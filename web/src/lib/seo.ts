// Every page the site has, with the words and facts a machine needs before any script runs.
//
// WHY
// The site is a React app: without this, every address answers with an empty <div> until the
// script runs. Google runs scripts; most of the places people now ask do not. WhatsApp, Facebook and
// X link previews, Bing (and so Copilot), and the crawlers behind answer engines read the HTML only.
// A link to a project shared into a village WhatsApp group showed the same generic preview whichever
// page it pointed at. And a reader on a slow phone saw nothing at all until the code arrived.
//
// This module is read only at build time, by scripts/prerender.mjs. It is never part of the app's
// own download (it imports the whole register). The app shows the same words through titles.ts.
//
// RULES IT KEEPS
// Figures are the record's own, formatted the way the pages format them, never totalled or ranked
// beyond what the pages already show. Live data (tenders, the refresh log, the board) is not written
// here, because a copy frozen at build time would be shown as current: those pages carry their words
// only, and their live parts load in the browser.
import { districts, MERGED, type Project } from '@/lib/data'
import { byId, largest, paperOf, placeText, projects, worksIn } from '@/lib/data-projects'
import claimsRaw from '@/data/claims.json'
import moneyRaw from '@/data/money.json'
import factsRaw from '@/data/statefacts.json'
import { crore, croreTe, dateLong, dateTe, num, STATUS_WORDS, TYPE_WORDS, TODAY } from '@/lib/format'
import { ARG_PATHS, STATIC_PATHS } from '@/lib/route'
import { projectTab } from '@/lib/project-title'
import { bigWorks } from '@/lib/bigworks'
import { workPoster } from '@/three/posters'
import { docDescription, docFacts, docRecs, docSiblings, docTab, docTitle, kindOf, summitDescription, summitFacts, summitName, summits, summitTitle, type DocRec } from '@/lib/docs'
import { CARD_NAME_MAX, CLAIM_Q, PAGE_WORDS, districtTitle, paperTitle, projectQuestion, projectQuestionTe, projectTabBase, shortName, type Bi } from '@/lib/titles'

export const ORIGIN = 'https://apfactcheck.dheeco.com'
export { TODAY }

/** One line of the pre-rendered body: plain text, or text with a link. */
export type Line = { text: Bi; href?: string; external?: boolean }
/** What a page's share picture shows (the picture WhatsApp, Facebook and X put under a link). The build draws one picture
 *  per page and language from this: scripts/share-spec.mjs names the files, scripts/make_cards.py draws them. Every figure
 *  here is one the page's own lines already print, in the same words; a picture never says more than its page. */
export type Card =
  | {
      kind: 'project'
      /** The small label in the corner: the question the page answers. */
      tag: Bi
      title: Bi
      status: Bi
      /** Physical progress as printed, already formatted ("86.2"), or null when the paper prints none. */
      progress: string | null
      cost: Bi | null
      due: Bi | null
      place: Bi
      source: Bi
      /** The baked 3D picture of the work, when one exists for its current figures (no file extension, no -lw suffix). */
      poster: string | null
    }
  | { kind: 'place'; tag: Bi; title: Bi; line: Bi; source: Bi }

export type PageOut = {
  /** The English address. The Telugu one is the same with /te in front. */
  path: string
  title: Bi
  /** The title in the tab, a search result and a link preview, when the heading is too long for those. */
  tabTitle?: Bi
  description: Bi
  /** Extra structured data nodes for this page (schema.org), beyond the page and breadcrumb ones. */
  ld?: object[]
  /** What the page is about (a place, for a district page): added to the page's own WebPage node. */
  about?: object
  /** A few facts or links under the heading, in the order a reader needs them. */
  lines: Line[]
  /** The page's own share picture. Pages without one use the site's default picture. */
  card?: Card
  /** Breadcrumb trail above this page, for the structured data. */
  trail?: { name: Bi; path: string }[]
  /** Last change of what the page shows, for the sitemap. */
  lastmod: string
}

const same = (s: string): Bi => ({ en: s, te: s })
const P = (token: string, arg?: string) => (arg ? ARG_PATHS[token] + encodeURIComponent(arg) : STATIC_PATHS[token])

