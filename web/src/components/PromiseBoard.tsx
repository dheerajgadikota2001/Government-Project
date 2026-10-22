import * as React from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import { crore, croreTe, num, MOU_STATUS } from '@/lib/format'
import { useLang } from '@/lib/i18n'
import { useWidth } from '@/graphics/util'

// Every investment promise in one picture, as plain bars. Promises are grouped by the stage each
// has reached. Every row names the company, says who reported it, and prints the amount it claims
// at the end of its bar, so no mark is ever left without words. All bars share one scale, marked
// at the top of every group. A dark bar is a government record; a grey bar is what the company or
// a newspaper says. Nothing is added up and printed.

type Mou = { id: number | string; company_name: string; investment_crore: number | null; status: string; source_tier: string; signed_date?: string | null; sector?: string }

const ORDER = ['signed', 'investment_started', 'operational', 'stalled', 'cancelled']
/** Room kept at the right of every bar lane for the amount printed after the bar. */
const LAB = 116
const at = (f: number) => `calc((100% - ${LAB}px) * ${f})`

/** Who reported the promise, in one word: the legend above the board gives the full words. */
const WHO: Record<string, { en: string; te: string; chip: string; bar: string }> = {
  government: { en: 'Government', te: 'ప్రభుత్వం', chip: 'border-transparent bg-foreground text-background', bar: 'bg-foreground/80' },
  company: { en: 'Company', te: 'కంపెనీ', chip: 'border-dotted border-foreground/55 text-foreground/80', bar: 'bg-foreground/[0.32]' },
  press: { en: 'Newspaper', te: 'పత్రిక', chip: 'border-dashed border-foreground/50 text-foreground/80', bar: 'bg-foreground/[0.32]' },
}
const who = (k: string) => WHO[k] ?? WHO.press

