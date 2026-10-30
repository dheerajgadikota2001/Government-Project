// Checks the search extras added on 30 Oct 2026 (run: npm run test:seo-extras, after npm run build).
//  - IndexNow: one key file that holds its own key; the change list sends both languages, sends a page
//    once per change, and tells the engines about pages that have gone
//  - llms.txt: written by the build, every link in it lands on a pre-rendered page, no figures in it
//  - structured data: Dataset on the money, department and state facts pages with years taken from the
//    data; AdministrativeArea on every district page in both languages
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedUrls, nextSent, readKey, ORIGIN } from './indexnow.mjs'

const web = fileURLToPath(new URL('..', import.meta.url))
const dist = join(web, 'dist')
let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

// ---- IndexNow
const key = readKey(join(web, 'public'))
expect('one IndexNow key file in public/, holding its own 32-character key', /^[0-9a-f]{32}$/.test(key))
expect('the key file is in the build', existsSync(join(dist, `${key}.txt`)) && readFileSync(join(dist, `${key}.txt`), 'utf8').trim() === key)
const cur = { '/': { h: 'a' }, '/projects/1': { h: 'b' }, '/projects/2': { h: 'c' } }
const first = changedUrls(cur, {})
expect('first send: every page, both languages', first.length === 6 && first.includes(`${ORIGIN}/te`) && first.includes(`${ORIGIN}/te/projects/1`))
const sent = nextSent(cur)
expect('nothing changed: nothing to send', changedUrls(cur, sent).length === 0)
const moved = changedUrls({ ...cur, '/projects/2': { h: 'z' } }, sent)
expect('one page changed: only its two addresses', moved.length === 2 && moved.every((u) => u.endsWith('/projects/2')), moved.join(' '))
const gone = changedUrls({ '/': { h: 'a' }, '/projects/1': { h: 'b' } }, sent)
expect('a page that has gone is sent once, so it can be dropped', gone.length === 2 && gone.every((u) => u.endsWith('/projects/2')))
expect('--all sends everything', changedUrls(cur, sent, true).length === 6)

// ---- llms.txt
const llms = existsSync(join(dist, 'llms.txt')) ? readFileSync(join(dist, 'llms.txt'), 'utf8') : ''
expect('llms.txt is written by the build', llms.startsWith('# AP Fact Check'))
const links = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1])
const missing = links.filter((u) => { const p = new URL(u).pathname; return !existsSync(join(dist, p, 'index.html')) && !existsSync(join(dist, p)) })
expect('every link in llms.txt lands on a pre-rendered page', links.length >= 8 && missing.length === 0, missing.join(' '))
expect('llms.txt carries no rupee figures', !/₹|crore/.test(llms))

// ---- structured data
const ldOf = (path) => {
  const f = join(dist, path, 'index.html')
  if (!existsSync(f)) return []
  const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(readFileSync(f, 'utf8'))
  return m ? JSON.parse(m[1])['@graph'] : []
}
const money = JSON.parse(readFileSync(join(web, 'src/data/money.json'), 'utf8'))
for (const [path, lang] of [['finances', 'en'], ['te/finances', 'te'], ['finances/departments', 'en'], ['state-facts', 'en'], ['te/state-facts', 'te']]) {
  const ds = ldOf(path).find((n) => n['@type'] === 'Dataset')
  expect(`/${path} describes its table as a Dataset (name, description, years, free)`, ds && ds.name && ds.description && /^\d{4}-04-01\/\d{4}-03-31$/.test(ds.temporalCoverage) && ds.isAccessibleForFree === true, JSON.stringify(ds))
}
const ends = money.series.flatMap((x) => x.points.map((p) => p.fy_end))
const debt = ldOf('finances').find((n) => n['@type'] === 'Dataset')
expect('the debt dataset\'s years are the data\'s own years', debt?.temporalCoverage === `${Math.min(...ends) - 1}-04-01/${Math.max(...ends)}-03-31`, debt?.temporalCoverage)
const dept = ldOf('finances/departments').find((n) => n['@type'] === 'Dataset')
expect('the department dataset counts the demands from the data', dept?.description.includes(`each of the ${money.departments.length} demands`))
const districts = JSON.parse(readFileSync(join(web, 'src/data/districts.json'), 'utf8'))
const dlist = districts.items
let placed = 0, total = 0
for (const d of dlist) {
  if (!d?.slug) continue
  for (const pre of ['districts', 'te/districts']) {
    total++
    const page = ldOf(`${pre}/${d.slug}`).find((n) => n['@type'] === 'WebPage')
    if (page?.about?.['@type'] === 'AdministrativeArea' && page.about.containedInPlace?.name === 'Andhra Pradesh') placed++
  }
}
expect('every district page, both languages, says which district it is about', total >= 56 && placed === total, `${placed} of ${total}`)

if (!ok) { console.error('\nseo extras checks failed'); process.exit(1) }
console.log('\nall seo extras checks passed')
