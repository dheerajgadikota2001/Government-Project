// What answer engines read about the site: who it is, and the full text of every page.
//
// WHY
// "AP Fact Check" is also the Associated Press's fact-checking unit, and a search for this site's name returned
// theirs (14 Nov 2026). An answer engine only tells the two apart from what the site says about itself in data it
// reads. And an engine that reads llms-full.txt instead of crawling 1,500 pages must find every page there, with
// the same words the page carries.
//
// WHAT IT CHECKS (after the build)
// 1. The home page's Organization node names Andhra Pradesh, India, and says it is not the Associated Press's.
// 2. llms.txt points to llms-full.txt and says the same.
// 3. llms-full.txt has one section for every English page in the sitemap, and nothing the pages do not say:
//    every section's description is the page's own meta description.
// Run after the build:  node scripts/test_ai_readable.mjs   (npm run test:ai)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(WEB, 'dist')
const ORIGIN = 'https://apfactcheck.dheeco.com'
let failed = 0
const fail = (m) => { failed++; if (failed <= 20) console.error('FAIL', m) }
const pass = (m) => console.log('PASS', m)
const read = (f) => fs.readFileSync(path.join(DIST, f), 'utf8')
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// 1. who the site is
const home = read('index.html')
const nodes = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
  const j = JSON.parse(m[1]); return j['@graph'] ?? [j]
})
const org = nodes.find((n) => n['@type'] === 'Organization')
// A plain link to the parent site, in the HTML served before any script runs, on the home page.
if (!/<a href="https:\/\/dheeco\.com\/">/.test(home)) fail('the home page has no plain link to dheeco.com')
if (!org) fail('no Organization node on the home page')
else {
  if (!/Andhra Pradesh \(India\)/.test(org.disambiguatingDescription ?? '')) fail('Organization does not name Andhra Pradesh, India')
  if (!/Not connected with the Associated Press/.test(org.disambiguatingDescription ?? '')) fail('Organization does not say it is not the Associated Press')
  if (org.areaServed?.name !== 'Andhra Pradesh') fail('Organization areaServed is not Andhra Pradesh')
  // dheeco.com names this site as its subOrganization with this @id; the parent must answer with the @id dheeco.com uses.
  if (org['@id'] !== `${ORIGIN}/#org`) fail('Organization @id changed: dheeco.com points at /#org')
  if (org.parentOrganization?.['@id'] !== 'https://dheeco.com/#organization') fail('parentOrganization does not carry dheeco.com\'s @id')
}
pass('the home page says which AP this is')

// 2. llms.txt
const llms = read('llms.txt')
if (!llms.includes(`${ORIGIN}/llms-full.txt`)) fail('llms.txt does not point to llms-full.txt')
if (!/Not connected with the Associated Press/.test(llms)) fail('llms.txt does not say it is not the Associated Press')
pass('llms.txt points to the full text and names the site')

// 3. llms-full.txt against the sitemap and the pages
const full = read('llms-full.txt')
const sections = new Map()
for (const block of full.split('\n## ').slice(1)) {
  const [, url, , desc] = block.split('\n')
  sections.set(url, desc)
}
const sitemap = read('sitemap-en.xml')
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
if (urls.length < 1000) fail(`only ${urls.length} addresses in sitemap-en.xml: build first`)
for (const u of urls) {
  if (!sections.has(u)) { fail(`llms-full.txt has no section for ${u}`); continue }
  const file = u === ORIGIN + '/' ? 'index.html' : path.join(u.slice(ORIGIN.length), 'index.html')
  const meta = read(file).match(/<meta name="description" content="([^"]*)"/)
  if (meta && unesc(meta[1]) !== sections.get(u)) fail(`${u}: llms-full.txt describes it differently from the page`)
}
if (sections.size !== urls.length) fail(`llms-full.txt has ${sections.size} sections, the sitemap ${urls.length} addresses`)
if (/full page is loading/i.test(full)) fail('llms-full.txt carries the old loading sentence')
pass(`llms-full.txt carries all ${urls.length} English pages, each with the page's own description`)

if (failed) { console.error(`${failed} problems`); process.exit(1) }
console.log('AI-readable checks passed.')