export function PromiseBoard({ mous, onOpen, className }: { mous: Mou[]; onOpen: (m: Mou) => void; className?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>(900)
  const { lang } = useLang()
  const te = lang === 'te'
  const money = (v: number) => (te ? croreTe(v, 0) : crore(v, 0))
  // Wide screens put a promise on one line: name, who reported it, then its bar.
  const wide = w >= 720
  const NAME = 240, CHIP = 104, GAP = 12
  const lane = wide ? w - 20 - 16 - NAME - CHIP - 2 * GAP : w - 20 - 16
  const track = lane - LAB
  const n = track >= 420 ? 4 : 2
  const scale = d3.scaleLinear().domain([0, Math.max(1, ...mous.map((m) => m.investment_crore ?? 0))]).nice(n)
  const top = scale.domain()[1]
  const ticks = scale.ticks(n)
  const rowCols = wide ? { gridTemplateColumns: `${NAME}px ${CHIP}px minmax(0,1fr)`, columnGap: GAP } : undefined

  const groups = React.useMemo(() => {
    const stages = ORDER.filter((s) => mous.some((m) => m.status === s)).concat([...new Set(mous.map((m) => m.status))].filter((s) => !ORDER.includes(s)))
    return stages.map((s) => ({
      stage: s,
      rows: mous.filter((m) => m.status === s).sort((a, b) =>
        (b.investment_crore ?? -1) - (a.investment_crore ?? -1) || a.company_name.localeCompare(b.company_name)),
    }))
  }, [mous])

  const stageName = (s: string) => (te ? MOU_STATUS[s]?.te : MOU_STATUS[s]?.en) ?? s
  const count = (k: number) => (te ? `${k} ${k === 1 ? 'హామీ' : 'హామీలు'}` : `${k} ${k === 1 ? 'promise' : 'promises'}`)
  const whoChip = (kind: string) => (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.05em]', who(kind).chip)} lang={te ? 'te' : undefined}>
      {te ? who(kind).te : who(kind).en}
    </span>
  )
  // The scale marks, drawn inside a bar lane so they never cross a name.
  const marks = (reach: number) => (
    <>{ticks.filter((t) => t > 0).map((t) => <span key={t} aria-hidden className="absolute border-l border-dashed border-foreground/15" style={{ left: at(t / top), top: -reach, bottom: -reach }} />)}</>
  )
  const lane_ = (m: Mou) => {
    const v = m.investment_crore
    return (
      <span className="relative flex min-h-[20px] min-w-0 items-center gap-2">
        {wide ? marks(8) : null}
        {v != null ? (
          <>
            <span aria-hidden className={cn('relative block h-3.5 shrink-0 rounded-[3px]', who(m.source_tier).bar)} style={{ width: `max(3px, ${at(v / top)})` }} />
            <span className="relative shrink-0 whitespace-nowrap rounded-sm bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))] pr-1 text-[13px] font-semibold tnum" lang={te ? 'te' : undefined}>{money(v)}</span>
          </>
        ) : (
          <span className="relative text-[13px] italic text-muted-foreground" lang={te ? 'te' : undefined}>{te ? 'మొత్తం చెప్పలేదు' : 'No amount given'}</span>
        )}
      </span>
    )
  }
  const ruler = () => (
    <div aria-hidden className={cn('px-2 pb-0.5 text-[11px] text-muted-foreground', wide && 'grid items-end')} style={rowCols}>
      {wide ? <span className="font-medium">{te ? 'కంపెనీ' : 'Company'}</span> : null}
      {wide ? <span className="font-medium">{te ? 'ఎవరు చెప్పారు' : 'Reported by'}</span> : null}
      <span className="relative block h-[22px] tnum">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 whitespace-nowrap" style={{ left: at(t / top), transform: t === 0 ? undefined : 'translateX(-50%)' }}>{num(t, 0)}</span>
        ))}
        <span className="absolute bottom-0 left-0 h-px bg-foreground/25" style={{ width: at(1) }} />
        {ticks.map((t) => <span key={'k' + t} className="absolute bottom-0 h-[5px] w-px bg-foreground/35" style={{ left: at(t / top) }} />)}
        <span className="absolute right-0 top-0 font-medium" lang={te ? 'te' : undefined}>{te ? '₹ కోట్లు' : '₹ crore'}</span>
      </span>
    </div>
  )

  return (
    <div ref={ref} className={cn('min-w-0', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', WHO.government.bar)} />{te ? 'ముదురు బార్: ప్రభుత్వ రికార్డు' : 'Dark bar: a government record'}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', WHO.company.bar)} />{te ? 'బూడిద బార్: కంపెనీ లేదా పత్రిక చెప్పినది' : 'Grey bar: what a company or a newspaper says'}</span>
        <span>{te ? 'మొత్తాలు ₹ కోట్లలో, అన్నీ ఒకే కొలతపై.' : 'Amounts in ₹ crore, all on one scale.'}</span>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <section key={g.stage} className="rounded-xl bg-muted/60 p-2.5" aria-label={`${stageName(g.stage)}, ${count(g.rows.length)}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 pb-1.5 pt-0.5">
              <h4 className="text-[15.5px] font-semibold leading-snug" lang={te ? 'te' : undefined}>{stageName(g.stage)}</h4>
              <span className="text-[12.5px] text-muted-foreground tnum">{count(g.rows.length)}</span>
            </header>
            {ruler()}
            <ol>
              {g.rows.map((m) => {
                const v = m.investment_crore
                const label = te
                  ? `${m.company_name}: ${v != null ? money(v) + ' అని చెప్పారు' : 'మొత్తం చెప్పలేదు'}; ${who(m.source_tier).te}`
                  : `${m.company_name}: ${v != null ? money(v) + ' claimed' : 'no amount given'}; reported by ${who(m.source_tier).en.toLowerCase()}`
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => onOpen(m)} aria-label={label}
                      className={cn('grid w-full items-center rounded-md px-2 py-1.5 text-left transition-colors hover:bg-background/80 focus-visible:bg-background/80',
                        !wide && 'grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1')}
                      style={rowCols}>
                      <span className="min-w-0 text-[14px] font-medium leading-snug" lang="en">{m.company_name}</span>
                      <span className={cn(!wide && 'self-start pt-0.5')}>{whoChip(m.source_tier)}</span>
                      <span className={cn('min-w-0', !wide && 'col-span-2')}>{lane_(m)}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
