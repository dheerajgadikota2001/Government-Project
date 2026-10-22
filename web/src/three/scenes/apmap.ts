import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, mesh, plinth } from '../kit'
import { fitBox } from './common'
import { shadowFloor } from '../core'

// Andhra Pradesh as a model: every district a raised tile of the same height and the same
// colour, because the map is for picking a place, not for showing a number. The chosen
// district rises and takes the accent colour. The sea fills the rest of the stand.

export type MapParams = {
  shapes: { name: string; shape: string }[]
  viewBox: string
  selected?: string | null
  /** Districts to tint, for example the nine a paper names. */
  highlight?: string[]
  onPick?: (name: string) => void
  onHover?: (name: string | null) => void
  compact?: boolean
  spin?: boolean
}

const S = 1 / 66 // map units to model units

function parseShape(d: string, vx: number, vy: number) {
  // the files hold polylines: "M x,y x,y ... Z M ..." in the map's own units
  const shapes: THREE.Shape[] = []
  for (const part of d.split(/M/i).map((p) => p.trim()).filter(Boolean)) {
    const pts = part.replace(/Z/gi, '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite))
    if (pts.length < 3) continue
    const sh = new THREE.Shape()
    pts.forEach(([x, y], i) => {
      const X = (x - vx) * S, Y = -(y - vy) * S // y flips: down on paper is towards the reader
      if (i === 0) sh.moveTo(X, Y); else sh.lineTo(X, Y)
    })
    shapes.push(sh)
  }
  return shapes
}

const build: Builder<MapParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 26

  const [, , vw, vh] = params.viewBox.split(/\s+/).map(Number)
  const cx = vw / 2, cy = vh / 2
  const mapW = vw * S, mapD = vh * S

  root.add(plinth(mapW + 1.2, mapD + 1.2, M, 0.5))
  const floor = shadowFloor(60, P.dark ? 0.35 : 0.14); floor.position.y = -0.5; root.add(floor)
  // No sea: we hold no outline of the neighbouring states, and water inland would mislead.
  // The state sits as a cut-out on the dark stand; a quiet label names the Bay of Bengal.

  const depth = 0.32
  const landMat = new THREE.MeshStandardMaterial({ color: P.clay, roughness: 0.8 })
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#CFCBC4'), roughness: 0.9 })
  const pickMat = new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.5, emissive: P.accent, emissiveIntensity: 0.08 })
  const hoverMat = new THREE.MeshStandardMaterial({ color: P.clay.clone().lerp(P.accent, 0.18), roughness: 0.75 })
  const tintMat = new THREE.MeshStandardMaterial({ color: P.clay.clone().lerp(P.accent, 0.38), roughness: 0.7 })
  const seamMat = new THREE.LineBasicMaterial({ color: P.dark ? new THREE.Color('#8B8C93') : new THREE.Color('#A9A59D') })

  type Tile = { name: string; mesh: THREE.Mesh; lift: number; target: number; center: THREE.Vector3 }
  const tiles: Tile[] = params.shapes.map((d) => {
    const shapes = parseShape(d.shape, cx, cy)
    const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2) // extrude upwards; the shape's y becomes -z
    geo.computeBoundingBox()
    const m = mesh(geo, [landMat, sideMat] as unknown as THREE.Material)
    ;(m as THREE.Mesh).material = [landMat, sideMat]
    m.userData.name = d.name
    root.add(m)
    // the district's outline on its top face, so neighbours read as separate tiles
    for (const sh of shapes) {
      const pts = sh.getPoints().map((p) => new THREE.Vector3(p.x, depth + 0.031, -p.y))
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), seamMat)
      m.add(line)
    }
    const bb = geo.boundingBox!
    const center = new THREE.Vector3((bb.min.x + bb.max.x) / 2, depth, (bb.min.z + bb.max.z) / 2)
    return { name: d.name, mesh: m, lift: 0, target: 0, center }
  })

  let selected = params.selected ?? null
  let hovered: string | null = null
  const paint = () => {
    for (const t of tiles) {
      const on = t.name === selected, hv = t.name === hovered && !on, hl = (params.highlight ?? []).includes(t.name)
      ;(t.mesh as THREE.Mesh).material = [on ? pickMat : hv ? hoverMat : hl ? tintMat : landMat, sideMat]
      t.target = on ? 0.32 : hv ? 0.12 : hl ? 0.08 : 0
    }
  }
  paint()

  const ray = new THREE.Raycaster()
  const hitName = (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2(x, y), stage.camera)
    const hit = ray.intersectObjects(tiles.map((t) => t.mesh), false)[0]
    return (hit?.object.userData.name as string | undefined) ?? null
  }
  const center = new THREE.Vector3(0, 0.2, 0.2)
  const az = -0.18, el = params.compact ? 1.0 : 0.92

  return {
    frame: (t, dt) => {
      const a = az + (params.spin === false ? 0 : Math.sin((t / 30) * Math.PI * 2) * 0.12)
      fitBox(stage, center, mapW + 0.9, 0.8, mapD + 0.9, a, el, params.compact ? 1.0 : 1.04)
      for (const tile of tiles) {
        tile.lift += (tile.target - tile.lift) * Math.min(1, (dt || 1) * 9)
        tile.mesh.position.y = tile.lift
      }
    },
    anchors: () => [
      ...tiles.filter((t) => t.name === (hovered ?? selected)).map((t) => ({ id: 'label', x: t.center.x, y: t.center.y + t.lift + 0.1, z: t.center.z })),
      { id: 'bay', x: mapW * 0.3, y: 0.05, z: mapD * 0.18 },
    ],
    pick: (x, y) => {
      const n = hitName(x, y)
      if (!n) return
      selected = n; paint()
      params.onPick?.(n)
    },
    hover: (x, y) => {
      const n = hitName(x, y)
      if (n === hovered) return
      hovered = n; paint()
      params.onHover?.(n)
    },
    update: (p) => {
      const np = p as MapParams
      if (np.selected !== undefined && np.selected !== selected) { selected = np.selected; paint() }
    },
  }
}

export default build
