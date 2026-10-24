// One page for each government paper the site holds, and one for each investment summit.
//
// WHY
// People look for a paper by its name: "Andhra Pradesh Budget Speech 2024-25", "CAG Report 5 of 2016".
// Until now the papers only sat in a list on one page, so a search for one paper had nowhere to land.
// Each paper now has its own address, its own title and the link to the official file. The page says only
// what the record says: who published it, which year, where we found it, and the link. It never
// summarises the paper's figures.
//
// WHAT IS LEFT OUT, ON PURPOSE
// - Assembly bills (414), and the "other" papers (317, mostly single district notices): thin pages, low value.
//   They stay in the list on the Documents page.
// - Press releases (2).
// - Anything the register itself leaves out (voter-roll-like papers and lists that name private people): this
//   module reads the register file as it is, which already omits them. The test (scripts/test_docs.mjs) fails
//   if a title looks like a voter roll.
//
// ADDRESSES NEVER CHANGE
// A paper's address is built from its name and its record number once. If a name is corrected later, the
// address stays. scripts/test_docs.mjs keeps a frozen list (web/seo-slugs.json) and fails if an address in
// it disappears or changes.
//
// This file is read by the pre-renderer (seo.ts) and by the app's paper page (pages/Docs.tsx), so the words a
// crawler sees and the words a reader sees come from one place.
import papersRaw from '@/data/papers.json'
import registerRaw from '@/data/register_papers.json'
import investRaw from '@/data/investments.json'
import { crore, croreTe, dateLong, dateTe, num } from '@/lib/format'
import { shortName, type Bi } from '@/lib/titles'

const same = (s: string): Bi => ({ en: s, te: s })

