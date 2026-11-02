// The words and figures a hub page carries in its plain HTML, before any script runs.
//
// WHY
// The audit of 2 Nov 2026 read every page the way a crawler without JavaScript reads it. The project and
// paper pages carried their facts; the hubs did not. Home was 76 words against 2,311 once rendered, the Money
// page 57 against 1,694, State facts 55. All a crawler saw was "The full page is loading." Answer engines
// (ChatGPT, Perplexity, Copilot), many Bing fetches and WhatsApp link previews read only that HTML, so the
// pages most likely to be asked about were the ones they knew least about.
//
// RULES
// Every figure here is one the page itself shows, from the same data file, with the same stage word (actual,
// revised estimate, budget estimate) and the paper it came from. Nothing is totalled, ranked or worked out.
// Where two papers print different figures for the same thing (the debt), each is listed under its own
// paper, as the page shows them side by side. Live data (tenders, the refresh log) is never written here:
// a copy frozen at build time would read as current.
import moneyRaw from '@/data/money.json'
import factsRaw from '@/data/statefacts.json'
import periodsRaw from '@/data/periods.json'
import { crore, croreTe, dateLong, dateTe, fy, num, STAGE_WORDS } from '@/lib/format'
import type { Bi } from '@/lib/titles'

export type HubLine = { text: Bi; href?: string; external?: boolean }

type Point = { fy_end: number; value: number | null; stage?: string; source?: string }
type Series = { indicator: string; family: string; points: Point[] }
type Source = { title: string; publisher?: string; url?: string; short?: string }
type DeptRow = { y: string; s: string; t: number | null }
type Money = {
  series: Series[]
  sources: Record<string, Source>
  departments: { no: string; name: string; rows: DeptRow[] }[]
  income_interest: { fy_end: number; fy_label: string; stage: string; source: string; revenue_receipts: number; interest_payments: number }[]
  states: { key: string; label: string; te?: string; unit: string; stages?: Record<string, string>; rows: { state: string; values: (number | null)[] }[]; years: number[]; src?: string; pub?: string; url?: string }[]
}
type Fact = { key: string; label: string; group: string; unit: string; div?: number; dec?: number; source: string; table: string; latest?: { fy_label: string; value: number; stage?: string } }
type Facts = { groups: { key: string; label: string }[]; sources: Record<string, { title: string; url: string }>; indicators: Fact[] }
type Periods = { periods: { from: string; to: string | null; cm: string }[] }

const money = moneyRaw as unknown as Money
const facts = factsRaw as unknown as Facts
const periods = periodsRaw as unknown as Periods

const stage = (s: string | undefined, lang: 'en' | 'te') => (s && STAGE_WORDS[s] ? STAGE_WORDS[s][lang].toLowerCase() : '')
const money2 = (v: number, lang: 'en' | 'te') => (lang === 'en' ? crore(v) : croreTe(v))
const paper = (code: string | undefined) => (code ? money.sources[code] : undefined)
/** A value with its unit, the way the pages write it: the rupee mark in front, the sign before it. */
const withUnit = (n: number, unit: string, dec: number) => {
  const u = (unit || '').replace(/\(no unit printed[^)]*\)/i, '').trim()
  if (u.startsWith('₹')) return `${n < 0 ? '-₹' : '₹'}${num(Math.abs(n), dec)} ${u.replace(/^₹\s*/, '')}`.trim()
  return `${num(n, dec)}${u ? ' ' + u : ''}`
}

// The Money page's own names for the three papers that print the debt (src/pages/Money.tsx).
const DEBT_FAMILIES: { family: string; name: Bi; says: string }[] = [
  { family: 'RBI', name: { en: 'Reserve Bank of India', te: 'రిజర్వ్ బ్యాంక్ ఆఫ్ ఇండియా' }, says: 'as the Reserve Bank of India prints it' },
  { family: 'AP_BUDGET', name: { en: 'State budget books', te: 'రాష్ట్ర బడ్జెట్ పుస్తకాలు' }, says: 'as the state budget books print it' },
  { family: 'CAG', name: { en: 'CAG audit', te: 'కాగ్ ఆడిట్' }, says: 'as the CAG audit prints it' },
]

const series = (indicator: string, family: string) => money.series.find((s) => s.indicator === indicator && s.family === family)

/** The debt as each paper prints it, year by year, newest first. */
export function debtLines(perFamily = 99): HubLine[] {
  const out: HubLine[] = []
  for (const f of DEBT_FAMILIES) {
    const s = series('outstanding_liabilities', f.family)
    if (!s) continue
    const pts = s.points.filter((p) => p.value != null).sort((a, b) => b.fy_end - a.fy_end).slice(0, perFamily)
    for (const p of pts) {
      const src = paper(p.source)
      const st = stage(p.stage, 'en'), stTe = stage(p.stage, 'te')
      out.push({
        text: {
          en: `Debt at the end of March ${p.fy_end}, ${f.says}: ${money2(p.value!, 'en')}${st ? ` (${st})` : ''}${src ? `. ${src.title}` : ''}`,
          te: `${p.fy_end} మార్చి చివరికి అప్పు, ${f.name.te} ప్రకారం: ${money2(p.value!, 'te')}${stTe ? ` (${stTe})` : ''}${src ? `. ${src.title}` : ''}`,
        },
        href: src?.url, external: !!src?.url,
      })
    }
  }
  return out
}

