import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, plinth, mergeGeometries } from '../kit'
import { boundsOf, fitObject } from './common'
import { shadowFloor, useSky } from '../core'

// The register as a model town. Every work in the register is one small piece, and each piece looks
// like the kind of work it is: a water tank for town works, a stretch of road, a canal, a length of
// railway track, a power pylon, a factory shed. A piece is built up to the share its latest paper
// prints: the built part is solid, with a thin line in the accent colour where building stops; the
// rest stands faint, still to build. Works with no share printed, or only approved, are faint
// outlines. Stopped works are grey. Tap a piece to open its work.

export type CityWork = { id: number; kind: string; status: string; pct: number | null }
export type CityParams = {
  works: CityWork[]
  groups: { key: string; kinds: string[] }[]
  onPick?: (id: number | null) => void
  onHover?: (id: number | null) => void
  selected?: number | null
  /** Narrow screens: lay the city out tall rather than wide. */
  portrait?: boolean
}

const LOT = 0.3

// ------------------------------------------------------------------ pieces
// Each piece is built around its own origin: base at y = 0, centred in a 0.3 lot. `axis` is the
// direction it grows in as work is done: up for things that rise, along x for things that stretch.

type Piece = { geo: THREE.BufferGeometry; mats: THREE.Material[]; axis: 0 | 1; start: number; len: number; top: number }

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g }
function cyl(rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return g }
/** A thin square beam between two points: legs and bracing for towers. */
function beam(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const len = a.distanceTo(b)
  const g = new THREE.BoxGeometry(t, len, t)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)))
  return g
}
function merged(parts: [THREE.BufferGeometry, number][], materials: THREE.Material[]) {
  // one draw call per piece kind: parts are merged, each keeps its own material through groups
  const order = [...parts].sort((a, b) => a[1] - b[1])
  const geo = mergeGeometries(order.map(([g]) => (g.index ? g.toNonIndexed() : g)), true)!
  let k = 0
  geo.groups.forEach((gr) => { gr.materialIndex = order[k++][1] })
  return { geo, mats: materials }
}

