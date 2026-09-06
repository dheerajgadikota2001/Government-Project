import { useState, useEffect, createContext, useContext } from 'react'
import { useT } from '../../i18n'
import { EVENTS, track } from '../../lib/analytics'

/**
 * Chart primitives for the Advanced views — hand-built SVG, no chart library.
 *
 * Design rules (from the platform's viz method):
 *  - one hue for magnitude, darker = larger; never rainbow
 *  - bars ≤24px thick, 4px rounded data-end, square at baseline
 *  - hairline solid gridlines, recessive axes
 *  - text wears text colors, never the series color (except inside a fill)
 *  - every chart ships a hover/focus tooltip and (via parent) a table fallback
 *  - status colors are reserved for status, always paired with icon + label
 */

// Sequential blue ramp (validated reference palette)
export const SEQ = ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb']
export const STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#898781',
}

export const fmtIN = n => (n == null ? '—' : n.toLocaleString('en-IN'))

/** Shade picker: rank-based, first entries darkest. */
export const shadeByRank = (i, total) => {
  const steps = [SEQ[0], SEQ[1], SEQ[2], SEQ[3], SEQ[4]]
  const idx = Math.min(steps.length - 1, Math.floor((i / Math.max(1, total)) * steps.length))
  return steps[idx]
}

// ---------------- tooltip ----------------

export function useChartTip() {
  const [tip, setTip] = useState(null) // {x, y, label, value, detail}
  const show = (e, label, value, detail) => {
    const x = e.clientX ?? e.target.getBoundingClientRect().left
    const y = e.clientY ?? e.target.getBoundingClientRect().top
    setTip({ x, y, label, value, detail })
  }
  const hide = () => setTip(null)
  const node = tip ? (
    <div
      className="fixed z-[100] pointer-events-none bg-on-surface text-surface rounded-lg px-3 py-2 text-label-sm max-w-[260px]"
      style={{
        // Sit the tip beside the cursor, and flip it to the other side when it
        // would run off the right edge. It used to be clamped instead, which
        // parked it on top of the neighbouring bars — a tooltip that hides the
        // data it is explaining.
        left: tip.x + 16 + 280 > window.innerWidth ? tip.x - 296 : tip.x + 16,
        // Above the cursor normally; below it near the top of the window, so
        // the tip is never pushed off-screen.
        top: tip.y - 72 < 8 ? tip.y + 20 : tip.y - 72,
        background: '#0b0b0b',
        color: '#fff',
      }}
    >
      <div className="opacity-75">{tip.label}</div>
      <div className="font-bold text-body-md">{tip.value}</div>
      {tip.detail && <div className="opacity-75">{tip.detail}</div>}
    </div>
  ) : null
  return { show, hide, node }
}

// ---------------- horizontal bar chart ----------------

/**
 * rows: [{ label, value, tipDetail?, emphasis? }]  (already sorted by caller)
 * maxValue: axis max (clean number). unit: axis suffix, e.g. "Cr".
 */
