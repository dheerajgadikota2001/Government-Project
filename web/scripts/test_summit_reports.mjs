// What was reported about a summit before the state published its own paper (src/data/summit_reports.json).
//
// WHY
// The 2026 summit was reported as Rs 9.02, 9.89 and 9.98 lakh crore, Rs 5.84 lakh crore for one day, and two
// different figures for the other day. A page that explains why must itself be exact: every figure as printed,
// with the report that printed it, in both languages, and nothing the site worked out. One wrong digit on this
// page would be the thing it exists to correct.
//
// WHAT IT CHECKS (no build needed): npm run test:summits
//  1. every report: an https link, a date not after the check date, press or government, a speaker in both
//     languages, and a quote of 25 words or fewer
//  2. every figure, company and pipeline reading names a report that exists, and a figure's group exists
//  3. every printed amount says the same as its number (₹9,02,434 crore is 902434; ₹9.02 lakh crore is 902000)
//  4. both languages carry the same numbers, and the Telugu is Telugu
//  5. where one report states parts and their total, the parts and the total agree as printed (MoUs and jobs
//     exactly; rupees to within Rs 1 crore of rounding). The page never prints this check: it only stops a
//     typing mistake from reaching readers.
//  6. no em dash or double dash in our own words; descriptions fit in 300 characters
//  7. the page that draws this data adds nothing up: no sum or reduce over amounts in SummitExplainer.tsx
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const web = fileURLToPath(new URL('..', import.meta.url))
const data = JSON.parse(readFileSync(join(web, 'src/data/summit_reports.json'), 'utf8'))
let failed = 0
const fail = (m) => { failed++; console.error('FAIL', m) }
const pass = (m) => console.log('PASS', m)