// The links every page carries at its foot, so a crawler that lands anywhere can reach everything.
const NAV: Line[] = [
  { text: { en: 'Projects', te: 'పనులు' }, href: P('projects') },
  { text: { en: 'My district', te: 'మా జిల్లా' }, href: P('districts') },
  { text: { en: 'Money', te: 'డబ్బు' }, href: P('money') },
  { text: { en: 'Check a claim', te: 'నిజమేనా?' }, href: P('claims') },
  { text: { en: 'Government papers', te: 'ప్రభుత్వ పత్రాలు' }, href: P('papers') },
  { text: { en: 'Tenders', te: 'టెండర్లు' }, href: P('tenders') },
]
export const footerLinks = NAV
export const siteDescription: Bi = PAGE_WORDS.about.description

function staticPage(token: string, lines: Line[] = []): PageOut {
  const w = PAGE_WORDS[token]
  return { path: P(token), title: w.title, description: w.description, lines, lastmod: TODAY }
}

/* ------------------------------------------------------------------ one project */
function projectPage(p: Project): PageOut {
  const ty = TYPE_WORDS[p.ty], st = STATUS_WORDS[p.st]
  const lines: Line[] = [
    { text: same(p.t) },
    { text: { en: `Kind of work: ${ty?.en ?? p.ty}`, te: `పని రకం: ${ty?.te ?? p.ty}` } },
    { text: { en: `Status in the record: ${st?.en ?? p.st}`, te: `రికార్డులో స్థితి: ${st?.te ?? p.st}` } },
    { text: { en: `Place: ${placeText(p, 'en')}`, te: `ప్రాంతం: ${placeText(p, 'te')}` } },
  ]
  if (p.c != null) lines.push({
    text: { en: `Cost as printed: ${crore(p.c)}. This is the estimate in that paper, not money spent.`, te: `ముద్రించిన వ్యయం: ${croreTe(p.c)}. ఇది ఆ పత్రంలోని అంచనా, ఖర్చు చేసిన డబ్బు కాదు.` },
    href: p.cu ?? undefined, external: true,
  })
  if (p.p != null) lines.push({ text: { en: `Physical progress as printed: ${num(p.p, 1)}%`, te: `ముద్రించిన భౌతిక పురోగతి: ${num(p.p, 1)}%` } })
  if (p.due) lines.push({ text: { en: `Expected completion as printed: ${dateLong(p.due)}`, te: `ముద్రించిన పూర్తి గడువు: ${dateTe(p.due)}` } })
  if (p.dept) lines.push({ text: { en: `Department: ${p.dept}`, te: `శాఖ: ${p.dept}` } })
  lines.push({ text: { en: `Paper: ${paperOf(p)}`, te: `పత్రం: ${paperOf(p)}` }, href: p.su ?? undefined, external: true })
  if (p.f && p.l) lines.push({ text: { en: `Papers on record from ${dateLong(p.f)} to ${dateLong(p.l)}`, te: `${dateTe(p.f)} నుంచి ${dateTe(p.l)} వరకు పత్రాలు రికార్డులో ఉన్నాయి` } })
  const st2 = st ? `${st.en.toLowerCase()}` : p.st
  const started = p.st === 'tendered' || p.st === 'approved'
  const bw = bigWorks.find((w) => w.id === p.id)
  const card: Card = {
    kind: 'project',
    tag: started ? { en: 'Has work started?', te: 'పనులు మొదలయ్యాయా?' } : { en: 'Is it finished?', te: 'పూర్తయిందా?' },
    // no bracket at the end (that tells two records of one name apart on the page), and the longest names are cut in the middle
    title: projectTabBase(p, CARD_NAME_MAX),
    status: st ?? same(p.st),
    progress: p.p != null ? num(p.p, 1) : null,
    cost: p.c != null ? { en: crore(p.c), te: croreTe(p.c) } : null,
    due: p.due ? { en: dateLong(p.due), te: dateTe(p.due) } : null,
    place: { en: placeText(p, 'en'), te: placeText(p, 'te') },
    source: same(paperOf(p)),
    poster: bw ? workPoster(bw.id, bw.drawPct) ?? null : null,
  }
  return {
    card,
    path: P('project', String(p.id)),
    title: { en: projectQuestion(p), te: projectQuestionTe(p) },
    tabTitle: projectTab(p),
    description: {
      en: `${p.t}: ${st2}, ${placeText(p, 'en')}.${p.c != null ? ` Cost as printed ${crore(p.c)}.` : ''} From ${paperOf(p)}, with the paper linked.`.slice(0, 300),
      te: `${p.t}: ${st?.te ?? p.st}, ${placeText(p, 'te')}.${p.c != null ? ` ముద్రించిన వ్యయం ${croreTe(p.c)}.` : ''} ఆధారం: ${paperOf(p)}.`.slice(0, 300),
    },
    lines,
    trail: [{ name: PAGE_WORDS.projects.title, path: P('projects') }],
    lastmod: p.l && p.l <= TODAY ? p.l.slice(0, 10) : TODAY,
  }
}

