import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, plinth } from '../kit'
import { fitBox } from './common'
import { shadowFloor } from '../core'

// Planned and spent, as glasses. Each year is one glass: its height is the plan made before the
// year (the budget estimate), the liquid in it is what was spent (from the accounts), and a dashed
// ring marks the plan as changed during the year (the revised estimate). All glasses share one
// scale. A year with no spending figure read yet stands empty, and says so.

export type GlassYear = { id: string; BE?: number; RE?: number; A?: number }
export type GlassParams = { years: GlassYear[]; compact?: boolean; onPick?: (id: string | null) => void }

const build: Builder<GlassParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 16

  const ys = params.years
  const max = Math.max(1, ...ys.flatMap((y) => [y.BE ?? 0, y.RE ?? 0, y.A ?? 0]))
  const H = 3.0, scale = H / max
  const r = 0.34, pitch = 0.95
  const W = ys.length * pitch
  const x0 = -W / 2 + pitch / 2

  root.add(plinth(W + 0.8, 2.0, M, 0.4))
  const floor = shadowFloor(60, P.dark ? 0.35 : 0.14); floor.position.y = -0.4; root.add(floor)

  const glassMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#EEF2F5'), roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })
  const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), roughness: 0.2 })
  const liquidMat = new THREE.MeshStandardMaterial({ color: P.accent.clone().lerp(new THREE.Color('#FFFFFF'), 0.15), roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 })
  const ringMat = new THREE.MeshStandardMaterial({ color: P.accent2, roughness: 0.5 })
  const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#DADDE1'), roughness: 0.3 })

  const fills: { mesh: THREE.Mesh; target: number; delay: number }[] = []
  const tops: { id: string; x: number; top: number; spent: number | null }[] = []
  ys.forEach((y, i) => {
    const x = x0 + i * pitch
    const g = new THREE.Group(); g.position.x = x; root.add(g)
    const gh = Math.max(0.04, (y.BE ?? 0) * scale)
    // the glass: an open cylinder with a thick base and a bright rim
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, gh, 40, 1, true), glassMat)
    wall.position.y = gh / 2 + 0.06
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.06, 40), baseMat)
    base.position.y = 0.03; base.castShadow = true
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 48), rimMat)
    rim.rotation.x = Math.PI / 2; rim.position.y = gh + 0.06
    g.add(wall, base, rim)
    // spent: liquid; it rises above the rim when spending passed the plan
    if (y.A != null) {
      const lh = Math.max(0.01, y.A * scale)
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.86, 1, 40), liquidMat)
      liquid.castShadow = true
      liquid.position.y = 0.06
      g.add(liquid)
      fills.push({ mesh: liquid, target: lh, delay: i * 0.06 })
    }
    // revised plan: a dashed ring, drawn as a ring of short beads
    if (y.RE != null) {
      const ry = y.RE * scale + 0.06
      const beads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.025, 0.025), ringMat, 18)
      const m4 = new THREE.Matrix4()
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2
        m4.makeRotationY(-a); m4.setPosition(Math.cos(a) * (r + 0.03), ry, Math.sin(a) * (r + 0.03))
        beads.setMatrixAt(k, m4)
      }
      g.add(beads)
    }
    tops.push({ id: y.id, x, top: Math.max(gh, (y.A ?? 0) * scale) + 0.06, spent: y.A ?? null })
  })

  const center = new THREE.Vector3(0, H * 0.45, 0)
  return {
    frame: (t) => {
      fitBox(stage, center, W + 1.0, H + 0.9, 2.2, -0.16 + Math.sin((t / 28) * Math.PI * 2) * 0.03, 0.2, params.compact ? 1.02 : 1.06)
      for (const f of fills) {
        const p = t === 0 ? 1 : Math.min(1, Math.max(0, (t - f.delay) / 0.9))
        const e = 1 - Math.pow(1 - p, 3)
        const h = Math.max(0.005, f.target * e)
        f.mesh.scale.y = h
        f.mesh.position.y = 0.06 + h / 2
      }
    },
    anchors: () => [
      ...tops.map((t) => ({ id: `top-${t.id}`, x: t.x, y: t.top + 0.08, z: 0 })),
      ...tops.map((t) => ({ id: `base-${t.id}`, x: t.x, y: -0.42, z: 1.05 })),
    ],
  }
}

export default build
