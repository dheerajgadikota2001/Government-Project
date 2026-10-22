import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, plinth, rbox } from '../kit'
import { fitBox } from './common'
import { shadowFloor } from '../core'

// States as a skyline: one tower per state, its height the value the Reserve Bank prints,
// sorted from the highest. Andhra Pradesh stands in the accent colour. No rank is printed:
// the order is only the sort, and the reader taps a tower to read its value.
// Choosing another year does not rebuild the model: every tower glides to its new height and place,
// so the reader sees Andhra Pradesh move among the states.

export type SkyRow = { state: string; v: number }
export type SkyParams = { rows: SkyRow[]; highlight: string; onPick?: (state: string | null) => void; selected?: string | null }

const H = 3.2, PITCH = 0.42, TW = 0.32

const build: Builder<SkyParams> = (stage, first) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 20
  let params = first

  const clay = new THREE.MeshStandardMaterial({ color: P.clay, roughness: 0.7 })
  const hi = new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.45, emissive: P.accent, emissiveIntensity: 0.12 })
  const sel = new THREE.MeshStandardMaterial({ color: P.clay.clone().lerp(P.accent2, 0.35), roughness: 0.6 })
  // One unit-tall box, scaled to height: the same tower can grow or shrink smoothly.
  const geo = rbox(TW, 1, TW, 0.03, 2)

  type Tower = { mesh: THREE.Mesh; x: number; h: number; tx: number; th: number; x0: number; h0: number }
  const towers = new Map<string, Tower>()
  let W = 1, n = 1
  let plinthMesh: THREE.Object3D | null = null
  let since = 0 // time the current targets were set
  let clock = 0

  const layout = (rows: SkyRow[], instant: boolean) => {
    const live = rows.filter((r) => r.v != null && Number.isFinite(r.v))
    const sorted = [...live].sort((a, b) => b.v - a.v)
    const max = Math.max(1e-9, ...sorted.map((r) => r.v))
    const count = Math.max(sorted.length, n)
    if (!plinthMesh || count !== n) {
      n = count
      W = n * PITCH
      if (plinthMesh) root.remove(plinthMesh)
      plinthMesh = plinth(W + 0.8, 1.6, M, 0.35)
      root.add(plinthMesh)
    }
    const x0 = -W / 2 + PITCH / 2
    const seen = new Set<string>()
    sorted.forEach((r, i) => {
      seen.add(r.state)
      let t = towers.get(r.state)
      const tx = x0 + i * PITCH, th = Math.max(0.03, (r.v / max) * H)
      if (!t) {
        const mesh = new THREE.Mesh(geo, clay)
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.userData = { state: r.state }
        root.add(mesh)
        t = { mesh, x: tx, h: instant ? th : 0.001, tx, th, x0: tx, h0: instant ? th : 0.001 }
        towers.set(r.state, t)
      }
      t.x0 = t.x; t.h0 = t.h; t.tx = tx; t.th = th
      t.mesh.visible = true
    })
    // a state with no value printed for this year sinks into the stand
    towers.forEach((t, k) => { if (!seen.has(k)) { t.x0 = t.x; t.h0 = t.h; t.th = 0.001 } })
    since = clock
  }

  let selected = params.selected ?? null
  const paint = () => towers.forEach((t) => { const s = t.mesh.userData.state; t.mesh.material = s === params.highlight ? hi : s === selected ? sel : clay })
  layout(params.rows, false)
  paint()
  const floor = shadowFloor(60, P.dark ? 0.35 : 0.14); floor.position.y = -0.35; root.add(floor)

  const ray = new THREE.Raycaster()
  const center = new THREE.Vector3(0, H * 0.42, 0)
  const apply = () => towers.forEach((t) => {
    t.mesh.scale.y = Math.max(0.001, t.h)
    t.mesh.position.set(t.x, t.h / 2, 0)
    t.mesh.visible = t.h > 0.002
  })
  apply()
  let lastKey = params.rows.map((r) => r.state + ':' + r.v).join('|')
  return {
    frame: (t) => {
      clock = t
      fitBox(stage, center, W + 0.9, H + 0.7, 1.6, -0.3 + Math.sin((t / 30) * Math.PI * 2) * 0.05, 0.24, 1.04)
      // towers rise the first time they are seen, and glide when the year changes
      let i = 0
      towers.forEach((tw) => {
        const p = t === 0 ? 1 : Math.min(1, Math.max(0, (t - since - i * 0.012) / 0.7))
        const e = 1 - Math.pow(1 - p, 3)
        tw.x = tw.x0 + (tw.tx - tw.x0) * e
        tw.h = tw.h0 + (tw.th - tw.h0) * e
        i++
      })
      apply()
    },
    anchors: () => [...towers.values()].filter((t) => t.th > 0.002).map((t) => ({ id: `top-${t.mesh.userData.state}`, x: t.x, y: t.h + 0.06, z: 0 })),
    pick: (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x, y), stage.camera)
      const hit = ray.intersectObjects([...towers.values()].map((t) => t.mesh), false)[0]
      selected = hit ? (hit.object.userData.state as string) : null
      paint()
      params.onPick?.(selected)
    },
    update: (next) => {
      const p = next as SkyParams
      const key = p.rows.map((r) => r.state + ':' + r.v).join('|')
      params = p
      if (key !== lastKey) { lastKey = key; layout(p.rows, false) }
      if (p.selected !== undefined && p.selected !== selected) selected = p.selected
      paint()
    },
    dispose: () => { geo.dispose() },
  }
}

export default build
