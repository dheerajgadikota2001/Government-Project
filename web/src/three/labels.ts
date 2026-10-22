import type * as T from 'three'
import type { Anchor } from './View3D'

// Labels are ordinary HTML laid over a model. Each frame they are moved to the screen position of
// their point in the model. They never sit on each other and never leave the picture: the most
// important are placed first, and a label that would touch an earlier one moves to the nearest free
// row, with a thin line back to its point. Used by the model in its card and in full screen.

export type Place = 'top' | 'bottom' | 'left' | 'right' | 'center'

/** Where a label's box sits relative to its point, in pixels: the same rule as the CSS shift in Pin. */
export function boxAt(place: Place, w: number, h: number): [number, number] {
  switch (place) {
    case 'bottom': return [-w / 2, 6]
    case 'left': return [-w - 8, -h / 2]
    case 'right': return [8, -h / 2]
    case 'center': return [-w / 2, -h / 2]
    default: return [-w / 2, -h - 6]
  }
}

export function createLabelPlacer(THREE: typeof T, box: HTMLElement, getOverlay: () => HTMLElement | null, reduced: boolean) {
  const v = new THREE.Vector3()
  // label sizes are read from the page now and then, not every frame
  const sizes = new Map<HTMLElement, { w: number; h: number }>()
  let sizeAge = 0
  const eased = new Map<HTMLElement, { dx: number; dy: number }>()
  return (anchors: Anchor[] | undefined, camera: T.Camera) => {
    const overlay = getOverlay()
    if (!anchors || !overlay) return
    const W = box.clientWidth, H = box.clientHeight
    const map = new Map(anchors.map((x) => [x.id, x]))
    if (sizeAge-- <= 0) { sizes.clear(); sizeAge = 20 }
    type Item = { el: HTMLElement; x: number; y: number; w: number; h: number; bx: number; by: number; place: Place; fixed: boolean; pr: number; i: number }
    const items: Item[] = []
    Array.from(overlay.querySelectorAll<HTMLElement>('[data-anchor]')).forEach((el, i) => {
      const p = map.get(el.dataset.anchor!)
      if (!p) { el.style.visibility = 'hidden'; return }
      v.set(p.x, p.y, p.z).project(camera)
      if (v.z >= 1) { el.style.visibility = 'hidden'; return }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H
      let sz = sizes.get(el)
      if (!sz) { const c = el.firstElementChild as HTMLElement | null; sz = { w: c?.offsetWidth ?? 0, h: c?.offsetHeight ?? 0 }; sizes.set(el, sz) }
      const place = (el.dataset.place as Place) || 'top'
      const [ox, oy] = boxAt(place, sz.w, sz.h)
      items.push({ el, x, y, w: sz.w, h: sz.h, bx: x + ox, by: y + oy, place, fixed: el.dataset.fixed != null, pr: Number(el.dataset.priority ?? 0), i })
    })
    items.sort((p, q) => q.pr - p.pr || p.i - q.i)
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const hits = (x: number, y: number, w: number, h: number) => placed.some((q) => x < q.x + q.w + 3 && q.x < x + w + 3 && y < q.y + q.h + 2 && q.y < y + h + 2)
    for (const it of items) {
      let dx = 0, dy = 0
      if (it.w && it.bx < 4) dx = 4 - it.bx
      else if (it.w && it.bx + it.w > W - 4) dx = Math.max(4 - it.bx, W - 4 - it.w - it.bx)
      if (!it.fixed && it.w && it.h && hits(it.bx + dx, it.by, it.w, it.h)) {
        // candidate rows: just below or just above every label already placed; nearest first,
        // and a label prefers to move away from its point (down for labels under a point, up for labels over one)
        const dir = it.place === 'top' ? -1 : 1
        const cost = (y: number) => Math.abs(y - it.by) * (Math.sign(y - it.by) === dir ? 1 : 1.7)
        const cands = placed.flatMap((q) => [q.y + q.h + 4, q.y - it.h - 4]).sort((p, q) => cost(p) - cost(q))
        for (const ny of cands) {
          if (ny < 2 || ny + it.h > H - 2) continue
          if (!hits(it.bx + dx, ny, it.w, it.h)) { dy = ny - it.by; break }
        }
      }
      placed.push({ x: it.bx + dx, y: it.by + dy, w: it.w, h: it.h })
      // glide to a new row instead of jumping, unless the reader asked for less motion
      const prev = eased.get(it.el)
      const k = reduced || !prev ? 1 : 0.3
      const ex = prev ? prev.dx + (dx - prev.dx) * k : dx, ey = prev ? prev.dy + (dy - prev.dy) * k : dy
      eased.set(it.el, { dx: ex, dy: ey })
      it.el.style.visibility = 'visible'
      it.el.style.transform = `translate(${(it.x + ex).toFixed(1)}px, ${(it.y + ey).toFixed(1)}px)`
      const lead = it.el.lastElementChild as HTMLElement | null
      if (lead && lead.dataset.leader != null) {
        // from the point in the model to the nearest edge of the label
        const [ox, oy] = boxAt(it.place, it.w, it.h)
        const px = -ex, py = -ey
        const qx = Math.min(Math.max(px, ox), ox + it.w), qy = Math.min(Math.max(py, oy), oy + it.h)
        const len = Math.hypot(qx - px, qy - py)
        if (Math.abs(ey) > 4 && len > 6) {
          lead.style.display = 'block'
          lead.style.width = `${len.toFixed(1)}px`
          lead.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${Math.atan2(qy - py, qx - px).toFixed(3)}rad)`
        } else lead.style.display = 'none'
      }
    }
  }
}
