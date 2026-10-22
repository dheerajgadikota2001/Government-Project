import * as React from 'react'
import * as d3 from 'd3'
import { STAGE_WORDS } from '@/lib/format'
import { useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { textWidth, useWidth } from './util'

// One row per year: the year, a bar, and the value printed at the end of the row.
// A line or a column chart can print only a few of its values before the labels collide on a
// phone (twelve columns in 300px leave 25px each), so readers had a shape without numbers.
// Here every year carries its own figure, the scale is marked above and below with its unit,
// and an estimate says which kind it is in words, not only by its look.

export type YearRow = { fyEnd: number; year: string; v: number | null; stage?: string | null }
export type YearGroup = { from: number; to: number; title: React.ReactNode; shade: string }

const isEst = (s?: string | null) => !!(s && STAGE_WORDS[s]?.est)

/** Scale marks that fit the track without their labels touching; always at least one beyond zero. */
export function scaleMarks(lo: number, hi: number, track: number, label: (v: number) => string): number[] {
  for (const c of [5, 4, 3, 2, 1]) {
    const ts = d3.ticks(lo, hi, c)
    if (ts.length < 2) continue
    const gap = ((ts[1] - ts[0]) / (hi - lo)) * track
    const need = Math.max(...ts.map((t) => textWidth(label(t), 11, 400))) + 10
    if (gap >= need) return ts
  }
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(Math.abs(lo), Math.abs(hi)))))
  return lo < 0 ? [Math.ceil(lo / p) * p, 0, Math.floor(hi / p) * p] : [0, Math.floor(hi / p) * p]
}

