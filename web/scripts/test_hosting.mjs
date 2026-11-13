// Guards the hosting rules in firebase.web.json: which Cache-Control each address gets, and where redirects lead.
//
// WHY
// Until 13 Nov 2026 the rule for every address ("**") set Cache-Control: no-cache. Firebase applies a hosting header
// to responses from Cloud Run too, so it replaced the API's own "public, max-age=300, s-maxage=300" and every API
// call missed the CDN (x-cache: MISS on /api/v1/projects/register). The fix sets no-cache only on pages: addresses
// with no dot and not under /api/. The same review found the icon rule listing "share/default.png" inside @( ),
// where a slash never matches, so the default share picture had no rule of its own.
//
// WHAT IT CHECKS
// 1. Every page in dist, both languages, gets exactly one Cache-Control rule, and it is no-cache.
// 2. Nothing under /api/ gets a Cache-Control rule, so the API's own header reaches the CDN and the reader.
// 3. Each kind of file gets the one rule meant for it, never two.
// 4. Regex rules use nothing RE2 refuses (Firebase reads them with RE2, this test with JavaScript).
// 5. Every redirect to a project lands on a page that exists, and no redirect hides a page that exists.
// Run after the build:  node scripts/test_hosting.mjs   (npm run test:hosting)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(WEB, 'dist')
const config = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'firebase.web.json'), 'utf8')).hosting
// Firebase matches "source" as a glob with extglob, the way minimatch does. minimatch comes with the build tools.
const minimatch = createRequire(import.meta.url)('minimatch')

let failed = 0
const fail = (m) => { failed++; if (failed <= 30) console.error('FAIL', m) }
const pass = (m) => console.log('PASS', m)

// RE2 names a group (?P<name>...); JavaScript writes (?<name>...). Nothing else in these rules differs.
const re = (r) => new RegExp(r.replace(/\(\?P</g, '(?<'))
const matches = (rule, p) => (rule.regex ? re(rule.regex).test(p) : minimatch(p, rule.source))
const cacheRules = (p) => config.headers.filter((r) => matches(r, p) && r.headers.some((h) => h.key === 'Cache-Control'))
const cacheOf = (p) => cacheRules(p).map((r) => r.headers.find((h) => h.key === 'Cache-Control').value)

// 4. RE2 has no lookaround and no backreferences
for (const r of [...config.headers, ...config.redirects]) {
  if (r.regex && /\(\?[=!<]|\\[1-9]/.test(r.regex.replace(/\(\?P<\w+>/g, ''))) fail(`regex RE2 cannot read: ${r.regex}`)
}
pass('regex rules use only what RE2 reads')

// 1. every page
const pages = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'assets') walk(path.join(dir, e.name)) }
    else if (e.name === 'index.html') pages.push('/' + path.relative(DIST, dir).split(path.sep).join('/'))
  }
}
walk(DIST)
const pagePaths = pages.map((p) => (p === '/' ? '/' : p.replace(/\/$/, '')))
if (pagePaths.length < 1000) fail(`only ${pagePaths.length} pages in dist: build first`)
for (const p of pagePaths) {
  const c = cacheOf(p)
  if (c.length !== 1 || c[0] !== 'no-cache') fail(`${p}: page gets ${JSON.stringify(c)}, expected exactly no-cache`)
}
pass(`${pagePaths.length} pages each get exactly one rule: no-cache`)

// 2 and 3. the API and each kind of file
const expect = {
  '/api/v1/projects/register': null,
  '/api/v1/meta/csp-report': null,
  '/api': 'no-cache',                       // not an API address: the API lives under /api/
  '/apis': 'no-cache',
  '/te': 'no-cache',
  '/assets/index-CWEfh6JV.js': 'public, max-age=31536000, immutable',
  '/3d/polavaram.glb': 'public, max-age=604800, stale-while-revalidate=2592000',
  '/fonts/telugu.woff2': 'public, max-age=31536000, immutable',
  '/sw.js': 'no-cache',
  '/sitemap.xml': 'public, max-age=3600',
  '/robots.txt': 'public, max-age=3600',
  '/favicon.ico': 'public, max-age=86400',
  '/icon-512.png': 'public, max-age=86400',
  '/share/default.png': 'public, max-age=86400',
  '/share/projects-613-en-1a2b3c4d.png': 'public, max-age=31536000, immutable',
  '/manifest.webmanifest': 'public, max-age=86400',
}
for (const [p, want] of Object.entries(expect)) {
  const c = cacheOf(p)
  if (want === null ? c.length !== 0 : c.length !== 1 || c[0] !== want) fail(`${p}: gets ${JSON.stringify(c)}, expected ${want ?? 'none (the API sets its own)'}`)
}
pass('the API keeps its own Cache-Control; each kind of file gets one rule')

// 5. redirects
const exists = new Set(pagePaths)
for (const r of config.redirects) {
  const to = r.destination
  if (/^\/(te\/)?projects\/\d+$/.test(to) && !exists.has(to)) fail(`redirect ${r.regex ?? r.source} leads to ${to}, which is not a page`)
  for (const p of pagePaths) if (r.regex && re(r.regex).test(p)) fail(`redirect ${r.regex} hides the page ${p}`)
}
pass('every redirect to a project lands on a page, and none hides a page')

if (failed) { console.error(`${failed} problems`); process.exit(1) }
console.log('Hosting tests passed.')