export function HBarChart({ rows, maxValue, unit = '', tick = 4, tip, valueFmt = fmtIN }) {
  const LABEL_W = 230
  const PLOT_W = 540
  const ROW_H = 29
  const H = rows.length * ROW_H + 34
  const scale = PLOT_W / maxValue

  return (
    <svg viewBox={`0 0 ${LABEL_W + PLOT_W + 10} ${H}`} width="100%" role="img">
      {Array.from({ length: tick + 1 }, (_, i) => {
        const x = LABEL_W + (PLOT_W / tick) * i
        return (
          <g key={i}>
            {i > 0 && i < tick && (
              <line x1={x} y1={6} x2={x} y2={H - 28} stroke="#e1e0d9" strokeWidth="1" />
            )}
            <text
              x={x} y={H - 10}
              textAnchor={i === 0 ? 'middle' : i === tick ? 'end' : 'middle'}
              className="fill-outline" fontSize="12" style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {valueFmt((maxValue / tick) * i)}{i === tick && unit ? ` ${unit}` : ''}
            </text>
          </g>
        )
      })}
      <line x1={LABEL_W} y1={H - 28} x2={LABEL_W + PLOT_W} y2={H - 28} stroke="#c3c2b7" strokeWidth="1" />

      {rows.map((r, i) => {
        const y = 6 + i * ROW_H
        const w = Math.max(2, r.value * scale)
        const fill = shadeByRank(i, rows.length)
        const label = valueFmt(r.value)
        const inside = w > label.length * 8 + 24
        return (
          <g key={r.label}>
            <text x={LABEL_W - 8} y={y + 14} textAnchor="end" fontSize="12" className="fill-on-surface-variant" fontWeight={r.emphasis ? 700 : 400}>
              {r.label.length > 27 ? r.label.slice(0, 26) + '…' : r.label}
            </text>
            <rect
              x={LABEL_W} y={y - 2} width={PLOT_W + 8} height={ROW_H - 4} fill="transparent"
              tabIndex={0} className="cursor-pointer outline-primary"
              onPointerMove={e => tip.show(e, r.label, label + (unit ? ` ${unit}` : ''), r.tipDetail)}
              onPointerLeave={tip.hide}
              onFocus={e => tip.show(e, r.label, label + (unit ? ` ${unit}` : ''), r.tipDetail)}
              onBlur={tip.hide}
            />
            <rect
              x={LABEL_W} y={y} width={w} height={20} fill={fill} pointerEvents="none"
              style={{ clipPath: 'inset(0 0 0 0 round 0 4px 4px 0)' }}
              stroke={r.emphasis ? '#0b0b0b' : 'none'} strokeWidth={r.emphasis ? 1.5 : 0}
            />
            {inside ? (
              <text x={LABEL_W + w - 8} y={y + 14} textAnchor="end" fontSize="12" fontWeight="600" fill="#fff" pointerEvents="none">{label}</text>
            ) : (
              <text x={LABEL_W + w + 8} y={y + 14} fontSize="12" fontWeight="600" className="fill-on-surface" pointerEvents="none">{label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ---------------- count strip (part-to-whole) ----------------

/** segments: [{ label, count, color, icon, textOnFill }] */
export function CountStrip({ segments, total, tip, tipDetail }) {
  const { t } = useT()
  const W = 740
  const GAP = 2
  let x = 20
  const visible = segments.filter(s => s.count > 0)
  return (
    <>
      <svg viewBox="0 0 780 60" width="100%" role="img">
        {visible.map(s => {
          const w = (s.count / total) * W - GAP
          const seg = (
            <g key={s.label}>
              <rect
                x={x} y={4} width={w + GAP} height={48} fill="transparent" tabIndex={0} className="cursor-pointer"
                onPointerMove={e => tip.show(e, s.label, t('chart.countOfTotal', { count: s.count, total }), tipDetail)}
                onPointerLeave={tip.hide}
                onFocus={e => tip.show(e, s.label, t('chart.countOfTotal', { count: s.count, total }), tipDetail)}
                onBlur={tip.hide}
              />
              <rect x={x} y={10} width={w} height={32} fill={s.color} rx="4" pointerEvents="none" />
              {w > 34 && (
                <text x={x + w / 2} y={30} textAnchor="middle" fontSize="13" fontWeight="600" fill={s.textOnFill || '#fff'} pointerEvents="none">
                  {s.count}
                </text>
              )}
            </g>
          )
          x += w + GAP
          return seg
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-label-sm text-on-surface-variant">
        {segments.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1.5 min-w-0">
            <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.icon && <span aria-hidden="true">{s.icon}</span>} {s.label} ({s.count})
          </span>
        ))}
      </div>
    </>
  )
}

// ---------------- year columns ----------------

/** counts: {year: n}. Renders EVERY year from min to max — empty years included. */
export function YearColumns({ counts, tip, tipDetail }) {
  const { tn } = useT()
  const years = Object.keys(counts).map(Number)
  if (!years.length) return null
  const minYr = Math.min(...years)
  const maxYr = Math.max(...years)
  const all = []
  for (let y = minYr; y <= maxYr; y++) all.push(y)
  const cw = 730 / all.length
  const maxN = Math.max(...Object.values(counts))
  const unitH = Math.min(18, 96 / maxN)

  return (
    <svg viewBox="0 0 780 172" width="100%" role="img">
      <line x1="40" y1="132" x2="770" y2="132" stroke="#c3c2b7" strokeWidth="1" />
      {all.map((yr, i) => {
        const n = counts[yr] || 0
        const h = n * unitH
        const x0 = 40 + i * cw + (cw - 24) / 2
        return (
          <g key={yr}>
            {n > 0 && (
              <>
                <rect
                  x={x0 - 8} y={Math.max(4, 132 - h - 18)} width={40} height={h + 22} fill="transparent" tabIndex={0} className="cursor-pointer"
                  onPointerMove={e => tip.show(e, String(yr), tn('chart.records', n), tipDetail)}
                  onPointerLeave={tip.hide}
                  onFocus={e => tip.show(e, String(yr), tn('chart.records', n), tipDetail)}
                  onBlur={tip.hide}
                />
                <rect x={x0} y={132 - h} width={24} height={h} fill={SEQ[2]} pointerEvents="none" style={{ clipPath: 'inset(0 0 0 0 round 4px 4px 0 0)' }} />
                <text x={x0 + 12} y={Math.max(14, 126 - h)} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-on-surface" pointerEvents="none">{n}</text>
              </>
            )}
            <text x={x0 + 12} y={152} textAnchor="middle" fontSize="12" className="fill-outline" pointerEvents="none">{yr}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------- stat tiles ----------------

export function StatTiles({ tiles }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div key={t.label} className="bg-surface-container-lowest border border-surface-variant rounded-xl px-4 py-3">
          <p className="text-label-sm text-on-surface-variant">{t.label}</p>
          <p className="text-headline-sm font-headline-sm text-on-surface font-bold mt-0.5">{t.value}</p>
          {t.detail && <p className="text-label-sm text-outline mt-0.5">{t.detail}</p>}
        </div>
      ))}
    </div>
  )
}

// ---------------- shared section wrapper ----------------

/**
 * A titled section that opens on click.
 *
 * These pages carry a lot of evidence, and showing all of it at once buries the
 * thing a reader came for. The heading is now the control: the summary line
 * (title + one-line `sub`) always shows, so the page reads as a contents list,
 * and the charts and tables appear when asked for. Nothing is removed — this is
 * purely disclosure.
 *
 * Built on <details>/<summary> rather than a useState toggle, which buys
 * keyboard access, screen-reader semantics and browser find-in-page for free.
 *
 * The one thing this must not break: several of these sections are anchor
 * targets (#spending, #orders) linked from elsewhere on the site. A collapsed
 * section that ignored its own deep link would trade a layout problem for a
 * navigation one, so a matching URL hash forces the section open — on first
 * render and on later hash changes alike.
 */
/**
 * A panel the reader explicitly asked to see should not arrive collapsed.
 *
 * VizSection defaults to closed, which is right for heavy charts sitting in a
 * long page. It is wrong the moment the reader has already clicked "See this
 * as charts" — they then get a second, identical-looking heading and read the
 * result as "I asked for charts and got data". Anything rendered inside a
 * VizOpen provider opens by default instead.
 */
export const VizOpenContext = createContext(false)
export function VizOpen({ children }) {
  return <VizOpenContext.Provider value={true}>{children}</VizOpenContext.Provider>
}

export function VizSection({ id, title, sub, provenance, info, defaultOpen, children }) {
  const targeted = () =>
    typeof window !== 'undefined' && id && window.location.hash === `#${id}`
  const forcedOpen = useContext(VizOpenContext)
  const [open, setOpen] = useState(
    (defaultOpen ?? forcedOpen) || targeted()
  )

  useEffect(() => {
    if (!id) return
    const onHash = () => { if (targeted()) setOpen(true) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [id])

  return (
    <details
      id={id}
      open={open}
      onToggle={e => {
        const now = e.currentTarget.open
        setOpen(now)
        // Only the opening. A close is the same reader finishing with it and
        // would double every count for no extra meaning.
        if (now) track(EVENTS.CHART_EXPANDED, { chart: id || String(title).slice(0, 60) })
      }}
      className="group bg-surface-container-lowest border border-surface-variant rounded-xl scroll-mt-20"
    >
      <summary className="list-none cursor-pointer p-5 flex items-start gap-3 rounded-xl hover:bg-surface-container transition-colors">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-body-lg font-bold text-on-surface inline-flex items-center gap-2">{title}{info}</span>
          {sub && <span className="text-label-md text-on-surface-variant">{sub}</span>}
        </span>
        <span
          aria-hidden="true"
          className="ms-auto shrink-0 mt-1 text-on-surface-variant transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="px-5 pb-5">
        {children}
        {provenance && (
          <p className="text-label-sm text-outline mt-3 pt-2 border-t border-dashed border-surface-variant">{provenance}</p>
        )}
      </div>
    </details>
  )
}


// ---------------- donut (part-to-whole, few slices) ----------------

/**
 * slices: [{ label, value, color? }] — use ≤7 slices; caller groups the tail.
 * Renders donut + side legend with values; hover tooltips via tip.
 */
export function DonutChart({ slices, tip, unit = '', valueFmt = fmtIN, centerLabel }) {
  const { t } = useT()
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null
  const R = 70, r = 42, CX = 90, CY = 90
  let a0 = -Math.PI / 2
  const arcs = slices.map((sl, i) => {
    const frac = sl.value / total
    const a1 = a0 + frac * 2 * Math.PI
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = [
      `M ${CX + R * Math.cos(a0)} ${CY + R * Math.sin(a0)}`,
      `A ${R} ${R} 0 ${large} 1 ${CX + R * Math.cos(a1)} ${CY + R * Math.sin(a1)}`,
      `L ${CX + r * Math.cos(a1)} ${CY + r * Math.sin(a1)}`,
      `A ${r} ${r} 0 ${large} 0 ${CX + r * Math.cos(a0)} ${CY + r * Math.sin(a0)}`,
      'Z',
    ].join(' ')
    const color = sl.color || shadeByRank(i, slices.length)
    a0 = a1
    return { ...sl, path: p, color, pct: (frac * 100).toFixed(1) }
  })
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 180 180" width="170" height="170" role="img" aria-label={t('chart.donutAria')}>
        {arcs.map(a => (
          <path key={a.label} d={a.path} fill={a.color}
            onMouseMove={e => tip.show(e, a.label, `${valueFmt(a.value)}${unit ? ` ${unit}` : ''} · ${a.pct}%`)}
            onMouseLeave={tip.hide}
          />
        ))}
        {centerLabel && (
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-on-surface">{centerLabel}</text>
        )}
      </svg>
      <ul className="flex flex-col gap-1 text-label-sm text-on-surface-variant min-w-[220px]">
        {arcs.map(a => (
          <li key={a.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: a.color }} />
            <span className="truncate max-w-[220px] min-w-0" data-nowrap-en title={a.label}>{a.label}</span>
            <span className="ms-auto tabular-nums text-on-surface">{a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------- aligned multi-line chart ----------------

/**
 * seriesList: [{ label, color, points: [{x, value, note?}] }] — x is a shared
 * ordinal axis (e.g. "year 1..5 of a tenure"). Lines with emphasized endpoints.
 */
export function LineOverlay({ seriesList, xLabels, tip, unit = '', height = 190, valueFmt = fmtIN }) {
  const { t } = useT()
  const [focus, setFocus] = useState(null)   // series label being read
  const [peek, setPeek] = useState(null)     // {label, color, x, value, note}
  const W = 760, H = height, PAD_L = 46, PAD_B = 24
  const allVals = seriesList.flatMap(s => s.points.map(p => p.value))
  const maxV = Math.max(...allVals)
  const mag = Math.pow(10, Math.floor(Math.log10(maxV)))
  const top = Math.ceil(maxV / mag) * mag
  const n = xLabels.length
  const px = i => PAD_L + (i * (W - PAD_L - 10)) / Math.max(1, n - 1)
  const py = v => (H - PAD_B) - (v / top) * (H - PAD_B - 8)
  const dim = sr => focus && focus !== sr.label

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[620px] w-full" role="img" aria-label={t('chart.lineAria')}
        onMouseLeave={() => { setFocus(null); setPeek(null); tip.hide() }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W - 10} y1={py(top * f)} y2={py(top * f)} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
            <text x={PAD_L - 4} y={py(top * f) + 3} textAnchor="end" className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {top >= 10000 ? valueFmt(Math.round((top * f) / 1000) * 1000) : Math.round(top * f)}
            </text>
          </g>
        ))}
        {xLabels.map((xl, i) => (
          <text key={xl} x={px(i)} y={H - 8} textAnchor="middle" className="text-[9px]" fill="currentColor" fillOpacity="0.65">{xl}</text>
        ))}
        {seriesList.map(sr => {
          const pts = sr.points.filter(p => p.value != null)
          if (!pts.length) return null
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x)} ${py(p.value)}`).join(' ')
          const last = pts[pts.length - 1]
          const faded = dim(sr)
          return (
            <g key={sr.label} style={{ transition: 'opacity .15s' }} opacity={faded ? 0.18 : 1}>
              {/* fat invisible hit line so the whole series is easy to grab */}
              <path d={d} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setFocus(sr.label)}
                onMouseMove={e => {
                  const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
                  const vx = ((e.clientX - rect.left) / rect.width) * W
                  let best = pts[0]
                  pts.forEach(p => { if (Math.abs(px(p.x) - vx) < Math.abs(px(best.x) - vx)) best = p })
                  setPeek({ label: sr.label, color: sr.color, x: best.x, value: best.value, note: best.note })
                }}
              />
              <path d={d} fill="none" stroke={sr.color} strokeWidth={focus === sr.label ? 3.5 : 2.5}
                strokeLinejoin="round" pointerEvents="none" />
              {pts.map(p => (
                <circle key={p.x} cx={px(p.x)} cy={py(p.value)} r={p === last ? 4.5 : 3} fill={sr.color}
                  pointerEvents="none" />
              ))}
            </g>
          )
        })}
        {/* the readout, drawn beside the hovered point */}
        {peek && (
          <g pointerEvents="none">
            <line x1={px(peek.x)} x2={px(peek.x)} y1={8} y2={H - PAD_B} stroke={peek.color} strokeOpacity="0.35" strokeDasharray="3 3" />
            <circle cx={px(peek.x)} cy={py(peek.value)} r="6" fill="none" stroke={peek.color} strokeWidth="2.5" />
            <circle cx={px(peek.x)} cy={py(peek.value)} r="3" fill={peek.color} />
            <text x={Math.min(px(peek.x) + 10, W - 120)} y={Math.max(py(peek.value) - 20, 14)}
              className="text-[10px]" fill={peek.color} fontWeight="700">{peek.label}</text>
            <text x={Math.min(px(peek.x) + 10, W - 120)} y={Math.max(py(peek.value) - 8, 26)}
              className="text-[10px]" fill="currentColor" fillOpacity="0.75">{xLabels[peek.x]}</text>
            <text x={Math.min(px(peek.x) + 10, W - 120)} y={Math.max(py(peek.value) + 4, 38)}
              className="text-[11px]" fill="currentColor" fontWeight="700"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {valueFmt(peek.value)}{unit ? ` ${unit}` : ''}
            </text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-label-sm">
        {seriesList.map(sr => (
          <button key={sr.label} type="button"
            onMouseEnter={() => setFocus(sr.label)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(sr.label)}
            onBlur={() => setFocus(null)}
            className={`inline-flex items-center gap-1.5 min-w-0 transition-opacity ${dim(sr) ? 'opacity-40' : 'opacity-100'} ${focus === sr.label ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>
            <span className="w-4 h-1 rounded inline-block" style={{ background: sr.color }} /> {sr.label}
          </button>
        ))}
      </div>
      {peek?.note && <p className="text-label-sm text-on-surface-variant mt-0.5">{peek.note}</p>}
    </div>
  )
}
