import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, mesh, rbox, plinth } from '../kit'
import { fitBox } from './common'
import { shadowFloor } from '../core'

// Money as stacks of bundles, every stack on one scale.
// Solid paper bundles are figures from accounts; glass bundles are estimates or claims, the
// 3D form of the site's hollow marks. A near-flat camera keeps heights comparable by eye,
// and a ruler behind the stacks gives the exact scale.

export type MoneyBar = {
  id: string
  value: number                      // ₹ crore
  kind: 'actual' | 'estimate' | 'claim'
  /** Parts the paper itself prints, bottom first. A part with value null takes the rest of the stack, unlabelled. */
  parts?: { label: string; value: number | null }[]
}
export type MoneyParams = {
  bars: MoneyBar[]
  /** Gaps marked between bars, by index: a government change, marked by date only. */
  marks?: { after: number; id: string }[]
  ticks: number[]                    // ₹ crore, where the ruler draws a line
  max?: number                       // ₹ crore at the top of the ruler
  gap?: number                       // space between stacks
  wide?: boolean                     // fewer, fatter stacks (the claim view)
  highlight?: string | null
  /** Which end of the ruler carries its labels. */
  /** Leave room on the right for part labels. */
  labelRoom?: boolean
  rulerSide?: 'left' | 'right'
  onPick?: (id: string | null) => void
  compact?: boolean
  /** A phone-width picture: the stacks face the reader more, so their labels have room. */
  narrow?: boolean
}

const PAPER = new THREE.Color('#F4F2EE')

