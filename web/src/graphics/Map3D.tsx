import * as React from 'react'
import { drawnDistricts as districts, mapViewBox } from '@/lib/data'
import { worksIn } from '@/lib/data-projects'
import { useThemeTick } from '@/lib/design'
import { useLang } from '@/lib/i18n'
import { readTokens, brighter, darker, mix } from './tokens'
import { textWidth } from './util'

// The districts as a raised relief, on the lines drawn in April 2022. It is a picker: it is
// never shaded by the number of records, because the largest works name no district.
// Markapuram and Polavaram (1 January 2026) have no lines yet; DistrictPickerMap names them
// beside the map, and Prakasam and Alluri Sitharama Raju here still include them.

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number }
function bbox(d: string): Box {
  const nums = d.replace(/[MZ]/g, ' ').trim().split(/[\s,]+/).map(Number)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1]
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
const BOXES = new Map(districts.map((d) => [d.name, bbox(d.shape)]))
const SHORT = (n: string) => n.replace('Dr. B.R. Ambedkar ', '').replace('Sri Potti Sriramulu ', 'SPS ').replace('Alluri Sitharama Raju', 'ASR').replace('Parvathipuram ', '')

// Hand-placed nudges for a few labels that sit on narrow districts
const NUDGE: Record<string, [number, number]> = { NTR: [6, -2], Krishna: [-4, 8], Bapatla: [8, 6], Guntur: [-6, -2], 'East Godavari': [-6, 4], Kakinada: [10, -6], 'Dr. B.R. Ambedkar Konaseema': [8, 10], 'West Godavari': [-10, 10] }

