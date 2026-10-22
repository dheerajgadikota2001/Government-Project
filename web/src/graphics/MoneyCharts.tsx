import * as React from 'react'
import * as d3 from 'd3'
import { motion } from 'motion/react'
import { fy, GOVERNMENT_CHANGES, lakhCrore, num, crore, STAGE_WORDS, tickMoney, yearFrac, dateShort, dateTe } from '@/lib/format'
import { useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Halo, RM, spread, textWidth, useTokens, useWidth } from './util'

export type Pt = { fy_end: number; value: number; stage: string; source?: string }
export type Book = { key: string; name: string; short: string; nameTe?: string; shortTe?: string; points: Pt[] }

const est = (s?: string) => !!(s && STAGE_WORDS[s]?.est)

/* ======================================================================
   Signature graphic B: debt and the three books. Each office's figure for
   each year is its own labelled dot. Audited solid, estimates hollow.
   ====================================================================== */
export function DebtBooks({ books, year, onYear }: { books: Book[]; year: number; onYear: (y: number) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>(900)
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  // Axis words in the reader's language: "₹2 లక్షల కోట్లు", "2019 మార్చి".
  const tick = (v: number) => (te ? tickMoney(v).replace(' lakh crore', ' లక్షల కోట్లు').replace(' crore', ' కోట్లు') : tickMoney(v))
  const narrow = w < 640
  const m = { l: narrow ? 58 : 76, r: narrow ? 14 : 150, t: 18, b: 56 }
  const H = narrow ? 360 : 420
  const all = books.flatMap((b) => b.points)
  const x = d3.scaleLinear().domain([2014.6, 2026.4]).range([m.l, w - m.r])
  const y = d3.scaleLinear().domain([0, d3.max(all, (p) => p.value)! * 1.06]).range([H - m.b, m.t]).nice()
  const colors = [C.c1, C.c3, C.c2]
  const shapes = ['circle', 'square', 'diamond'] as const
  const mark = (shape: typeof shapes[number], cx: number, cy: number, r: number, fill: string, stroke: string, dashed: boolean) => {
    const common = { fill, stroke, strokeWidth: 2.2, strokeDasharray: dashed ? '3 2' : undefined }
    if (shape === 'square') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />
    if (shape === 'diamond') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} {...common} />
    return <circle cx={cx} cy={cy} r={r} {...common} />
  }
  const marks = GOVERNMENT_CHANGES.map((g) => ({ g, t: yearFrac(g) })).filter((g) => g.t > 2014.6 && g.t < 2026.4)
  // end labels for each book, nudged apart
  const ends = books.map((b) => { const l = b.points[b.points.length - 1]; return y(l.value) })
  const endY = spread(ends, 30, m.t, H - m.b)
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label={te ? 'ప్రతి ఆర్థిక సంవత్సరం చివరి ఆంధ్రప్రదేశ్ అప్పు, మూడు కార్యాలయాలు ముద్రించినట్లు' : "Andhra Pradesh's debt at the end of each financial year, as three offices print it"} style={{ display: 'block', overflow: 'visible' }}>
        {y.ticks(5).map((v) => <g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} /><Halo x={m.l - 8} y={y(v) + 4} anchor="end" size={11.5} fill={C.muted}>{tick(v)}</Halo></g>)}
        {d3.range(2015, 2027, narrow ? 2 : 1).map((e) => (
          <g key={e} onClick={() => onYear(e)} style={{ cursor: 'pointer' }}>
            <rect x={x(e) - 14} y={m.t} width={28} height={H - m.b - m.t} fill={e === year ? C.grid : 'transparent'} opacity={0.6} />
            <Halo x={x(e)} y={H - m.b + 18} anchor="middle" size={11} fill={e === year ? C.fg : C.muted} weight={e === year ? 700 : 400}>{narrow ? (te ? `మార్చి ${String(e).slice(2)}` : `Mar ${String(e).slice(2)}`) : fy(e)}</Halo>
          </g>
        ))}
        <Halo x={narrow ? 0 : m.l} y={H - 8} size={11.5} fill={C.muted}>{te ? (narrow ? 'ప్రతి ఏడాది మార్చి 31 నాటి అప్పు' : 'ప్రతి ఆర్థిక సంవత్సరం చివరి అప్పు (మార్చి 31)') : narrow ? 'Debt on 31 March of each year' : 'Debt at the end of each financial year (31 March)'}</Halo>
        {(() => {
          // Each date sits beside its line. If two dates would touch, the later one tries the other side,
          // then the next row down: dates never print on top of each other.
          const boxes: { x0: number; x1: number; row: number }[] = []
          return marks.map((g) => {
            const text = te ? (narrow ? dateTe(g.g) : `ప్రభుత్వం మారింది ${dateTe(g.g)}`) : narrow ? dateShort(g.g) : `Government changed ${dateShort(g.g)}`
            const tw = textWidth(text, 10.5, 400)
            const lx = x(g.t)
            const lo = narrow ? 2 : m.l, hi = w - 2
            let pick: { x0: number; x1: number; row: number; anchor: 'start' | 'end' } | null = null
            for (const row of [0, 1, 2]) {
              for (const anchor of ['end', 'start'] as const) {
                const x0 = anchor === 'start' ? lx + 4 : lx - 4 - tw, x1 = x0 + tw
                if (x0 < lo || x1 > hi) continue
                if (boxes.some((b) => b.row === row && x0 < b.x1 + 6 && b.x0 < x1 + 6)) continue
                pick = { x0, x1, row, anchor }; break
              }
              if (pick) break
            }
            pick ??= { x0: lx + 4, x1: lx + 4 + tw, row: 0, anchor: 'start' }
            boxes.push(pick)
            return (
              <g key={g.g}>
                <line x1={lx} x2={lx} y1={m.t} y2={H - m.b} stroke={C.muted} strokeDasharray="1 4" strokeWidth={1.4} />
                <Halo x={pick.anchor === 'start' ? lx + 4 : lx - 4} y={m.t + 10 + pick.row * 13} anchor={pick.anchor} size={10.5} fill={C.muted}>{text}</Halo>
              </g>
            )
          })
        })()}
        {books.map((b, bi) => {
          const line = d3.line<Pt>().x((p) => x(p.fy_end)).y((p) => y(p.value))
          const solid = b.points.filter((p) => !est(p.stage))
          const tail = b.points.findIndex((p) => est(p.stage))
          return (
            <g key={b.key}>
              <motion.path d={line(solid) ?? ''} fill="none" stroke={colors[bi]} strokeWidth={2} strokeOpacity={0.55}
                initial={RM ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: bi * 0.15 }} />
              {tail > 0 ? <path d={line(b.points.slice(tail - 1)) ?? ''} fill="none" stroke={colors[bi]} strokeWidth={2} strokeDasharray="3 4" strokeOpacity={0.7} /> : null}
              {b.points.map((p) => <g key={p.fy_end}>{mark(shapes[bi], x(p.fy_end), y(p.value), 5, est(p.stage) ? C.bg : colors[bi], est(p.stage) ? colors[bi] : C.bg, est(p.stage))}</g>)}
              {!narrow ? <Halo x={w - m.r + 14} y={endY[bi] + 4} size={12} weight={650} fill={colors[bi]}>{te ? b.shortTe ?? b.short : b.short}</Halo> : null}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        {books.map((b, i) => (
          <span key={b.key} className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>{mark(shapes[i], 6, 6, 4.5, colors[i], colors[i], false)}</svg>{te ? b.nameTe ?? b.name : b.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-dashed border-foreground/60" />{te ? 'ఖాళీ: అంచనా' : 'Hollow: an estimate'}</span>
      </div>
    </div>
  )
}

/** The CAG's own three parts of the debt, which add up to the CAG's own total. */
export function PartsBars({ years }: { years: { fy_end: number; internal_debt: number; goi_loans: number; public_account: number; total: number }[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(800)
  const C = useTokens()
  const H = 300, m = { l: 66, r: 10, t: 24, b: 30 }
  const x = d3.scaleBand().domain(years.map((d) => String(d.fy_end))).range([m.l, w - m.r]).padding(0.3)
  const y = d3.scaleLinear().domain([0, d3.max(years, (d) => d.total)! * 1.08]).range([H - m.b, m.t]).nice()
  const keys = [['internal_debt', 'Loans raised by the state', C.c1], ['goi_loans', 'Loans from the Centre', C.c3], ['public_account', 'Public account: deposits and funds the state holds', C.c4]] as const
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label="The CAG's three parts of the debt by year" style={{ display: 'block', overflow: 'visible' }}>
        {y.ticks(4).map((v) => <g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} /><Halo x={m.l - 8} y={y(v) + 4} anchor="end" size={11} fill={C.muted}>{tickMoney(v)}</Halo></g>)}
        {years.map((d, i) => {
          let acc = 0
          return (
            <g key={d.fy_end}>
              {keys.map(([k, , c]) => {
                const v = d[k as keyof typeof d] as number
                const y0 = y(acc), y1 = y(acc + v)
                acc += v
                // Plain rects: animating an SVG rect's y with motion turns into a CSS transform that Safari
                // places wrongly, which left this chart empty on iPhones.
                return <rect key={k} x={x(String(d.fy_end))} y={y1} width={x.bandwidth()} height={Math.max(0, y0 - y1)} fill={c} />
              })}
              {w >= 700 ? <Halo x={x(String(d.fy_end))! + x.bandwidth() / 2} y={y(d.total) - 6} anchor="middle" size={11} weight={650}>{lakhCrore(d.total, 2)}</Halo> : null}
              {/* year labels: the full "2015-16" where it fits, else the short "Mar 16", else every other year */}
              {(() => {
                const step = x.step(), full = fy(d.fy_end), short = `Mar ${String(d.fy_end).slice(2)}`
                const fits = (t: string) => textWidth(t, 11) + 6 <= step
                const label = fits(full) ? full : fits(short) ? short : (i % 2 === 0 ? `'${String(d.fy_end).slice(2)}` : '')
                return label ? <Halo x={x(String(d.fy_end))! + x.bandwidth() / 2} y={H - m.b + 16} anchor="middle" size={11} fill={C.muted}>{label}</Halo> : null
              })()}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        {keys.map(([k, l, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm" style={{ background: c }} />{l}</span>)}
      </div>
    </div>
  )
}

/* ======================================================================
   Signature graphic C: planned and spent. One row per year: budget
   estimate (hollow), revised estimate (dashed), audited (solid).
   ====================================================================== */
export function Dumbbells({ rows }: { rows: { year: string; BE?: number; RE?: number; A?: number }[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(800)
  const C = useTokens()
  const narrow = w < 560
  const m = { l: narrow ? 58 : 76, r: 20, t: 26, b: 30 }
  const rowH = 30
  const H = m.t + m.b + rows.length * rowH
  const vals = rows.flatMap((r) => [r.BE, r.RE, r.A].filter((v): v is number => v != null))
  const x = d3.scaleLinear().domain([0, d3.max(vals)! * 1.05]).range([m.l, w - m.r]).nice()
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label="Planned and spent, year by year" style={{ display: 'block', overflow: 'visible' }}>
        {x.ticks(narrow ? 3 : 5).map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={m.t - 6} y2={H - m.b} stroke={C.grid} /><Halo x={x(v)} y={m.t - 10} anchor="middle" size={11} fill={C.muted}>{tickMoney(v)}</Halo></g>)}
        {rows.map((r, i) => {
          const cy = m.t + i * rowH + rowH / 2
          const xs = [r.BE, r.RE, r.A].filter((v): v is number => v != null).map(x)
          return (
            <g key={r.year}>
              <Halo x={m.l - 10} y={cy + 4} anchor="end" size={12} fill={C.ink2}>{r.year}</Halo>
              {xs.length > 1 ? <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={cy} y2={cy} stroke={C.ink2} strokeOpacity={0.35} strokeWidth={3} /> : null}
              {r.BE != null ? <circle cx={x(r.BE)} cy={cy} r={6} fill={C.bg} stroke={C.c1} strokeWidth={2.2} /> : null}
              {r.RE != null ? <circle cx={x(r.RE)} cy={cy} r={6} fill={C.bg} stroke={C.c3} strokeWidth={2.2} strokeDasharray="3 2" /> : null}
              {r.A != null ? <circle cx={x(r.A)} cy={cy} r={6} fill={C.fg} stroke={C.bg} strokeWidth={2} /> : null}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2" style={{ borderColor: C.c1 }} />Budget estimate: the plan before the year</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-dashed" style={{ borderColor: C.c3 }} />Revised estimate: the plan changed during the year</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-foreground" />Actual: what was spent, from the accounts</span>
      </div>
    </div>
  )
}

/* ======================================================================
   Signature graphic D: Andhra Pradesh among the states. Flat bars, sorted
   by the value RBI prints, every state named and every value printed.
   ====================================================================== */
/** Indian states and union territories as Telugu readers write them. */
export const STATE_TE: Record<string, string> = {
  'Andhra Pradesh': 'ఆంధ్రప్రదేశ్', 'Arunachal Pradesh': 'అరుణాచల్ ప్రదేశ్', Assam: 'అస్సాం', Bihar: 'బిహార్', Chhattisgarh: 'ఛత్తీస్‌గఢ్',
  Goa: 'గోవా', Gujarat: 'గుజరాత్', Haryana: 'హరియాణా', 'Himachal Pradesh': 'హిమాచల్ ప్రదేశ్', Jharkhand: 'ఝార్ఖండ్', Karnataka: 'కర్ణాటక',
  Kerala: 'కేరళ', 'Madhya Pradesh': 'మధ్యప్రదేశ్', Maharashtra: 'మహారాష్ట్ర', Manipur: 'మణిపూర్', Meghalaya: 'మేఘాలయ', Mizoram: 'మిజోరం',
  Nagaland: 'నాగాలాండ్', Odisha: 'ఒడిశా', Punjab: 'పంజాబ్', Rajasthan: 'రాజస్థాన్', Sikkim: 'సిక్కిం', 'Tamil Nadu': 'తమిళనాడు',
  Telangana: 'తెలంగాణ', Tripura: 'త్రిపుర', 'Uttar Pradesh': 'ఉత్తరప్రదేశ్', Uttarakhand: 'ఉత్తరాఖండ్', 'West Bengal': 'పశ్చిమ బెంగాల్',
  'Andaman & Nicobar Islands': 'అండమాన్ నికోబార్ దీవులు', Chandigarh: 'చండీగఢ్', Delhi: 'ఢిల్లీ', 'NCT Delhi': 'ఢిల్లీ',
  'Jammu & Kashmir': 'జమ్మూ కశ్మీర్', 'Jammu and Kashmir': 'జమ్మూ కశ్మీర్', Ladakh: 'లద్దాఖ్', Puducherry: 'పుదుచ్చేరి',
  'All States and UTs': 'అన్ని రాష్ట్రాలు, కేంద్రపాలిత ప్రాంతాలు',
}

/** The most round marks that fit the track without their words touching; always one beyond zero. */
function scaleMarks(max: number, track: number, label: (v: number) => string): number[] {
  for (const c of [5, 4, 3, 2, 1]) {
    const ts = d3.ticks(0, max, c)
    if (ts.length < 2) continue
    const gap = ((ts[1] - ts[0]) / max) * track
    const need = Math.max(...ts.map((t) => textWidth(label(t), 11, 400))) + 10
    if (gap >= need) return ts
  }
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  return [0, Math.floor(max / p) * p]
}

export function StateBars({ rows, value, tick, unit, hollow, highlight = 'Andhra Pradesh', label }: {
  /** Sorted already, in the order the reader should read them. */
  rows: { state: string; v: number }[]
  /** The value printed on each row. */
  value: (v: number) => string
  /** The marks on the scale; the unit is printed once beside them. */
  tick: (v: number) => string
  unit: string
  /** Estimates and provisional figures are drawn hollow, as everywhere on the site. */
  hollow?: boolean
  highlight?: string
  label: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>(800)
  const { lang } = useLang()
  const te = lang === 'te'
  const max = Math.max(...rows.map((r) => r.v))
  const nameW = w < 480 ? 116 : w < 760 ? 156 : 200
  const valW = Math.ceil(Math.max(...rows.map((r) => textWidth(value(r.v), 13.5, 700)))) + 6
  const track = Math.max(60, w - nameW - valW - 2 * 10 - 12)
  const ticks = scaleMarks(max, track, tick)
  const cols = { gridTemplateColumns: `${nameW}px minmax(0,1fr) ${valW}px` }
  const name = (s: string) => (te ? STATE_TE[s] ?? s : s)
  const Ruler = ({ bottom }: { bottom?: boolean }) => (
    <div aria-hidden className={cn('grid gap-2.5 px-1.5 text-[11px] text-muted-foreground tnum', bottom ? 'mt-1' : 'mb-1')} style={cols}>
      <span className="self-center font-medium leading-tight" lang={te ? 'te' : undefined}>{unit}</span>
      <span className="relative h-4">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 whitespace-nowrap" style={{ left: `${(t / max) * 100}%`, transform: t === 0 ? undefined : 'translateX(-50%)' }}>{tick(t)}</span>
        ))}
      </span>
      <span />
    </div>
  )
  return (
    <div ref={ref} className="min-w-0">
      <Ruler />
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid gap-2.5 px-1.5" style={cols}>
          <span />
          <span className="relative">
            {ticks.map((t) => <span key={t} className="absolute inset-y-0 border-l border-dashed border-foreground/15" style={{ left: `${(t / max) * 100}%` }} />)}
          </span>
          <span />
        </div>
        <ol className="relative" aria-label={label}>
          {rows.map((r) => {
            const hi = r.state === highlight
            const all = /^All States/i.test(r.state)
            const colour = hi ? 'var(--chart-1)' : all ? 'color-mix(in oklab, var(--foreground) 22%, transparent)' : 'color-mix(in oklab, var(--foreground) 42%, transparent)'
            // A figure that may still change is striped inside a dashed edge: still a bar, never an empty box.
            const stripes = `repeating-linear-gradient(135deg, ${hi ? 'color-mix(in oklab, var(--chart-1) 62%, transparent)' : all ? colour : 'color-mix(in oklab, var(--foreground) 30%, transparent)'} 0 2px, transparent 2px 5.5px)`
            return (
              <li key={r.state} className={cn('grid items-center gap-2.5 rounded-md px-1.5 py-[3px]', hi && 'bg-[color-mix(in_oklab,var(--chart-1)_12%,transparent)]')} style={cols}>
                <span className={cn('text-[13px] leading-[1.15]', hi ? 'font-semibold' : 'text-foreground/85', all && 'italic text-muted-foreground')} lang={te ? 'te' : 'en'}>{name(r.state)}</span>
                <span className="relative h-3.5">
                  <span className={cn('absolute inset-y-0 left-0 rounded-[3px]', hollow && 'border-[1.5px] border-dashed')}
                    style={{ width: `max(3px, ${(r.v / max) * 100}%)`, background: hollow ? stripes : colour, borderColor: hollow ? colour : undefined }} />
                </span>
                <span className={cn('text-right text-[13.5px] tnum', hi ? 'font-bold' : 'text-foreground/85')}>{value(r.v)}</span>
              </li>
            )
          })}
        </ol>
      </div>
      <Ruler bottom />
    </div>
  )
}

export { num, crore }