const build: Builder<MoneyParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 14
  stage.camera.updateProjectionMatrix()

  const n = params.bars.length
  const bw = params.wide ? 1.5 : 0.82, bd = params.wide ? 1.0 : 0.62
  const gap = params.gap ?? (params.wide ? 1.1 : 0.34)
  const max = params.max ?? Math.max(...params.bars.map((b) => b.value), ...params.ticks)
  const H = params.wide ? 4.2 : 3.6                      // height of `max` in model units
  const scale = H / max
  const pitch = bw + gap
  const W = n * pitch - gap
  const x0 = -W / 2 + bw / 2
  // one bundle stands for this many crore; chosen so the tallest stack has about 24 bundles
  const per = niceStep(max / 24)
  const bundleH = per * scale

  const base = plinth(W + 1.6, bd + 2.0, M, 0.42)
  root.add(base)
  const floor = shadowFloor(60, P.dark ? 0.35 : 0.14); floor.position.y = -0.42; root.add(floor)

  // the ruler: a pale board behind the stacks with a line at each tick
  const boardH = H + 0.35
  const board = mesh(new THREE.BoxGeometry(W + 1.2, boardH, 0.04), new THREE.MeshStandardMaterial({ color: P.dark ? new THREE.Color('#3B3C42') : new THREE.Color('#F7F6F3'), roughness: 0.9 }), false, true)
  board.position.set(0, boardH / 2, -bd / 2 - 0.55)
  root.add(board)
  const tickMat = new THREE.MeshBasicMaterial({ color: P.dark ? new THREE.Color('#8D8E96') : new THREE.Color('#B9B6AF') })
  for (const t of params.ticks) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(W + 1.1, 0.012, 0.01), tickMat)
    line.position.set(0, t * scale, -bd / 2 - 0.52)
    root.add(line)
  }

  // bundle geometry shared by every stack: a paper block and a band around it
  const bGeo = rbox(bw, bundleH * 0.9, bd, Math.min(0.05, bundleH * 0.3), 2)
  const bandGeo = new THREE.BoxGeometry(bw * 0.2, bundleH * 0.92, bd + 0.012)
  const paperMat = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.78 })
  const bandMat = new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.5 })
  const glassMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#E9EEF2'), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false })
  const claimGlass = glassMat.clone(); claimGlass.color = P.accent2.clone().lerp(new THREE.Color('#FFFFFF'), 0.72); claimGlass.opacity = 0.42
  const claimBand = new THREE.MeshStandardMaterial({ color: P.accent2, roughness: 0.5, transparent: true, opacity: 0.85 })
  const estBand = new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.5, transparent: true, opacity: 0.32, depthWrite: false })
  const edgeMat = (c: THREE.Color) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.55 })

  type Stack = { id: string; group: THREE.Group; bundles: THREE.Object3D[]; top: number; x: number; parts: { mid: number; label: string }[] }
  const stacks: Stack[] = params.bars.map((b, i) => {
    const g = new THREE.Group()
    const x = x0 + i * pitch
    g.position.x = x
    root.add(g)
    const total = b.value * scale
    const bundles: THREE.Object3D[] = []
    const glass = b.kind !== 'actual'
    const body = glass ? (b.kind === 'claim' ? claimGlass : glassMat) : paperMat
    const band = b.kind === 'claim' ? claimBand : b.kind === 'estimate' ? estBand : bandMat
    const edges = edgeMat(b.kind === 'claim' ? P.accent2 : P.ghost)
    // parts: where each printed part ends, so a small gap marks the boundary
    const bounds: { from: number; to: number; label: string }[] = []
    if (b.parts?.length) {
      let acc = 0
      for (const p of b.parts) {
        const from = acc
        const to = p.value == null ? b.value : Math.min(b.value, acc + p.value)
        bounds.push({ from: from * scale, to: to * scale, label: p.label })
        acc = to
      }
    }
    let y = 0, k = 0
    while (y < total - 1e-6) {
      const h = Math.min(bundleH, total - y)
      const unit = new THREE.Group()
      const blk = new THREE.Mesh(bGeo, body); blk.castShadow = !glass; blk.receiveShadow = true
      const bnd = new THREE.Mesh(bandGeo, band); bnd.castShadow = false
      unit.add(blk, bnd)
      if (glass) unit.add(new THREE.LineSegments(new THREE.EdgesGeometry(bGeo, 30), edges))
      unit.scale.y = h / bundleH
      unit.position.y = y + h / 2
      // tiny, seeded misalignment so the stack looks hand-stacked rather than extruded
      unit.position.x = (Math.sin(k * 12.9898 + i) * 0.5) * 0.025
      unit.rotation.y = (Math.sin(k * 78.233 + i * 3) * 0.5) * 0.04
      unit.userData = { target: unit.position.y, delay: k * 0.035 + i * 0.05 }
      g.add(unit)
      bundles.push(unit)
      y += h; k++
    }
    // part boundaries: a thin dark plate where one printed part ends and the next begins
    for (const bd2 of bounds.slice(0, -1)) {
      const plate = mesh(new THREE.BoxGeometry(bw + 0.08, 0.02, bd + 0.08), M.ink, false, false)
      plate.position.y = bd2.to
      g.add(plate)
    }
    return { id: b.id, group: g, bundles, top: total, x, parts: bounds.map((p) => ({ mid: (p.from + p.to) / 2, label: p.label })) }
  })

  // government changes: a fine line drawn on the ruler board between two years, marked by date only
  const markMat = new THREE.MeshBasicMaterial({ color: P.dark ? new THREE.Color('#9A9BA3') : new THREE.Color('#77757A') })
  for (const m of params.marks ?? []) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.014, H + 0.2, 0.01), markMat)
    line.position.set(x0 + m.after * pitch + pitch / 2, (H + 0.2) / 2, -bd / 2 - 0.5)
    root.add(line)
  }

  // highlight: lift the chosen stack a little and dim the others
  let picked: string | null = params.highlight ?? null
  const applyHighlight = () => {
    stacks.forEach((s) => {
      const on = !picked || s.id === picked
      s.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && 'opacity' in m && !(o as THREE.LineSegments).isLineSegments) { /* shared materials: dim by scale only */ }
      })
      s.group.position.z = picked && s.id === picked ? 0.12 : 0
      s.group.scale.setScalar(on ? 1 : 0.985)
    })
  }
  applyHighlight()

  const ray = new THREE.Raycaster()
  const center = new THREE.Vector3(params.labelRoom ? 0.9 : params.narrow ? -0.25 : 0, H * 0.46, 0)
  // Nearly straight on: heights read like a bar chart, with just enough angle to show the bundles are stacks.
  const az = -0.06, el = 0.2
  const roomX = params.labelRoom ? 4.2 : params.narrow ? 1.8 : 2.2

  return {
    frame: (t) => {
      fitBox(stage, center, W + roomX, H + 1.4, bd + 1.6, az + Math.sin((t / 26) * Math.PI * 2) * 0.015, el, params.compact ? 1.04 : 1.08)
      // bundles fall into place once, the first time the model is seen
      for (const s of stacks) for (const u of s.bundles) {
        const { target, delay } = u.userData as { target: number; delay: number }
        const p = Math.min(1, Math.max(0, (t - delay) / 0.45))
        const e = t === 0 ? 1 : 1 - Math.pow(1 - p, 3)
        u.position.y = target + (1 - e) * 2.2
        u.visible = e > 0.001
      }
    },
    anchors: () => {
      const out = stacks.flatMap((s) => [
        { id: `top-${s.id}`, x: s.x, y: s.top + 0.12, z: 0 },
        { id: `base-${s.id}`, x: s.x, y: -0.45, z: bd / 2 + 1.0 },
        ...s.parts.map((p, i) => ({ id: `part-${s.id}-${i}`, x: s.x + bw / 2 + 0.12, y: p.mid, z: bd / 2 })),
      ])
      const rx = (params.rulerSide ?? 'left') === 'left' ? -W / 2 - 0.5 : W / 2 + 0.5
      for (const t of params.ticks) out.push({ id: `tick-${t}`, x: rx, y: t * scale, z: -bd / 2 - 0.5 })
      for (const m of params.marks ?? []) out.push({ id: `mark-${m.id}`, x: x0 + m.after * pitch + pitch / 2, y: H + 0.32, z: 0 })
      return out
    },
    pick: (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x, y), stage.camera)
      const hit = ray.intersectObjects(stacks.map((s) => s.group), true)[0]
      const s = hit ? stacks.find((st) => st.group === hit.object.parent?.parent || st.group === hit.object.parent) : null
      picked = s && s.id !== picked ? s.id : null
      applyHighlight()
      params.onPick?.(picked)
    },
    update: (p) => {
      const np = p as MoneyParams
      if (np.highlight !== undefined && np.highlight !== picked) { picked = np.highlight; applyHighlight() }
    },
  }
}

function niceStep(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / p
  return (f < 1.5 ? 1 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p
}

export default build