const TE = /[ఀ-౿]/
const digits = (s) => (s.match(/\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, '')).sort().join(' ')
/** "₹9,02,434 crore" -> 902434; "₹9.02 lakh crore" -> 902000; "over ₹22 lakh crore" -> 2200000 */
function amountOf(s) {
  const m = s.match(/₹([\d,.]+) (lakh crore|crore)/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return m[2] === 'lakh crore' ? Math.round(n * 1e5) : n
}
function bi(where, b, { telugu = true, sameDigits = true } = {}) {
  if (!b || !b.en?.trim() || !b.te?.trim()) return fail(`${where}: missing English or Telugu`)
  if (telugu && !TE.test(b.te)) fail(`${where}: the Telugu is not in Telugu script`)
  // "Day 1" is "మొదటి రోజు" in Telugu: an ordinal word, not a figure, so it is left out of the comparison.
  if (sameDigits && digits(b.en.replace(/\bDay \d\b/g, '')) !== digits(b.te)) fail(`${where}: numbers differ between languages [${digits(b.en)}] vs [${digits(b.te)}]`)
  for (const [lang, s] of Object.entries(b)) if (/—|--/.test(s)) fail(`${where} (${lang}): em dash or double dash`)
}

const keys = Object.keys(data).filter((k) => !k.startsWith('_'))
if (!keys.length) fail('no summit in the file')
for (const key of keys) {
  const x = data[key]
  const R = new Map(x.reports.map((r) => [r.id, r]))
  if (R.size !== x.reports.length) fail(`${key}: two reports share an id`)

  // 1. reports
  for (const r of x.reports) {
    if (!/^https:\/\//.test(r.url)) fail(`${key}/${r.id}: link is not https`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > x.checked) fail(`${key}/${r.id}: date ${r.date} is not a day on or before the check (${x.checked})`)
    if (!['press', 'government'].includes(r.kind)) fail(`${key}/${r.id}: kind must be press or government`)
    if (r.kind === 'government' && !/gov\.in\//.test(r.url)) fail(`${key}/${r.id}: marked government but the link is not a government site`)
    // A news agency's story carried on a government site (PTI on DD News) is still a news report; the outlet must name the agency.
    if (r.kind === 'press' && /gov\.in\//.test(r.url) && !/\((PTI|UNI|IANS|ANI)\)/.test(r.outlet)) fail(`${key}/${r.id}: a government site marked press without naming the news agency`)
    if (r.quote.split(/\s+/).length > 25) fail(`${key}/${r.id}: quote over 25 words`)
    bi(`${key}/${r.id} speaker`, r.speaker, { sameDigits: true })
  }
  pass(`${key}: ${x.reports.length} reports, each linked, dated, labelled and quoted briefly`)

  // 2. references
  const G = new Set(x.groups.map((g) => g.id))
  for (const f of x.figures) {
    if (!R.has(f.report)) fail(`${key}: a figure names report ${f.report}, which is not in the list`)
    if (!G.has(f.group)) fail(`${key}: a figure names group ${f.group}, which is not in the list`)
  }
  for (const c of x.companies) if (!R.has(c.report)) fail(`${key}/${c.name}: names report ${c.report}, which is not in the list`)
  for (const st of x.pipeline) for (const r of st.readings) if (!R.has(r.report)) fail(`${key}/${st.id}: names report ${r.report}, which is not in the list`)
  for (const g of x.groups) if (!x.figures.some((f) => f.group === g.id)) fail(`${key}: group ${g.id} has no figure`)
  pass(`${key}: every figure, company and stage names a report and a group that exist`)

  // 3. amounts as printed
  for (const f of x.figures) {
    const a = amountOf(f.amount.en)
    if (a == null || Math.abs(a - f.crore) > 0.5) fail(`${key}/${f.report}/${f.group}: amount "${f.amount.en}" is not ${f.crore}`)
    if (amountOf(f.words.en) != null && !f.words.en.includes(f.amount.en.replace(/^over /, '')) && !/trillion/.test(f.words.en) && !/headline/.test(f.words.en)) fail(`${key}/${f.report}/${f.group}: the words and the amount print different figures`)
  }
  for (const st of x.pipeline) for (const r of st.readings) {
    const a = amountOf(r.amount.en)
    if (a == null || Math.abs(a - r.crore) > 0.5) fail(`${key}/${st.id}/${r.report}: amount "${r.amount.en}" is not ${r.crore}`)
    if (st.projects != null && !r.words.en.includes(String(st.projects))) fail(`${key}/${st.id}/${r.report}: the reading does not print the stage's ${st.projects} projects`)
  }
  pass(`${key}: every printed amount matches its number`)

  // 4. both languages
  bi(`${key} headline`, x.headline); bi(`${key} description`, x.description); bi(`${key} official check`, x.official_check)
  for (const f of x.figures) { bi(`${key}/${f.report} words`, f.words); bi(`${key}/${f.report} amount`, f.amount) }
  for (const g of x.groups) { bi(`${key}/${g.id} label`, g.label); bi(`${key}/${g.id} note`, g.note) }
  for (const c of x.companies) { bi(`${key}/${c.name} what`, c.what); if (c.also) bi(`${key}/${c.name} also`, c.also) }
  for (const st of x.pipeline) { bi(`${key}/${st.id} label`, st.label); for (const r of st.readings) { bi(`${key}/${st.id} words`, r.words); bi(`${key}/${st.id} amount`, r.amount) } }
  for (const n of [...x.pipeline_notes, ...x.watch]) bi(`${key} note`, n)
  pass(`${key}: English and Telugu carry the same numbers`)

  // 5. stated parts against the stated total, report by report
  const byRep = (id, g) => x.figures.find((f) => f.report === id && f.group === g)
  for (const id of R.keys()) {
    const both = byRep(id, 'both'), summit = byRep(id, 'summit'), regional = byRep(id, 'regional')
    if (!both || !summit || !regional) continue
    if (both.mous != null && summit.mous != null && regional.mous != null && summit.mous + regional.mous !== both.mous) fail(`${key}/${id}: MoUs ${summit.mous} and ${regional.mous} do not make the stated ${both.mous}`)
    if (Math.abs(summit.crore + regional.crore - both.crore) > 1) fail(`${key}/${id}: ${summit.crore} and ${regional.crore} do not make the stated ${both.crore}, beyond Rs 1 crore of rounding`)
    if (both.jobs != null && summit.jobs != null && regional.jobs != null && summit.jobs + regional.jobs !== both.jobs) fail(`${key}/${id}: jobs do not make the stated total`)
  }
  pass(`${key}: where a report states parts and a total, they agree as printed`)

  // 6. lengths
  for (const l of ['en', 'te']) if (x.description[l].length > 300) fail(`${key}: ${l} description is ${x.description[l].length} characters`)
  if (!/promise/i.test(x.headline.en + x.description.en)) fail(`${key}: never says these are promises`)
  pass(`${key}: descriptions fit and say these are promises`)
}

// 7. the page adds nothing up
const page = readFileSync(join(web, 'src/components/SummitExplainer.tsx'), 'utf8')
if (/\.reduce\(|d3\.sum|\bsum\(/.test(page)) fail('SummitExplainer.tsx adds something up')
else pass('the summit page draws bars side by side and adds nothing up')

if (failed) { console.error(`${failed} problems`); process.exit(1) }
console.log('Summit report checks passed.')
