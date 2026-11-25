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
//  7. the pages that draw this data add nothing up: no sum or reduce over amounts in SummitExplainer.tsx,
//     summit-parts.tsx or Reports.tsx (this test may add, to check printed parts; the pages may not)
//  8. the Reports section's cards (src/lib/reports.ts) print figures from this file word for word
//  also: sectors, companies, places and differences name real reports and real districts, and say the same in
//  both languages; a split whose report states the day's total must make that total, or a row was mistyped
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
    // A page that prints no date keeps date null and says so in both languages; a guessed date would be our own figure.
    if (r.date === null) { if (!r.date_note) fail(`${key}/${r.id}: no date and no note saying the page prints none`); else bi(`${key}/${r.id} date note`, r.date_note) }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > x.checked) fail(`${key}/${r.id}: date ${r.date} is not a day on or before the check (${x.checked})`)
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

  // 5b. the full report's parts: sectors, companies, places and differences
  const DISTRICTS = new Set(JSON.parse(readFileSync(join(web, 'src/data/districts.json'), 'utf8')).items.map((d) => d.slug))
  for (const sc of x.sectors ?? []) {
    bi(`${key}/sectors/${sc.id} label`, sc.label); bi(`${key}/sectors/${sc.id} note`, sc.note)
    for (const id of sc.reports) if (!R.has(id)) fail(`${key}/sectors/${sc.id}: names report ${id}, which is not in the list`)
    for (const r of sc.rows) {
      if (!R.has(r.report)) fail(`${key}/sectors/${sc.id}/${r.name.en}: names report ${r.report}, which is not in the list`)
      const a = amountOf(r.amount.en)
      if (a == null || Math.abs(a - r.crore) > 0.5) fail(`${key}/sectors/${sc.id}/${r.name.en}: amount "${r.amount.en}" is not ${r.crore}`)
      if (!r.words.en.includes(r.amount.en)) fail(`${key}/sectors/${sc.id}/${r.name.en}: the words do not print the amount`)
      bi(`${key}/sectors/${sc.id}/${r.name.en} name`, r.name, { sameDigits: false }); bi(`${key}/sectors/${sc.id}/${r.name.en} words`, r.words); bi(`${key}/sectors/${sc.id}/${r.name.en} amount`, r.amount)
    }
    // A split whose report also states the day's total: the printed rows must make that total, or a row was mistyped.
    if (sc.total) {
      const t = x.figures.find((f) => f.report === sc.total.report && f.group === sc.total.group)
      if (!t) fail(`${key}/sectors/${sc.id}: the stated total (${sc.total.report}, ${sc.total.group}) is not a figure`)
      else {
        const rup = sc.rows.reduce((s, r) => s + r.crore, 0), mous = sc.rows.reduce((s, r) => s + (r.mous ?? 0), 0)
        if (Math.abs(rup - t.crore) > 1) fail(`${key}/sectors/${sc.id}: rows make ${rup}, the stated total is ${t.crore}`)
        if (t.mous != null && mous !== t.mous) fail(`${key}/sectors/${sc.id}: rows count ${mous} MoUs, the stated total is ${t.mous}`)
      }
    }
  }
  for (const c of x.companies) {
    if (c.day !== null && ![1, 2].includes(c.day)) fail(`${key}/${c.name}: day must be 1, 2 or null (not stated)`)
    if (c.district != null && !DISTRICTS.has(c.district)) fail(`${key}/${c.name}: district ${c.district} is not one of the 28`)
    if (c.district != null && !c.place) fail(`${key}/${c.name}: a district on the map with no place as printed`)
    for (const o of c.others ?? []) { if (!R.has(o.report)) fail(`${key}/${c.name}: another reading names report ${o.report}, which is not in the list`); bi(`${key}/${c.name} other`, o.words) }
  }
  // A company's agreement mark is set by hand and held to its readings: "one" only when no other report prints it.
  for (const c of x.companies) {
    if (!['one', 'agree', 'differ'].includes(c.check)) fail(`${key}/${c.name}: check must be one, agree or differ`)
    if ((c.check === 'one') !== !(c.others ?? []).length) fail(`${key}/${c.name}: check "${c.check}" does not fit ${(c.others ?? []).length} other readings`)
  }
  const SECT = ['manufacturing', 'energy', 'digital', 'vehicles', 'chemicals', 'food', 'defence', 'other']
  for (const c of x.companies) if (!SECT.includes(c.sector)) fail(`${key}/${c.name}: sector ${c.sector} is not one of the eight`)
  for (const sc of x.sectors ?? []) for (const r of sc.rows) if (!SECT.includes(r.sector)) fail(`${key}/sectors/${sc.id}/${r.name.en}: sector ${r.sector} is not one of the eight`)
  // Each dashboard tile shows a figure as printed: the amount, or a jobs number the report's own words print.
  for (const k of x.kpis ?? []) for (const s of [k, k.compare].filter(Boolean)) {
    const f = x.figures.find((g) => g.report === s.report && g.group === s.group)
    if (!f) { fail(`${key} tile ${k.id}: ${s.report}/${s.group} is not a figure`); continue }
    if (s.field === 'jobs' && (f.jobs == null || !f.words.en.includes(f.jobs.toLocaleString('en-IN')))) fail(`${key} tile ${k.id}: ${s.report}/${s.group} prints no jobs figure`)
    bi(`${key} tile ${k.id} label`, s.label, { sameDigits: true })
  }
  if (x.finding) {
    const fd = x.finding
    bi(`${key} finding title`, fd.title); bi(`${key} finding note`, fd.note)
    for (const side of ['before', 'after']) {
      const s = fd[side], f = x.figures.find((g) => g.report === s.report && g.group === s.group)
      if (!f) { fail(`${key} finding ${side}: ${s.report}/${s.group} is not a figure`); continue }
      if (s.big.en !== f.amount.en || s.big.te !== f.amount.te) fail(`${key} finding ${side}: prints ${s.big.en}, the figure is ${f.amount.en}`)
      if (!fd.title.en.includes(f.amount.en)) fail(`${key} finding title does not print ${f.amount.en}`)
      bi(`${key} finding ${side} label`, s.label); bi(`${key} finding ${side} sub`, s.sub)
      for (const n of (s.sub.en.match(/\d[\d,]*/g) ?? [])) if (!f.words.en.includes(n)) fail(`${key} finding ${side}: ${n} is not in the figure's words`)
    }
  }
  const names = x.companies.map((c) => `${c.name}|${c.day}`)
  if (new Set(names).size !== names.length) fail(`${key}: one company is listed twice on the same day`)
  for (const n of [...(x.companies_notes ?? []), ...(x.not_read ?? [])]) bi(`${key} note`, n)
  for (const d of x.differences ?? []) {
    bi(`${key}/differences/${d.id} subject`, d.subject, { sameDigits: false }); bi(`${key}/differences/${d.id} note`, d.note)
    if (d.readings.length < 2) fail(`${key}/differences/${d.id}: a difference needs two readings`)
    for (const r of d.readings) { if (!R.has(r.report)) fail(`${key}/differences/${d.id}: names report ${r.report}, which is not in the list`); bi(`${key}/differences/${d.id} reading`, r.words) }
  }
  pass(`${key}: sectors, companies, places and differences name real reports and districts, in both languages`)

  // 6. lengths
  for (const l of ['en', 'te']) if (x.description[l].length > 300) fail(`${key}: ${l} description is ${x.description[l].length} characters`)
  if (!/promise/i.test(x.headline.en + x.description.en)) fail(`${key}: never says these are promises`)
  if (x.meta_description) { bi(`${key} meta description`, x.meta_description); for (const l of ['en', 'te']) if (x.meta_description[l].length > 158) fail(`${key}: ${l} meta description is ${x.meta_description[l].length} characters, over 158`) }
  pass(`${key}: descriptions fit and say these are promises`)
}

