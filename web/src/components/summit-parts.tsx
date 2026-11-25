import * as React from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { crore, croreTe, dateLong, dateTe, lakhCrore, lakhCroreTe, num, tickMoney } from '@/lib/format'
import { useWidth } from '@/graphics/util'
import type { Bi, SummitReport } from '@/lib/docs'

// The pieces both summit pages draw with: the short explainer on /investments/<summit> and the full report on
// /reports/<slug>. Every figure is copied as printed by the report named beside it. Nothing here adds, subtracts,
// averages or ranks: bars only stand side by side on one ruler (scripts/test_summit_reports.mjs checks this file).

export type Row = { key: string; name: React.ReactNode; meta?: React.ReactNode; value: number | null; amount: string; kind: 'press' | 'government'; note?: React.ReactNode }

export const BAR = { press: 'bg-foreground/[0.30] outline outline-1 outline-dashed outline-foreground/45', government: 'bg-foreground/80' }

/** Rows of bars on one shared ruler. The amount printed at the end of each bar is the report's own words. */
export function Ruler({ groups, max, unit }: { groups: { id: string; label: React.ReactNode; note?: React.ReactNode; rows: Row[] }[]; max: number; unit: 'lakh' | 'crore' }) {
  const [ref, w] = useWidth<HTMLDivElement>(820)
  const { lang } = useLang()
  const te = lang === 'te'
  const wide = w >= 720
  const NAME = wide ? 250 : 0
  const LAB = wide ? 150 : 128
  const lane = Math.max(120, (wide ? w - NAME - 28 : w - 20) - LAB)
  const scale = d3.scaleLinear().domain([0, max]).nice(lane >= 420 ? 5 : 3)
  const top = scale.domain()[1]
  const ticks = scale.ticks(lane >= 420 ? 5 : 3)
  const at = (f: number) => `calc((100% - ${LAB}px) * ${f})`
  const tick = (v: number) => (unit === 'lakh' ? (te ? `₹${num(v / 1e5, 1)} లక్షల కోట్లు` : tickMoney(v)) : num(v, 0))
  return (
    <div ref={ref} className="min-w-0 space-y-3">
      {groups.map((g) => (
        <section key={g.id} className="rounded-xl bg-muted/60 p-2.5" aria-label={typeof g.label === 'string' ? g.label : undefined}>
          <h4 className="px-2 pb-1 text-[15px] font-semibold leading-snug">{g.label}</h4>
          <div aria-hidden className={cn('px-2 text-[11px] text-muted-foreground', wide && 'grid')} style={wide ? { gridTemplateColumns: `${NAME}px minmax(0,1fr)` } : undefined}>
            {wide ? <span /> : null}
            <span className="relative block h-[20px] tnum">
              {ticks.map((t) => <span key={t} className="absolute top-0 whitespace-nowrap" style={{ left: at(t / top), transform: t === 0 ? undefined : 'translateX(-50%)' }}>{t === 0 ? '0' : tick(t)}</span>)}
              <span className="absolute bottom-0 left-0 h-px bg-foreground/25" style={{ width: at(1) }} />
              {unit === 'crore' ? <span className="absolute right-0 top-0 font-medium">{te ? '₹ కోట్లు' : '₹ crore'}</span> : null}
            </span>
          </div>
          <ol>
            {g.rows.map((r) => (
              <li key={r.key} className={cn('rounded-md px-2 py-1.5', wide ? 'grid items-center gap-x-0' : 'space-y-1')} style={wide ? { gridTemplateColumns: `${NAME}px minmax(0,1fr)` } : undefined}>
                <div className="min-w-0 pr-3">
                  <div className="text-[14px] font-medium leading-snug">{r.name}</div>
                  {r.meta ? <div className="text-[12.5px] leading-snug text-muted-foreground">{r.meta}</div> : null}
                </div>
                <div className="min-w-0">
                  <span className="relative flex min-h-[20px] items-center gap-2">
                    {ticks.filter((t) => t > 0).map((t) => <span key={t} aria-hidden className="absolute -bottom-1.5 -top-1.5 border-l border-dashed border-foreground/15" style={{ left: at(t / top) }} />)}
                    {r.value != null ? (
                      <>
                        <span aria-hidden className={cn('relative block h-3.5 shrink-0 rounded-[3px]', BAR[r.kind])} style={{ width: `max(2px, ${at(r.value / top)})` }} />
                        <span className="relative shrink-0 whitespace-nowrap rounded-sm bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))] pr-1 text-[13px] font-semibold tnum" lang={te ? 'te' : undefined}>{r.amount}</span>
                      </>
                    ) : <span className="relative text-[13px] italic text-muted-foreground">{r.amount}</span>}
                  </span>
                  {r.note ? <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{r.note}</div> : null}
                </div>
              </li>
            ))}
          </ol>
          {g.note ? <p className="px-2 pt-1.5 text-[13.5px] leading-relaxed text-foreground/85">{g.note}</p> : null}
        </section>
      ))}
    </div>
  )
}

export function Legend() {
  const { tr } = useLang()
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', BAR.government)} />{tr('Solid bar: a government paper', 'ముదురు బార్: ప్రభుత్వ పత్రం')}</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', BAR.press)} />{tr('Dashed bar: a news report', 'గీతల బార్: వార్తా నివేదిక')}</span>
      <span>{tr('All bars on one ruler. Never added together.', 'అన్ని బార్లూ ఒకే కొలతపై. ఎప్పుడూ కలపం.')}</span>
    </div>
  )
}

/** The words both pages use to name a report, link it and pick a language. */
export function useReportWords(x: SummitReport) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const pick = (b: Bi) => (te ? b.te : b.en)
  const R = new Map(x.reports.map((r) => [r.id, r]))
  const when = (d: string | null) => (d ? (te ? dateTe(d) : dateLong(d)) : tr('date not printed', 'తేదీ లేదు'))
  /** The report's name and date, linked to it. */
  const by = (id: string) => {
    const r = R.get(id)!
    return <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" lang="en">{r.outlet}, {when(r.date)}</a>
  }
  const who = (id: string) => pick(R.get(id)!.speaker)
  const srcs = (ids: string[]) => [...new Set(ids)].map((id) => { const r = R.get(id)!; return { label: r.outlet, url: r.url, date: when(r.date), kind: r.kind } })
  /** A company's amount: a lakh crore figure in lakh crore, anything smaller in crore, as the reports print them. */
  const money = (v: number) => (v >= 1e5 ? (te ? lakhCroreTe(v) : lakhCrore(v)) : (te ? croreTe(v, 0) : crore(v, 0)))
  return { te, tr, lang, pick, R, when, by, who, srcs, money }
}

/** The figures going round, grouped by what each counts: the first chart on both pages. */
export function figureGroups(x: SummitReport, w: ReturnType<typeof useReportWords>, only?: string[]) {
  return x.groups.filter((g) => !only || only.includes(g.id)).map((g) => ({
    id: g.id, label: w.pick(g.label), note: w.pick(g.note),
    rows: x.figures.filter((f) => f.group === g.id).map((f, i): Row => ({
      key: `${g.id}-${i}`, name: <span lang="en">{w.R.get(f.report)!.outlet}</span>, meta: <>{w.who(f.report)} · {w.by(f.report)}</>,
      value: f.crore, amount: w.pick(f.amount), kind: w.R.get(f.report)!.kind, note: w.pick(f.words),
    })),
  })).filter((g) => g.rows.length)
}

export type { SummitReport }