function pieces(P: ReturnType<typeof mats>) {
  const concrete = new THREE.MeshStandardMaterial({ color: '#D3CFC6', roughness: 0.86 })
  const concreteDark = new THREE.MeshStandardMaterial({ color: '#B9B4AA', roughness: 0.9 })
  const steel = new THREE.MeshStandardMaterial({ color: '#9AA1A8', roughness: 0.38, metalness: 0.6 })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#45464B', roughness: 0.92 })
  const paint = new THREE.MeshStandardMaterial({ color: '#F2F1EC', roughness: 0.6 })
  const earth = new THREE.MeshStandardMaterial({ color: '#A3967F', roughness: 0.98 })
  const water = new THREE.MeshStandardMaterial({ color: '#5F7E86', roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4 })
  const ballast = new THREE.MeshStandardMaterial({ color: '#8C877E', roughness: 1 })
  const sleeper = new THREE.MeshStandardMaterial({ color: '#7A6A58', roughness: 0.9 })
  const wall = new THREE.MeshStandardMaterial({ color: '#DAD5CA', roughness: 0.85 })
  const roof = new THREE.MeshStandardMaterial({ color: '#7E848B', roughness: 0.55, metalness: 0.35 })
  void P

  // Town works: the elevated water tank every Andhra town knows, on its column.
  const tank = (() => {
    const parts: [THREE.BufferGeometry, number][] = [
      [cyl(0.07, 0.07, 0.012, 20, 0, 0), 1],                 // footing
      [cyl(0.03, 0.036, 0.3, 14, 0, 0.012), 0],              // column
      [cyl(0.088, 0.075, 0.03, 22, 0, 0.31), 1],              // the bowl's base ring
      [cyl(0.09, 0.09, 0.11, 22, 0, 0.34), 0],                // tank
      [cyl(0.02, 0.095, 0.04, 22, 0, 0.45), 2],               // roof cone
      [cyl(0.012, 0.012, 0.02, 8, 0, 0.49), 2],               // vent
    ]
    return { ...merged(parts, [concrete, concreteDark, roof]), axis: 1 as const, start: 0, len: 0.51, top: 0.51 }
  })()

  // Roads: a stretch of two-lane road with a dashed centre line and pale shoulders.
  const road = (() => {
    const parts: [THREE.BufferGeometry, number][] = [
      [box(0.28, 0.012, 0.15, 0, 0, 0), 1],                   // shoulders and base
      [box(0.28, 0.014, 0.11, 0, 0.002, 0), 0],               // carriageway
      ...[-0.1, -0.035, 0.03, 0.095].map((x) => [box(0.035, 0.004, 0.008, x, 0.016, 0), 2] as [THREE.BufferGeometry, number]),
      [box(0.28, 0.004, 0.005, 0, 0.016, 0.05), 2], [box(0.28, 0.004, 0.005, 0, 0.016, -0.05), 2],
    ]
    return { ...merged(parts, [asphalt, earth, paint]), axis: 0 as const, start: -0.14, len: 0.28, top: 0.03 }
  })()

  // Irrigation: a lined canal with water in it, banks on both sides.
  const canal = (() => {
    const bank = (z: number) => { const g = new THREE.BoxGeometry(0.28, 0.05, 0.05); g.translate(0, 0.025, z); return g }
    const parts: [THREE.BufferGeometry, number][] = [
      [box(0.28, 0.012, 0.17, 0, 0, 0), 0],
      [bank(0.06), 1], [bank(-0.06), 1],
      [box(0.28, 0.006, 0.07, 0, 0.026, 0), 2],
    ]
    return { ...merged(parts, [earth, concrete, water]), axis: 0 as const, start: -0.14, len: 0.28, top: 0.06 }
  })()

  // Railways: ballast, sleepers and two rails.
  const track = (() => {
    const parts: [THREE.BufferGeometry, number][] = [
      [box(0.28, 0.02, 0.14, 0, 0, 0), 0],
      ...[-0.12, -0.07, -0.02, 0.03, 0.08, 0.125].map((x) => [box(0.018, 0.008, 0.1, x, 0.02, 0), 1] as [THREE.BufferGeometry, number]),
      [box(0.28, 0.01, 0.01, 0, 0.028, 0.03), 2], [box(0.28, 0.01, 0.01, 0, 0.028, -0.03), 2],
    ]
    return { ...merged(parts, [ballast, sleeper, steel]), axis: 0 as const, start: -0.14, len: 0.28, top: 0.04 }
  })()

  // Power: a lattice transmission tower: four legs leaning in, cross bracing, and two cross arms.
  const pylon = (() => {
    const parts: [THREE.BufferGeometry, number][] = [[box(0.12, 0.01, 0.12, 0, 0, 0), 1]]
    const legAt = (y: number) => 0.055 - (0.055 - 0.014) * (y / 0.5)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([beam(new THREE.Vector3(sx * 0.055, 0.01, sz * 0.055), new THREE.Vector3(sx * 0.014, 0.5, sz * 0.014), 0.006), 0])
    for (const y of [0.12, 0.24, 0.34]) {
      const r = legAt(y)
      const c = [[-r, -r], [r, -r], [r, r], [-r, r]]
      for (let k = 0; k < 4; k++) parts.push([beam(new THREE.Vector3(c[k][0], y, c[k][1]), new THREE.Vector3(c[(k + 1) % 4][0], y, c[(k + 1) % 4][1]), 0.004), 0])
    }
    for (const [y, half] of [[0.36, 0.11], [0.44, 0.08]] as const) {
      parts.push([beam(new THREE.Vector3(-half, y, 0), new THREE.Vector3(half, y, 0), 0.007), 0])
      for (const x of [-half + 0.008, half - 0.008]) parts.push([box(0.006, 0.035, 0.006, x, y - 0.035, 0), 2])
    }
    return { ...merged(parts, [steel, concreteDark, concrete]), axis: 1 as const, start: 0, len: 0.5, top: 0.5 }
  })()

  // Industry and others: a shed with a saw-tooth roof and a chimney.
  const shed = (() => {
    const tooth = (x: number) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.07, 0); s.lineTo(0.07, 0.05); s.lineTo(0, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false }); g.translate(x, 0.12, -0.09); return g }
    const parts: [THREE.BufferGeometry, number][] = [
      [box(0.23, 0.12, 0.18, 0, 0, 0), 0],
      [tooth(-0.115), 1], [tooth(-0.045), 1], [tooth(0.025), 1],
      [cyl(0.014, 0.018, 0.3, 10, 0.085, 0, 0.05), 2],
    ]
    return { ...merged(parts, [wall, roof, concreteDark]), axis: 1 as const, start: 0, len: 0.3, top: 0.3 }
  })()

  return { towns: tank, roads: road, water: canal, rail: track, power: pylon, other: shed } as Record<string, Piece>
}

// ------------------------------------------------------------------ the build line
// One shader change does the work: each instance carries its built share; the solid copy draws the
// piece up to that share, the faint copy draws the rest, and a thin band at the cut takes the accent.

