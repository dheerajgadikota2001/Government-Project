import * as React from 'react'
import { AlertTriangle, ArrowUpRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtByName } from '@/lib/data'
import { PaperChip, Te } from '@/components/kit'
import { RM } from '@/graphics/util'
import { DM, fmt, type Measure } from '@/components/DistrictFacts'

// The district, year by year, from the state's Statistical Abstract editions 2014 to 2023, then 2024.
//
// House rules kept here, and why:
// - Until 4 April 2022 Andhra Pradesh had 13 districts. Books up to 2022 print those 13, bigger
//   districts. A figure for old Krishna is not a figure for today's Krishna, so the two are drawn as
//   separate groups and never joined by a line, added or split.
// - Which old district a new district came from is said only where an official district page says
//   it. Otherwise the reader picks the old district their village was in.
// - Every number is the book's own. A change of unit (₹ million to ₹ crore) or of what is counted
//   starts a new group with words; nothing is converted. Bars start at zero, every bar prints its value.

type Flag = { kind: 'reading' | 'doubt' | 'blank' | 'police'; en: string; te: string | null }
type Point = {
  edition: number; year_en: string; year_te: string; sort: number; map: '13' | '26'
  table: string | null; page: number | null; kind: Measure['kind']; unit_en: string; unit_te: string
  def: string | null; values: Record<string, number | null>; state: number | null; state_gap: boolean
  flags: Record<string, Flag>; units: Record<string, { unit: string; value: number }[]> | null
}
type HMeasure = { id: string; id2024: string; theme: string; en: string; te: string; note: { en: string; te: string } | null; points: Point[] }
type Doc = {
  paper: { title: string; title_te: string; by: string; by_te: string; editions: number[] }
  def_text: Record<string, { en: string; te: string }>
  old13: string[]
  parents2022: Record<string, { from: string[]; source: string; url: string }>
  unsourced2022: string[]
  measures: HMeasure[]
}

let cache: Promise<Doc> | null = null
const load = () => (cache ??= import('@/data/district_history.json').then((m) => m.default as unknown as Doc))

function useDoc() {
  const [doc, setDoc] = React.useState<Doc | null>(null)
  const [err, setErr] = React.useState(false)
  React.useEffect(() => { let on = true; load().then((d) => on && setDoc(d), () => on && setErr(true)); return () => { on = false } }, [])
  return { doc, err }
}

const KEY = (d: string) => `apfc-old-district:${d}`

/** One row of a group: the year, which book and page, a bar from zero, the printed value. */
type Row = { key: string; year: string; book: string; v: number | null; flag?: Flag; units?: { unit: string; value: number }[]; gap?: boolean; latest?: boolean }
type Group = { title: string; sub?: string; unit: Pick<Measure, 'kind' | 'unit_en' | 'unit_te'>; rows: Row[]; tone: 'old' | 'new' }