export function YearBars({ rows, value, tick, unit, color = 'var(--chart-1)', max, groups, label, className }: {
  /** Oldest first: the reader reads down the years. */
  rows: YearRow[]
  /** The figure printed at the end of each row. */
  value: (v: number) => string
  /** The marks on the scale; the unit is printed once beside them. */
  tick: (v: number) => string
  unit: React.ReactNode
  color?: string
  /** A fixed top of the scale, so two charts can share one. */
  max?: number
  /** Optional headings that gather years, for example the government periods. */
  groups?: YearGroup[]
  label: string
  className?: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>(560)
  const { tr, lang } = useLang()
  const te = lang === 'te'
  const vs = rows.filter((r) => r.v != null).map((r) => r.v as number)
  const lo = Math.min(0, ...vs)
  const hi = Math.max(max ?? 0, ...vs, 0)
  const span = hi - lo || 1
  const at = (v: number) => ((v - lo) / span) * 100
  const zero = at(0)
  const stageWord = (s?: string | null) => (isEst(s) ? (te ? STAGE_WORDS[s!].te : STAGE_WORDS[s!].en) : '')
  const yearW = Math.ceil(Math.max(...rows.map((r) => textWidth(r.year, 13, 500)))) + 4
  const noFig = tr('no figure', 'అంకె లేదు')
  const valW = Math.ceil(Math.max(
    ...rows.map((r) => (r.v == null ? textWidth(noFig, 12, 400) : textWidth(value(r.v), 13.5, 700))),
    ...rows.map((r) => textWidth(stageWord(r.stage), 11, 500)),
  )) + 6
  const track = Math.max(60, w - yearW - valW - 2 * 10 - 12)
  const ticks = scaleMarks(lo, hi, track, tick)
  const cols = { gridTemplateColumns: `${yearW}px minmax(0,1fr) ${valW}px` }
  const anyEst = rows.some((r) => isEst(r.stage))

  const Ruler = ({ bottom }: { bottom?: boolean }) => (
    <div aria-hidden className={cn('grid gap-2.5 px-1.5 text-[11px] text-muted-foreground tnum', bottom ? 'mt-1' : 'mb-1')} style={cols}>
      <span className="self-center font-medium leading-tight" lang={te ? 'te' : undefined}>{unit}</span>
      <span className="relative h-4">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 whitespace-nowrap" style={{ left: `${at(t)}%`, transform: at(t) <= 0.5 ? undefined : at(t) >= 99.5 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{tick(t)}</span>
        ))}
      </span>
      <span />
    </div>
  )

  const Row = ({ r }: { r: YearRow }) => {
    const est = isEst(r.stage)
    // A figure that may still change is striped inside a dashed edge: still a bar, never an empty box.
    const stripes = `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 62%, transparent) 0 2px, transparent 2px 5.5px)`
    const left = r.v == null ? 0 : Math.min(at(r.v), zero)
    const width = r.v == null ? 0 : Math.abs(at(r.v) - zero)
    const words = r.v == null ? `${r.year}: ${noFig}` : `${r.year}: ${value(r.v)}${est ? `, ${stageWord(r.stage)}` : ''}`
    return (
      <li className="grid items-center gap-2.5 px-1.5 py-[3px]" style={cols} aria-label={words}>
        <span className="text-[13px] leading-[1.15] text-foreground/85 tnum">{r.year}</span>
        <span className="relative h-3.5">
          {r.v != null ? (
            <span className={cn('absolute inset-y-0 rounded-[3px]', est && 'border-[1.5px] border-dashed')}
              style={{ left: `${left}%`, width: `max(3px, ${width}%)`, background: est ? stripes : color, borderColor: est ? color : undefined }} />
          ) : null}
        </span>
        <span className="text-right leading-[1.1]">
          {r.v == null
            ? <span className="text-[12px] italic text-muted-foreground">{noFig}</span>
            : <span className="block text-[13.5px] font-semibold tnum">{value(r.v)}</span>}
          {est ? <span className="block text-[11px] font-medium text-muted-foreground" lang={te ? 'te' : undefined}>{stageWord(r.stage)}</span> : null}
        </span>
      </li>
    )
  }

  const inGroup = (g: YearGroup) => rows.filter((r) => r.fyEnd >= g.from && r.fyEnd <= g.to)
  return (
    <div ref={ref} className={cn('min-w-0', className)} role="figure" aria-label={label}>
      <Ruler />
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid gap-2.5 px-1.5" style={cols}>
          <span />
          <span className="relative">
            {ticks.map((t) => <span key={t} className={cn('absolute inset-y-0 border-l', t === 0 ? 'border-foreground/45' : 'border-dashed border-foreground/15')} style={{ left: `${at(t)}%` }} />)}
          </span>
          <span />
        </div>
        {groups?.length ? (
          <div className="relative space-y-1.5">
            {groups.map((g) => {
              const rs = inGroup(g)
              if (!rs.length) return null
              return (
                <section key={g.from} className="relative">
                  {/* the period's own grey shade, inside the row padding so bars and grid lines stay aligned */}
                  <span aria-hidden className="absolute bottom-0.5 left-0 top-1 w-[3px] rounded-full" style={{ background: g.shade }} />
                  <div className="relative px-1.5 pb-0.5 pt-1 text-[12px] font-semibold leading-snug text-foreground/80" lang={te ? 'te' : undefined}>
                    <span className="bg-card box-decoration-clone pr-1">{g.title}</span>
                  </div>
                  <ol className="relative">{rs.map((r) => <Row key={r.fyEnd} r={r} />)}</ol>
                </section>
              )
            })}
          </div>
        ) : (
          <ol className="relative">{rows.map((r) => <Row key={r.fyEnd} r={r} />)}</ol>
        )}
      </div>
      <Ruler bottom />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1.5 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-[2px]" style={{ background: color }} />{tr('Final figure', 'చివరి సంఖ్య')}</span>
        {anyEst ? (
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-[2px] border-[1.5px] border-dashed" style={{ borderColor: color, background: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 62%, transparent) 0 2px, transparent 2px 5.5px)` }} />{tr('Estimate: may still change', 'అంచనా: ఇంకా మారవచ్చు')}</span>
        ) : null}
      </div>
    </div>
  )
}