// 8. the Reports section's cards print figures from this file, word for word, with the same report behind them
{
  const src = readFileSync(join(web, 'src/lib/reports.ts'), 'utf8')
  const cards = [...src.matchAll(/\{ amount: \{ en: '([^']+)', te: '([^']+)' \}, what: \{ en: '([^']+)', te: '([^']+)' \}, report: '([^']+)', group: '([^']+)' \}/g)]
  const summits = [...src.matchAll(/summit: '([^']+)'/g)].map((m) => m[1])
  if (!cards.length || !summits.length) fail('reports.ts: no card figures found; the test reads them by their shape')
  for (const s of summits) if (!data[s]) fail(`reports.ts: report built from summit ${s}, which has no reports`)
  for (const [, en, te, wen, wte, report, group] of cards) {
    const f = summits.map((s) => data[s]).flatMap((x) => x.figures).find((f) => f.report === report && f.group === group)
    if (!f) { fail(`reports.ts: card figure ${en} names ${report}/${group}, which is not a figure`); continue }
    if (f.amount.en !== en || f.amount.te !== te) fail(`reports.ts: card prints ${en} / ${te}, the figure is ${f.amount.en} / ${f.amount.te}`)
    bi(`reports.ts card ${en}`, { en: wen, te: wte })
    for (const n of (wen.match(/\d[\d,]*/g) ?? [])) if (!f.words.en.includes(n)) fail(`reports.ts: card says ${n} for ${en}, which the report's words do not print`)
  }
  if (/—|--/.test(src)) fail('reports.ts: em dash or double dash')
  pass(`reports.ts: ${cards.length} card figures are printed figures, with the same report behind each`)
  // The hero's one-line link to the newest report is written by hand, so the first screen downloads nothing more.
  const slugs = [...src.matchAll(/slug: '([^']+)'/g)].map((m) => m[1])
  const hero = readFileSync(join(web, 'src/pages/Home.tsx'), 'utf8') + readFileSync(join(web, 'src/components/search-dialog.tsx'), 'utf8')
  for (const m of hero.matchAll(/(?:href\('|token: ')report-([^']+)'/g)) if (!slugs.includes(m[1])) fail(`Home.tsx or search-dialog.tsx links report ${m[1]}, which reports.ts does not have`)
}

// 7. the pages add nothing up
for (const f of ['src/components/SummitExplainer.tsx', 'src/components/summit-parts.tsx', 'src/components/summit-dashboard.tsx', 'src/pages/Reports.tsx']) {
  const page = readFileSync(join(web, f), 'utf8')
  if (/\.reduce\(|d3\.sum|\bsum\(|\+=\s*[a-z]+\.crore/.test(page)) fail(`${f} adds something up`)
  else pass(`${f} draws bars side by side and adds nothing up`)
}

if (failed) { console.error(`${failed} problems`); process.exit(1) }
console.log('Summit report checks passed.')