function Bars({ g }: { g: Group }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const max = Math.max(0, ...g.rows.map((r) => r.v ?? 0)) || 1
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className={cn('text-[13px] font-semibold', g.tone === 'new' ? 'text-[var(--chart-1)]' : 'text-foreground/85')} lang={te ? 'te' : undefined}>{g.title}</p>
        {g.sub ? <p className="text-[12px] text-muted-foreground" lang={te ? 'te' : undefined}>{g.sub}</p> : null}
      </div>
      <ol className="space-y-1.5">
        {g.rows.map((r) => (
          <li key={r.key}>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3">
              <div className="leading-tight">
                <span className="block text-[12.5px] font-medium tnum" lang={te ? 'te' : undefined}>{r.year}</span>
                <span className="block text-[10.5px] text-muted-foreground" lang={te ? 'te' : undefined}>{r.book}</span>
              </div>
              {r.units ? (
                <p className="text-[12.5px] leading-snug text-foreground/85">
                  {r.units.map((u, i) => <span key={u.unit}>{i ? ' · ' : ''}{u.unit} <b className="tnum font-semibold">{fmt(g.unit, u.value, te)}</b></span>)}
                </p>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="relative h-[13px] min-w-0 flex-1 rounded-[3px] bg-muted/70">
                    {r.v != null ? (
                      <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{
                        width: `${Math.max((Math.max(r.v, 0) / max) * 100, 0.6)}%`,
                        background: g.tone === 'new' ? 'var(--chart-1)' : r.latest ? 'color-mix(in oklab, var(--foreground) 55%, transparent)' : 'color-mix(in oklab, var(--foreground) 30%, transparent)',
                        transition: RM ? undefined : 'width 500ms cubic-bezier(.22,.8,.2,1)',
                      }} />
                    ) : null}
                  </span>
                  <span className={cn('w-[44%] shrink-0 text-right text-[12.5px] tnum sm:w-[36%]', r.v == null ? 'text-muted-foreground' : 'font-medium')}>
                    {fmt(g.unit, r.v, te)}{r.flag && r.flag.kind !== 'blank' ? <sup className="ml-0.5 text-[10px] text-amber-600 dark:text-amber-400" aria-label={tr('see note', 'గమనిక చూడండి')}>!</sup> : null}
                  </span>
                </span>
              )}
            </div>
            {r.flag && (r.flag.kind === 'doubt' || r.flag.kind === 'reading') ? (
              <p className={cn('ml-[96px] mt-0.5 text-[11.5px] leading-snug sm:ml-[132px]', r.flag.kind === 'doubt' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                {te ? <Te>{r.flag.te}</Te> : r.flag.en}
              </p>
            ) : null}
            {r.gap ? (
              <p className="ml-[96px] mt-0.5 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400 sm:ml-[132px]">
                {tr('In this table the districts do not add up to the state total the book prints.', 'ఈ పట్టికలో జిల్లాల అంకెలు పుస్తకం ముద్రించిన రాష్ట్ర మొత్తానికి సరిపోవడం లేదు.')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

function bookLine(p: { edition: number; table: string | null; page: number | null }, te: boolean) {
  return te ? `${p.edition} పుస్తకం, పేజీ ${p.page ?? '?'}` : `Book ${p.edition}, p. ${p.page ?? '?'}`
}

/** Old district rows, split into groups wherever the unit or what is counted changes. */
function oldGroups(m: HMeasure, old: string, doc: Doc, te: boolean, name: (s: string) => string): Group[] {
  const pts = m.points.filter((p) => p.map === '13')
  const out: Group[] = []
  pts.forEach((p, i) => {
    const sig = `${p.kind}|${p.unit_en}|${p.def ?? ''}`
    const prev = out[out.length - 1]
    const prevSig = i ? `${pts[i - 1].kind}|${pts[i - 1].unit_en}|${pts[i - 1].def ?? ''}` : ''
    const row: Row = {
      key: `${p.edition}-${p.year_en}`, year: te ? p.year_te : p.year_en, book: bookLine(p, te),
      v: p.values[old] ?? null, flag: p.flags[old], units: p.units?.[old], gap: p.state_gap, latest: i === pts.length - 1,
    }
    if (!prev || sig !== prevSig) {
      const title = te ? `పాత ${name(old)} జిల్లా` : `Old ${old} district`
      const parts: string[] = []
      if (out.length && p.unit_en !== pts[i - 1].unit_en) parts.push(te ? `ఇక్కడి నుంచి పుస్తకం ${p.unit_te}లో ముద్రించింది` : `From here the book prints ${p.unit_en}`)
      if (p.def) parts.push(te ? doc.def_text[p.def].te : doc.def_text[p.def].en)
      else if (out.length && pts[i - 1].def) parts.push(te ? 'ఇక్కడి నుంచి మళ్లీ సాధారణ లెక్క' : 'From here, the usual count again')
      out.push({ title, sub: parts.join('. ') || undefined, unit: p, rows: [row], tone: 'old' })
    } else prev.rows.push(row)
  })
  return out
}

/** The district as drawn in 2022: the 2023 edition (if it printed 26 districts), then the 2024 edition. */
function newGroup(m: HMeasure, site: string, te: boolean, title: string): Group | null {
  const rows: Row[] = []
  let unit: Group['unit'] | null = null
  for (const p of m.points.filter((x) => x.map === '26')) {
    unit ??= p
    if (p.kind !== unit.kind || p.unit_en !== unit.unit_en) continue
    rows.push({ key: `${p.edition}`, year: te ? p.year_te : p.year_en, book: bookLine(p, te), v: p.values[site] ?? null, flag: p.flags[site], gap: p.state_gap })
  }
  const m24 = DM.measures.find((x) => x.id === m.id2024)
  if (m24) {
    if (!unit || (unit.kind === m24.kind && unit.unit_en === m24.unit_en)) {
      unit ??= m24
      rows.push({ key: '2024', year: te ? m24.year_te : m24.year_en, book: te ? `2024 పుస్తకం, పేజీ ${m24.page}` : `Book 2024, p. ${m24.page}`, v: m24.values[site] ?? null })
    }
  }
  if (!rows.length || !unit) return null
  rows[rows.length - 1].latest = true
  return { title, unit, rows, tone: 'new' }
}

function Card({ m, old, site, doc, newTitle }: { m: HMeasure; old: string | null; site: string; doc: Doc; newTitle: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const name = (s: string) => (te ? districtByName.get(s)?.te ?? s : s)
  const groups = [...(old ? oldGroups(m, old, doc, te, name) : []), newGroup(m, site, te, newTitle)].filter(Boolean) as Group[]
  if (!groups.length) return null
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold leading-snug" lang={te ? 'te' : undefined}>{te ? m.te : m.en}</p>
      <div className="mt-3 space-y-4">
        {groups.map((g, i) => (
          <div key={i} className={cn(i && g.tone === 'new' ? 'border-t border-dashed border-border pt-3' : '')}><Bars g={g} /></div>
        ))}
      </div>
      {m.note ? <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] leading-snug"><Info className="mt-0.5 size-4 shrink-0" />{te ? <Te>{m.note.te}</Te> : m.note.en}</p> : null}
      {!old ? <p className="mt-3 text-[12.5px] text-muted-foreground">{tr('Pick an old district above to see the years before 2022.', '2022కి ముందటి ఏళ్లు చూడడానికి పైన పాత జిల్లాను ఎంచుకోండి.')}</p> : null}
    </li>
  )
}

/** The district page section: every figure the books print for this place, from 2014 to now. */
export function DistrictHistory({ district }: { district: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const { doc, err } = useDoc()
  const d = districtByName.get(district)
  // A district of 2026 reads its parent's 2022 rows, as the 2024 section does.
  const site = d?.formed ? d.from! : district
  const sited = districtByName.get(site)
  const parents = doc?.parents2022[site]
  const [old, setOld] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!doc) return
    let saved: string | null = null
    try { saved = localStorage.getItem(KEY(district)) } catch { /* private window */ }
    setOld(saved && doc.old13.includes(saved) ? saved : parents?.from[0] ?? null)
  }, [doc, district, parents])
  const pick = (o: string) => { setOld(o); try { localStorage.setItem(KEY(district), o) } catch { /* ignore */ } }
  const themes = DM.themes.filter((t) => doc?.measures.some((m) => m.theme === t.key))
  const [theme, setTheme] = React.useState('economy')
  const name = (s: string) => (te ? districtByName.get(s)?.te ?? s : s)

  if (err) return <p className="text-[14px] text-muted-foreground">{tr('The year-by-year figures did not load. Please try again.', 'ఏడాది వారీ అంకెలు రాలేదు. మళ్లీ ప్రయత్నించండి.')}</p>
  if (!doc) return <div className="h-40 animate-pulse rounded-2xl bg-muted/60" aria-label={tr('Loading', 'వస్తోంది')} />

  const list = doc.measures.filter((m) => m.theme === theme)
  const others = doc.old13.filter((o) => !parents?.from.includes(o))
  const newTitle = d?.formed
    ? (te ? `${sited!.te} జిల్లా, 2022 సరిహద్దులతో (${d.te} అప్పుడు అందులో ఉంది)` : `${site} district as drawn in 2022 (it then held ${d.name})`)
    : (te ? `${d?.te ?? district} జిల్లా, 2022 సరిహద్దులతో` : `${district} district as drawn in 2022`)

  const chip = (o: string, strong: boolean) => (
    <button key={o} type="button" onClick={() => pick(o)} aria-pressed={old === o}
      className={cn('rounded-full border px-3.5 py-2 text-[13.5px] font-medium',
        old === o ? 'border-foreground bg-foreground text-background' : strong ? 'border-foreground/50 bg-background hover:border-foreground' : 'border-border bg-background text-foreground/80 hover:border-foreground/40')}>
      <span lang={te ? 'te' : undefined}>{name(o)}</span>
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-[14.5px] leading-relaxed">
        <p>{te
          ? <Te>2022 ఏప్రిల్ 4 వరకు ఆంధ్రప్రదేశ్‌లో 13 జిల్లాలు ఉండేవి. 2014 నుంచి 2022 వరకు పుస్తకాలు ఆ 13 పెద్ద జిల్లాల అంకెలే ముద్రించాయి. కాబట్టి ఆ ఏళ్లకు మీ ప్రాంతం అప్పుడు ఉన్న పాత జిల్లా అంకెలు చూపుతాం; అవి ఇప్పటి జిల్లావి కావు, వాటిని కలపం, విడదీయం.</Te>
          : 'Until 4 April 2022 Andhra Pradesh had 13 districts. Books from 2014 to 2022 print those 13 bigger districts. So for those years we show the old district your area was part of. Those figures are not today\'s district, and we never add or split them.'}</p>
        {parents ? (
          <p className="text-[13.5px] text-foreground/85">
            {te
              ? <Te>{`${sited?.te ?? site} జిల్లా అధికారిక వెబ్‌సైట్ ప్రకారం ఇది ఈ పాత జిల్లా(ల) నుంచి ఏర్పడింది: ${parents.from.map(name).join(', ')}.`}</Te>
              : `The official ${site} district website says it was formed from: ${parents.from.join(', ')}.`}{' '}
            <a href={parents.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline underline-offset-4">{tr('Source', 'మూలం')}<ArrowUpRight className="size-3.5" /></a>
          </p>
        ) : (
          <p className="flex gap-2 text-[13.5px] text-foreground/85"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{tr(
            'We have not yet found an official page that says which old district this district came from. Pick the old district your village was in before April 2022.',
            'ఈ జిల్లా ఏ పాత జిల్లా నుంచి ఏర్పడిందో చెప్పే అధికారిక పేజీ ఇంకా దొరకలేదు. 2022 ఏప్రిల్‌కు ముందు మీ ఊరు ఉన్న పాత జిల్లాను ఎంచుకోండి.')}</p>
        )}
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">{tr('Old district (before April 2022)', 'పాత జిల్లా (2022 ఏప్రిల్‌కు ముందు)')}</p>
          <div className="flex flex-wrap gap-1.5">
            {parents?.from.map((o) => chip(o, true))}
            {others.map((o) => chip(o, !parents))}
          </div>
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Subject', 'విషయం')}>
        {themes.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === theme} onClick={() => setTheme(t.key)}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium',
              t.key === theme ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/40')}>
            <span lang={te ? 'te' : undefined}>{te ? t.te : t.en}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((m) => <Card key={m.id} m={m} old={old} site={site} doc={doc} newTitle={newTitle} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        <PaperChip label={te ? `${doc.paper.title_te}, ${doc.paper.by_te}` : `${doc.paper.title}, ${doc.paper.by}`} />
        <span>{tr('Each row names its book and page. Bars start at zero and compare only rows in the same group.',
          'ప్రతి వరుసలో పుస్తకం, పేజీ ఉన్నాయి. పట్టీలు సున్నా నుంచి మొదలవుతాయి; ఒకే గుంపులోని వరుసలనే పోల్చవచ్చు.')}</span>
      </div>
    </div>
  )
}
