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
import { crore, croreTe, dateLong, dateTe, num, STATUS_WORDS, TYPE_WORDS, TODAY } from '@/lib/format'
import { ARG_PATHS, STATIC_PATHS } from '@/lib/route'
import { CLAIM_Q, PAGE_WORDS, districtTitle, paperTitle, projectQuestion, projectQuestionTe, type Bi } from '@/lib/titles'

export const ORIGIN = 'https://apfactcheck.dheeco.com'

/** One line of the pre-rendered body: plain text, or text with a link. */
export type Line = { text: Bi; href?: string; external?: boolean }
export type PageOut = {
  /** The English address. The Telugu one is the same with /te in front. */
  path: string
  title: Bi
  description: Bi
  /** A few facts or links under the heading, in the order a reader needs them. */
  lines: Line[]
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
  return {
    path: P('project', String(p.id)),
    title: { en: projectQuestion(p), te: projectQuestionTe(p) },
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

/* ------------------------------------------------------------------ all of them */
export function allPages(): PageOut[] {
  const big = largest(12).map((p): Line => ({ text: { en: `${p.t}: ${crore(p.c)} as printed`, te: `${p.t}: ముద్రించిన ${croreTe(p.c)}` }, href: P('project', String(p.id)) }))
  const dlinks = districts.map((d): Line => ({ text: { en: d.name, te: d.te }, href: P('district', d.slug) }))
  const clinks = claims.map((c): Line => ({ text: CLAIM_Q[c.slug] ?? same(c.question), href: P('claim', c.slug) }))
  const out: PageOut[] = [
    staticPage('home', [...NAV]),
    staticPage('cards'),
    staticPage('projects', [{ text: { en: `${projects.filter((p) => !MERGED[p.id]).length} project records. The largest by printed cost:`, te: `${projects.filter((p) => !MERGED[p.id]).length} పనుల రికార్డులు. ముద్రించిన వ్యయం ప్రకారం పెద్దవి:` } }, ...big]),
    staticPage('districts', dlinks),
    staticPage('money'), staticPage('money-departments'), staticPage('money-states'), staticPage('state-facts'),
    staticPage('investments'), staticPage('governments'),
    staticPage('claims', clinks),
    staticPage('papers'), staticPage('tenders'), staticPage('updates'), staticPage('helplines'), staticPage('words'),
    staticPage('community'), staticPage('sources'), staticPage('about'), staticPage('disclaimer'), staticPage('privacy'),
  ]
  for (const p of projects) if (!MERGED[p.id]) out.push(projectPage(p))
  for (const d of districts) { out.push(districtPage(d)); out.push(paperPage(d)) }
  for (const c of claims) out.push(claimPage(c))
  return out
}

/** Record ids shown under another record's page: the old address moves there for good. */
export const mergedRedirects = () => Object.entries(MERGED).map(([from, to]) => ({ from: P('project', from), to: P('project', String(to)) }))
export const hasProject = (id: number) => byId.has(id)

export const notFoundPage: PageOut = {
  path: '/404', title: PAGE_WORDS.notfound.title, description: PAGE_WORDS.notfound.description,
  lines: [...NAV], lastmod: TODAY,
}
