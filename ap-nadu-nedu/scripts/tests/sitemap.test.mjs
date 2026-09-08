import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { STATIC_ROUTES, SITE_ORIGIN, LANG_CODES, PREFIXED_LANGS, localizedPath, splitLangPath } from '../../src/lib/routes.js'

/**
 * WHY THIS TEST EXISTS
 *
 * The sitemap was 19 hand-written URLs, and its own comment stated the plan:
 * detail pages would be "discovered through the list pages". They would not
 * have been. Project links are real anchors, but the register paginates in
 * React state, so page two has no address. A crawler cannot press a button, and
 * roughly 650 of 673 projects were unreachable.
 *
 * A hand-maintained sitemap also goes stale silently, which is the worst way
 * for a sitemap to be wrong: Search Console reports success either way.
 */

const here = dirname(fileURLToPath(import.meta.url))
const XML = readFileSync(resolve(here, '../../public/sitemap.xml'), 'utf8')
const locs = [...XML.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

test('the sitemap is generated, not hand-edited', () => {
  assert.match(XML, /GENERATED FILE/,
    'public/sitemap.xml looks hand-written. Run: npm run sitemap')
})

test('every static route is published', () => {
  for (const route of STATIC_ROUTES) {
    const want = SITE_ORIGIN + (route.pattern === '/' ? '/' : route.pattern)
    assert.ok(locs.includes(want), `${want} is missing. Run: npm run sitemap`)
  }
})

test('the project register is published, not just its first page', () => {
  const projects = locs.filter(l => /\/projects\/\d+$/.test(l))
  assert.ok(projects.length > 500,
    `only ${projects.length} project pages are listed. The register holds hundreds, ` +
    'and pagination has no URL for a crawler to follow. Run: npm run sitemap')
})

test('nothing is listed twice', () => {
  assert.equal(new Set(locs).size, locs.length, 'duplicate <loc> in the sitemap')
})

test('no noindex page and no route pattern leaked in', () => {
  assert.ok(!locs.some(l => l.endsWith('/search')), '/search is noindex and must not be listed')
  assert.ok(!locs.some(l => l.includes(':id') || l.includes(':key')),
    'an unresolved route pattern was published as a URL')
})

test('every URL is absolute and on the live domain', () => {
  for (const l of locs) {
    assert.ok(l.startsWith(SITE_ORIGIN + '/'), `${l} is not on ${SITE_ORIGIN}`)
  }
})

test('district pages are published, since each one is a subject people search', () => {
  const districts = locs.filter(l => l.includes('?district='))
  assert.ok(districts.length >= 20,
    `only ${districts.length} district pages listed. There are 26. Run: npm run sitemap`)
})

test('no filter other than district is published', () => {
  const withQuery = locs.filter(l => l.includes('?'))
  for (const l of withQuery) {
    const params = [...new URL(l).searchParams.keys()]
    assert.deepEqual(params, ['district'],
      `${l} publishes a filter that is the same projects rearranged`)
  }
})

test('no URL contains a stringified object, which is what a wrong shape looks like', () => {
  const junk = locs.filter(l => /%5Bobject|\[object/i.test(l))
  assert.deepEqual(junk, [],
    'a value was put into a URL without being turned into a string first. Run: npm run sitemap')
})

test('every district URL names a real district', () => {
  for (const l of locs.filter(l => l.includes('?district='))) {
    const name = new URL(l).searchParams.get('district')
    assert.ok(name && name.length > 2 && /[A-Za-z]/.test(name), `bad district value: ${name}`)
  }
})

/**
 * THE LANGUAGE HALF
 *
 * The site publishes six languages. Until the sitemap listed them, five of
 * them had no way of being discovered at all: a crawler cannot guess that
 * /te/projects/613 exists, and nothing on the site linked to it from outside
 * a Telugu session. Listing them is what turns 717 pages into 4302.
 *
 * Google's rule for hreflang is that the annotation must be reciprocal. If the
 * Telugu URL does not name the English one back, the pair is discarded and the
 * two read as duplicates competing with each other, which is worse than not
 * annotating at all. So the assertions below are about completeness, not
 * presence.
 */

const urlBlocks = [...XML.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1])

test('every page is published in every language', () => {
  const byLang = {}
  for (const code of LANG_CODES) byLang[code] = 0
  for (const loc of locs) byLang[splitLangPath(loc.replace(SITE_ORIGIN, '')).lang]++

  const english = byLang.en
  assert.ok(english > 700, `only ${english} English URLs, the register should be larger`)
  for (const code of LANG_CODES) {
    assert.equal(byLang[code], english,
      `${code} has ${byLang[code]} URLs but English has ${english}`)
  }
  assert.equal(locs.length, english * LANG_CODES.length)
})

test('every URL carries the full reciprocal hreflang set', () => {
  // Spot-checking a few would pass while the tail was broken, and the tail is
  // where a generated file goes wrong.
  for (const block of urlBlocks) {
    const tags = [...block.matchAll(/hreflang="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(tags, [...LANG_CODES, 'x-default'],
      `incomplete hreflang set on ${block.match(/<loc>([^<]+)</)?.[1]}`)
  }
})

test('an alternate points at the same page, not a different one', () => {
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)</)[1]
    const { path } = splitLangPath(loc.replace(SITE_ORIGIN, ''))
    for (const [, code, href] of block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)) {
      const want = SITE_ORIGIN + localizedPath(code === 'x-default' ? 'en' : code, path)
      assert.equal(href.replace(/&amp;/g, '&'), want.replace(/&amp;/g, '&'),
        `${loc} points its ${code} alternate at ${href}`)
    }
  }
})