/* ------------------------------------------------------------------ the kinds of paper */
type Kind = { en: string; te: string; /** one plain sentence on what this kind of paper is, true of every paper of the kind */ what: Bi }
const KINDS: Record<string, Kind> = {
  // from the register
  budget: { en: 'Budget paper', te: 'బడ్జెట్ పత్రం', what: { en: 'Budget papers set out what the state plans to spend and receive in a year. A plan is not the money actually spent.', te: 'బడ్జెట్ పత్రాలు ఒక ఏడాదిలో రాష్ట్రం ఎంత ఖర్చు చేయాలని, ఎంత పొందాలని అనుకుంటున్నదో చెబుతాయి. ప్రణాళిక అంటే ఖర్చు చేసిన డబ్బు కాదు.' } },
  audit_report: { en: 'Audit report', te: 'ఆడిట్ నివేదిక', what: { en: 'An audit report of the Comptroller and Auditor General of India (CAG) examines how public money was spent, and says what the auditors found.', te: 'కాగ్ (కంప్ట్రోలర్ అండ్ ఆడిటర్ జనరల్ ఆఫ్ ఇండియా) ఆడిట్ నివేదిక ప్రజాధనం ఎలా ఖర్చయిందో పరిశీలించి, ఆడిటర్లు ఏం కనుగొన్నారో చెబుతుంది.' } },
  policy: { en: 'Policy', te: 'విధానం', what: { en: 'A policy sets out what the government says it will do and offer in one sector. It states an intention. It is not a record of results.', te: 'ఒక రంగంలో ప్రభుత్వం ఏం చేస్తామని, ఏం అందిస్తామని చెబుతున్నదో విధానం తెలుపుతుంది. అది ఉద్దేశం మాత్రమే, ఫలితాల రికార్డు కాదు.' } },
  annual_report: { en: 'Annual report or survey', te: 'వార్షిక నివేదిక లేదా సర్వే', what: { en: 'A yearly report or survey published by the state, with its official figures for the year.', te: 'రాష్ట్రం ప్రచురించే వార్షిక నివేదిక లేదా సర్వే; ఆ ఏడాది అధికారిక అంకెలు ఉంటాయి.' } },
  white_paper: { en: 'White paper', te: 'శ్వేతపత్రం', what: { en: 'A white paper is a government document that sets out the facts, or the government’s position, on one subject.', te: 'ఒక అంశంపై వాస్తవాలను లేదా ప్రభుత్వ వైఖరిని తెలిపే ప్రభుత్వ పత్రం శ్వేతపత్రం.' } },
  government_order: { en: 'Government order', te: 'ప్రభుత్వ ఉత్తర్వు', what: { en: 'A Government Order (GO) is a written order issued by a department of the state.', te: 'ప్రభుత్వ ఉత్తర్వు (జీఓ) అంటే రాష్ట్రంలోని ఒక శాఖ జారీ చేసే లిఖితపూర్వక ఉత్తర్వు.' } },
  // from our own list of papers (papers.json)
  'Demands for Grants': { en: 'Demands for Grants', te: 'గ్రాంట్ల డిమాండ్లు', what: { en: 'Demands for Grants list, department by department, the money the government asks the Assembly to approve for the year.', te: 'గ్రాంట్ల డిమాండ్లు శాఖల వారీగా, ఆ ఏడాదికి శాసనసభ ఆమోదం కోసం ప్రభుత్వం కోరే మొత్తాలను చూపుతాయి.' } },
  'Portal': { en: 'Portal', te: 'పోర్టల్', what: { en: 'A government website where papers or data are published.', te: 'పత్రాలు లేదా వివరాలు ప్రచురించే ప్రభుత్వ వెబ్‌సైట్.' } },
  'Budget speech': { en: 'Budget speech', te: 'బడ్జెట్ ప్రసంగం', what: { en: 'The Finance Minister’s speech when the budget is presented.', te: 'బడ్జెట్ ప్రవేశపెట్టేటప్పుడు ఆర్థిక మంత్రి చేసే ప్రసంగం.' } },
  'CAG audit report': { en: 'CAG audit report', te: 'కాగ్ ఆడిట్ నివేదిక', what: { en: 'An audit report of the Comptroller and Auditor General of India (CAG) examines how public money was spent, and says what the auditors found.', te: 'కాగ్ (కంప్ట్రోలర్ అండ్ ఆడిటర్ జనరల్ ఆఫ్ ఇండియా) ఆడిట్ నివేదిక ప్రజాధనం ఎలా ఖర్చయిందో పరిశీలించి, ఆడిటర్లు ఏం కనుగొన్నారో చెబుతుంది.' } },
  'Socio-Economic Survey': { en: 'Socio-Economic Survey', te: 'సామాజిక ఆర్థిక సర్వే', what: { en: 'The state’s yearly review of its economy and society, with official figures.', te: 'రాష్ట్ర ఆర్థిక, సామాజిక స్థితిపై వార్షిక సమీక్ష; అధికారిక అంకెలు ఉంటాయి.' } },
  'Open data': { en: 'Open data', te: 'ఓపెన్ డేటా', what: { en: 'A public data set published by a government body.', te: 'ప్రభుత్వ సంస్థ ప్రచురించిన బహిరంగ గణాంకాల సమితి.' } },
  'Budget statement': { en: 'Budget statement', te: 'బడ్జెట్ ప్రకటన', what: { en: 'A statement of the state’s receipts and spending as part of the budget papers.', te: 'బడ్జెట్ పత్రాల్లో భాగంగా రాష్ట్ర ఆదాయ, ఖర్చుల ప్రకటన.' } },
  'RBI publication': { en: 'RBI publication', te: 'ఆర్బీఐ ప్రచురణ', what: { en: 'A publication of the Reserve Bank of India, with figures for the states.', te: 'రిజర్వ్ బ్యాంక్ ఆఫ్ ఇండియా ప్రచురణ; రాష్ట్రాల అంకెలు ఉంటాయి.' } },
  'Central statistics': { en: 'Central statistics', te: 'కేంద్ర గణాంకాలు', what: { en: 'Statistics published by the Union government, with figures for the states.', te: 'కేంద్ర ప్రభుత్వం ప్రచురించిన గణాంకాలు; రాష్ట్రాల అంకెలు ఉంటాయి.' } },
  'Tenders': { en: 'Tenders', te: 'టెండర్లు', what: { en: 'A government site where tender notices are published.', te: 'టెండర్ ప్రకటనలు ప్రచురించే ప్రభుత్వ సైట్.' } },
  'Dashboard': { en: 'Dashboard', te: 'డ్యాష్‌బోర్డ్', what: { en: 'A government page that shows live or regularly updated figures.', te: 'తాజా లేదా తరచూ నవీకరించే అంకెలను చూపే ప్రభుత్వ పేజీ.' } },
  'Assembly record': { en: 'Assembly record', te: 'శాసనసభ రికార్డు', what: { en: 'A record of the state Assembly.', te: 'రాష్ట్ర శాసనసభ రికార్డు.' } },
  'Central document': { en: 'Central document', te: 'కేంద్ర పత్రం', what: { en: 'A document published by the Union government.', te: 'కేంద్ర ప్రభుత్వం ప్రచురించిన పత్రం.' } },
  'Government Orders': { en: 'Government orders', te: 'ప్రభుత్వ ఉత్తర్వులు', what: { en: 'Written orders issued by departments of the state.', te: 'రాష్ట్ర శాఖలు జారీ చేసే లిఖితపూర్వక ఉత్తర్వులు.' } },
  'Gazette': { en: 'Gazette', te: 'గెజిట్', what: { en: 'The official gazette, where laws, rules and notices are published.', te: 'చట్టాలు, నియమాలు, ప్రకటనలు ప్రచురించే అధికారిక గెజిట్.' } },
  'RTI disclosure': { en: 'RTI disclosure', te: 'సమాచార హక్కు వెల్లడి', what: { en: 'Information a department publishes under the Right to Information Act.', te: 'సమాచార హక్కు చట్టం కింద ఒక శాఖ ప్రచురించే సమాచారం.' } },
}

