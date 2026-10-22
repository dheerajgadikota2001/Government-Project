import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { STATIC_ROUTES, SITE_ORIGIN, LANG_CODES, PREFIXED_LANGS, INDEXED_LANGS, localizedPath, splitLangPath } from '../../src/lib/routes.js'
import { robotsFor } from '../../src/lib/seo.js'

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
const PUBLIC_DIR = resolve(here, '../../public')

// sitemap.xml is an index; the pages are in one file per indexed language.
// Every rule below reads the pages from all of them together.
const INDEX = readFileSync(resolve(PUBLIC_DIR, 'sitemap.xml'), 'utf8')
const CHILD_FILES = [...INDEX.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].split('/').pop())
const CHILDREN = Object.fromEntries(CHILD_FILES.map(f => [f, readFileSync(resolve(PUBLIC_DIR, f), 'utf8')]))
const XML = Object.values(CHILDREN).join('\n')
const locs = [...XML.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

test('the sitemap is generated, not hand-edited', () => {
  for (const [name, text] of [['sitemap.xml', INDEX], ...Object.entries(CHILDREN)]) {
    assert.match(text, /GENERATED FILE/, `public/${name} looks hand-written. Run: npm run sitemap`)
  }
})

test('sitemap.xml is an index of one file per indexed language, each holding only its language', () => {
  // Search Console reports coverage per submitted sitemap. One file per
  // language is what shows whether Telugu is being indexed, instead of one
  // number for everything.
  assert.match(INDEX, /<sitemapindex[\s>]/, 'sitemap.xml is not an index. Run: npm run sitemap')
  assert.deepEqual(CHILD_FILES, INDEXED_LANGS.map(c => `sitemap-${c}.xml`))
  for (const loc of INDEX.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(loc[1].startsWith(`${SITE_ORIGIN}/sitemap-`), `the index points off the site: ${loc[1]}`)
  }
  for (const code of INDEXED_LANGS) {
    const mine = [...CHILDREN[`sitemap-${code}.xml`].matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    assert.ok(mine.length > 500, `sitemap-${code}.xml lists only ${mine.length} pages`)
    const stray = mine.filter(l => splitLangPath(l.replace(SITE_ORIGIN, '')).lang !== code)
    assert.deepEqual(stray.slice(0, 3), [], `sitemap-${code}.xml lists pages in another language`)
  }
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
  // Districts moved from ?district=Guntur to /districts/guntur so they could
  // be prerendered. This asserted the old form for a while after the move,
  // which is how a stale test reads: it fails on correct output.
  const districts = locs.filter(l => /\/districts\/[a-z0-9-]+$/.test(l))
  assert.ok(districts.length >= 20 * INDEXED_LANGS.length,
    `only ${districts.length} district pages listed. There are 26 per indexed language. Run: npm run sitemap`)
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

/*
 * UPDATE, September 2026. The five translated trees were listed here and
 * Google fetched almost none of them: 4,300 URLs sat in "Discovered, currently
 * not indexed", and the ones it did fetch were rejected, because the project
 * names in them are untranslated English inside translated sentences. Only
 * INDEXED_LANGS are listed now. The rules below are written against that list,
 * so adding a language to it brings its URLs and its reciprocal hreflang back
 * and the tests hold them to the same standard as before.
 */
test('a page is listed in exactly the languages it is indexed in', () => {
  // Page by page, because an indexed language can still hold a page that is
  // noindex in it: a Telugu fact check is English text. robotsFor is the rule
  // the page's own head uses, so the two cannot disagree.
  const english = locs.filter(l => splitLangPath(l.replace(SITE_ORIGIN, '')).lang === 'en')
  assert.ok(english.length > 700, `only ${english.length} English URLs, the register should be larger`)
  const listed = new Set(locs)
  for (const loc of english) {
    const path = loc.replace(SITE_ORIGIN, '') || '/'
    for (const code of LANG_CODES) {
      const url = SITE_ORIGIN + localizedPath(code, path)
      const want = robotsFor(localizedPath(code, path)) === null
      assert.equal(listed.has(url), want,
        `${url} ${want ? 'is indexed but missing' : 'is listed but its page says noindex'}. Run: npm run sitemap`)
    }
  }
  assert.equal(new Set(locs).size, locs.length, 'a URL is listed twice')
})

test('no URL in the sitemap asks not to be indexed', () => {
  // A sitemap is the list of pages we ask Google to index. Listing a noindex
  // page is a contradiction Search Console reports and does not resolve.
  for (const loc of locs) {
    const path = loc.replace(SITE_ORIGIN, '').replace(/&amp;/g, '&') || '/'
    assert.equal(robotsFor(path), null, `${loc} is in the sitemap but its page says noindex`)
  }
})

test('every URL carries exactly the hreflang set its page declares', async () => {
  // Spot-checking a few would pass while the tail was broken, and the tail is
  // where a generated file goes wrong. The set is the page's own, from the
  // function that writes the page head, so a pair always names each other.
  const { alternatesFor } = await import('../../src/lib/seo.js')
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)</)[1]
    const got = [...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]])
    assert.deepEqual(got, alternatesFor(loc.replace(SITE_ORIGIN, '') || '/'), `wrong hreflang set on ${loc}`)
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
    const found = block.match(/hreflang="x-default" href="([^"]+)"/)
    if (!found) continue            // no hreflang at all while one language is indexed
    const xd = found[1]
    for (const code of PREFIXED_LANGS) {
      assert.ok(!xd.includes(`/${code}/`) && !xd.endsWith(`/${code}`),
        `x-default points at ${code}, which is not a fallback anyone can read`)
    }
  }
})