/* ------------------------------------------------------------------ one district, and its paper */
function districtPage(d: (typeof districts)[number]): PageOut {
  const works = worksIn(d.name).filter((p) => !MERGED[p.id])
  const lines: Line[] = []
  if (d.hq) lines.push({ text: { en: `Headquarters: ${d.hq}`, te: `ముఖ్య పట్టణం: ${d.hq}` } })
  if (d.formed) lines.push({ text: { en: `Formed on ${dateLong(d.formed)} from ${d.from} district.`, te: `${dateTe(d.formed)}న ${d.from} జిల్లా నుంచి ఏర్పడింది.` } })
  lines.push({ text: { en: `Project records that name this district: ${works.length}`, te: `ఈ జిల్లా పేరున్న పనుల రికార్డులు: ${works.length}` } })
  for (const p of works.slice(0, 12)) lines.push({ text: { en: `${p.t} (${STATUS_WORDS[p.st]?.en ?? p.st})`, te: `${p.t} (${STATUS_WORDS[p.st]?.te ?? p.st})` }, href: P('project', String(p.id)) })
  lines.push({ text: { en: `${d.name} district paper`, te: `${d.te} జిల్లా పత్రిక` }, href: P('paper', d.slug) })
  return {
    card: {
      kind: 'place', tag: { en: 'District', te: 'జిల్లా' }, title: districtTitle(d),
      line: works.length
        ? { en: `${works.length} project records name this district.`, te: `ఈ జిల్లా పేరున్న పనుల రికార్డులు: ${works.length}.` }
        : { en: 'Facts and official notices for this district.', te: 'ఈ జిల్లా గణాంకాలు, అధికారిక నోటీసులు.' },
      source: { en: 'Government papers, each one linked', te: 'ప్రభుత్వ పత్రాలు, ప్రతిదీ లింక్‌తో' },
    },
    path: P('district', d.slug),
    title: districtTitle(d),
    description: {
      en: `${d.name} district, Andhra Pradesh: its project records, official notices and facts, each from a government paper.`,
      te: `${d.te} జిల్లా, ఆంధ్రప్రదేశ్: పనుల రికార్డులు, అధికారిక నోటీసులు, గణాంకాలు, అన్నీ ప్రభుత్వ పత్రాల నుంచే.`,
    },
    lines,
    trail: [{ name: PAGE_WORDS.districts.title, path: P('districts') }],
    lastmod: TODAY,
  }
}

function paperPage(d: (typeof districts)[number]): PageOut {
  return {
    card: {
      kind: 'place', tag: { en: 'Daily district page', te: 'రోజువారీ జిల్లా పేజీ' }, title: paperTitle(d),
      line: { en: 'Official notices, water, works and welfare, each with its source.', te: 'అధికారిక నోటీసులు, నీరు, పనులు, సంక్షేమం, ప్రతిదీ మూలంతో.' },
      source: { en: 'Government notices, each one linked', te: 'ప్రభుత్వ నోటీసులు, ప్రతిదీ లింక్‌తో' },
    },
    path: P('paper', d.slug),
    title: paperTitle(d),
    description: {
      en: `A daily page for ${d.name} district: official notices, water, works and welfare, each with the government source it came from. Can be read aloud.`,
      te: `${d.te} జిల్లాకు రోజువారీ పేజీ: అధికారిక నోటీసులు, నీరు, పనులు, సంక్షేమం, ప్రతిదీ ప్రభుత్వ మూలంతో. వినవచ్చు కూడా.`,
    },
    lines: [{ text: { en: `${d.name} district: projects and facts`, te: `${d.te} జిల్లా: పనులు, గణాంకాలు` }, href: P('district', d.slug) }],
    trail: [{ name: districtTitle(d), path: P('district', d.slug) }],
    lastmod: TODAY,
  }
}

