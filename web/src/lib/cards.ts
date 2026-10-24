// Cards: one fact each, built from the record, never typed.
//
// Every value on a card is read from the same data the pages use, so a card can
// never disagree with its page. Each card keeps its paper and date, because a
// card travels alone (forwarded on WhatsApp) and the source must travel with it.
// Telugu and English are built from the same value in one place.

import { districts, meta } from '@/lib/data'
import { projects } from '@/lib/data-projects'
import { pol } from '@/lib/data-polavaram'
import { money } from '@/lib/data-money'
import { facts } from '@/lib/data-facts'
import { invest } from '@/lib/data-invest'
import { claims } from '@/lib/data-claims'
import { registerPapers } from '@/lib/data-papers'
import type { TenderSummary } from '@/lib/live'
import { crore, croreTe, dateLong, dateTe, num } from '@/lib/format'

export type BiS = { en: string; te: string }
export type CardKind = 'number' | 'picture' | 'thenNow' | 'claim' | 'district' | 'week' | 'word'
/** A paper's name stays in English (it is a title); our own registers are named in both languages, and every date line is in both. */
export type Paper = { label: string | BiS; date?: BiS; url?: string }

export type FactCard = {
  id: string
  kind: CardKind
  topic: BiS
  title: BiS
  /** The figure exactly as the paper prints it. */
  value?: BiS
  line?: BiS
  paper: Paper
  /** Route token for "Full picture". */
  href: string
  hrefLabel?: BiS
  /** A shorter figure for the share picture, when the card's own value is long. */
  share?: { value: string }
  img?: 'dam'
  picture?: { label: BiS; value: number; text: BiS; style: 'plan' | 'spent' }[]
  thenNow?: { a: { label: BiS; value: string; est?: boolean }; b: { label: BiS; value: string; est?: boolean } }
  claim?: { figure: BiS; said: BiS; doc: BiS; record: BiS; recordDoc: BiS; status: BiS }
  word?: { term: BiS; plain: BiS; example: BiS }
}

const bi = (en: string, te: string): BiS => ({ en, te })

/* ------------------------------------------------------------ Polavaram */
function polavaramCard(): FactCard {
  const r = pol.readings[pol.readings.length - 1]
  return {
    id: 'polavaram', kind: 'number', img: 'dam',
    topic: bi('Projects', 'పనులు'),
    title: bi('Polavaram dam', 'పోలవరం ప్రాజెక్టు'),
    value: bi(`${num(r.pct)}%`, `${num(r.pct)}%`),
    line: bi(`of the physical work done, at ${dateLong(r.date)}`, `భౌతిక పనిలో పూర్తయిన భాగం, ${dateTe(r.date)} నాటికి`),
    paper: { label: r.paper, url: r.url },
    href: 'project-613',
    share: { value: `${num(r.pct)}%` },
  }
}

/* --------------------------------------------------- tenders this week */
// Live: built from the server's tender summary. Until that answer arrives, or if it cannot, the card is
// left out rather than filled from an old copy.
function tendersCard(sum: TenderSummary | null | undefined): FactCard | null {
  if (!sum?.closing_next_7_days?.length || !sum.read_on) return null
  const today = sum.read_on
  const { day, count: n } = [...sum.closing_next_7_days].sort((a, b) => b.count - a.count || a.day.localeCompare(b.day))[0]
  const one = sum.portals.length === 1 ? sum.portals[0].portal : null
  return {
    id: 'tenders', kind: 'week',
    topic: bi('This week', 'ఈ వారం'),
    title: bi('Tenders closing', 'గడువు ముగుస్తున్న టెండర్లు'),
    value: bi(String(n), String(n)),
    line: bi(`${one ? `${one} tender notices` : 'Tender notices'} close on ${dateLong(day)}, India time.`, `${one ? `${one} ` : ''}టెండర్లు ${dateTe(day)}న ముగుస్తాయి.`),
    paper: { label: one ? `${one} tenders portal` : 'State tender portals', date: bi(`read ${dateLong(today)}`, `${dateTe(today)}న చదివాం`) },
    href: 'tenders', hrefLabel: bi('See them', 'అవి చూడండి'),
  }
}

