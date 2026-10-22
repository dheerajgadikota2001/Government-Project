import * as React from 'react'
import * as d3 from 'd3'
import { motion } from 'motion/react'
import { dateLong, dateShort, dateTe, num, crore, croreTe, yearFrac, MON3 } from '@/lib/format'
import { useLang } from '@/lib/i18n'
import { Halo, RM, spread, textWidth, useTokens, useWidth } from './util'

/* ======================================================================
   "A date that keeps moving": every completion date a paper gave (y),
   placed at the date of that paper (x). Points under the diagonal gave a
   date that had already passed when they were printed.
   ====================================================================== */
export type Deadline = { said: string; target: string; prec: 'month' | 'year'; paper: string; kind: 'gov' | 'press' }

export function DeadlineChart({ items, labelled, height }: { items: Deadline[]; labelled?: Set<string>; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>(900)
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const [hover, setHover] = React.useState<number | null>(null)
  const narrow = w < 640
  const hasPress = items.some((d) => d.kind === 'press'), hasYear = items.some((d) => d.prec === 'year')
  // direct labels for government papers on the right edge, nudged apart
  const govIdx = items.map((d, i) => [d, i] as const).filter(([d]) => d.kind === 'gov' && (!labelled || labelled.has(d.paper)))
  const labText = (d: Deadline) => `${d.paper.replace('Socio-Economic Survey', 'Survey')}: ${d.prec === 'year' ? d.target : te ? dateTe(d.target) : `${MON3[+d.target.slice(5, 7) - 1]} ${d.target.slice(0, 4)}`}`
  const labW = Math.max(0, ...govIdx.map(([d]) => textWidth(labText(d), 11.5)))
  // The right-hand labels appear only where they fit in full. Elsewhere each dot names its paper on tap, and the table lists all.
  const showLabels = !narrow && labW + 20 <= w * 0.42
  const m = { l: narrow ? 46 : 64, r: showLabels ? Math.max(170, Math.ceil(labW) + 20) : 12, t: 22, b: 40 }
  const H = height ?? (narrow ? 380 : 440)
  const x = d3.scaleLinear().domain([2016.6, 2027]).range([m.l, w - m.r])
  const y = d3.scaleLinear().domain([2018, 2028.6]).range([H - m.b, m.t])
  const tx = (s: string) => yearFrac(s)
  const ty = (d: Deadline) => (d.prec === 'year' ? +d.target + 0.5 : yearFrac(d.target))
  const xs = d3.range(2017, 2027 + 1, narrow ? 2 : 1)
  const ys = d3.range(2018, 2029, narrow ? 2 : 1)
  const labY = spread(govIdx.map(([d]) => y(ty(d))), 15, m.t, H - m.b)
  const h = hover != null ? items[hover] : null
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={H} role="img" aria-label={te ? 'ప్రతి పత్రం ఇచ్చిన పూర్తి తేదీ, ఆ పత్రం తేదీ దగ్గర' : 'Each completion date a paper gave, placed at the date of that paper'} style={{ display: 'block', overflow: 'visible' }}>
        {ys.map((v) => <g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} /><Halo x={m.l - 8} y={y(v) + 4} anchor="end" size={11.5} fill={C.muted}>{v}</Halo></g>)}
        {xs.map((v) => <Halo key={v} x={x(v)} y={H - m.b + 18} anchor="middle" size={11.5} fill={C.muted}>{v}</Halo>)}
        <Halo x={m.l - (narrow ? 40 : 56)} y={m.t - 8} size={11.5} weight={600} fill={C.muted}>{te ? 'ఇచ్చిన పూర్తి తేదీ' : 'Completion date given'}</Halo>
        <Halo x={w - m.r} y={H - 4} anchor="end" size={11.5} weight={600} fill={C.muted}>{te ? 'పత్రం తేదీ →' : 'Date of the paper →'}</Halo>
        {/* the diagonal: a target equal to the paper's own date */}
        <line x1={x(2018)} y1={y(2018)} x2={x(2027)} y2={y(2027)} stroke={C.ink2} strokeDasharray="5 5" strokeOpacity={0.6} />
        {narrow
          ? <Halo x={w - m.r} y={y(2018.4)} size={11} fill={C.muted} anchor="end">{te ? 'గీత కింద: అప్పటికే దాటిన తేదీ' : 'Below the dashed line: date already passed'}</Halo>
          : <Halo x={x(2023.2)} y={y(2023.2) + 16} size={11.5} fill={C.muted} anchor="start">{te ? 'ఈ గీత కింద ఉంటే, ఆ తేదీ అప్పటికే దాటిపోయింది' : 'Below this line, the date had already passed'}</Halo>}
        {items.map((d, i) => {
          const cx = x(tx(d.said)), cy = y(ty(d))
          const isPress = d.kind === 'press'
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
              {d.prec === 'year' ? <line x1={cx} x2={cx} y1={y(+d.target)} y2={y(+d.target + 1)} stroke={isPress ? C.c2 : C.c1} strokeWidth={3} strokeOpacity={0.45} strokeLinecap="round" /> : null}
              <motion.circle cx={cx} cy={cy} r={isPress ? 6.5 : 6.5}
                fill={isPress ? C.bg : C.c1} stroke={isPress ? C.c2 : C.bg} strokeWidth={isPress ? 2.4 : 2} strokeDasharray={isPress ? '3 2' : undefined}
                initial={RM ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} />
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
            </g>
          )
        })}
        {showLabels ? govIdx.map(([d, i], k) => (
          <g key={i}>
            <line x1={x(tx(d.said)) + 8} x2={w - m.r + 6} y1={y(ty(d))} y2={labY[k]} stroke={C.grid} />
            <Halo x={w - m.r + 10} y={labY[k] + 4} size={11.5} fill={C.ink2}>{labText(d)}</Halo>
          </g>
        )) : null}
      </svg>
      {h ? (
        <div className="pointer-events-none absolute left-2 top-2 max-w-[280px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-[13px] shadow-lg backdrop-blur">
          <div className="font-semibold">{h.paper}</div>
          {te
            ? <div className="text-muted-foreground" lang="te">{dateTe(h.said)}న ప్రచురితం. ఇచ్చిన పూర్తి తేదీ: <b className="text-foreground">{h.prec === 'year' ? h.target : dateTe(h.target)}</b>.</div>
            : <div className="text-muted-foreground">Printed {dateLong(h.said)}. Completion date given: <b className="text-foreground">{h.prec === 'year' ? h.target : dateLong(h.target)}</b>.</div>}
          <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{h.kind === 'press' ? (te ? 'పత్రిక చెప్పింది' : 'Newspaper says') : (te ? 'ప్రభుత్వ రికార్డు' : 'Government record')}</div>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full" style={{ background: C.c1 }} />{te ? 'ప్రభుత్వ పత్రం' : 'Government paper'}</span>
        {hasPress ? <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-dashed" style={{ borderColor: C.c2 }} />{te ? 'పత్రికా కథనం' : 'Newspaper report'}</span> : null}
        {hasYear ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded" style={{ background: C.c1, opacity: 0.45 }} />{te ? 'నెల లేకుండా సంవత్సరం మాత్రమే' : 'A year with no month given'}</span> : null}
      </div>
    </div>
  )
}

/* ======================================================================
   Progress, measure by measure. Different papers measure different things,
   so each measure is its own row from 0 to 100% and nothing is joined.
   ====================================================================== */
export type ProgRow = { measure: string; date: string; pct: number; paper: string; url?: string; kind: 'gov' | 'press' }

export function ProgressRows({ rows }: { rows: ProgRow[] }) {
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const [ref, w] = useWidth<HTMLDivElement>(700)
  const narrow = w < 560
  return (
    <div ref={ref} className="space-y-3.5">
      {rows.map((r, i) => {
        const press = r.kind === 'press'
        return (
          <div key={i} className={narrow ? 'space-y-1' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-4'}>
            <div className="min-w-0">
              <div className="text-[14px] font-medium leading-snug">{r.measure}</div>
              <div className="text-[12px] text-muted-foreground">{te ? dateTe(r.date) : dateLong(r.date)} · <span lang="en">{r.paper}</span>{press ? (te ? ' · పత్రిక చెప్పింది' : ' · Newspaper says') : ''}</div>
            </div>
            <div className="relative h-7">
              <div className="absolute inset-y-[11px] left-0 w-[84%] rounded-full bg-muted" />
              <motion.div className="absolute inset-y-[9px] left-0 rounded-full"
                style={press ? { border: `2px dashed ${C.c2}`, background: 'transparent' } : { background: C.c1 }}
                initial={RM ? false : { width: 0 }} whileInView={{ width: `${r.pct * 0.84}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.04, ease: 'easeOut' }} />
              <div className="absolute top-0 whitespace-nowrap text-[13px] font-bold tnum" style={{ left: `calc(${r.pct * 0.84}% + 8px)`, lineHeight: '28px', color: press ? C.c2 : C.fg }}>{num(r.pct)}%</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ======================================================================
   The cost, as each paper printed it. Different scopes, so no joining line.
   ====================================================================== */
export type CostPoint = { date: string; value: number; label: string; scope: string; paper: string }

export function CostDots({ points, focus, height }: { points: CostPoint[]; focus?: string[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>(900)
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const narrow = w < 640
  const ticks = [0, 20000, 40000, 60000]
  const tickLabel = (v: number) => (v === 0 ? '0' : te ? `₹${num(v, 0)} కోట్లు` : `₹${num(v, 0)} crore`)
  const money = (v: number) => (te ? croreTe(v) : crore(v))
  const day = (s: string) => (te ? dateTe(s) : dateShort(s))
  // the left margin fits the longest axis label, so it never runs past the card's edge
  const m = { l: Math.ceil(Math.max(...ticks.map((v) => textWidth(tickLabel(v), 11.5)))) + 14, r: 16, t: 26, b: 34 }
  const H = height ?? (narrow ? 300 : 340)
  const lit = (p: CostPoint) => !focus || focus.includes(p.date)
  const x = d3.scaleLinear().domain([2008.4, 2025.4]).range([m.l, w - m.r])
  const y = d3.scaleLinear().domain([0, 60000]).range([H - m.b, m.t])
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label={te ? 'ప్రతి పత్రం ముద్రించిన పోలవరం వ్యయం' : "Polavaram's cost as each paper printed it"} style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((v) => <g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} /><Halo x={m.l - 8} y={y(v) + 4} anchor="end" size={11.5} fill={C.muted}>{tickLabel(v)}</Halo></g>)}
        {d3.range(2009, 2026, narrow ? 4 : 2).map((v) => <Halo key={v} x={x(v)} y={H - m.b + 18} anchor="middle" size={11.5} fill={C.muted}>{v}</Halo>)}
        {(() => {
          // Place each label beside its dot. A label that would touch an earlier label, a dot, or the edge
          // tries the other side, then rows above and below, nearest first. A thin line joins a moved label to its dot.
          const boxes: { x0: number; x1: number; y0: number; y1: number }[] = []
          const dots = points.map((p) => ({ cx: x(yearFrac(p.date)), cy: y(p.value) }))
          const lh = narrow ? 32 : 36
          return points.map((p, i) => {
            const { cx, cy } = dots[i]
            if (!lit(p)) return null
            const t1 = textWidth(money(p.value), narrow ? 12.5 : 14, 700)
            const t2 = textWidth(narrow || te ? day(p.date) : `${day(p.date)} · ${p.label}`, narrow ? 11 : 11.5, 400)
            const tw = Math.max(t1, t2)
            const prefer = cx < w * 0.62
            const sides = prefer ? [true, false] : [false, true]
            const rows = [0, -1, 1, -2, 2, -3, 3]
            for (const r of rows) for (const right of sides) {
              const ly = cy - 3 + r * lh
              const x0 = right ? cx + 12 : cx - 12 - tw, x1 = x0 + tw
              const y0 = ly - 13, y1 = ly + (narrow ? 18 : 21)
              if (x0 < 2 || x1 > w - 2 || y0 < 0 || y1 > H - m.b - 4) continue
              if (boxes.some((b) => x0 < b.x1 + 4 && b.x0 < x1 + 4 && y0 < b.y1 + 2 && b.y0 < y1 + 2)) continue
              if (dots.some((d, j) => j !== i && d.cx > x0 - 9 && d.cx < x1 + 9 && d.cy > y0 - 9 && d.cy < y1 + 9)) continue
              boxes.push({ x0, x1, y0, y1 })
              return { ly, right }
            }
            const ly = Math.min(cy - 3, H - m.b - 22)
            return { ly, right: prefer }
          })
        })().map((spot, i) => {
          const p = points[i]
          const cx = x(yearFrac(p.date)), cy = y(p.value)
          const phase = p.scope.startsWith('First')
          const on = lit(p)
          const { ly, right } = spot ?? { ly: cy - 3, right: true }
          return (
            <g key={i} style={{ opacity: on ? 1 : 0.28, transition: 'opacity .4s' }}>
              <line x1={cx} x2={cx} y1={y(0)} y2={cy} stroke={C.grid} strokeWidth={2} />
              {phase
                ? <rect x={cx - 7} y={cy - 7} width={14} height={14} fill={C.bg} stroke={C.c3} strokeWidth={2.5} />
                : <circle cx={cx} cy={cy} r={7.5} fill={C.c1} stroke={C.bg} strokeWidth={2} />}
              {on && ly !== cy - 3 ? <line x1={cx + (right ? 6 : -6)} y1={cy + (ly < cy ? -6 : 6)} x2={cx + (right ? 10 : -10)} y2={ly - 4} stroke={C.muted} strokeWidth={1} /> : null}
              {on ? <Halo x={cx + (right ? 12 : -12)} y={ly} anchor={right ? 'start' : 'end'} size={narrow ? 12.5 : 14} weight={700}>{money(p.value)}</Halo> : null}
              {!on ? null : !narrow && !te ? <Halo x={cx + (right ? 12 : -12)} y={ly + 17} anchor={right ? 'start' : 'end'} size={11.5} fill={C.muted}>{day(p.date)} · {p.label}</Halo> : <Halo x={cx + (right ? 12 : -12)} y={ly + (narrow ? 15 : 17)} anchor={right ? 'start' : 'end'} size={narrow ? 11 : 11.5} fill={C.muted}>{day(p.date)}</Halo>}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full" style={{ background: C.c1 }} />{te ? 'మొత్తం ప్రాజెక్టు' : 'Whole project'}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 border-2" style={{ borderColor: C.c3 }} />{te ? 'మొదటి దశ మాత్రమే, 41.15 మీటర్ల వరకు నీటి నిల్వ' : 'First phase only, water stored up to 41.15 metres'}</span>
      </div>
    </div>
  )
}

/* ======================================================================
   Families resettled each year, from the department's records via the CAG.
   ====================================================================== */
export function FamiliesBars({ rows }: { rows: { year: string; n: number }[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(800)
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const none = te ? 'ఏమీ లేవు' : 'None'
  if (w < 560) return (
    <div ref={ref} className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.year} className="grid grid-cols-[96px_1fr] items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">{r.year.replace('Up to March ', 'To March ')}</span>
          {r.n ? <span className="flex items-center gap-2"><span className="h-3.5 rounded-sm" style={{ width: `${(r.n / 4000) * 70}%`, background: C.c1 }} /><b className="tnum">{num(r.n, 0)}</b></span> : <span className="text-muted-foreground">{none}</span>}
        </div>
      ))}
    </div>
  )
  const H = 230, m = { l: 8, r: 8, t: 26, b: 46 }
  const x = d3.scaleBand().domain(rows.map((r) => r.year)).range([m.l, w - m.r]).padding(0.28)
  const y = d3.scaleLinear().domain([0, 4000]).range([H - m.b, m.t])
  const narrow = w < 560
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label={te ? 'ఏడాది వారీగా పునరావాసం పొందిన కుటుంబాలు' : 'Families resettled each year'} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={m.l} x2={w - m.r} y1={y(0)} y2={y(0)} stroke={C.ink2} />
        {rows.map((r, i) => {
          const bx = x(r.year)!, bw = x.bandwidth()
          return (
            <g key={r.year}>
              {r.n > 0
                ? <rect x={bx} y={y(r.n)} width={bw} height={Math.max(0, y(0) - y(r.n))} rx={3} fill={C.c1} />
                : <text x={bx + bw / 2} y={y(0) - 8} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 600 }} fill={C.muted}>{te ? '0' : none}</text>}
              {r.n > 0 ? <Halo x={bx + bw / 2} y={y(r.n) - 7} anchor="middle" size={12} weight={700}>{num(r.n, 0)}</Halo> : null}
              {(te && r.year.endsWith(' వరకు') ? [r.year.replace(' వరకు', ''), 'వరకు'] : [r.year.replace('Up to March ', 'To Mar ')]).map((t, k) => (
                <Halo key={k} x={bx + bw / 2} y={H - m.b + 18 + k * 13} anchor="middle" size={narrow ? 9.5 : 11.5} fill={C.muted}>{t}</Halo>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Simple horizontal bars drawn to scale, each with its printed value. */
export function HBars({ rows, unit, max, color, valueFmt, highlight }: {
  rows: { label: React.ReactNode; value: number; sub?: React.ReactNode; key: string }[]
  unit?: string; max?: number; color?: string; valueFmt?: (v: number) => string; highlight?: string | null
}) {
  const C = useTokens()
  const [ref, w] = useWidth<HTMLDivElement>(600)
  const mx = max ?? d3.max(rows, (r) => r.value) ?? 1
  const text = (v: number) => `${valueFmt ? valueFmt(v) : num(v)}${unit ? ` ${unit}` : ''}`
  // The bars share one scale. Shrink it, never past a third of the column, so every value label fits beside its bar.
  const colW = Math.max(1, (w - 12) * (1.4 / 2.3))
  const room = d3.min(rows, (r) => (r.value > 0 ? (colW - 10 - textWidth(text(r.value), 13, 600)) / ((r.value / mx) * colW) : 1)) ?? 1
  const k = Math.max(0.34, Math.min(0.62, room)) * 100
  return (
    <div ref={ref} className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] items-center gap-3">
          <div className={'min-w-0 text-[14px] leading-snug ' + (highlight === r.key ? 'font-semibold' : '')}>{r.label}{r.sub ? <div className="text-[12px] text-muted-foreground">{r.sub}</div> : null}</div>
          <div className="relative h-6">
            <motion.div className="absolute inset-y-0.5 left-0 rounded" style={{ background: highlight && highlight !== r.key ? C.c5 : (color ?? C.c1) }}
              initial={RM ? false : { width: 0 }} whileInView={{ width: `${(r.value / mx) * k}%` }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.6 }} />
            <div className="absolute top-0 whitespace-nowrap text-[13px] font-semibold tnum" style={{ left: `calc(${(r.value / mx) * k}% + 8px)`, lineHeight: '24px' }}>{text(r.value)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
