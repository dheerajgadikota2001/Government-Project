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

const { SITE_ORIGIN, STATIC_ROUTES, LANG_CODES, localizedPath, districtPath } = await import('../src/lib/routes.js')
const { departmentPath } = await import('../src/lib/departmentSummary.js')

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
/**
 * Every project, with the date its record last changed.
 *
 * The date is why this returns records rather than ids. With 691 URLs Google
 * would work through everything eventually; with 4302 it uses lastmod to
 * decide what to look at first. Without it, a project whose spend figure moved
 * last week waits behind four thousand pages that did not change at all.
 */
async function projectRecords() {
  const items = []
  let expected = null
  for (let page = 1; page <= 200; page++) {
    const r = await get(`/projects/?page=${page}&page_size=100`)
    expected = r.total ?? expected
    for (const item of r.items || []) {
      if (item?.id != null) items.push({ id: item.id, updated: item.updated_at || null })
    }
    if (!r.has_next) break
  }
  if (expected != null && items.length !== expected) {
    throw new Error(`walked ${items.length} projects but the register reports ${expected}`)
  }
  return items
}

/** W3C date, which is the only format a sitemap may carry. Bad input is dropped. */
const isoDay = value => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * One page, six addresses.
 *
 * Every language gets its own <url> entry, and each entry lists all six as
 * alternates plus x-default. Google's rule is that the annotation has to be
 * reciprocal: if the Telugu URL does not name the English one back, the pair
 * is ignored and the two are read as duplicates competing with each other. So
 * the full set is repeated inside every entry. It is verbose and it is the
 * format.
 */
function url(path, changefreq, priority, lastmod) {
  const links = LANG_CODES
    .map(code =>
      `    <xhtml:link rel="alternate" hreflang="${code}" href="${esc(SITE_ORIGIN + localizedPath(code, path))}"/>`)
    .concat(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(SITE_ORIGIN + localizedPath('en', path))}"/>`)
    .join('\n')

  return LANG_CODES.map(code =>
    `  <url>\n    <loc>${esc(SITE_ORIGIN + localizedPath(code, path))}</loc>\n` +
    `${links}\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n  </url>`,
  ).join('\n')
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
  const raw = r.districts || []

  // The endpoint returns objects like { code, name }, not strings. The first
  // version of this assumed strings, and encodeURIComponent turned every one of
  // them into "%5Bobject%20Object%5D". Twenty six identical junk URLs went into
  // a sitemap that Google had already fetched.
  //
  // The stub used to test this returned plain strings, so it passed. That is
  // twice now that a mock has been kinder than the real API: it also allowed a
  // page_size the API rejects. A stub that only agrees with you is not a test.
  const names = raw
    .map(d => (typeof d === 'string' ? d : d?.name))
    .filter(name => typeof name === 'string' && name.trim())
    .map(name => name.trim())

  if (names.length !== raw.length) {
    throw new Error(
      `read ${raw.length} districts but could only name ${names.length}. ` +
      'The shape of /projects/filters has changed.',
    )
  }
  return names
}

const entries = []


let ids = []
try {
  ids = await projectRecords()
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

// The newest record in the register. A district page and the register itself
// are as fresh as the most recent thing on them, which is a truthful claim and
// the one that gets them recrawled when something actually moves.
const newest = ids
  .map(p => isoDay(p.updated))
  .filter(Boolean)
  .sort()
  .pop() || null

// The static pages are written after the register has answered, so they can
// carry the same date. They are views onto the data, so the honest lastmod for
// the homepage is the day the newest record changed, not the day of the build.
for (const route of STATIC_ROUTES) {
  const [freq, pri] = FREQ[route.pattern] || ['weekly', '0.5']
  entries.push(url(route.pattern === '/' ? '/' : route.pattern, freq, pri, newest))
}

for (const district of names) {
  entries.push(url(districtPath(district), 'weekly', '0.8', newest))
}

/**
 * The forty voted demands.
 *
 * Thirteen years of budget volumes each, already collected and already cited,
 * and until now with no address of their own. Refusing to publish a sitemap
 * over a failure here would be wrong: the register is the load-bearing part
 * and these are an addition to it, so a missing department list costs forty
 * URLs and not the whole file.
 */
let departments = []
try {
  const r = await get('/finances/departments')
  departments = (r.departments || []).map(d => d.department).filter(Boolean)
} catch (err) {
  console.error(`Could not read the department list: ${err.message}`)
  console.error('Publishing without the forty department pages.')
}

for (const name of departments) {
  entries.push(url(departmentPath(name), 'yearly', '0.7', newest))
}

for (const project of ids) {
  entries.push(url(`/projects/${project.id}`, 'weekly', '0.7', isoDay(project.updated)))
}

const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED FILE. Do not edit by hand.

  Written by scripts/generate-sitemap.mjs from src/lib/routes.js and the live
  project register. Run "npm run sitemap" after the register changes, and
  commit the result.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`

writeFileSync(OUT, xml, 'utf8')
const pages = STATIC_ROUTES.length + names.length + departments.length + ids.length
console.log(`sitemap: ${STATIC_ROUTES.length} pages + ${names.length} districts` +
  ` + ${departments.length} departments + ${ids.length} projects` +
  ` = ${pages} pages x ${LANG_CODES.length} languages = ${pages * LANG_CODES.length} URLs`)
console.log(`written to public/sitemap.xml`)