/** Income and interest, year by year, newest first, as the state's fiscal statements print them. */
export function incomeLines(): HubLine[] {
  return [...money.income_interest].sort((a, b) => b.fy_end - a.fy_end).map((r) => {
    const src = paper(r.source)
    const st = stage(r.stage, 'en'), stTe = stage(r.stage, 'te')
    return {
      text: {
        en: `${r.fy_label}: the state earned ${money2(r.revenue_receipts, 'en')} (revenue receipts) and paid ${money2(r.interest_payments, 'en')} in interest${st ? ` (${st})` : ''}`,
        te: `${r.fy_label}: రాష్ట్ర ఆదాయం (రెవెన్యూ రాబడి) ${money2(r.revenue_receipts, 'te')}; వడ్డీగా ${money2(r.interest_payments, 'te')}${stTe ? ` (${stTe})` : ''}`,
      },
      href: src?.url, external: !!src?.url,
    }
  })
}

/** Guarantees and loans taken through state companies, as the page shows them. */
export function outsideBudgetLines(): HubLine[] {
  const out: HubLine[] = []
  const g = series('guarantees', 'RBI')?.points.filter((p) => p.value != null && p.stage === 'A').sort((a, b) => b.fy_end - a.fy_end)[0]
  if (g) {
    const src = paper(g.source)
    out.push({ text: { en: `Guarantees the state has given for others, end of March ${g.fy_end}: ${money2(g.value!, 'en')}, in the state's own statement`, te: `${g.fy_end} మార్చి చివరికి ఇతరుల కోసం ఇచ్చిన హామీలు: ${money2(g.value!, 'te')}, రాష్ట్ర సొంత ప్రకటన ప్రకారం` }, href: src?.url, external: !!src?.url })
  }
  const o = series('off_budget_borrowings', 'CAG')?.points.filter((p) => p.value != null).sort((a, b) => b.fy_end - a.fy_end)[0]
  if (o) {
    const src = paper(o.source)
    out.push({ text: { en: `Loans taken through state companies, end of March ${o.fy_end}: ${money2(o.value!, 'en')}, as the CAG prints them`, te: `${o.fy_end} మార్చి చివరికి రాష్ట్ర సంస్థల ద్వారా తీసుకున్న అప్పులు: ${money2(o.value!, 'te')}, కాగ్ ప్రకారం` }, href: src?.url, external: !!src?.url })
  }
  return out
}

/** Each demand for grants with the newest figure the budget books print for it. */
export function departmentLines(): HubLine[] {
  return money.departments.map((d) => {
    const r = [...d.rows].filter((x) => x.t != null).sort((a, b) => (a.y === b.y ? 0 : a.y < b.y ? 1 : -1))[0]
    if (!r) return { text: { en: `Demand ${d.no}: ${d.name}`, te: `డిమాండ్ ${d.no}: ${d.name}` } }
    const st = stage(r.s, 'en'), stTe = stage(r.s, 'te')
    return {
      text: {
        en: `Demand ${d.no}, ${d.name}: ${money2(r.t!, 'en')} for ${r.y}${st ? ` (${st})` : ''}`,
        te: `డిమాండ్ ${d.no}, ${d.name}: ${r.y}కు ${money2(r.t!, 'te')}${stTe ? ` (${stTe})` : ''}`,
      },
    }
  })
}

/** Each RBI indicator with its latest value, year, stage and table. */
export function factLines(): HubLine[] {
  const out: HubLine[] = []
  for (const g of facts.groups) {
    for (const i of facts.indicators.filter((x) => x.group === g.key && x.latest)) {
      const l = i.latest!
      const v = withUnit(l.value / (i.div || 1), i.unit, i.dec ?? 2)
      const st = stage(l.stage, 'en'), stTe = stage(l.stage, 'te')
      const src = facts.sources[i.source]
      out.push({
        text: {
          en: `${i.label}: ${v} in ${l.fy_label}${st ? ` (${st})` : ''}. ${src?.title ?? 'RBI'}, ${i.table}`,
          te: `${i.label}: ${l.fy_label}లో ${v.trim()}${stTe ? ` (${stTe})` : ''}. ${src?.title ?? 'RBI'}, ${i.table}`,
        },
        href: src?.url, external: !!src?.url,
      })
    }
  }
  return out
}

/** Andhra Pradesh's own row in each all-states table, with the year and the paper. */
export function statesLines(): HubLine[] {
  const out: HubLine[] = []
  for (const s of money.states) {
    const row = s.rows.find((r) => r.state === 'Andhra Pradesh')
    if (!row) continue
    let k = row.values.length - 1
    while (k >= 0 && row.values[k] == null) k--
    if (k < 0) continue
    const v = row.values[k]!
    const shown = withUnit(v, s.unit, Math.abs(v) >= 1000 || Number.isInteger(v) ? 0 : 1)
    const year = fy(s.years[k])
    const sg = s.stages?.[String(s.years[k])]
    const st = stage(sg, 'en'), stTe = stage(sg, 'te')
    out.push({
      text: {
        en: `${s.label}, Andhra Pradesh, ${year}: ${shown}${st ? ` (${st})` : ''}${s.pub ? `. ${s.pub}` : ''}`,
        te: `${s.te ?? s.label}, ఆంధ్రప్రదేశ్, ${year}: ${shown}${stTe ? ` (${stTe})` : ''}${s.pub ? `. ${s.pub}` : ''}`,
      },
      href: s.url, external: !!s.url,
    })
  }
  return out
}

/** The governments by period: dates and Chief Minister only, as the site names them everywhere. */
export function periodLines(): HubLine[] {
  return periods.periods.map((p) => ({
    text: {
      en: `${dateLong(p.from)} to ${p.to ? dateLong(p.to) : 'today'}: Chief Minister ${p.cm}`,
      te: `${dateTe(p.from)} నుంచి ${p.to ? dateTe(p.to) : 'ఇప్పటి వరకు'}: ముఖ్యమంత్రి ${p.cm}`,
    },
  }))
}
