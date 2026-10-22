import metaJson from '@/data/meta.json'
// One set of formatters for the whole site, so rounding and wording never differ
// between two places that show the same figure.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MON3 = MONTHS.map((m) => m.slice(0, 3))
export const MONTHS_TE = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']

/** Telugu dates follow the story's own style: "2026 ఆగస్టు 31", "2027 జూన్". */
export function dateTe(s?: string | null): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!m) return String(y)
  return d ? `${y} ${MONTHS_TE[m - 1]} ${d}` : `${y} ${MONTHS_TE[m - 1]}`
}

/** ₹55,548.87 కోట్లు */
export const croreTe = (v: number | null | undefined, dec = 2) => (v == null ? '' : '₹' + num(v, dec) + ' కోట్లు')
/** The day the data was read, in India time. Due dates are judged against it, not against the reader's clock. */
export const TODAY: string = (metaJson as { asof: string }).asof

/**
 * The calendar day in India for any timestamp, whatever the reader's own time zone.
 * The API stores a notice published on 15 October as 14 October 18:30 UTC; read as UTC,
 * or in a reader's time zone abroad, it shows a day early. Date-only values pass through.
 */
export function istDay(iso?: string | null): string {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10)
}

/** Clock time in India, "11:59 pm", for deadlines. */
export function istTime(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t + 330 * 60_000)
  let h = d.getUTCHours()
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m} ${ap}`
}

export function num(v: number | null | undefined, dec = 2): string {
  if (v == null || Number.isNaN(v)) return ''
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: dec })
}

/** ₹55,548.87 crore. The unit is spelled out, never "Cr". */
export function crore(v: number | null | undefined, dec = 2): string {
  if (v == null) return ''
  return '₹' + num(v, dec) + ' crore'
}

/** ₹6.45 lakh crore for big figures. Tables beside it always show the exact crore figure. */
export function lakhCrore(v: number | null | undefined, dec = 2): string {
  if (v == null) return ''
  if (Math.abs(v) < 1e5) return crore(v)
  return '₹' + num(v / 1e5, dec) + ' lakh crore'
}

/** ₹6.45 లక్షల కోట్లు, the Telugu form of lakhCrore. */
export function lakhCroreTe(v: number | null | undefined, dec = 2): string {
  if (v == null) return ''
  if (Math.abs(v) < 1e5) return croreTe(v, dec)
  return '₹' + num(v / 1e5, dec) + ' లక్షల కోట్లు'
}

/** Axis ticks only: short but still in words people say. */
export function tickMoney(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 1e5) return '₹' + num(v / 1e5, 1) + ' lakh crore'
  return '₹' + num(v, 0) + ' crore'
}

/** "2026-08-31" → "31 August 2026"; "2026-08" → "August 2026"; "2026" → "2026". */
export function dateLong(s?: string | null): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!m) return String(y)
  if (!d) return `${MONTHS[m - 1]} ${y}`
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function dateShort(s?: string | null): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!m) return String(y)
  if (!d) return `${MON3[m - 1]} ${y}`
  return `${d} ${MON3[m - 1]} ${y}`
}

/** A precision-aware date: a month-only date never pretends to have a day. */
export function datePrec(s: string, prec: 'day' | 'month' | 'year' = 'month'): string {
  if (prec === 'year') return s.slice(0, 4)
  if (prec === 'month') return dateLong(s.slice(0, 7))
  return dateLong(s)
}

/** Decimal year for a time scale, from "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
export function yearFrac(s: string): number {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!m) return y + 0.5
  const day = d || 15
  return y + (m - 1) / 12 + (day - 1) / 365
}

export function toDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, (m || 7) - 1, d || 15))
}

/** Financial year label from the year it ends: 2026 → "2025-26". */
export const fy = (end: number) => `${end - 1}-${String(end).slice(2)}`

export const STATUS_WORDS: Record<string, { en: string; te: string }> = {
  under_construction: { en: 'Work going on', te: 'పనులు జరుగుతున్నాయి' },
  completed: { en: 'Finished', te: 'పూర్తయింది' },
  approved: { en: 'Approved', te: 'ఆమోదం పొందింది' },
  tendered: { en: 'Tender called', te: 'టెండర్ పిలిచారు' },
  suspended: { en: 'Stopped', te: 'ఆగిపోయింది' },
  delayed: { en: 'Delayed', te: 'ఆలస్యమైంది' },
}

export const TYPE_WORDS: Record<string, { en: string; te: string }> = {
  urban_development: { en: 'Towns and cities', te: 'పట్టణాలు' },
  roads: { en: 'Roads', te: 'రోడ్లు' },
  irrigation: { en: 'Irrigation', te: 'సాగునీరు' },
  railways: { en: 'Railways', te: 'రైల్వేలు' },
  industrial: { en: 'Industry', te: 'పరిశ్రమలు' },
  power: { en: 'Power', te: 'విద్యుత్' },
  airports: { en: 'Airports', te: 'విమానాశ్రయాలు' },
  it_tech: { en: 'IT and technology', te: 'ఐటీ' },
  infrastructure: { en: 'Infrastructure', te: 'మౌలిక వసతులు' },
  education: { en: 'Education', te: 'విద్య' },
  ports: { en: 'Ports', te: 'ఓడరేవులు' },
  health: { en: 'Health', te: 'ఆరోగ్యం' },
}

export const STAGE_WORDS: Record<string, { en: string; te: string; est: boolean }> = {
  A: { en: 'Actual figure', te: 'వాస్తవ సంఖ్య', est: false },
  Actual: { en: 'Actual figure', te: 'వాస్తవ సంఖ్య', est: false },
  RE: { en: 'Revised estimate', te: 'సవరించిన అంచనా', est: true },
  BE: { en: 'Budget estimate', te: 'బడ్జెట్ అంచనా', est: true },
  PE: { en: 'Provisional figure', te: 'తాత్కాలిక సంఖ్య', est: true },
}

export const KIND_WORDS: Record<string, { en: string; te: string }> = {
  government: { en: 'Government record', te: 'ప్రభుత్వ రికార్డు' },
  gov: { en: 'Government record', te: 'ప్రభుత్వ రికార్డు' },
  company: { en: 'Company says', te: 'కంపెనీ చెబుతోంది' },
  press: { en: 'Newspaper says', te: 'పత్రిక చెబుతోంది' },
}

export const PORTAL_WORDS: Record<string, string> = {
  MOSPI_IPMD: 'MoSPI project monitoring report',
  AMRUT_MoHUA: 'AMRUT list, Union Housing and Urban Affairs Ministry',
  'AP Socio-Economic Survey (Planning Dept)': 'Socio-Economic Survey, Planning Department',
}

export const MOU_STATUS: Record<string, { en: string; te: string; order: number }> = {
  signed: { en: 'Signed only', te: 'సంతకం మాత్రమే', order: 0 },
  investment_started: { en: 'Investment started', te: 'పెట్టుబడి మొదలైంది', order: 1 },
  operational: { en: 'Running', te: 'నడుస్తోంది', order: 2 },
  stalled: { en: 'Stalled', te: 'నిలిచిపోయింది', order: 3 },
  cancelled: { en: 'Cancelled', te: 'రద్దయింది', order: 4 },
}

/** Government changes, by date only. Drawn identically; never named by party. */
export const GOVERNMENT_CHANGES = ['2014-06-08', '2019-05-30', '2024-06-12']
export const STATE_DIVIDED = '2014-06-02'

export const dueGone = (due?: string | null, status?: string) => !!due && due < TODAY && status !== 'completed'

export function shortTitle(t: string, n = 64): string {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** Text our own system wrote (notes, event lines): no long dashes, rupees as ₹. Never used on quotes. */
export function clean(t?: string | null): string {
  if (!t) return ''
  return t
    .replace(/\s*[\u2014]\s*/g, ', ')
    .replace(/\s+[\u2013]\s*|\s*[\u2013]\s+/g, ', ')
    .replace(/\s*--\s*/g, ', ')
    .replace(/\bRs\.?\s?(?=\d)/g, '₹')
    .replace(/\bPM Modi\b/g, 'The Prime Minister')
}
