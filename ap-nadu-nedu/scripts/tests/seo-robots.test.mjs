import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * WHY THIS TEST EXISTS
 *
 * robots.txt carried "Disallow: /api/" for weeks. It reads as obviously right:
 * the API returns JSON and JSON is not a page. But this is a React app, so
 * every figure on every page arrives by fetch from /api/v1/... , and robots.txt
 * does not merely stop a crawler visiting a URL. It stops the renderer fetching
 * it. Google rendered the homepage with every number as a dash and captured the
 * site's own error box reading "The data server isn't responding".
 *
 * We had told Google not to look, then Google reported the site as broken.
 *
 * Keeping JSON out of search results is the job of the X-Robots-Tag header the
 * API now sends (see backend/tests/test_seo_headers.py). It is not the job of
 * this file. Anyone who re-adds the block here will pass their own review and
 * silently empty the rendered pages again, so the block is asserted against.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROBOTS = readFileSync(resolve(here, '../../public/robots.txt'), 'utf8')

const directives = ROBOTS.split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'))

test('nothing under /api is disallowed, or the rendered pages go empty', () => {
  const blocked = directives.filter(l => /^Disallow:\s*\/api/i.test(l))
  assert.deepEqual(blocked, [], 'robots.txt blocks the API the pages are built from')
})

test('a blanket Disallow: / would hide the whole site', () => {
  const blanket = directives.filter(l => /^Disallow:\s*\/\s*$/i.test(l))
  assert.deepEqual(blanket, [], 'robots.txt hides the entire site')
})

test('the sitemap is still declared, at the live domain', () => {
  const sitemap = directives.find(l => /^Sitemap:/i.test(l))
  assert.ok(sitemap, 'robots.txt no longer points at a sitemap')
  assert.match(sitemap, /https:\/\/apfactcheck\.dheeco\.com\/sitemap\.xml/)
})

test('crawling is still allowed at the root', () => {
  assert.ok(directives.some(l => /^User-agent:\s*\*/i.test(l)), 'no User-agent rule')
  assert.ok(directives.some(l => /^Allow:\s*\/\s*$/i.test(l)), 'no Allow: / rule')
})