function progressify(mat: THREE.Material, piece: Piece, mode: 'solid' | 'ghost', accent: THREE.Color) {
  const m = mat as THREE.MeshStandardMaterial
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uStart = { value: piece.start }
    sh.uniforms.uLen = { value: piece.len }
    sh.uniforms.uAccent = { value: accent }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShare;\nvarying float vShare;\nvarying float vCoord;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvShare = aShare;\nvCoord = position.${piece.axis === 0 ? 'x' : 'y'};`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uStart;\nuniform float uLen;\nuniform vec3 uAccent;\nvarying float vShare;\nvarying float vCoord;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float cutAt = uStart + vShare * uLen;
        ${mode === 'solid' ? 'if (vCoord > cutAt + 0.0005) discard;' : 'if (vCoord < cutAt - 0.0005) discard;'}`)
    if (mode === 'solid') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>\n if (vShare < 0.999 && vCoord > cutAt - uLen * 0.035) diffuseColor.rgb = uAccent;`)
    }
  }
  // start and length are uniforms, so pieces that grow the same way share one compiled program
  m.customProgramCacheKey = () => `progress-${mode}-${piece.axis}`
  return m
}

function depthFor(piece: Piece) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  d.onBeforeCompile = (sh) => {
    sh.uniforms.uStart = { value: piece.start }
    sh.uniforms.uLen = { value: piece.len }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShare;\nvarying float vShare;\nvarying float vCoord;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvShare = aShare;\nvCoord = position.${piece.axis === 0 ? 'x' : 'y'};`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uStart;\nuniform float uLen;\nvarying float vShare;\nvarying float vCoord;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vCoord > uStart + vShare * uLen + 0.0005) discard;')
  }
  d.customProgramCacheKey = () => `progress-depth-${piece.axis}`
  return d
}

// ------------------------------------------------------------------ the town

