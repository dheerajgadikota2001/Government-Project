import * as React from 'react'
import { useThemeTick } from '@/lib/design'
import { readTokens } from './tokens'

/** Width of a container, so charts redraw for phones and desktops alike. */
export function useWidth<T extends HTMLElement>(initial = 720) {
  const ref = React.useRef<T>(null)
  const [w, setW] = React.useState(initial)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.getBoundingClientRect().width || initial)
    const ro = new ResizeObserver((es) => {
      const nw = Math.round(es[0].contentRect.width)
      if (nw > 0) setW(nw)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, w] as const
}

export function useTokens() {
  const tick = useThemeTick()
  return React.useMemo(() => readTokens(), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** A label with a halo, so it stays readable over grid lines and marks. */
export function Halo({ x, y, children, anchor = 'start', size = 13, weight = 500, fill, halo, className, dy }: {
  x: number; y: number; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number
  fill?: string; halo?: string; className?: string; dy?: number
}) {
  const C = useTokens()
  return (
    <text x={x} y={y} dy={dy} textAnchor={anchor} className={className}
      style={{ fontSize: size, fontWeight: weight, paintOrder: 'stroke', strokeLinejoin: 'round', fontFamily: 'inherit' }}
      fill={fill ?? C.fg} stroke={halo ?? C.bg} strokeWidth={4}>
      {children}
    </text>
  )
}

/** Greedy vertical de-overlap for end labels. */
export function spread(ys: number[], gap: number, min = -Infinity, max = Infinity): number[] {
  const idx = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array(ys.length).fill(0)
  let last = min - gap
  for (const [y, i] of idx) { const v = Math.max(y, last + gap); out[i] = v; last = v }
  const over = last - max
  if (over > 0) for (let k = 0; k < out.length; k++) out[k] -= over
  return out
}

export const RM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Rough width of a label in the page's own font, so labels can be given room before drawing. */
let measureCtx: CanvasRenderingContext2D | null = null
export function textWidth(text: string, size: number, weight = 500): number {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`
      return measureCtx.measureText(text).width
    }
  } catch { /* no canvas: fall back to an estimate */ }
  return text.length * size * 0.56
}
