/**
 * Write public/sitemap.xml from the route table and the live register.
 *
 * WHY THIS EXISTS
 *
 * The sitemap was 19 hand-written URLs and its own comment admitted the plan:
 * "project/news detail pages are discovered through the list pages". That plan
 * does not survive contact with how the register is built. Project links are
 * real anchors, so a crawler can follow them, but pagination is React state:
 * `setPage(p => p + 1)`. Page two has no address. A crawler cannot press a
 * button, so it sees the first page of the register and stops, and roughly 650
 * of 673 projects are undiscoverable.
 *
 * Fixing pagination is the larger, better change. Listing every project in the
 * sitemap is the change that can ship tonight, and it removes the dependency on
 * pagination entirely: Google never has to walk the list at all.
 *
 * WHY IT IS NOT PART OF THE BUILD
 *
 * A build that reaches across the network is a build that fails when the API is
 * having a bad afternoon, and it would fail in CI, where nothing is wrong with
 * the code. So this writes a file that is committed like any other source, and
 * `npm run build` stays offline and deterministic. Run it when the register has
 * meaningfully changed.
 *
 * Usage:
 *   npm run sitemap                     against the live API
 *   npm run sitemap -- --api http://127.0.0.1:8001/api/v1
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../public/sitemap.xml')

const args = process.argv.slice(2)
const apiFlag = args.indexOf('--api')
const API = apiFlag !== -1 ? args[apiFlag + 1] : 'https://apfactcheck.dheeco.com/api/v1'

const { SITE_ORIGIN, STATIC_ROUTES } = await import('../src/lib/routes.js')

// changefreq and priority are hints Google has said for years it largely
// ignores, kept because other crawlers still read them and they cost nothing.
const FREQ = {
  '/': ['daily', '1.0'],
  '/projects': ['daily', '0.9'],
  '/news': ['daily', '0.6'],
  '/tenders': ['daily', '0.6'],
  '/updates': ['daily', '0.5'],
}

async function get(path) {
  const res = await fetch(API + path, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json()
}

/**
 * Every project id, walked page by page.
 *
 * page_size is 100 because the API caps it there and answers 422 above it. The
 * first version of this script asked for 200 and was tested against a stub that
 * cheerfully served 200, so it passed locally and would have failed on the real
 * register. The stub was more permissive than the thing it stood in for, which
 * is the usual way a mock lies.
 *
 * The loop follows has_next rather than guessing from the page length, and the
 * count is checked against total afterwards, so a truncated walk fails loudly
 * instead of publishing a sitemap that quietly forgets half the site.
 */
async function projectIds() {
  const ids = []
  let expected = null
  for (let page = 1; page <= 200; page++) {
    const r = await get(`/projects/?page=${page}&page_size=100`)
    expected = r.total ?? expected
    for (const item of r.items || []) if (item?.id != null) ids.push(item.id)
    if (!r.has_next) break
  }
  if (expected != null && ids.length !== expected) {
    throw new Error(`walked ${ids.length} projects but the register reports ${expected}`)
  }
  return ids
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function url(loc, changefreq, priority) {
  return `  <url>\n    <loc>${esc(loc)}</loc>\n` +
         `    <changefreq>${changefreq}</changefreq>\n` +
         `    <priority>${priority}</priority>\n  </url>`
}

/**
 * Every district the register knows about.
 *
 * A district is a page in its own right, not a filtered view: "projects in
 * Palnadu" is a subject people search for by name, and there are 26 of them.
 * The canonical keeps ?district= for the same reason, so these belong in the
 * sitemap. Status, sort and page do not, and never will.
 */
async function districts() {
  const r = await get('/projects/filters')
  return (r.districts || []).filter(Boolean)
}

const entries = []

for (const route of STATIC_ROUTES) {
  const [freq, pri] = FREQ[route.pattern] || ['weekly', '0.5']
  entries.push(url(SITE_ORIGIN + (route.pattern === '/' ? '/' : route.pattern), freq, pri))
}

let ids = []
try {
  ids = await projectIds()
} catch (err) {
  console.error(`\nCould not reach the register at ${API}`)
  console.error(`  ${err.message}`)
  console.error('\nRefusing to write a sitemap that silently drops every project.')
  console.error('The existing public/sitemap.xml is left untouched.\n')
  process.exit(1)
}

if (!ids.length) {
  console.error('\nThe register returned no projects. Refusing to publish a sitemap')
  console.error('that would tell Google 673 pages had disappeared.\n')
  process.exit(1)
}

let names = []
try {
  names = await districts()
} catch (err) {
  console.error(`\nCould not read the district list: ${err.message}`)
  console.error('Refusing to publish a sitemap missing 26 district pages.\n')
  process.exit(1)
}

for (const district of names) {
  entries.push(url(`${SITE_ORIGIN}/projects?district=${encodeURIComponent(district)}`, 'weekly', '0.8'))
}

for (const id of ids) {
  entries.push(url(`${SITE_ORIGIN}/projects/${id}`, 'weekly', '0.7'))
}

const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED FILE. Do not edit by hand.

  Written by scripts/generate-sitemap.mjs from src/lib/routes.js and the live
  project register. Run "npm run sitemap" after the register changes, and
  commit the result.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`

writeFileSync(OUT, xml, 'utf8')
console.log(`sitemap: ${STATIC_ROUTES.length} pages + ${names.length} districts + ${ids.length} projects = ${entries.length} URLs`)
console.log(`written to public/sitemap.xml`)