const build: Builder<CityParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 28
  void useSky(stage, 42, 210)
  const kit = pieces(M)

  // lay out neighbourhoods: each a near-square block of lots, placed left to right in rows
  type Block = { key: string; items: CityWork[]; cols: number; rows: number; x: number; z: number; w: number; d: number }
  const blocks: Block[] = params.groups.map((g) => {
    const items = params.works.filter((w) => g.kinds.includes(w.kind))
      .sort((a, b) => order(a) - order(b) || (b.pct ?? -1) - (a.pct ?? -1))
    // the largest neighbourhood is laid out wide, so the others fit in one row beneath it
    const cols = Math.max(2, Math.ceil(Math.sqrt(items.length * (items.length > 200 ? (params.portrait ? 1.1 : 3.4) : (params.portrait ? 1.0 : 1.4)))))
    const rows = Math.ceil(items.length / cols)
    return { key: g.key, items, cols, rows, x: 0, z: 0, w: cols * LOT, d: rows * LOT }
  }).filter((b) => b.items.length)
  const street = 0.55
  const biggest = blocks.reduce((a, b) => (b.items.length > a.items.length ? b : a), blocks[0])
  const restW = blocks.filter((b) => b !== biggest).reduce((sum, b) => sum + b.w + street, -street)
  const maxRowW = params.portrait ? biggest.w + 0.5 : Math.max(biggest.w, restW) + 0.5
  let cx = 0, cz = 0, rowD = 0
  const rowsOf: Block[][] = [[]]
  for (const b of blocks) {
    if (cx > 0 && cx + b.w > maxRowW) { cz += rowD + street; cx = 0; rowD = 0; rowsOf.push([]) }
    b.x = cx; b.z = cz; cx += b.w + street; rowD = Math.max(rowD, b.d); rowsOf[rowsOf.length - 1].push(b)
  }
  for (const r of rowsOf) { const rw = r.reduce((sum, b) => sum + b.w + street, -street); const off = (maxRowW - 0.5 - rw) / 2; for (const b of r) b.x += off }
  const minX = Math.min(...blocks.map((b) => b.x)), maxX = Math.max(...blocks.map((b) => b.x + b.w))
  const minZ = Math.min(...blocks.map((b) => b.z)), maxZ = Math.max(...blocks.map((b) => b.z + b.d))
  const totalW = maxX - minX, totalD = maxZ - minZ
  for (const b of blocks) { b.x -= minX + totalW / 2; b.z -= minZ + totalD / 2 }

  root.add(plinth(totalW + 1.4, totalD + 1.6, M, 0.4))
  const floor = shadowFloor(80, P.dark ? 0.35 : 0.14); floor.position.y = -0.4; root.add(floor)
  // each neighbourhood stands on ground that suits it: paving for towns, earth for roads and canals
  const groundOf: Record<string, string> = { towns: '#C9C5BC', roads: '#B3A891', water: '#AFA48C', rail: '#A9A59D', power: '#B5AB96', other: '#C2BFB8' }
  for (const b of blocks) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.12, 0.04, b.d + 0.12), new THREE.MeshStandardMaterial({ color: new THREE.Color(groundOf[b.key] ?? '#BDB9B0'), roughness: 0.97 }))
    pad.position.set(b.x + b.w / 2, 0.02, b.z + b.d / 2)
    pad.receiveShadow = true
    root.add(pad)
  }

  // one solid and one faint instanced copy per kind of piece; both carry the built share per instance
  const grey = new THREE.Color('#8E8A83'), white = new THREE.Color('#FFFFFF')
  const ghostMat = () => new THREE.MeshBasicMaterial({ color: P.ghost, transparent: true, opacity: 0.16, depthWrite: false })
  type Lot = { w: CityWork; x: number; z: number; key: string; i: number }
  const lots: Lot[] = []
  const meshes: { solid: THREE.InstancedMesh; ghost: THREE.InstancedMesh; lots: Lot[] }[] = []
  for (const b of blocks) {
    const piece = kit[b.key] ?? kit.other
    const n = b.items.length
    const geo = piece.geo.clone()
    const share = new Float32Array(n)
    geo.setAttribute('aShare', new THREE.InstancedBufferAttribute(share, 1))
    const solid = new THREE.InstancedMesh(geo, piece.mats.map((m) => progressify(m.clone(), piece, 'solid', P.accent)), n)
    const ghost = new THREE.InstancedMesh(geo, piece.mats.map(() => progressify(ghostMat(), piece, 'ghost', P.accent)), n)
    solid.customDepthMaterial = depthFor(piece)
    solid.castShadow = true; solid.receiveShadow = true
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1)
    const mine: Lot[] = []
    b.items.forEach((w, i) => {
      const x = b.x + (i % b.cols) * LOT + LOT / 2, z = b.z + Math.floor(i / b.cols) * LOT + LOT / 2
      m4.compose(new THREE.Vector3(x, 0.04, z), q, one)
      solid.setMatrixAt(i, m4); ghost.setMatrixAt(i, m4)
      share[i] = builtShare(w)
      solid.setColorAt(i, w.status === 'suspended' ? grey : white)
      const lot = { w, x, z, key: b.key, i }
      lots.push(lot); mine.push(lot)
    })
    if (solid.instanceColor) solid.instanceColor.needsUpdate = true
    root.add(solid, ghost)
    meshes.push({ solid, ghost, lots: mine })
  }

  // the chosen piece: a ring of accent light at its foot
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 40), new THREE.MeshBasicMaterial({ color: P.accent, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2
  ring.visible = false
  ring.userData.noFit = true
  root.add(ring)
  let selected = params.selected ?? null
  let hovered: number | null = null
  const lotOf = (id: number | null) => (id == null ? null : lots.find((l) => l.w.id === id) ?? null)
  const place = () => {
    const l = lotOf(hovered ?? selected)
    ring.visible = !!l
    if (l) ring.position.set(l.x, 0.05, l.z)
  }
  place()

  const ray = new THREE.Raycaster()
  const hitId = (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2(x, y), stage.camera)
    const hit = ray.intersectObjects(meshes.flatMap((m) => [m.solid, m.ghost]), false)[0]
    if (!hit || hit.instanceId == null) return null
    const owner = meshes.find((m) => m.solid === hit.object || m.ghost === hit.object)
    return owner?.lots[hit.instanceId]?.w.id ?? null
  }

  const bounds = boundsOf(root)
  const az = params.portrait ? -0.25 : -0.5, el = params.portrait ? 0.86 : 0.64
  return {
    frame: (t) => {
      fitObject(stage, bounds, az + Math.sin((t / 32) * Math.PI * 2) * 0.06, el, { x: 0.05, top: 0.1, bottom: 0.05 })
    },
    anchors: () => [
      ...blocks.map((b) => ({ id: `group-${b.key}`, x: b.x + b.w / 2, y: 0.05, z: b.z - 0.18 })),
      ...((hovered ?? selected) != null ? [(() => { const l = lotOf(hovered ?? selected); return { id: 'chosen', x: l?.x ?? 0, y: 0.55, z: l?.z ?? 0 } })()] : []),
    ],
    pick: (x, y) => { const id = hitId(x, y); selected = id; place(); params.onPick?.(id) },
    hover: (x, y) => { const id = hitId(x, y); if (id === hovered) return; hovered = id; place(); params.onHover?.(id) },
    update: (p) => { const np2 = p as CityParams; if (np2.selected !== undefined) { selected = np2.selected; place() } },
  }
}

function order(w: CityWork) {
  return { completed: 0, under_construction: 1, delayed: 1, suspended: 2, tendered: 3, approved: 4 }[w.status] ?? 5
}
function builtShare(w: CityWork) {
  if (w.status === 'completed') return 1
  if (w.status === 'approved' || w.status === 'tendered') return 0
  if (w.pct != null) return Math.max(0.03, Math.min(1, w.pct / 100))
  return 0.06 // going on, with no share printed: a low base only
}

export default build