/** The register kinds that get a page of their own. */
export const REGISTER_KINDS_WITH_PAGE = ['budget', 'audit_report', 'policy', 'annual_report', 'white_paper', 'government_order']

/* ------------------------------------------------------------------ the records */
export type DocRec = {
  slug: string
  src: 'paper' | 'register'
  kind: string
  title: string
  publisher: string
  /** the year or period the paper names: "2023-24", "Report 3 of 2024", "2014-15, 2026-27" */
  period: string | null
  year: number | null
  /** the day it was published, when the register has it (yyyy-mm-dd) */
  date: string | null
  url: string
  /** what the paper holds, from our own list (English only) */
  what: string | null
  /** a note on reaching the source, from our own list (English only) */
  note: string | null
  /** where we found it, from the register */
  portal: string | null
  /** the day we last checked the link, from our own list */
  checked: string | null
  language: string | null
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** The name, tidied for a heading: one space between words, no trailing file code ("... - 2024INFRA_33986_MS18"). */
export const tidy = (t: string) => t.replace(/\s+/g, ' ').replace(/\s[-–]\s[A-Za-z0-9]*\d[A-Za-z0-9]*_[A-Za-z0-9_]+$/, '').trim()

/** Our list's own notes are working notes. A sentence is shown only when it reads as a plain description of the paper
 *  (no "we", "our", no remarks about what is missing or unreachable). Access notes are never shown. */
const publicWords = (t: unknown): string | null =>
  typeof t === 'string' && t.trim() && !/\b(we|our|us)\b|missing|not been able|could not|cannot|blocked|refus|unreachable|earlier note/i.test(t) ? t.trim() : null

const paperDocs = (papersRaw as any).documents as any[]
const registerItems = (registerRaw as any).items as any[]

function build(): DocRec[] {
  const out: DocRec[] = []
  const urls = new Set<string>()
  for (const d of paperDocs) {
    // an entry that records a paper we could not find is a note to ourselves, not a paper
    if (!d.url || !d.title || /missing|could not locate/i.test(d.id + ' ' + d.title)) continue
    const years: string[] = d.years ?? []
    out.push({
      slug: String(d.id), src: 'paper', kind: d.doc_type ?? 'Portal', title: tidy(d.title), publisher: d.publisher ?? '',
      period: years.length ? years.join(', ') : null, year: years.length ? parseInt(years[0], 10) || null : null, date: null,
      url: d.url, what: publicWords(d.what_it_holds), note: null, portal: null,
      checked: d.verified ? d.verified_date ?? null : null, language: d.language ?? null,
    })
    urls.add(d.url)
  }
  for (const r of registerItems) {
    if (!REGISTER_KINDS_WITH_PAGE.includes(r.k) || !r.u || !r.t || urls.has(r.u)) continue
    const title = tidy(r.t)
    out.push({
      slug: `${slugify(title).slice(0, 60).replace(/-+$/, '')}-r${r.id}`, src: 'register', kind: r.k, title, publisher: r.o ?? '',
      period: r.ref ?? (r.y ? String(r.y) : null), year: r.y ?? null, date: r.d ?? null,
      url: r.u, what: null, note: null, portal: r.portal ?? null, checked: null, language: null,
    })
  }
  // Two files of one paper (a budget volume cut into parts) share a name: number them, in record order, so each title is its own.
  const byName = new Map<string, DocRec[]>()
  for (const d of out) byName.set(d.title.toLowerCase() + '|' + d.kind + '|' + d.publisher, [...(byName.get(d.title.toLowerCase() + '|' + d.kind + '|' + d.publisher) ?? []), d])
  for (const g of byName.values()) if (g.length > 1) g.forEach((d, i) => { d.title = `${d.title} (part ${i + 1})` })
  return out
}
export const docRecs: DocRec[] = build()
export const docBySlug = new Map(docRecs.map((d) => [d.slug, d]))

/* ------------------------------------------------------------------ the words */
export const kindOf = (d: DocRec): Kind => KINDS[d.kind] ?? { en: d.kind, te: d.kind, what: same('A government paper.') }
const hasAp = (t: string) => /andhra|\bAP\b/i.test(t)

/** The page's heading: the paper's own name, with what it is and where. Names that already say it are left as they are. */
export function docTitle(d: DocRec): Bi {
  const k = kindOf(d)
  // a budget paper in the register is named by its department or its volume: the year it belongs to goes after the name
  const base = d.src === 'register' && d.kind === 'budget' && d.period && !d.title.includes(d.period) ? `${d.title} ${d.period}` : d.title
  const says = (w: string) => base.toLowerCase().includes(w.toLowerCase())
  const tail = (lang: 'en' | 'te') => {
    const kind = k[lang]
    const bits: string[] = []
    if (!says(k.en)) bits.push(kind)
    if (!hasAp(base)) bits.push(lang === 'en' ? 'Andhra Pradesh' : 'ఆంధ్రప్రదేశ్')
    return bits.length ? `: ${bits.join(', ')}` : ''
  }
  return { en: `${base}${tail('en')}`, te: `${base}${tail('te')}` }
}
/** The tab and search-result title: the name cut in the middle when it is long, never inside a word.
 *  Two papers whose cut names come out the same keep their whole names, so no two tabs read alike. */
const cutTab = (t: Bi): Bi => {
  const cut = (s: string) => { const i = s.lastIndexOf(': '); return i > 0 ? shortName(s.slice(0, i), 62) + s.slice(i) : shortName(s, 80) }
  return { en: cut(t.en), te: cut(t.te) }
}
let tabCount: Map<string, number> | null = null
export function docTab(d: DocRec): Bi {
  if (!tabCount) {
    tabCount = new Map()
    for (const x of docRecs) { const c = cutTab(docTitle(x)).en; tabCount.set(c, (tabCount.get(c) ?? 0) + 1) }
  }
  const t = docTitle(d)
  const c = cutTab(t)
  return (tabCount.get(c.en) ?? 0) > 1 ? t : c
}
export function docDescription(d: DocRec): Bi {
  const k = kindOf(d)
  const when = d.date ? `, ${dateLong(d.date)}` : d.period ? `, ${d.period}` : ''
  const whenTe = d.date ? `, ${dateTe(d.date)}` : d.period ? `, ${d.period}` : ''
  const head = `${tidy(d.title)}. ${k.en} from ${d.publisher || 'a government body'}${when}.`
  const tail = ' The official file is linked.'
  // the paper's own description goes in only when the whole sentence fits: a description never stops mid-sentence
  const what = d.what && (head + ' ' + d.what + tail).length <= 300 ? ` ${d.what}` : ''
  const fit = (s: string) => (s.length <= 300 ? s : s.slice(0, 299).replace(/\s+\S*$/, '') + '…')
  return {
    en: fit(head + what + tail),
    te: fit(`${tidy(d.title)}. ${d.publisher || 'ప్రభుత్వ సంస్థ'} నుంచి ${k.te}${whenTe}. అధికారిక ఫైల్ లింక్ ఇక్కడ ఉంది.`),
  }
}

/** One fact on the page: a label, a value, and a link when it has one. */
export type Fact = { label: Bi; value: Bi; href?: string; external?: boolean; lang?: 'en' }
export function docFacts(d: DocRec): Fact[] {
  const k = kindOf(d)
  const f: Fact[] = [{ label: { en: 'Kind of paper', te: 'పత్రం రకం' }, value: { en: k.en, te: k.te } }]
  if (d.publisher) f.push({ label: { en: 'Published by', te: 'ప్రచురణ' }, value: same(d.publisher), lang: 'en' })
  if (d.date) f.push({ label: { en: 'Published on', te: 'ప్రచురించిన తేదీ' }, value: { en: dateLong(d.date), te: dateTe(d.date) } })
  if (d.period) f.push({ label: { en: 'Year or period', te: 'సంవత్సరం లేదా కాలం' }, value: same(d.period) })
  if (d.language) f.push({ label: { en: 'Language of the paper', te: 'పత్రం భాష' }, value: { en: d.language, te: d.language === 'English' ? 'ఇంగ్లీషు' : d.language } })
  if (d.portal) f.push({ label: { en: 'Where we found it', te: 'మాకు ఎక్కడ దొరికింది' }, value: same(d.portal), lang: 'en' })
  if (d.what) f.push({ label: { en: 'What it holds', te: 'ఇందులో ఏముంది' }, value: same(d.what), lang: 'en' })
  if (d.checked) f.push({ label: { en: 'Link last checked', te: 'లింక్ చివరిగా చూసిన తేదీ' }, value: { en: dateLong(d.checked), te: dateTe(d.checked) } })
  f.push({ label: { en: 'The official file', te: 'అధికారిక ఫైల్' }, value: { en: 'Open it at its source', te: 'మూలం వద్ద తెరవండి' }, href: d.url, external: true })
  return f
}

/** Other papers of the same kind from the same office, newest year first: how a reader walks from one year to the next. */
const groups = new Map<string, DocRec[]>()
for (const d of docRecs) {
  const key = `${d.kind}|${d.publisher}`
  groups.set(key, [...(groups.get(key) ?? []), d])
}
export function docSiblings(d: DocRec, limit = 8): DocRec[] {
  const g = groups.get(`${d.kind}|${d.publisher}`) ?? []
  return g.filter((x) => x.slug !== d.slug).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)).slice(0, limit)
}