/* ---------------------------------------------------- schools, 2024-25 */
function schoolsCard(): FactCard | null {
  const dep = (money.departments as any[]).find((d) => d.no === 'XII')
  if (!dep) return null
  // rows are compact: y year, s stage ('BE', 'RE', 'A'), t gross total (see scripts/prep_departments.py)
  const years = ([...new Set(dep.rows.map((r: any) => r.y))] as string[]).sort()
  const get = (y: string, s: string) => dep.rows.find((r: any) => r.y === y && r.s === s)
  const y = [...years].reverse().find((yy) => get(yy, 'A')?.t != null && get(yy, 'BE')?.t != null)
  if (!y) return null
  const be = get(y, 'BE').t as number
  const a = get(y, 'A')
  return {
    id: 'schools', kind: 'picture',
    topic: bi('Money', 'డబ్బు'),
    title: bi(`School Education, ${y}`, `పాఠశాల విద్య, ${y}`),
    picture: [
      { label: bi('Planned', 'ప్రణాళిక'), value: be, text: bi(crore(be), croreTe(be)), style: 'plan' },
      { label: bi('Spent', 'ఖర్చు'), value: a.t, text: bi(crore(a.t), croreTe(a.t)), style: 'spent' },
    ],
    line: bi('Both bars on one scale.', 'రెండూ ఒకే కొలతపై.'),
    paper: { label: 'AP budget books, Demand XII', url: (money.dept_books as Record<string, string>)?.[a.src] },
    href: 'money-departments',
  }
}

/* ------------------------------------------------- income per person */
function incomeCard(): FactCard | null {
  const ind = (facts.indicators as any[]).find((i) => i.key === 'pc_nsdp_current')
  if (!ind) return null
  const pts = (ind.points as any[]).filter((p) => p.value != null)
  const first = pts.find((p) => p.fy_label === '2014-15') ?? pts[0]
  const last = pts[pts.length - 1]
  const est = (p: any) => p.stage === 'PE' || p.stage === 'RE' || p.stage === 'BE'
  return {
    id: 'income', kind: 'thenNow',
    topic: bi('Economy', 'ఆర్థిక వ్యవస్థ'),
    title: bi('Income per person', 'తలసరి ఆదాయం'),
    thenNow: {
      a: { label: bi(first.fy_label, first.fy_label), value: '₹' + num(first.value, 0), est: est(first) },
      b: { label: bi(est(last) ? `${last.fy_label}, provisional` : last.fy_label, est(last) ? `${last.fy_label}, తాత్కాలికం` : last.fy_label), value: '₹' + num(last.value, 0), est: est(last) },
    },
    line: bi('A year, per person, in the rupees of each year, so price rises are included.', 'ఒక్కొక్కరికి ఏడాదికి, ఆయా ఏళ్ల రూపాయల్లో; ధరల పెరుగుదల కూడా ఇందులో ఉంది.'),
    paper: { label: 'RBI Handbook of States 2024-25, Table 19' },
    href: 'state-facts',
  }
}

/* ------------------------------------------------------- debt, RBI */
function debtCard(): FactCard | null {
  const s = (money.series as any[]).find((x) => x.indicator === 'outstanding_liabilities' && x.family === 'RBI')
  const p = [...s.points].reverse().find((x: any) => x.stage === 'A')
  if (!p) return null
  return {
    id: 'debt', kind: 'number',
    topic: bi('Money', 'డబ్బు'),
    title: bi(`What the state owed, end of March ${p.fy_end}`, `${p.fy_end} మార్చి చివరికి రాష్ట్ర అప్పు`),
    value: bi(crore(p.value), croreTe(p.value)),
    line: bi('The state government\'s own debt, from its accounts, as RBI counts it.', 'ప్రభుత్వ సొంత అప్పు, లెక్కల ప్రకారం, ఆర్బీఐ లెక్కించినట్లు.'),
    paper: { label: 'RBI, State Finances 2025-26' },
    href: 'money',
  }
}

/* ------------------------------------------------- investment promises */
function promisesCard(): FactCard {
  const all = invest.mous as any[]
  const op = all.filter((m) => m.status === 'operational').length
  return {
    id: 'promises', kind: 'number',
    topic: bi('Investment promises', 'పెట్టుబడి హామీలు'),
    title: bi('Company promises now running', 'ఇప్పుడు నడుస్తున్న పెట్టుబడి హామీలు'),
    value: bi(`${op} of ${all.length}`, `${all.length}లో ${op}`),
    line: bi('promise records are reported operational. A promise is not money spent.', 'హామీ రికార్డులు నడుస్తున్నట్లు నమోదయ్యాయి. హామీ అంటే ఖర్చు చేసిన డబ్బు కాదు.'),
    paper: { label: bi('Our register of promise records', 'మా హామీ రికార్డుల రిజిస్టర్'), date: bi(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) },
    href: 'investments',
  }
}

