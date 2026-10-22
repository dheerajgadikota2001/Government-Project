import * as React from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtByName } from '@/lib/data'
import { num } from '@/lib/format'
import { PaperChip, Te } from '@/components/kit'
import { RM } from '@/graphics/util'
import raw from '@/data/district_measures.json'

// Everything the Statistical Abstract 2024 prints for every district, on one district's page.
//
// House rules kept here, and why:
// - Each figure is the book's own, read off the page image and checked against the book's state
//   row (site/scripts/build_district_measures.py). Nothing is added, divided or ranked here.
// - The strip under each figure shows where the 26 districts' printed values lie, lowest to
//   highest, with both ends labelled with their values. It never prints a rank.
// - A district of 2026 (Markapuram, Polavaram) shows the figures of the district it was cut
//   from, said as such in words, because the book was written on the 2022 map.

export type Measure = {
  id: string; theme: string; en: string; te: string; unit_en: string; unit_te: string
  kind: 'count' | 'pct' | 'dec0' | 'dec1' | 'money_cr' | 'money_lakh' | 'money_mn'
  year_en: string; year_te: string; table: string; page: number; column: string; source: string
  values: Record<string, number | null>; state: number | null
  state_note: { en: string; te: string } | null; caveat: { en: string; te: string } | null
  notes: Record<string, { en: string; te: string }>
}
type Doc = {
  paper: { title: string; title_te: string; by: string; by_te: string; pages: number }
  themes: { key: string; en: string; te: string; n: number }[]
  measures: Measure[]
}
export const DM = raw as unknown as Doc

const SHORT_EN = (n: string) => n.replace('Dr. B.R. Ambedkar ', '').replace('Sri Potti Sriramulu ', 'SPS ').replace('Parvathipuram ', '').replace('Alluri Sitharama Raju', 'ASR')
const SHORT_TE = (n: string) => n.replace('డా. బి.ఆర్. అంబేద్కర్ ', '').replace('శ్రీ పొట్టి శ్రీరాములు ', '').replace('పార్వతీపురం ', '')

/** The number as the book prints it, in Indian grouping, with its unit. */
export function fmt(m: Pick<Measure, 'kind' | 'unit_en' | 'unit_te'>, v: number | null, te: boolean): string {
  if (v == null) return te ? 'ముద్రించలేదు' : 'not printed'
  const dec = m.kind === 'pct' || m.kind === 'money_cr' || m.kind === 'money_lakh' || m.kind === 'money_mn' || m.kind === 'dec1' ? (Number.isInteger(v) ? 0 : 2) : 0
  const n = num(v, m.kind === 'dec1' ? (Number.isInteger(v) ? 0 : 1) : dec)
  if (m.kind === 'pct') return `${n}%`
  if (m.kind === 'money_cr') return te ? `₹${n} కోట్లు` : `₹${n} crore`
  if (m.kind === 'money_lakh') return te ? `₹${n} లక్షలు` : `₹${n} lakh`
  if (m.kind === 'money_mn') return te ? `₹${n} మిలియన్లు` : `₹${n} million`
  const u = te ? m.unit_te : m.unit_en
  return u ? `${n} ${u}` : n
}

function useName() {
  const { lang } = useLang()
  return (site: string, short = false) => {
    const d = districtByName.get(site)
    if (lang === 'te' && d) return short ? SHORT_TE(d.te) : d.te
    return short ? SHORT_EN(site) : site
  }
}