/* ------------------------------------------------------------------ one claim */
type Claim = {
  slug: string; question: string
  claims: { date: string; document: string; url: string; quote: string }[]
  record: { source: string; document: string; document_url?: string; figure: number; as_of?: string }[]
}
const claims = claimsRaw as unknown as Claim[]

function claimPage(c: Claim): PageOut {
  const q = CLAIM_Q[c.slug] ?? same(c.question)
  const lines: Line[] = []
  for (const k of c.claims) lines.push({ text: { en: `Said on ${dateLong(k.date)}, in ${k.document}: “${k.quote}”`, te: `${dateTe(k.date)}న, ${k.document}లో: “${k.quote}”` }, href: k.url, external: true })
  for (const r of c.record) lines.push({ text: { en: `${r.source}, ${r.document}: ${crore(r.figure, 0)}`, te: `${r.source}, ${r.document}: ${croreTe(r.figure, 0)}` }, href: r.document_url, external: true })
  return {
    path: P('claim', c.slug),
    title: q,
    description: {
      en: `${q.en} What was said, and what the RBI and the state's accounts print for the same day, with every source linked.`,
      te: `${q.te} ఏం చెప్పారు, అదే రోజుకు ఆర్బీఐ, రాష్ట్ర లెక్కలు ఏం ముద్రించాయి: ప్రతి మూలానికి లింకుతో.`,
    },
    lines,
    trail: [{ name: PAGE_WORDS.claims.title, path: P('claims') }],
    lastmod: TODAY,
  }
}

/* ------------------------------------------------------------------ one government paper, one investment summit */
const factLines = (facts: ReturnType<typeof docFacts>): Line[] =>
  facts.map((f) => ({ text: { en: `${f.label.en}: ${f.value.en}`, te: `${f.label.te}: ${f.value.te}` }, href: f.href, external: f.external }))

function docPage(d: DocRec): PageOut {
  const k = kindOf(d)
  const lines: Line[] = [...factLines(docFacts(d)), { text: k.what }]
  for (const s of docSiblings(d)) lines.push({ text: same(s.title), href: P('doc', s.slug) })
  const t = docTitle(d)
  return {
    card: {
      kind: 'place', tag: { en: k.en, te: k.te }, title: same(shortName(d.title, 52)),
      line: { en: d.period ? `${d.publisher || 'Government paper'}, ${d.period}.` : `${d.publisher || 'Government paper'}.`, te: d.period ? `${d.publisher || 'ప్రభుత్వ పత్రం'}, ${d.period}.` : `${d.publisher || 'ప్రభుత్వ పత్రం'}.` },
      source: same(d.publisher || 'Government of Andhra Pradesh'),
    },
    path: P('doc', d.slug),
    title: t,
    tabTitle: docTab(d),
    description: docDescription(d),
    ld: [{
      '@type': 'Report',
      name: t.en,
      url: ORIGIN + P('doc', d.slug),
      sameAs: d.url,
      about: 'Andhra Pradesh',
      ...(d.publisher ? { publisher: { '@type': 'Organization', name: d.publisher } } : {}),
      ...(d.date ? { datePublished: d.date } : {}),
      inLanguage: d.language === 'Telugu' ? 'te' : 'en',
    }],
    lines,
    trail: [{ name: PAGE_WORDS.papers.title, path: P('papers') }],
    lastmod: d.checked && d.checked <= TODAY ? d.checked.slice(0, 10) : d.date && d.date <= TODAY ? d.date.slice(0, 10) : TODAY,
  }
}

function summitPage(s: (typeof summits)[number]): PageOut {
  const t = summitTitle(s)
  return {
    card: {
      kind: 'place', tag: { en: 'Investment summit', te: 'పెట్టుబడుల సదస్సు' }, title: summitName(s),
      line: { en: `${num(s.mou_count, 0)} MoUs and ${crore(s.investment_crore, 0)} announced. A promise, not money spent.`, te: `${num(s.mou_count, 0)} ఎంఓయూలు, ${croreTe(s.investment_crore, 0)} ప్రకటించారు. హామీ మాత్రమే, ఖర్చు కాదు.` },
      source: { en: 'The state’s own paper is linked', te: 'రాష్ట్ర పత్రం లింక్ చేశాం' },
    },
    path: P('summit', s.key),
    title: t,
    description: summitDescription(s),
    lines: factLines(summitFacts(s)),
    trail: [{ name: PAGE_WORDS.investments.title, path: P('investments') }],
    lastmod: s.end_date <= TODAY ? s.end_date.slice(0, 10) : TODAY,
  }
}

