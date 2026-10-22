import * as React from 'react'
import * as d3 from 'd3'
import { motion } from 'motion/react'
import { GOVERNMENT_CHANGES, dateLong, dateShort, dateTe, num, yearFrac } from '@/lib/format'
import { PaperChip } from '@/components/kit'
import { useLang } from '@/lib/i18n'
import { Halo, RM, useTokens, useWidth } from './util'

// Signature graphic A: the project road. Dated steps on a true time scale, each
// naming its paper; progress readings as points on a 0 to 100% band; the due
// date drawn as a plan, not an event; government changes marked by date only.

export type RoadStep = { date: string; label: string; text?: string; paper?: string; url?: string }
export type RoadReading = { date: string; pct: number | null; paper: string; url?: string; spent?: number | null; note?: string }

/** The project's story, paper by paper: a readable list, oldest first, grouped by year, every title in
 *  full with its paper linked. A chart of printed progress appears above it only when at least two
 *  reports print a share of work done; an empty chart says nothing and reads as a mistake. */
export function ProjectRoad({ steps, readings, due, dueLabel, duePaper }: {
  steps: RoadStep[]; readings: RoadReading[]; due?: string | null; dueLabel?: string; duePaper?: string
}) {
  const withPct = readings.filter((r) => r.pct != null).sort((a, b) => yearFrac(a.date) - yearFrac(b.date))
  return (
    <div className="max-w-3xl">
      {withPct.length >= 2 ? <ProgressChart readings={withPct} due={due} /> : null}
      <RoadVertical steps={steps} readings={readings} due={due} dueLabel={dueLabel} duePaper={duePaper} />
    </div>
  )
}

/** Printed progress over time: one labelled point per report, a year axis, the due date as a dashed mark. */
function ProgressChart({ readings, due }: { readings: RoadReading[]; due?: string | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(720)
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const m = { l: 44, r: 20, t: 26, b: 30 }, H = 190
  const dates = [...readings.map((r) => r.date), ...(due ? [due] : [])]
  const t0 = Math.floor(d3.min(dates.map(yearFrac))! - 0.2), t1 = Math.ceil(d3.max(dates.map(yearFrac))! + 0.2)
  const x = d3.scaleLinear().domain([t0, t1]).range([m.l, w - m.r])
  const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t])
  const years = d3.range(Math.ceil(t0), t1 + 1).filter((yy, i, a) => w > 560 || i % 2 === 0 || yy === a[a.length - 1])
  const line = d3.line<RoadReading>().x((r) => x(yearFrac(r.date))).y((r) => y(r.pct!))
  // label every point, but when two points sit close only the later one is labelled, so nothing overprints
  const show = readings.map((r, i) => i === readings.length - 1 || x(yearFrac(readings[i + 1].date)) - x(yearFrac(r.date)) > 44)
  return (
    <div ref={ref} className="mb-6 rounded-2xl border border-border bg-card p-4">
      <div className="text-[13px] font-semibold">{te ? 'జరిగిన పని, ఒక్కో నివేదిక ముద్రించినట్లు' : 'Work done, as each report printed it'}</div>
      <svg width={w - 32} height={H} role="img" style={{ display: 'block', overflow: 'visible' }}
        aria-label={te ? 'నివేదికలు ముద్రించిన పని శాతం, కాలక్రమంలో' : 'Share of work done as printed by each report, over time'}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - 32 - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} strokeDasharray={v % 50 ? '2 4' : undefined} />
            <Halo x={m.l - 8} y={y(v) + 4} anchor="end" size={11} fill={C.muted}>{v}%</Halo>
          </g>
        ))}
        {years.map((yy) => <Halo key={yy} x={Math.min(x(yy), w - 32 - m.r)} y={H - 8} anchor="middle" size={11.5} fill={C.muted}>{yy}</Halo>)}
        {due ? (
          <g>
            <line x1={Math.min(x(yearFrac(due)), w - 32 - m.r)} x2={Math.min(x(yearFrac(due)), w - 32 - m.r)} y1={m.t - 6} y2={H - m.b} stroke={C.fg} strokeDasharray="3 4" />
            <Halo x={Math.min(x(yearFrac(due)), w - 32 - m.r) - 6} y={m.t - 10} anchor="end" size={11.5} fill={C.muted}>{te ? `గడువు ${dateShort(due)}` : `Due ${dateShort(due)}`}</Halo>
          </g>
        ) : null}
        <motion.path d={line(readings) ?? ''} fill="none" stroke={C.c1} strokeWidth={2.5} strokeLinejoin="round"
          initial={RM ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        {readings.map((r, i) => (
          <g key={i}>
            <circle cx={x(yearFrac(r.date))} cy={y(r.pct!)} r={5.5} fill={C.c1} stroke={C.bg} strokeWidth={2} />
            {show[i] ? <Halo x={x(yearFrac(r.date))} y={y(r.pct!) - 11} anchor="middle" size={12.5} weight={700} fill={C.c1}>{num(r.pct!)}%</Halo> : null}
          </g>
        ))}
      </svg>
      <div className="text-[12.5px] text-muted-foreground">{te ? `${readings.length} నివేదికలు పని శాతం ముద్రించాయి; ప్రతి చుక్క ఒక నివేదిక. గీత కింద జాబితాలో ఒక్కో నివేదిక ఉంది.` : `${readings.length} reports print a share of work done; each dot is one report. Each is listed below.`}</div>
    </div>
  )
}