/** All 26 printed values, sorted, one labelled bar each. Opened from a figure on demand. */
export function MeasureBars({ m, lit, onPick }: { m: Measure; lit?: string | null; onPick?: (site: string) => void }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const name = useName()
  const rows = Object.entries(m.values).map(([site, v], i) => ({ site, v, i }))
  const known = rows.filter((r) => r.v != null) as { site: string; v: number; i: number }[]
  const blank = rows.filter((r) => r.v == null)
  known.sort((a, b) => b.v - a.v || a.i - b.i)
  const lo = Math.min(0, ...known.map((r) => r.v))
  const hi = Math.max(...known.map((r) => r.v), 0)
  const span = hi - lo || 1
  const zero = ((0 - lo) / span) * 100
  return (
    <div className="@container">
      <ol className="space-y-1" aria-label={tr(`${m.en}, every district, highest first`, `${m.te}, అన్ని జిల్లాలు`)}>
        {known.map((r) => {
          const me = r.site === lit
          const left = r.v >= 0 ? zero : ((r.v - lo) / span) * 100
          const width = (Math.abs(r.v) / span) * 100
          return (
            <li key={r.site}>
              <button type="button" onClick={() => onPick?.(r.site)} disabled={!onPick}
                className={cn('grid w-full grid-cols-[92px_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-0.5 text-left @sm:grid-cols-[150px_minmax(0,1fr)] @sm:gap-3',
                  me ? 'bg-[color-mix(in_oklab,var(--chart-1)_10%,transparent)]' : onPick ? 'hover:bg-accent/60' : '')}>
                <span className={cn('line-clamp-2 text-[12.5px] leading-[1.1] @sm:text-[13px]', me ? 'font-semibold' : 'text-foreground/80')} lang={te ? 'te' : undefined}>{name(r.site, true)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="relative h-[12px] min-w-0 flex-1 rounded-[3px] bg-muted/70">
                    <span className="absolute inset-y-0 rounded-[3px]" style={{
                      left: `${left}%`, width: `${Math.max(width, 0.6)}%`,
                      background: me ? 'var(--chart-1)' : 'color-mix(in oklab, var(--foreground) 28%, transparent)',
                      transition: RM ? undefined : 'width 500ms cubic-bezier(.22,.8,.2,1)',
                    }} />
                  </span>
                  <span className={cn('w-[42%] shrink-0 text-right text-[12px] tnum @sm:w-[34%] @sm:text-[12.5px]', me ? 'font-semibold' : 'text-foreground/80')}>{fmt(m, r.v, te)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {blank.length ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{te
          ? <Te>{`పుస్తకం విలువ ముద్రించనివి: ${blank.map((b) => name(b.site, true)).join(', ')}.`}</Te>
          : `No value printed for ${blank.map((b) => name(b.site, true)).join(', ')}.`}</p>
      ) : null}
      <p className="mt-2 text-[12px] text-muted-foreground">{tr('Sorted by the printed value. We print no rank.', 'ముద్రించిన విలువ ప్రకారం వరుస. మేము ర్యాంకు ఇవ్వం.')}</p>
    </div>
  )
}

/** Where the district's value lies among the 26, with both ends named and valued. */
function Strip({ m, site }: { m: Measure; site: string }) {
  const { lang } = useLang()
  const te = lang === 'te'
  const name = useName()
  const pts = Object.entries(m.values).filter(([, v]) => v != null) as [string, number][]
  if (pts.length < 3) return null
  const sorted = [...pts].sort((a, b) => a[1] - b[1])
  const [loS, loV] = sorted[0]
  const [hiS, hiV] = sorted[sorted.length - 1]
  const span = hiV - loV || 1
  const x = (v: number) => ((v - loV) / span) * 100
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative mx-1 h-4">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {pts.map(([s, v]) => (
          <span key={s} className={cn('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
            s === site ? 'z-10 size-3.5 bg-[var(--chart-1)] ring-2 ring-card' : 'size-2 bg-foreground/30')}
            style={{ left: `${x(v)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[11.5px] leading-tight text-muted-foreground">
        <span className="min-w-0"><span lang={te ? 'te' : undefined}>{name(loS, true)}</span> <span className="tnum">{fmt(m, loV, te)}</span></span>
        <span className="min-w-0 text-right"><span lang={te ? 'te' : undefined}>{name(hiS, true)}</span> <span className="tnum">{fmt(m, hiV, te)}</span></span>
      </div>
    </div>
  )
}

function Row({ m, site }: { m: Measure; site: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const [open, setOpen] = React.useState(false)
  const v = m.values[site]
  const note = m.notes[site]
  const paperLine = te ? `పట్టిక ${m.table}, పీడీఎఫ్ పేజీ ${m.page}` : `Table ${m.table}, PDF page ${m.page}`
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <p className="text-[14.5px] leading-snug text-foreground/90" lang={te ? 'te' : undefined}>{te ? m.te : m.en}</p>
        <p className="text-[22px] font-semibold leading-tight tracking-tight tnum sm:text-right">{fmt(m, v, te)}</p>
        <p className="text-[12.5px] text-muted-foreground">{te ? m.year_te : m.year_en}</p>
        {m.state != null ? (
          <p className="text-[12.5px] text-muted-foreground sm:text-right">{tr('Andhra Pradesh: ', 'ఆంధ్రప్రదేశ్: ')}<span className="tnum">{fmt(m, m.state, te)}</span></p>
        ) : null}
      </div>
      <Strip m={m} site={site} />
      {note ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] leading-snug"><Info className="mt-0.5 size-4 shrink-0" />{te ? <Te>{note.te}</Te> : note.en}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted-foreground">
        <span>{paperLine}</span>
        {m.caveat ? <span className="basis-full leading-snug">{te ? <Te>{m.caveat.te}</Te> : m.caveat.en}</span> : null}
        {m.state_note ? <span className="basis-full leading-snug">{te ? <Te>{m.state_note.te}</Te> : m.state_note.en}</span> : null}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          {open ? tr('Hide the 26 districts', '26 జిల్లాలు దాచండి') : tr('See all 26 districts', '26 జిల్లాలూ చూడండి')}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open ? <div className="mt-3 border-t border-border pt-3"><MeasureBars m={m} lit={site} /></div> : null}
    </li>
  )
}

/** The district page section: every printed district figure, by subject. */
export function DistrictFacts({ district }: { district: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const d = districtByName.get(district)
  // A district of 2026 reads its parent's rows, and says so.
  const site = d?.formed ? d.from! : district
  const themes = DM.themes.filter((t) => t.n)
  const [theme, setTheme] = React.useState(themes[0].key)
  const list = DM.measures.filter((m) => m.theme === theme)
  const parent = d?.formed ? districtByName.get(d.from!) : null
  return (
    <div className="space-y-4">
      {parent ? (
        <p className="rounded-xl border border-border bg-card p-4 text-[14.5px] leading-relaxed">{te
          ? <Te>{`ఈ పుస్తకం 2026కి ముందు 26 జిల్లాల ప్రకారం రాసింది. అందుకే ఇక్కడి అంకెలు ${parent.te} జిల్లావి; అప్పట్లో ${d!.te} ప్రాంతం అందులోనే ఉంది.`}</Te>
          : `The book was written on the 26 districts before 2026, so the figures here are ${parent.name}'s, which then included ${d!.name}.`}</p>
      ) : null}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Subject', 'విషయం')}>
        {themes.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === theme} onClick={() => setTheme(t.key)}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium',
              t.key === theme ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/40')}>
            <span lang={te ? 'te' : undefined}>{te ? t.te : t.en}</span> <span className={cn('tnum', t.key === theme ? 'opacity-70' : 'text-muted-foreground')}>{t.n}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((m) => <Row key={m.id} m={m} site={site} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        <PaperChip label={te ? `${DM.paper.title_te}, ${DM.paper.by_te}` : `${DM.paper.title}, ${DM.paper.by}`} />
        <span>{tr('Every figure is the book\'s own, checked against its state row. The strip shows the lowest and highest district.',
          'ప్రతి అంకె పుస్తకంలోదే; రాష్ట్ర వరుసతో సరిచూశాం. గీత అత్యల్ప, అత్యధిక జిల్లాలను చూపుతుంది.')}</span>
      </div>
    </div>
  )
}

/** The districts page: pick any figure and see all 26 side by side. */
export function MeasureCompare({ className }: { className?: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const [theme, setTheme] = React.useState(DM.themes[0].key)
  const inTheme = DM.measures.filter((m) => m.theme === theme)
  const [id, setId] = React.useState(inTheme[0].id)
  const m = DM.measures.find((x) => x.id === id && x.theme === theme) ?? inTheme[0]
  const [lit, setLit] = React.useState<string | null>(() => { try { return localStorage.getItem('apfc-district') } catch { return null } })
  const litSite = lit && districtByName.get(lit)?.formed ? districtByName.get(lit)!.from! : lit
  return (
    <div className={cn('@container space-y-4 rounded-2xl border border-border bg-card p-4 @md:p-6', className)}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Subject', 'విషయం')}>
        {DM.themes.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === theme} onClick={() => { setTheme(t.key); setId(DM.measures.find((x) => x.theme === t.key)!.id) }}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium',
              t.key === theme ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/40')}>
            <span lang={te ? 'te' : undefined}>{te ? t.te : t.en}</span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">{tr('Figure', 'అంకె')}</span>
        <select value={m.id} onChange={(e) => setId(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-[14.5px]" lang={te ? 'te' : undefined}>
          {inTheme.map((x) => <option key={x.id} value={x.id}>{te ? x.te : x.en}</option>)}
        </select>
      </label>
      <p className="text-[13px] text-muted-foreground">{te ? m.year_te : m.year_en} · {te ? `పట్టిక ${m.table}, పీడీఎఫ్ పేజీ ${m.page}` : `Table ${m.table}, PDF page ${m.page}`}{m.state != null ? <> · {tr('Andhra Pradesh: ', 'ఆంధ్రప్రదేశ్: ')}<span className="tnum">{fmt(m, m.state, te)}</span></> : null}</p>
      {m.caveat ? <p className="text-[13px] leading-snug text-muted-foreground">{te ? <Te>{m.caveat.te}</Te> : m.caveat.en}</p> : null}
      <MeasureBars m={m} lit={litSite} onPick={(s) => setLit((x) => (x === s ? null : s))} />
      <div className="border-t border-border pt-3"><PaperChip label={te ? `${DM.paper.title_te}, ${DM.paper.by_te}` : `${DM.paper.title}, ${DM.paper.by}`} /></div>
    </div>
  )
}