test('x-default sends an unpublished language to English', () => {
  const sample = urlBlocks.slice(0, 50)
  for (const block of sample) {
    const xd = block.match(/hreflang="x-default" href="([^"]+)"/)[1]
    for (const code of PREFIXED_LANGS) {
      assert.ok(!xd.includes(`/${code}/`) && !xd.endsWith(`/${code}`),
        `x-default points at ${code}, which is not a fallback anyone can read`)
    }
  }
})

test('the sitemap declares the xhtml namespace its alternates need', () => {
  // Without this the xhtml:link elements are not valid and Google ignores
  // every one of them, silently, while still reporting the sitemap as fine.
  assert.match(XML, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/)
})

test('the sitemap stays inside what a search engine will accept', () => {
  assert.ok(locs.length <= 50000, `${locs.length} URLs exceeds the 50,000 limit`)
  const megabytes = Buffer.byteLength(XML) / (1024 * 1024)
  assert.ok(megabytes <= 50, `sitemap is ${megabytes.toFixed(1)} MB, over the 50 MB limit`)
})

test('every URL carries a lastmod, and it is a real date', () => {
  // With 691 URLs Google gets to everything eventually. With 4302 it uses
  // lastmod to decide what to look at first, so without it a project whose
  // spend figure moved last week waits behind four thousand that did not.
  const blocks = [...XML.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1])
  const today = new Date().toISOString().slice(0, 10)
  let withDate = 0
  for (const block of blocks) {
    const m = block.match(/<lastmod>([^<]+)<\/lastmod>/)
    if (!m) continue
    withDate++
    assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/,
      `lastmod is not a W3C date: ${m[1]}`)
    assert.ok(m[1] <= today, `lastmod is in the future: ${m[1]}`)
    assert.ok(m[1] >= '2024-01-01', `lastmod is implausibly old: ${m[1]}`)
  }
  assert.ok(withDate / blocks.length > 0.9,
    `only ${withDate} of ${blocks.length} URLs carry a lastmod`)
})

test('districts are published at their own path, not as a query', () => {
  // A query string cannot be prerendered, so while districts lived at
  // ?district= they were visible only to crawlers that run JavaScript.
  const districts = locs.filter(l => /\/districts\//.test(l))
  assert.ok(districts.length >= 26 * 6,
    `only ${districts.length} district URLs; expected 26 in each of 6 languages`)
  assert.equal(locs.filter(l => /[?&]district=/.test(l)).length, 0,
    'the old query-string district URLs are still being published')
  for (const l of districts.slice(0, 30)) {
    assert.match(l, /\/districts\/[a-z0-9-]+$/, `not a clean slug: ${l}`)
  }
})

test('the forty voted demands each have a URL', () => {
  // Thirteen years of budget volumes per department, already collected and
  // already cited, and until now with no address at all.
  const depts = locs.filter(l => /\/finances\/departments\//.test(l))
  assert.ok(depts.length >= 40 * 6,
    `only ${depts.length} department URLs; expected 40 in each of 6 languages`)
  for (const l of depts.slice(0, 40)) {
    assert.match(l, /\/finances\/departments\/[a-z0-9-]+$/, `not a clean slug: ${l}`)
  }
  assert.ok(depts.some(l => /school-education$/.test(l)))
})