/* ---------------------------------------------------------- claims */
// Claim cards come in fair turns: one from each government's white paper, every day.
function claimCards(): FactCard[] {
  const out: FactCard[] = []
  const c14 = (claims as any[]).find((c) => c.slug === 'ap-debt-june-2014')
  if (c14) {
    const k = c14.claims[0]
    const r = c14.record.find((x: any) => /Reserve Bank/.test(x.source)) ?? c14.record[0]
    out.push({
      id: 'claim-2014', kind: 'claim',
      topic: bi('Check a claim', 'నిజమేనా?'),
      title: bi('Debt in June 2014', 'జూన్ 2014లో అప్పు'),
      claim: {
        figure: bi(`About ${crore(k.figure, 0)}`, `సుమారు ${croreTe(k.figure, 0)}`),
        said: bi('when the government took office in June 2014', 'జూన్ 2014లో ప్రభుత్వం బాధ్యతలు చేపట్టినప్పుడు'),
        doc: bi('White paper, 10 Jul 2019', 'శ్వేతపత్రం, 2019 జూలై 10'),
        record: bi(`No audited figure exists for June 2014. Nearest: ${crore(r.figure, 0)} at 31 March 2015.`, `జూన్ 2014కు ఆడిట్ చేసిన సంఖ్య లేదు. దగ్గరిది: 2015 మార్చి 31 నాటికి ${croreTe(r.figure, 0)}.`),
        recordDoc: bi('RBI', 'ఆర్బీఐ'),
        status: bi('Cannot be checked', 'సరిచూడలేము'),
      },
      paper: { label: 'RBI, State Finances 2025-26' },
      href: 'claim-ap-debt-june-2014', hrefLabel: bi('Full check', 'పూర్తి పరిశీలన'),
    })
  }
  const c24 = (claims as any[]).find((c) => c.slug === 'ap-debt-june-2024')
  if (c24) {
    const k = c24.claims[0]
    const r = c24.record.find((x: any) => /Reserve Bank/.test(x.source)) ?? c24.record[0]
    out.push({
      id: 'claim-2024', kind: 'claim',
      topic: bi('Check a claim', 'నిజమేనా?'),
      title: bi('Debt in June 2024', 'జూన్ 2024లో అప్పు'),
      claim: {
        figure: bi(crore(k.figure, 0), croreTe(k.figure, 0)),
        said: bi('on 12 June 2024', '2024 జూన్ 12 నాటికి'),
        doc: bi('White paper, 26 Jul 2024', 'శ్వేతపత్రం, 2024 జూలై 26'),
        record: bi(`${crore(r.figure, 0)} at 31 March 2024, government debt`, `2024 మార్చి 31 నాటికి ${croreTe(r.figure, 0)}, ప్రభుత్వ అప్పు`),
        recordDoc: bi('RBI', 'ఆర్బీఐ'),
        status: bi('Different definition: the claim adds corporation loans and unpaid bills', 'వేరే నిర్వచనం: కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు కూడా కలిపారు'),
      },
      paper: { label: 'RBI, State Finances 2025-26' },
      href: 'claim-ap-debt-june-2024', hrefLabel: bi('Full check', 'పూర్తి పరిశీలన'),
    })
  }
  return out
}

