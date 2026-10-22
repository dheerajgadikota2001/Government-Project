import * as d3 from 'd3'
import { motion } from 'motion/react'
import { useTokens, useWidth, RM } from './util'
import { STAGE_WORDS, num } from '@/lib/format'
import { useLang } from '@/lib/i18n'

/** A small line with every point labelled by stage: audited solid, estimates hollow. */
export function Spark({ points, height = 64, strokeWidth = 2.2, showLast = true }: {
  points: { x: number; v: number | null; stage?: string | null }[]; height?: number; strokeWidth?: number; showLast?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>(240)
  const C = useTokens()
  const pts = points.filter((p) => p.v != null) as { x: number; v: number; stage?: string | null }[]
  if (pts.length < 2) return <div ref={ref} style={{ height }} />
  const x = d3.scaleLinear().domain(d3.extent(pts, (p) => p.x) as [number, number]).range([4, w - (showLast ? 8 : 4)])
  const y = d3.scaleLinear().domain([d3.min(pts, (p) => p.v)! * 0.92, d3.max(pts, (p) => p.v)! * 1.04]).range([height - 6, 6])
  const isEst = (p: { stage?: string | null }) => !!(p.stage && STAGE_WORDS[p.stage]?.est)
  // the line breaks into a dashed run where the figures are estimates
  const solid = pts.filter((p) => !isEst(p))
  const firstEst = pts.findIndex(isEst)
  const dashed = firstEst > 0 ? pts.slice(firstEst - 1) : []
  const line = d3.line<{ x: number; v: number }>().x((p) => x(p.x)).y((p) => y(p.v)).curve(d3.curveMonotoneX)
  const last = pts[pts.length - 1]
  return (
    <div ref={ref}>
      <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <motion.path d={line(solid) ?? ''} fill="none" stroke={C.c1} strokeWidth={strokeWidth} strokeLinecap="round"
          initial={RM ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
        {dashed.length ? <path d={line(dashed) ?? ''} fill="none" stroke={C.c1} strokeWidth={strokeWidth} strokeDasharray="3 4" strokeLinecap="round" /> : null}
        {showLast ? <circle cx={x(last.x)} cy={y(last.v)} r={4} fill={isEst(last) ? C.bg : C.c1} stroke={C.c1} strokeWidth={2} /> : null}
      </svg>
    </div>
  )
}

/** A claim and the record placed on one scale, so the gap shows without being printed. */
export function ClaimScale({ claim, records, height = 70, compact }: {
  claim: { v: number; label: string }; records: { v: number; label: string }[]; height?: number; compact?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>(320)
  const C = useTokens()
  const { lang } = useLang()
  const all = [claim.v, ...records.map((r) => r.v)]
  const x = d3.scaleLinear().domain([0, d3.max(all)! * 1.08]).range([10, w - 10]).nice()
  // As many ticks as the width can label without crowding
  const ticks = x.ticks(Math.max(2, Math.min(compact ? 3 : 5, Math.floor(w / 120))))
  const base = height - 22
  return (
    <div ref={ref}>
      <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <line x1={x(0)} x2={w - 10} y1={base} y2={base} stroke={C.ink2} />
        {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={base} y2={base + 4} stroke={C.ink2} /><text x={x(t)} y={base + 16} textAnchor="middle" style={{ fontSize: 10.5 }} fill={C.muted}>{t >= 1e5 ? `₹${num(t / 1e5, 1)} ${lang === 'te' ? 'లక్షల కోట్లు' : 'lakh crore'}` : num(t, 0)}</text></g>)}
        {records.map((r, i) => (
          <g key={i}>
            <line x1={x(r.v)} x2={x(r.v)} y1={base} y2={base - 26 - i * 0} stroke={C.c1} strokeWidth={2} />
            <circle cx={x(r.v)} cy={base - 26} r={6} fill={C.c1} />
          </g>
        ))}
        <line x1={x(claim.v)} x2={x(claim.v)} y1={base} y2={base - 40} stroke={C.c2} strokeWidth={2} strokeDasharray="3 3" />
        <circle cx={x(claim.v)} cy={base - 40} r={6.5} fill={C.bg} stroke={C.c2} strokeWidth={2.4} strokeDasharray="3 2" />
      </svg>
    </div>
  )
}

/** A progress ring on a 0 to 100% scale, with the share as printed. */
export function Ring({ pct, size = 150, label }: { pct: number; size?: number; label?: string }) {
  const C = useTokens()
  const r = size / 2 - 10, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.grid} strokeWidth={12} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.c1} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={RM ? false : { strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - pct / 100) }} viewport={{ once: true }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <text x={size / 2} y={size / 2 + 2} textAnchor="middle" style={{ fontSize: size * 0.2, fontWeight: 700 }} fill={C.fg}>{num(pct)}%</text>
      {label ? <text x={size / 2} y={size / 2 + size * 0.16} textAnchor="middle" style={{ fontSize: size * 0.085 }} fill={C.muted}>{label}</text> : null}
    </svg>
  )
}