test('each sitemap declares the xhtml namespace exactly when it has alternates', () => {
  // Without it the xhtml:link elements are not valid and Google ignores every
  // one of them, silently, while still reporting the sitemap as fine.
  for (const [name, text] of Object.entries(CHILDREN)) {
    if (/<xhtml:link/.test(text)) assert.match(text, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/, name)
    else assert.ok(!/xmlns:xhtml/.test(text), `${name} declares a namespace for alternates that are not there`)
  }
})

test('the sitemap stays inside what a search engine will accept', () => {
  // The limits are per file.
  for (const [name, text] of Object.entries(CHILDREN)) {
    const n = (text.match(/<loc>/g) || []).length
    assert.ok(n <= 50000, `${name}: ${n} URLs exceeds the 50,000 limit`)
    const megabytes = Buffer.byteLength(text) / (1024 * 1024)
    assert.ok(megabytes <= 50, `${name} is ${megabytes.toFixed(1)} MB, over the 50 MB limit`)
  }
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
  assert.ok(districts.length >= 26 * INDEXED_LANGS.length,
    `only ${districts.length} district URLs; expected 26 in each indexed language`)
  assert.equal(locs.filter(l => /[?&]district=/.test(l)).length, 0,
    'the old query-string district URLs are still being published')
  for (const l of districts.slice(0, 30)) {
    assert.match(l, /\/districts\/[a-z0-9-]+$/, `not a clean slug: ${l}`)
  }
})

test('each finances question has a URL, in every indexed language', () => {
  const questions = locs.filter(l => /\/finances\/[a-z0-9-]+$/.test(l) && !/\/finances\/departments\//.test(l))
  assert.equal(questions.length, 9 * INDEXED_LANGS.length,
    `${questions.length} question URLs; expected 9 in each indexed language`)
  for (const code of INDEXED_LANGS) {
    const want = localizedPath(code, '/finances/whose-number-is-right')
    assert.ok(questions.some(l => l.endsWith(want)), `no ${want}`)
  }
})

test('the forty voted demands each have a URL', () => {
  // Thirteen years of budget volumes per department, already collected and
  // already cited, and until now with no address at all.
  const depts = locs.filter(l => /\/finances\/departments\//.test(l))
  // English only while their text is English (seo.js ENGLISH_CONTENT_PATTERNS);
  // the rule that keeps them out of the Telugu file is tested above.
  const english = depts.filter(l => splitLangPath(l.replace(SITE_ORIGIN, '')).lang === 'en')
  assert.ok(english.length >= 40, `only ${english.length} English department URLs; expected 40`)
  for (const l of depts.slice(0, 40)) {
    assert.match(l, /\/finances\/departments\/[a-z0-9-]+$/, `not a clean slug: ${l}`)
  }
  assert.ok(depts.some(l => /school-education$/.test(l)))
})