/* ------------------------------------------------------ word to know */
const WORDS: { term: BiS; plain: BiS; example: BiS }[] = [
  { term: bi('Revised estimate', 'సవరించిన అంచనా'), plain: bi('The plan, changed during the year.', 'ఏడాది మధ్యలో మార్చిన ప్రణాళిక.'),
    example: bi('A family plans ₹10,000 in June and changes it to ₹8,000 in December. ₹8,000 is the revised estimate.', 'ఒక కుటుంబం జూన్‌లో ₹10,000 అనుకుని, డిసెంబర్‌లో ₹8,000కి మార్చింది. ₹8,000 సవరించిన అంచనా.') },
  { term: bi('Guarantee', 'హామీ'), plain: bi('A promise to repay someone else\'s loan if they cannot.', 'ఇంకొకరు తీర్చలేకపోతే వారి అప్పు తీరుస్తామన్న హామీ.'),
    example: bi('Signing as guarantor for a neighbour\'s bank loan. You pay only if the neighbour cannot.', 'పొరుగువారి బ్యాంకు రుణానికి హామీదారుగా సంతకం చేయడం. వారు కట్టలేకపోతేనే మీరు కట్టాలి.') },
  { term: bi('Capital outlay', 'మూలధన వ్యయం'), plain: bi('Money spent building things that last: roads, dams, buildings.', 'శాశ్వతంగా నిలిచేవాటిపై ఖర్చు: రోడ్లు, ఆనకట్టలు, భవనాలు.'),
    example: bi('Building a house is capital outlay. Rent and groceries are not.', 'ఇల్లు కట్టడం మూలధన వ్యయం. అద్దె, సరుకులు కావు.') },
]
function wordCard(): FactCard {
  // One word a day, the same for every reader on that day.
  const day = Math.floor(Date.parse(meta.asof + 'T00:00:00Z') / 86400_000)
  const w = WORDS[day % WORDS.length]
  return {
    id: 'word', kind: 'word',
    topic: bi('A word to know', 'తెలుసుకోవాల్సిన పదం'),
    title: w.term, word: w,
    paper: { label: bi('Words to know', 'తెలుసుకోవాల్సిన పదాలు') },
    href: 'words', hrefLabel: bi('More words', 'మరిన్ని పదాలు'),
  }
}

/* ----------------------------------------------------- your district */
// Records, not works: the two Polavaram records are one work, but each names
// its own district (one names Eluru, the central report names none), so a
// district count is a count of records that name it.
export function districtFacts(name: string) {
  const records = projects.filter((p) => p.d === name).length
  const papersN = (registerPapers.items as any[]).filter((d) => d.o === `${name} District Collectorate`).length
  const d = districts.find((x) => x.name === name)
  return { records, papers: papersN, te: d?.te ?? name, slug: d?.slug }
}

const counted = () => bi(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`)

export function districtCard(name: string | null): FactCard {
  if (!name) {
    return { id: 'district', kind: 'district', topic: bi('Your district', 'మీ జిల్లా'), title: bi('Pick your district', 'మీ జిల్లాను ఎంచుకోండి'),
      line: bi('Pick it once; its card stays here.', 'ఒక్కసారి ఎంచుకోండి; దాని కార్డు ఇక్కడే ఉంటుంది.'), paper: { label: 'Our register', date: counted() }, href: 'districts', hrefLabel: bi('All districts', 'అన్ని జిల్లాలు') }
  }
  const f = districtFacts(name)
  return {
    id: 'district', kind: 'district',
    topic: bi('Your district', 'మీ జిల్లా'),
    title: bi(name, f.te),
    value: bi(String(f.records), String(f.records)),
    line: f.records
      ? bi(`project records in our register name ${name}. ${f.papers} papers come from its collectorate.`, `ప్రాజెక్టు రికార్డుల్లో ${f.te} పేరు ఉంది. దాని కలెక్టరేట్ నుంచి ${f.papers} పత్రాలు ఉన్నాయి.`)
      : bi(`project records name ${name} so far. ${f.papers} papers come from its collectorate.`, `ప్రాజెక్టు రికార్డుల్లో ఇప్పటివరకు ${f.te} పేరు లేదు. దాని కలెక్టరేట్ నుంచి ${f.papers} పత్రాలు ఉన్నాయి.`),
    paper: { label: bi('Our register', 'మా రిజిస్టర్'), date: counted() },
    href: f.slug ? `district-${f.slug}` : 'districts', hrefLabel: bi('Open the district', 'జిల్లా తెరవండి'),
  }
}

/** Today's set, in the order a reader meets them. */
export function todaysCards(district: string | null, tenders?: TenderSummary | null): FactCard[] {
  return [
    polavaramCard(),
    tendersCard(tenders),
    schoolsCard(),
    ...claimCards(),
    incomeCard(),
    debtCard(),
    promisesCard(),
    districtCard(district),
    wordCard(),
  ].filter(Boolean) as FactCard[]
}

/** The facts behind the "In short" rows now live with the projects data, so a page can use them without the deck. */
export { shortFacts } from '@/lib/data-projects'