/* ------------------------------------------------------------------ the project register as a dataset */
const withLd = (page: PageOut, ...ld: object[]): PageOut => ({ ...page, ld })

/** The register of project records, described for Google Dataset Search. It says only what the register is:
 *  no licence and no download are claimed, because neither exists. */
function datasetNode(): object {
  const live = projects.filter((p) => !MERGED[p.id])
  const first = live.map((p) => p.f).filter(Boolean).sort()[0]?.slice(0, 10)
  const last = live.map((p) => p.l).filter((d): d is string => !!d && d <= TODAY).sort().at(-1)?.slice(0, 10)
  return {
    '@type': 'Dataset',
    name: 'Andhra Pradesh government project records',
    description: `${live.length} government project records for Andhra Pradesh, each with its status, cost as printed, physical progress and expected completion where a paper prints them, and the government paper every figure came from, linked. Compiled from MoSPI reports, AMRUT lists, state orders and other official papers.`,
    url: ORIGIN + P('projects'),
    isAccessibleForFree: true,
    inLanguage: ['en', 'te'],
    spatialCoverage: { '@type': 'Place', name: 'Andhra Pradesh, India' },
    ...(first && last ? { temporalCoverage: `${first}/${last}` } : {}),
    variableMeasured: ['Status in the record', 'Cost as printed (crore rupees)', 'Physical progress as printed (percent)', 'Expected completion as printed', 'District', 'Department', 'Source paper'],
    creator: { '@id': ORIGIN + '/#org' },
  }
}

/* ------------------------------------------------------------------ the money and facts tables as datasets */
// Google Dataset Search lists pages whose tables are described this way. Every value below is read from
// the same data files the pages show, so the description cannot claim a year or a table the page lacks.
// No licence and no download are claimed, because neither exists.
type MoneyData = { series: { indicator: string; points: { fy_end: number }[] }[]; departments: { rows: { y: string; s: string }[] }[] }
type FactsData = { indicators: { points: { fy_end: number }[] }[] }
const money = moneyRaw as unknown as MoneyData
const facts = factsRaw as unknown as FactsData
/** A financial year that ends in March of `end` runs from April of the year before. */
const fyCoverage = (firstEnd: number, lastEnd: number) => `${firstEnd - 1}-04-01/${lastEnd}-03-31`
const fyEnd = (label: string) => Number(label.slice(0, 4)) + 1   // "2014-15" ends in 2015

function moneyDatasetNodes(): Record<string, object> {
  const base = { isAccessibleForFree: true, inLanguage: ['en', 'te'], spatialCoverage: { '@type': 'Place', name: 'Andhra Pradesh, India' }, creator: { '@id': ORIGIN + '/#org' } }
  const debtEnds = money.series.flatMap((x) => x.points.map((p) => p.fy_end))
  const deptYears = money.departments.flatMap((d) => d.rows.map((r) => fyEnd(r.y)))
  const factEnds = facts.indicators.flatMap((i) => i.points.map((p) => p.fy_end))
  return {
    money: {
      '@type': 'Dataset', ...base,
      name: 'Andhra Pradesh state debt and deficits, year by year',
      description: 'Andhra Pradesh state government outstanding liabilities, off-budget borrowings, guarantees, gross state domestic product, fiscal deficit and revenue deficit by financial year, each figure as printed by the Reserve Bank of India, the Comptroller and Auditor General of India or the Government of Andhra Pradesh budget papers, with the paper linked.',
      url: ORIGIN + P('money'),
      temporalCoverage: fyCoverage(Math.min(...debtEnds), Math.max(...debtEnds)),
      variableMeasured: ['Outstanding liabilities (crore rupees)', 'Off-budget borrowings (crore rupees)', 'Guarantees (crore rupees)', 'Gross state domestic product (crore rupees)', 'Fiscal deficit (crore rupees)', 'Revenue deficit (crore rupees)'],
    },
    'money-departments': {
      '@type': 'Dataset', ...base,
      name: 'Andhra Pradesh department spending: budget estimates, revised estimates and actuals',
      description: `Budget estimate, revised estimate and actual figure for each of the ${money.departments.length} demands for grants of the Government of Andhra Pradesh, by financial year, where the state budget books print them, with the audited spending in the CAG Appropriation Accounts beside them. Figures as printed, with the book and page linked.`,
      url: ORIGIN + P('money-departments'),
      temporalCoverage: fyCoverage(Math.min(...deptYears), Math.max(...deptYears)),
      variableMeasured: ['Budget estimate (crore rupees)', 'Revised estimate (crore rupees)', 'Actual figure (crore rupees)'],
    },
    'state-facts': {
      '@type': 'Dataset', ...base,
      name: 'Andhra Pradesh state indicators from the Reserve Bank of India',
      description: `${facts.indicators.length} indicators for Andhra Pradesh on the economy, state finances, social sectors, industry and infrastructure, banking, agriculture, employment and prices, by year, as printed in the Reserve Bank of India's Handbook of Statistics on Indian States and State Finances: A Study of Budgets, each with its table named.`,
      url: ORIGIN + P('state-facts'),
      temporalCoverage: fyCoverage(Math.min(...factEnds), Math.max(...factEnds)),
    },
  }
}

