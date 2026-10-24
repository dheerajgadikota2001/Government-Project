import * as React from 'react'
import * as d3 from 'd3'
import { useThemeTick } from '@/lib/design'
import { readTokens, brighter, darker, col } from './tokens'
import { num, crore, croreTe } from '@/lib/format'
import { useLang } from '@/lib/i18n'

// Polavaram drawn as a real object: the dam wall is built up to the share of
// work the chosen report printed. A report that printed no share leaves the
// wall unbuilt and says so on the drawing.

export type DamReading = { date: string; pct: number | null; spent: number | null; paper: string }

const RM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const T = (ms: number) => (RM ? 0 : ms)

export function Dam({ readings, index, gauge = true, notes = true, className }: {
  readings: DamReading[]; index: number; gauge?: boolean; notes?: boolean; className?: string
}) {
  const ref = React.useRef<SVGSVGElement>(null)
  const api = React.useRef<{ set: (i: number) => void } | null>(null)
  const tick = useThemeTick()
  const { lang } = useLang()
  const te = lang === 'te'
  const [pw, setPw] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    setPw(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((es) => { const w = Math.round(es[0].contentRect.width); if (w) setPw(w) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    const svgEl = ref.current
    if (!svgEl || !pw) return
    const C = readTokens()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z]
    const P = (pts: [number, number, number][]) => 'M' + pts.map((p) => iso(...p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z'
    const L = 520, t = 70, Hm = 210, bankH = 236, Y0 = -150, Y1 = 230, XL = -190, XR = L + 190, base = -46
    const all = ([[XL, Y0, bankH], [XR, Y1, base], [XL, Y1, base], [XR, Y0, bankH], [XL, Y0, base], [XR, Y1, bankH]] as [number, number, number][]).map((p) => iso(...p))
    const minX = d3.min(all, (p) => p[0])! - 20, maxX = d3.max(all, (p) => p[0])! + (gauge ? 250 : 20)
    const minY = d3.min(all, (p) => p[1])! - 70, maxY = d3.max(all, (p) => p[1])! + 16
    svg.attr('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)
    // viewBox units per screen pixel: text is sized in screen pixels, then scaled
    const k = (maxX - minX) / pw
    const px = (n: number) => Math.round(n * k)
    const defs = svg.append('defs')
    const id = 'dam' + Math.random().toString(36).slice(2, 7)
    const lin = (key: string, a: string, b: string, x2 = 0, y2 = 1) => {
      const g = defs.append('linearGradient').attr('id', id + key).attr('x1', 0).attr('y1', 0).attr('x2', x2).attr('y2', y2)
      g.append('stop').attr('offset', 0).attr('stop-color', a)
      g.append('stop').attr('offset', 1).attr('stop-color', b)
      return `url(#${id}${key})`
    }
    const soilF = lin('soil', C.soil, darker(C.soil, 0.7)), topG = lin('top', C.top, darker(C.top, 0.25), 1, 1)
    const rockF = lin('rock', C.rock, darker(C.rock, 0.6)), waterG = lin('water', brighter(C.water, 0.5), C.water, 1, 1)
    const wallF = lin('wallF', brighter(C.concrete, 0.4), darker(C.concrete, 0.25)), wallT = lin('wallT', brighter(C.concrete, 0.9), C.concrete, 1, 0)
    const pat = defs.append('pattern').attr('id', id + 'blk').attr('width', 40).attr('height', 16).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'skewY(30)')
    pat.append('path').attr('d', 'M0,0H40M0,8H40M20,0V8M0,8V16M40,8V16').attr('stroke', darker(C.concrete, 1.4)).attr('stroke-opacity', 0.35).attr('fill', 'none')
    const shadow = defs.append('filter').attr('id', id + 'sh').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '150%')
    shadow.append('feDropShadow').attr('dx', 0).attr('dy', 3).attr('stdDeviation', 3).attr('flood-color', '#000').attr('flood-opacity', C.dark ? 0.5 : 0.18)

    const g = svg.append('g')
    g.append('path').attr('d', P([[XL, Y1, 0], [XR, Y1, 0], [XR, Y1, base], [XL, Y1, base]])).attr('fill', soilF)
    g.append('path').attr('d', P([[XR, Y0, 0], [XR, Y1, 0], [XR, Y1, base], [XR, Y0, base]])).attr('fill', darker(C.soil, 0.7))
    g.append('path').attr('d', P([[0, Y0, 0], [L, Y0, 0], [L, Y1, 0], [0, Y1, 0]])).attr('fill', waterG)
    for (let k = 0; k < 7; k++) {
      const yy = Y0 + 30 + k * 52, xx = 60 + (k % 3) * 140
      if (yy > -6 && yy < t + 6) continue
      g.append('path').attr('d', 'M' + iso(xx, yy, 0).join(',') + 'L' + iso(xx + 70, yy + 8, 0).join(',')).attr('stroke', '#fff').attr('stroke-opacity', 0.5).attr('stroke-width', 2).attr('stroke-linecap', 'round')
    }
    g.append('path').attr('d', P([[XL, Y0, bankH], [0, Y0, bankH], [0, Y1, bankH], [XL, Y1, bankH]])).attr('fill', topG)
    g.append('path').attr('d', P([[0, Y0, bankH], [0, Y1, bankH], [0, Y1, 0], [0, Y0, 0]])).attr('fill', rockF)
    g.append('path').attr('d', P([[XL, Y1, bankH], [0, Y1, bankH], [0, Y1, 0], [XL, Y1, 0]])).attr('fill', darker(C.rock, 0.25))
    const wall = g.append('g')
    g.append('path').attr('fill', 'none').attr('stroke', C.ink2).attr('stroke-width', 2).attr('stroke-dasharray', '7 6')
      .attr('d', P([[0, t, 0], [L, t, 0], [L, t, Hm], [0, t, Hm]]) + P([[0, 0, Hm], [L, 0, Hm], [L, t, Hm], [0, t, Hm]]))
    const cranes = g.append('g')
    g.append('path').attr('d', P([[L, Y0, bankH], [XR, Y0, bankH], [XR, Y1, bankH], [L, Y1, bankH]])).attr('fill', topG)
    g.append('path').attr('d', P([[L, Y1, bankH], [XR, Y1, bankH], [XR, Y1, 0], [L, Y1, 0]])).attr('fill', darker(C.rock, 0.25))
    g.append('path').attr('d', P([[XR, Y0, bankH], [XR, Y1, bankH], [XR, Y1, 0], [XR, Y0, 0]])).attr('fill', rockF)

    const zOf = (pct: number) => (pct / 100) * Hm
    const gBase = iso(L, t, 0)[1], gy = (pct: number) => gBase - zOf(pct), gx = iso(XR, Y1, 0)[0] + 30
    const text = (sel: d3.Selection<SVGTextElement, unknown, null, undefined>, s: number, w: number, fill: string) =>
      sel.style('font-family', C.font).style('font-size', px(s * 0.62) + 'px').style('font-weight', w).style('fill', fill)
        .style('paint-order', 'stroke').style('stroke', C.bg).style('stroke-width', px(3.5) + 'px').style('stroke-linejoin', 'round')

    const ga = svg.append('g')
    const gm = ga.append('path').attr('fill', C.brand)
    const lead = ga.append('path').attr('stroke', C.brand).attr('stroke-dasharray', '2 4').attr('fill', 'none')
    const gl = ga.append('text').attr('text-anchor', 'start')
    text(gl, 24, 800, C.brand)
    if (gauge) {
      ga.append('line').attr('x1', gx).attr('x2', gx).attr('y1', gy(0)).attr('y2', gy(100)).attr('stroke', C.ink2).attr('stroke-width', 2)
      ;(pw < 520 ? [0, 50, 100] : [0, 25, 50, 75, 100]).forEach((v) => {
        ga.append('line').attr('x1', gx - 6).attr('x2', gx).attr('y1', gy(v)).attr('y2', gy(v)).attr('stroke', C.ink2)
        text(ga.append('text').attr('x', gx + 10).attr('y', gy(v) + 7), 21, 600, C.fg).text(v + '%')
      })
    }
    const notesG = svg.append('g')
    if (notes && pw >= 420) {
      // the note sits inside the drawing's top-left corner and points at the outline's corner
      const [cx0, cy0] = iso(0, 0, Hm)
      const tx = minX + px(10), ty = minY + px(22)
      const n = svg.append('g')
      n.append('circle').attr('cx', cx0).attr('cy', cy0).attr('r', px(2.5)).attr('fill', C.ink2)
      n.append('path').attr('d', `M${tx + px(6)},${ty + px(8)}L${tx + px(6)},${cy0}L${cx0},${cy0}`).attr('stroke', C.ink2).attr('stroke-width', px(1)).attr('fill', 'none').attr('stroke-dasharray', `${px(2)} ${px(2)}`)
      text(n.append('text').attr('x', tx).attr('y', ty), 20, 650, C.fg).text(te ? 'గీతల అంచు: ప్రణాళికలోని మొత్తం పని' : pw < 560 ? 'Dashed outline: all the planned work' : 'Dashed outline: the whole planned work')
    }
    let h = 0
    function drawWall(z: number) {
      wall.selectAll('*').remove(); cranes.selectAll('*').remove()
      if (z <= 0) return
      wall.append('path').attr('d', P([[0, t, 0], [L, t, 0], [L, t, z], [0, t, z]])).attr('fill', wallF)
      wall.append('path').attr('d', P([[0, t, 0], [L, t, 0], [L, t, z], [0, t, z]])).attr('fill', `url(#${id}blk)`)
      wall.append('path').attr('d', P([[0, 0, z], [L, 0, z], [L, t, z], [0, t, z]])).attr('fill', wallT)
      wall.append('path').attr('d', 'M' + iso(0, t, z).join(',') + 'L' + iso(L, t, z).join(',')).attr('stroke', C.brand).attr('stroke-width', 3)
      ;([[L * 0.3, 1], [L * 0.72, -1]] as [number, number][]).forEach(([cx, dir]) => {
        const [bx, by] = iso(cx, t / 2, z)
        const c = cranes.append('g').attr('transform', `translate(${bx},${by})`)
        c.append('rect').attr('x', -2.5).attr('y', -78).attr('width', 5).attr('height', 78).attr('fill', C.ink2)
        c.append('path').attr('d', `M${-28 * dir},-78 H${84 * dir}`).attr('stroke', C.ink2).attr('stroke-width', 3.5)
        c.append('path').attr('d', `M0,-92 L${-28 * dir},-78 M0,-92 L${84 * dir},-78`).attr('stroke', C.ink2).attr('stroke-width', 1.4)
        c.append('line').attr('x1', 58 * dir).attr('x2', 58 * dir).attr('y1', -78).attr('y2', -40).attr('stroke', C.ink2)
        c.append('rect').attr('x', 58 * dir - 8).attr('y', -40).attr('width', 16).attr('height', 9).attr('rx', 1.5).attr('fill', C.brand)
      })
    }
    function set(i: number) {
      const r = readings[Math.max(0, Math.min(readings.length - 1, i))]
      const pct = r.pct, to = pct == null ? 0 : zOf(pct), from = h
      wall.interrupt()
      if (RM) { h = to; drawWall(to) }
      else wall.transition().duration(T(900)).ease(d3.easeCubicOut).tween('h', () => (k: number) => { h = from + (to - from) * k; drawWall(h) })
      const y = gy(pct ?? 0), [ex, ey] = iso(L, t, to)
      const show = pct != null && gauge ? 1 : 0
      gm.transition().duration(T(900)).attr('d', `M${gx - 8},${y} l-14,-9 v18 z`).style('opacity', show)
      lead.transition().duration(T(900)).attr('d', `M${ex},${ey}H${gx - 22}`).style('opacity', show)
      gl.transition().duration(T(900)).attr('x', gx + px(44)).attr('y', y + px(5)).style('opacity', show)
      gl.text(pct == null ? '' : num(pct) + (te ? '% పూర్తి' : '% done'))
      notesG.selectAll('*').remove()
      if (notes && pct == null) {
        const [bx, by] = iso(L * 0.3, t, 0)
        // The note sits to the left of the wall. On a narrow screen there is no room, and the text ran off the edge
        // and printed over itself. The caption under the drawing already says the same in words, so the note is
        // left out when it does not fit.
        const one = te ? 'ఈ నివేదిక పని శాతం ముద్రించలేదు' : 'This report printed no share of work done'
        const two = te ? 'ముద్రించిన ఖర్చు: ' + croreTe(r.spent) : 'It printed money spent: ' + crore(r.spent)
        const need = Math.max(one.length * 12.4, two.length * 11.8) * (te ? 0.85 : 0.6) + 16
        const room = (bx - 66 - minX) / k
        if (room < need) return
        notesG.append('circle').attr('cx', bx).attr('cy', by).attr('r', 3).attr('fill', C.ink2)
        notesG.append('path').attr('d', `M${bx},${by}L${bx - 30},${by + 70}L${bx - 60},${by + 70}`).attr('stroke', C.ink2).attr('fill', 'none')
        text(notesG.append('text').attr('x', bx - 66).attr('y', by + 66).attr('text-anchor', 'end'), 20, 700, C.fg).text(te ? 'ఈ నివేదిక పని శాతం ముద్రించలేదు' : 'This report printed no share of work done')
        text(notesG.append('text').attr('x', bx - 66).attr('y', by + 90).attr('text-anchor', 'end'), 19, 400, C.muted).text(te ? 'ముద్రించిన ఖర్చు: ' + croreTe(r.spent) : 'It printed money spent: ' + crore(r.spent))
      }
    }
    api.current = { set }
    h = 0
    set(index)
    void col
  }, [tick, readings, gauge, notes, pw, te]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { api.current?.set(index) }, [index])

  return <svg ref={ref} className={className} width="100%" role="img" aria-label={te ? 'ఎంచుకున్న నివేదిక ముద్రించిన పని శాతం వరకు కట్టిన పోలవరం డ్యామ్ గోడ బొమ్మ' : 'A drawing of the Polavaram dam wall built up to the share of work printed in the chosen report'} style={{ display: 'block', overflow: 'visible' }} />
}
