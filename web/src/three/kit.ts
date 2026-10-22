import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Palette } from './core'

// Shared materials and shapes. Kept small on purpose: a handful of honest materials
// read as a crafted model; a hundred textures read as a video game.

export function mats(p: Palette) {
  const std = (color: THREE.Color, rough = 0.85, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })
  return {
    clay: std(p.clay, 0.82),
    stone: std(p.stone, 0.95),
    stone2: std(p.stone2, 0.95),
    plinth: std(p.plinth, 0.9),
    plinthSide: std(p.plinthSide, 0.92),
    asphalt: std(p.asphalt, 0.75),
    steel: std(p.steel, 0.38, 0.55),
    rock: std(p.rock, 1),
    wood: std(p.wood, 0.9),
    accent: std(p.accent, 0.45, 0.05, { emissive: p.accent, emissiveIntensity: 0.12 }),
    accent2: std(p.accent2, 0.5),
    ink: std(p.ink, 0.6),
    white: std(new THREE.Color('#FFFFFF'), 0.6),
    glass: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#E8EEF1'), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false }),
  }
}
export type Mats = ReturnType<typeof mats>

/** Planned, not built: faint faces and clear edges. The 3D form of the site's hollow marks. */
export function ghost(geo: THREE.BufferGeometry, p: Palette, strength = 1) {
  const g = new THREE.Group()
  const faces = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: p.ghost, transparent: true, opacity: 0.07 * strength, depthWrite: false }))
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: p.ghost, transparent: true, opacity: 0.5 * strength, depthWrite: false }))
  g.add(faces, edges)
  g.userData.ghost = true
  return g
}

export function rbox(w: number, h: number, d: number, r = 0.08, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01))
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

/** The stand every model sits on: a softly rounded slab with a darker rim. */
export function plinth(w: number, d: number, M: Mats, h = 0.6) {
  const g = new THREE.Group()
  const base = mesh(rbox(w, h, d, 0.28, 4), M.plinthSide)
  base.position.y = -h / 2
  const top = mesh(rbox(w - 0.12, 0.08, d - 0.12, 0.04, 2), M.plinth)
  top.position.y = -0.03
  g.add(base, top)
  return g
}

// ---------------------------------------------------------------- noise and terrain

// Small value-noise with smooth interpolation: enough for gentle model hills, no library.
function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}
export function noise2(x: number, y: number, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export function fbm(x: number, y: number, seed = 1, oct = 4) {
  let f = 0, amp = 0.5, fr = 1
  for (let i = 0; i < oct; i++) { f += amp * noise2(x * fr, y * fr, seed + i * 13); amp *= 0.5; fr *= 2 }
  return f
}

/** A rectangle of ground shaped by a height function, with soft vertex shading in the hollows. */
export function terrain(w: number, d: number, seg: number, height: (x: number, z: number) => number, base: THREE.Color, low: THREE.Color) {
  const geo = new THREE.PlaneGeometry(w, d, seg, Math.round(seg * d / w))
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  let hmin = Infinity, hmax = -Infinity
  const hs: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const h = height(pos.getX(i), pos.getZ(i))
    hs.push(h); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h)
    pos.setY(i, h)
  }
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = hmax > hmin ? (hs[i] - hmin) / (hmax - hmin) : 1
    c.copy(low).lerp(base, Math.pow(t, 0.7))
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  const m = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), false, true)
  return m
}

// ---------------------------------------------------------------- water

let waterNormal: THREE.CanvasTexture | null = null
/** A tileable ripple normal map drawn once on a canvas. Scrolling it makes water move without any extra geometry. */
export function waterNormalMap() {
  if (waterNormal) return waterNormal
  const N = 128
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(N, N)
  const h = (x: number, y: number) => {
    // periodic noise: sample a torus so the edges meet
    const a = (x / N) * Math.PI * 2, b = (y / N) * Math.PI * 2
    return fbm(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, 7, 3) + 0.5 * fbm(Math.sin(b) * 2.2 + 9, Math.cos(a + b) * 2.2, 3, 3)
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1)
    const n = new THREE.Vector3(-dx * 3.2, -dy * 3.2, 1).normalize()
    const i = (y * N + x) * 4
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  waterNormal = new THREE.CanvasTexture(cv)
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping
  return waterNormal
}

export function waterMaterial(p: Palette, repeat = 3) {
  const nm = waterNormalMap().clone()
  nm.needsUpdate = true
  nm.repeat.set(repeat, repeat)
  return new THREE.MeshStandardMaterial({
    color: p.water, roughness: 0.05, metalness: 0.1, normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6),
    transparent: true, opacity: 0.95, envMapIntensity: 1.5,
  })
}

// ---------------------------------------------------------------- small props

/** Model trees: pale wood spheres on sticks, as an architect's model would have them. */
export function trees(points: [number, number, number][], M: Mats, scale = 1) {
  const crown = new THREE.SphereGeometry(0.22 * scale, 10, 8)
  const stem = new THREE.CylinderGeometry(0.025 * scale, 0.03 * scale, 0.22 * scale, 6)
  const crowns = new THREE.InstancedMesh(crown, M.wood, points.length)
  const stems = new THREE.InstancedMesh(stem, M.wood, points.length)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3()
  points.forEach(([x, y, z], i) => {
    const k = 0.75 + hash(x, z, 3) * 0.55
    s.set(k, k * (0.9 + hash(z, x, 5) * 0.4), k)
    m.compose(new THREE.Vector3(x, y + 0.26 * scale * k, z), q, s); crowns.setMatrixAt(i, m)
    m.compose(new THREE.Vector3(x, y + 0.1 * scale, z), q, new THREE.Vector3(1, 1, 1)); stems.setMatrixAt(i, m)
  })
  crowns.castShadow = stems.castShadow = true
  crowns.receiveShadow = true
  const g = new THREE.Group(); g.add(crowns, stems)
  return g
}

/** A small rounded vehicle body; good enough for cars, trucks and wagons at model scale. */
export function vehicleGeo(len = 0.34, wid = 0.16, hgt = 0.12) {
  const body = rbox(len, hgt, wid, 0.04, 2)
  const cab = rbox(len * 0.45, hgt * 0.75, wid * 0.92, 0.035, 2)
  cab.translate(-len * 0.08, hgt * 0.7, 0)
  return mergeGeometries([body, cab])!
}

export { mergeGeometries }

/** A seeded random number between 0 and 1, so every model looks the same on every visit. */
export function rand(i: number, seed = 1) { return hash(i * 1.37, seed * 7.1, seed) }