/** A district page is about a place. Saying so lets search engines tie the page to the district itself. */
const districtPlace = (d: (typeof districts)[number]): object => ({
  '@type': 'AdministrativeArea', name: `${d.name} district`, alternateName: `${d.te} జిల్లా`,
  containedInPlace: { '@type': 'State', name: 'Andhra Pradesh', containedInPlace: { '@type': 'Country', name: 'India' } },
})

/* ------------------------------------------------------------------ all of them */
export function allPages(): PageOut[] {
  const moneyDatasets = moneyDatasetNodes()
  const big = largest(12).map((p): Line => ({ text: { en: `${p.t}: ${crore(p.c)} as printed`, te: `${p.t}: ముద్రించిన ${croreTe(p.c)}` }, href: P('project', String(p.id)) }))
  const dlinks = districts.map((d): Line => ({ text: { en: d.name, te: d.te }, href: P('district', d.slug) }))
  const clinks = claims.map((c): Line => ({ text: CLAIM_Q[c.slug] ?? same(c.question), href: P('claim', c.slug) }))
  const paperLinks = [...docRecs.filter((d) => d.src === 'paper'), ...docRecs.filter((d) => d.src === 'register').sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 40)]
    .map((d): Line => ({ text: docTab(d), href: P('doc', d.slug) }))
  const out: PageOut[] = [
    staticPage('home', [...NAV]),
    staticPage('cards'),
    withLd(staticPage('projects', [{ text: { en: `${projects.filter((p) => !MERGED[p.id]).length} project records. The largest by printed cost:`, te: `${projects.filter((p) => !MERGED[p.id]).length} పనుల రికార్డులు. ముద్రించిన వ్యయం ప్రకారం పెద్దవి:` } }, ...big]), datasetNode()),
    staticPage('districts', dlinks),
    withLd(staticPage('money'), moneyDatasets.money), withLd(staticPage('money-departments'), moneyDatasets['money-departments']),
    staticPage('money-states'), withLd(staticPage('state-facts'), moneyDatasets['state-facts']),
    staticPage('investments', summits.map((s): Line => ({ text: summitTitle(s), href: P('summit', s.key) }))), staticPage('governments'),
    staticPage('claims', clinks),
    staticPage('papers', paperLinks), staticPage('tenders'), staticPage('updates'), staticPage('helplines'), staticPage('words'),
    staticPage('community'), staticPage('sources'), staticPage('about'), staticPage('disclaimer'), staticPage('privacy'),
  ]
  for (const p of projects) if (!MERGED[p.id]) out.push(projectPage(p))
  for (const d of districts) { out.push({ ...districtPage(d), about: districtPlace(d) }); out.push(paperPage(d)) }
  for (const c of claims) out.push(claimPage(c))
  for (const d of docRecs) out.push(docPage(d))
  for (const s of summits) out.push(summitPage(s))
  return out
}

/** Record ids shown under another record's page: the old address moves there for good. */
export const mergedRedirects = () => Object.entries(MERGED).map(([from, to]) => ({ from: P('project', from), to: P('project', String(to)) }))
export const hasProject = (id: number) => byId.has(id)

export const notFoundPage: PageOut = {
  path: '/404', title: PAGE_WORDS.notfound.title, description: PAGE_WORDS.notfound.description,
  lines: [...NAV], lastmod: TODAY,
}