function RoadVertical({ steps, readings, due, dueLabel, duePaper }: {
  steps: RoadStep[]; readings: RoadReading[]; due?: string | null; dueLabel?: string; duePaper?: string
}) {
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  type Row = { date: string; kind: 'step' | 'reading' | 'gov' | 'due'; s?: RoadStep; r?: RoadReading }
  const rows: Row[] = [
    ...steps.map((s) => ({ date: s.date, kind: 'step' as const, s })),
    ...readings.filter((r) => !steps.some((s) => s.date.slice(0, 7) === r.date.slice(0, 7) && s.paper === r.paper)).map((r) => ({ date: r.date, kind: 'reading' as const, r })),
    ...GOVERNMENT_CHANGES.map((g) => ({ date: g, kind: 'gov' as const })),
    ...(due ? [{ date: due, kind: 'due' as const }] : []),
  ].sort((a, b) => yearFrac(a.date) - yearFrac(b.date))
  // Government changes outside the papers' own span say nothing about this work, so the road starts at its first paper.
  const firstPaper = d3.min(rows.filter((r) => r.kind !== 'gov'), (r) => yearFrac(r.date)) ?? 0
  const inRange = rows.filter((r) => r.kind !== 'gov' || yearFrac(r.date) > firstPaper)
  // Rows sit in normal page flow, so long words wrap and push the next row down instead of landing on it.
  // The gap above each row still grows with the time between papers, but only up to a cap.
  const gapAbove = (i: number) => (i === 0 ? 0 : Math.min(40, Math.max(0, (yearFrac(inRange[i].date) - yearFrac(inRange[i - 1].date)) * 14)))
  const lastIdx = inRange.length - 1
  const solid = { background: C.fg }
  const dashed = { backgroundImage: `linear-gradient(${C.fg} 55%, transparent 0)`, backgroundSize: '3px 9px', backgroundRepeat: 'repeat-y' }
  return (
    <ol className="relative" aria-label={te ? 'ప్రాజెక్టు ప్రయాణం, పాత పత్రం ముందు' : 'The project road, oldest paper first'}>
      {inRange.map((r, i) => {
        const pad = gapAbove(i)
        const dotTop = pad + 9 // the dot lines up with the date line
        const isDue = r.kind === 'due', nextIsDue = inRange[i + 1]?.kind === 'due'
        const yearNew = i === 0 || inRange[i - 1].date.slice(0, 4) !== r.date.slice(0, 4)
        return (
          <li key={i} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3" style={{ paddingTop: pad }}>

            {/* the road: one segment above the dot, one below; the stretch to the due date is dashed, a plan */}
            {i > 0 ? <span aria-hidden className="absolute left-[18px] top-0 w-[5px] rounded-full" style={{ height: dotTop, ...(isDue ? { ...dashed, width: 3, left: 19 } : solid) }} /> : null}
            {i < lastIdx ? <span aria-hidden className="absolute bottom-0 left-[18px] w-[5px] rounded-full" style={{ top: dotTop, ...(nextIsDue ? { ...dashed, width: 3, left: 19 } : solid) }} /> : null}
            <span aria-hidden className="relative flex justify-center" style={{ paddingTop: 1 }}>
              {r.kind === 'step' ? <span className="relative z-[1] size-[18px] rounded-full border-[3px] border-foreground bg-background" />
                : r.kind === 'reading' ? (r.r!.pct == null
                  ? <span className="relative z-[1] mt-1 size-[11px] rotate-45 border-2 bg-background" style={{ borderColor: C.c1 }} />
                  : <span className="relative z-[1] mt-0.5 size-[15px] rounded-full border-2 border-background" style={{ background: C.c1 }} />)
                : isDue ? <span className="relative z-[1] size-[20px] rounded-full border-2 border-dashed border-foreground bg-background" />
                : <span className="relative z-[1] mt-2 h-0 w-[30px] border-t-2 border-dashed border-muted-foreground/70" />}
            </span>
            <div className={'min-w-0 ' + (r.kind === 'gov' ? 'pb-4' : 'pb-6')}>
              <div className="text-[12.5px] leading-5 text-muted-foreground">{yearNew ? <b className="mr-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-foreground">{r.date.slice(0, 4)}</b> : null}{te ? dateTe(r.date) : dateLong(r.date)}</div>
              {r.kind === 'step' ? (<>
                <div className="text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{r.s!.text ?? r.s!.label}</div>
                {r.s!.paper ? <div className="mt-1.5"><PaperChip label={r.s!.paper} url={r.s!.url} /></div> : null}
              </>) : r.kind === 'reading' ? (<>
                <div className="text-[15.5px] font-semibold leading-snug" style={{ color: C.c1 }}>{r.r!.pct == null ? (te ? 'ఖర్చు మాత్రమే ముద్రించారు, పని శాతం లేదు' : 'Spending printed, no share of work') : te ? `${num(r.r!.pct)}% భౌతిక పురోగతి` : `${num(r.r!.pct)}% physical progress`}</div>
                {r.r!.note ? <div className="mt-0.5 text-[13.5px] leading-snug text-foreground/80 [overflow-wrap:anywhere]">{r.r!.note}</div> : null}
                <div className="mt-1.5"><PaperChip label={r.r!.paper} url={r.r!.url} /></div>
              </>) : isDue ? (<>
                <div className="text-[15.5px] font-semibold leading-snug">{dueLabel ?? (te ? 'గడువు' : 'Due date')}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{te ? 'ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు' : 'A plan, not an event'}{duePaper ? `. ${duePaper}` : ''}</div>
              </>) : <div className="text-[13px] font-medium text-muted-foreground">{te ? 'ప్రభుత్వం మారింది' : 'Government changed'}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
