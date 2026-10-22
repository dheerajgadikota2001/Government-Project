import * as d3 from 'd3'

// Graphics read their colours from the same CSS tokens as the page, so a theme
// switch repaints maps and charts with the rest of the site.
export type Tok = ReturnType<typeof readTokens>

export function readTokens(el: Element = document.documentElement) {
  const cs = getComputedStyle(el)
  const g = (k: string, f: string) => cs.getPropertyValue(k).trim() || f
  const fg = g('--foreground', '#111114')
  const bg = g('--card', '#FFFFFF')
  const dark = document.documentElement.classList.contains('dark')
  return {
    dark, fg, bg,
    page: g('--background', '#FAFAF9'),
    muted: g('--muted-foreground', '#5F5F69'),
    ink2: g('--ink2', '#3F3F48'),
    grid: g('--grid', '#E6E4DE'),
    border: g('--border', '#E4E3DE'),
    brand: g('--brand', '#2453D6'),
    c1: g('--chart-1', '#2563EB'), c2: g('--chart-2', '#D2457F'), c3: g('--chart-3', '#A0522D'),
    c4: g('--chart-4', '#6B6B76'), c5: g('--chart-5', '#B9BAC4'),
    land: g('--k-land', dark ? '#2B2E3C' : '#FBF9F4'), land2: g('--k-land2', dark ? '#232532' : '#E9E3D6'),
    side: g('--k-side', dark ? '#0B0C12' : '#BDB4A1'), sea1: g('--k-sea1', dark ? '#132036' : '#E3ECF5'), sea2: g('--k-sea2', dark ? '#0A1322' : '#CFDCEA'),
    stroke: g('--k-mapstroke', dark ? '#3A3E50' : '#FFFFFF'), concrete: g('--k-concrete', dark ? '#8B8780' : '#CFCBC2'),
    water: g('--k-water', dark ? '#2D6E9C' : '#7FB3D5'), soil: g('--k-soil', dark ? '#3B3226' : '#B59C7A'),
    rock: g('--k-rock', dark ? '#4A4D5A' : '#C9BC9C'), top: g('--k-top', dark ? '#3A3D49' : '#E4DCC6'),
    font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
  }
}

/** Any CSS colour (including oklch) as a d3 colour: paint one pixel and read it back. */
const probe = typeof document !== 'undefined' ? (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d', { willReadFrequently: true }) })() : null
const cache = new Map<string, d3.RGBColor>()
export function col(c: string): d3.RGBColor {
  const hit = cache.get(c)
  if (hit) return hit.copy() as d3.RGBColor
  const direct = d3.color(c)
  let out: d3.RGBColor
  if (direct) out = direct.rgb()
  else if (probe) {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = '#888'
    probe.fillStyle = c
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
    out = d3.rgb(r, g, b)
  } else out = d3.rgb(136, 136, 136)
  cache.set(c, out)
  return out.copy() as d3.RGBColor
}
export const brighter = (c: string, k: number) => col(c).brighter(k).formatHex()
export const darker = (c: string, k: number) => col(c).darker(k).formatHex()
export const mix = (a: string, b: string, t: number) => d3.interpolateRgb(col(a), col(b))(t)