export function Map3D({ selected, onPick, highlight, labels = true, height, className, compact, hover: hoverFromList }: {
  selected?: string | null; onPick?: (name: string) => void; highlight?: Record<string, string>
  labels?: boolean; height?: number; className?: string; compact?: boolean
  /** A district pointed at somewhere else on the page (the list beside the map) lifts here too. */
  hover?: string | null
}) {
  const tick = useThemeTick()
  const { lang } = useLang()
  const C = React.useMemo(() => readTokens(), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const [hoverHere, setHover] = React.useState<string | null>(null)
  const hover = hoverHere ?? hoverFromList ?? null
  const uid = React.useId().replace(/:/g, '')
  const layers = compact ? [12, 8, 4] : [24, 20, 16, 12, 8, 4]
  const counts = React.useMemo(() => new Map(districts.map((d) => [d.name, worksIn(d.name).length])), [])
  const hov = hover ? districts.find((d) => d.name === hover) : null
  // Names never print on top of each other: the largest districts are named first, and a name that
  // would touch one already placed moves a little, to the nearest free spot inside the map.
  const spots = React.useMemo(() => {
    const fs = compact ? 19 : 16
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = []
    const out = new Map<string, { x: number; y: number }>()
    const area = (n: string) => { const b = BOXES.get(n)!; return b.w * b.h }
    for (const d of [...districts].sort((a, b) => area(b.name) - area(a.name))) {
      const b = BOXES.get(d.name)!
      const [nx, ny] = NUDGE[d.name] ?? [0, 0]
      const tw = textWidth(lang === 'te' ? d.te : SHORT(d.name), fs, 650) + 4
      const bx = b.cx + nx, by = b.cy + ny + 5, step = fs + 2
      const tries: [number, number][] = [[0, 0], [0, step], [0, -step], [tw * 0.35, 0], [-tw * 0.35, 0], [tw * 0.3, step], [-tw * 0.3, step], [tw * 0.3, -step], [-tw * 0.3, -step], [0, 2 * step], [0, -2 * step]]
      let spot = { x: bx, y: by }
      for (const [dx, dy] of tries) {
        const x0 = bx + dx - tw / 2, x1 = x0 + tw, y0 = by + dy - fs * 0.82, y1 = by + dy + fs * 0.24
        if (boxes.some((q) => x0 < q.x1 && q.x0 < x1 && y0 < q.y1 && q.y0 < y1)) continue
        spot = { x: bx + dx, y: by + dy }
        boxes.push({ x0, x1, y0, y1 })
        break
      }
      out.set(d.name, spot)
    }
    return out
  }, [lang, compact, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={className} style={{ position: 'relative' }}>
      <svg viewBox={mapViewBox} width="100%" height={height} role="group" aria-label="Map of the districts on the lines of 2022. Press a district to open it." style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${uid}land`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.land} /><stop offset="1" stopColor={C.land2} /></linearGradient>
          <linearGradient id={`${uid}sel`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={brighter(C.brand, 0.5)} /><stop offset="1" stopColor={darker(C.brand, 0.35)} /></linearGradient>
          <radialGradient id={`${uid}sea`} cx="70%" cy="70%" r="80%"><stop offset="0" stopColor={C.sea1} /><stop offset="1" stopColor={C.sea2} stopOpacity="0" /></radialGradient>
          <filter id={`${uid}blur`}><feGaussianBlur stdDeviation="12" /></filter>
          <filter id={`${uid}soft`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity={C.dark ? 0.55 : 0.22} /></filter>
        </defs>
        <text x="760" y="600" fill={C.muted} style={{ fontSize: 15, letterSpacing: lang === 'te' ? '0.04em' : '0.22em', fontStyle: lang === 'te' ? 'normal' : 'italic', fontFamily: C.font }}>{lang === 'te' ? 'బంగాళాఖాతం' : 'BAY OF BENGAL'}</text>
        <g transform="translate(10,26)" filter={`url(#${uid}blur)`} opacity={C.dark ? 0.8 : 0.3}>
          {districts.map((d) => <path key={d.name} d={d.shape} fill="#000" />)}
        </g>
        {layers.map((k) => (
          <g key={k} transform={`translate(0,${k})`}>
            {districts.map((d) => <path key={d.name} d={d.shape} fill={mix(C.side, darker(C.side, 1.2), k / 24)} />)}
          </g>
        ))}
        <g>
          {districts.map((d) => {
            const isSel = d.name === selected
            const lift = isSel ? -14 : hover === d.name ? -6 : 0
            const hl = highlight?.[d.name]
            return (
              <path key={d.name} d={d.shape}
                fill={isSel ? `url(#${uid}sel)` : hl ?? `url(#${uid}land)`}
                stroke={C.stroke} strokeWidth={1.4}
                filter={isSel ? `url(#${uid}soft)` : undefined}
                style={{ transform: `translateY(${lift}px)`, transition: 'transform .35s cubic-bezier(.3,.7,.2,1)', cursor: onPick ? 'pointer' : 'default', outline: 'none' }}
                role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} aria-label={d.name}
                onPointerEnter={() => setHover(d.name)} onPointerLeave={() => setHover((h) => (h === d.name ? null : h))}
                onFocus={() => setHover(d.name)} onBlur={() => setHover(null)}
                onClick={() => onPick?.(d.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(d.name) } }}
              />
            )
          })}
        </g>
        {labels ? (
          <g style={{ pointerEvents: 'none' }}>
            {districts.map((d) => {
              const sp = spots.get(d.name)!
              const isSel = d.name === selected
              const lift = isSel ? -14 : hover === d.name ? -6 : 0
              const txt = lang === 'te' ? d.te : SHORT(d.name)
              return (
                <text key={d.name} x={sp.x} y={sp.y + lift} textAnchor="middle" lang={lang === 'te' ? 'te' : undefined}
                  style={{ fontFamily: C.font, fontSize: compact ? 19 : 16, fontWeight: 650, paintOrder: 'stroke', strokeLinejoin: 'round', transition: 'transform .35s' }}
                  fill={isSel ? '#fff' : C.ink2} stroke={isSel ? 'rgba(0,0,0,.35)' : C.land} strokeWidth={3}>
                  {txt}
                </text>
              )
            })}
          </g>
        ) : null}
        {selected && BOXES.get(selected) ? (() => {
          const b = BOXES.get(selected)!
          return (
            <g transform={`translate(${b.cx},${b.cy - 32})`} style={{ pointerEvents: 'none' }}>
              <path d="M0,0 C-14,-20 -18,-30 -18,-40 A18,18 0 1 1 18,-40 C18,-30 14,-20 0,0Z" fill={C.fg} stroke={C.bg} strokeWidth={2.5} filter={`url(#${uid}soft)`} />
              <circle cy={-40} r={6.5} fill={C.bg} />
            </g>
          )
        })() : null}
      </svg>
      {hov && !compact ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[260px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-[13px] shadow-lg backdrop-blur">
          <div className="font-semibold">{hov.name} <span lang="te" className="font-normal text-muted-foreground">{hov.te}</span></div>
          <div className="text-muted-foreground">{counts.get(hov.name) ? `${counts.get(hov.name)} project records name this district.` : 'No project record names this district yet.'}</div>
        </div>
      ) : null}
    </div>
  )
}