/* ------------------------------------------------------------------ the investment summits */
type Summit = {
  key: string; name: string; long_name: string; city: string; start_date: string; end_date: string
  mou_count: number; investment_crore: number; jobs: number; figure_type: string; quote: string; source_url: string
}
export const summits = (investRaw as any).summits as Summit[]
export const summitBySlug = new Map(summits.map((s) => [s.key, s]))
const SUMMIT_TE: Record<string, string> = {
  ps2016: 'భాగస్వామ్య సదస్సు 2016', ps2017: 'భాగస్వామ్య సదస్సు 2017', ps2018: 'భాగస్వామ్య సదస్సు 2018',
  gis2023: 'గ్లోబల్ ఇన్వెస్టర్స్ సమ్మిట్ 2023', ps2025: 'భాగస్వామ్య సదస్సు 2025',
}
export const summitName = (s: Summit): Bi => ({ en: s.name, te: SUMMIT_TE[s.key] ?? s.name })
export const summitTitle = (s: Summit): Bi => ({ en: `What did the ${s.name} announce?`, te: `${SUMMIT_TE[s.key] ?? s.name}లో ఏం ప్రకటించారు?` })
export const summitDescription = (s: Summit): Bi => ({
  en: `${s.name}, ${s.city}: the state’s own statement says ${num(s.mou_count, 0)} MoUs, ${crore(s.investment_crore, 0)} of potential investment and ${num(s.jobs, 0)} potential jobs. A promise, not money spent. The state’s paper is linked.`.slice(0, 300),
  te: `${SUMMIT_TE[s.key] ?? s.name}, ${s.city}: రాష్ట్ర ప్రకటన ప్రకారం ${num(s.mou_count, 0)} ఎంఓయూలు, ${croreTe(s.investment_crore, 0)} సంభావ్య పెట్టుబడి, ${num(s.jobs, 0)} సంభావ్య ఉద్యోగాలు. ఇది హామీ, ఖర్చు చేసిన డబ్బు కాదు. రాష్ట్ర పత్రం లింక్ చేశాం.`.slice(0, 300),
})
export function summitFacts(s: Summit): Fact[] {
  return [
    { label: { en: 'Summit', te: 'సదస్సు' }, value: { en: s.long_name, te: SUMMIT_TE[s.key] ?? s.long_name } },
    { label: { en: 'Where and when', te: 'ఎక్కడ, ఎప్పుడు' }, value: { en: `${s.city}, ${dateLong(s.start_date)}${s.end_date !== s.start_date ? ` to ${dateLong(s.end_date)}` : ''}`, te: `${s.city}, ${dateTe(s.start_date)}${s.end_date !== s.start_date ? ` నుంచి ${dateTe(s.end_date)} వరకు` : ''}` } },
    { label: { en: 'MoUs the state says were signed', te: 'సంతకం చేశారని రాష్ట్రం చెప్పిన ఎంఓయూలు' }, value: same(num(s.mou_count, 0)) },
    { label: { en: 'Potential investment, as the state states it', te: 'రాష్ట్రం చెప్పిన సంభావ్య పెట్టుబడి' }, value: { en: crore(s.investment_crore, 0), te: croreTe(s.investment_crore, 0) } },
    { label: { en: 'Potential jobs, as the state states it', te: 'రాష్ట్రం చెప్పిన సంభావ్య ఉద్యోగాలు' }, value: same(num(s.jobs, 0)) },
    { label: { en: 'The state’s own words', te: 'రాష్ట్రం మాటల్లోనే' }, value: same(`“${s.quote}”`), lang: 'en' },
    { label: { en: 'The paper', te: 'పత్రం' }, value: { en: 'Open the paper that says it', te: 'ఇది చెప్పిన పత్రాన్ని తెరవండి' }, href: s.source_url, external: true },
  ]
}
export const SUMMIT_CAVEAT: Bi = {
  en: 'These are promises announced at the summit. They are not money spent and not jobs created. What was actually built is a separate question: see what the state’s papers say, year by year, on the investments page.',
  te: 'ఇవి సదస్సులో ప్రకటించిన హామీలు. ఖర్చు చేసిన డబ్బు కాదు, సృష్టించిన ఉద్యోగాలు కాదు. వాస్తవంగా ఎంత నిర్మించారన్నది వేరే ప్రశ్న: రాష్ట్ర పత్రాలు సంవత్సరం వారీగా ఏం చెబుతున్నాయో పెట్టుబడుల పేజీలో చూడండి.',
}
