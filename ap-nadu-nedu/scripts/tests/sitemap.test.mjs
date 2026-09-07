import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { STATIC_ROUTES, SITE_ORIGIN } from '../../src/lib/routes.js'

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
