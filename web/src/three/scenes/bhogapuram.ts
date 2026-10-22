import * as THREE from 'three'
import type { Builder } from '../View3D'
import { mats, mesh, mergeGeometries, waterMaterial } from '../kit'
import { boundsOf, fitObject } from './common'
import { fitShadow, shadowFloor, useSky } from '../core'
import groundUrl from './bhogapuram/ground.webp'
import { TERRAIN } from './bhogapuram/terrain'

// Alluri Sitarama Raju International Airport, Bhogapuram, Phase 1, in its real setting.
//
// WHERE EVERY PIECE COMES FROM
// Positions are in metres in a frame laid along the runway: s runs from the runway 10 threshold
// toward runway 28, n runs across it, positive to the north side where the terminal stands.
//  - The ground: a Copernicus Sentinel-2 satellite picture of 28 September 2026 (10 m pixels),
//    so the earthworks, roads, villages and the coast are as they were that day.
//  - The land's shape: Copernicus DEM GLO-30 (surveyed 2011 to 2015, before the airport). Inside
//    the fence it is replaced by the graded runway level the AIP publishes: threshold 10 at
//    120.41 ft and threshold 28 at 188.32 ft, a 0.544% rise to the east.
//  - Surveyed (AAI AIP Supplement 80/2026): both thresholds, so the runway's length, width and
//    bearing; every aircraft stand; the reference point; the control tower; the isolated stand; the
//    DVOR; the approach lights; the rapid exits A5 and A7 by their published distances.
//  - Read off AAI's aerodrome chart (checked against the surveyed reference point to within 3 m):
//    taxiways, aprons, the terminal's footprint, the boarding-bridge marks, the fuel farm, the fire
//    stations and the radar.
//  - Not published: building heights and the terminal's architecture. The terminal's form here is
//    simplified; its roof line and glass walls are drawn, not copied. Parked aircraft show size
//    only; they are not live traffic.
// Every height is at true scale, the land's included.

export type BhogapuramParams = { compact?: boolean }

const K = 0.0021            // model units per metre
const VERT = 1              // heights at true scale, the land's included
const S0 = 2900, N0 = -550  // the model's centre, in runway metres
const X = (s: number) => (s - S0) * K
const Z = (n: number) => -(n - N0) * K
const H = (m: number) => m * K * VERT

// the frame of the satellite picture (make_assets.py)
const FS0 = -1000, FS1 = 6800, FN0 = -1800, FN1 = 1500

// the graded airport surface: AIP threshold elevations (EGM2008), metres
const RWY_LEN = 3797.4, RWY_W = 45
const ELEV10 = 36.70, SLOPE = (57.40 - 36.70) / RWY_LEN
const airElev = (s: number) => ELEV10 + SLOPE * Math.min(4470, Math.max(-470, s))

// ---------------------------------------------------------------- terrain heights
const T = TERRAIN
const heights = (() => {
  const bin = atob(T.dm)
  const out = new Float32Array(T.nx * T.ny)
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    out[i] = (v > 32767 ? v - 65536 : v) / 10
  }
  return out
})()
/** Ground height in metres at a runway-frame point (bilinear on the 30 m grid). */
function groundAt(s: number, n: number) {
  const fx = Math.min(T.nx - 1.001, Math.max(0, (s - T.s0) / T.step))
  const fy = Math.min(T.ny - 1.001, Math.max(0, (T.n1 - n) / T.step))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0
  const h = (x: number, y: number) => heights[y * T.nx + x]
  return h(x0, y0) * (1 - ax) * (1 - ay) + h(x0 + 1, y0) * ax * (1 - ay) + h(x0, y0 + 1) * (1 - ax) * ay + h(x0 + 1, y0 + 1) * ax * ay
}

// ---------------------------------------------------------------- the published layout (metres)
const STANDS: [string, number, number, 'C' | 'E' | 'F'][] = [
  ['11L', 1984.4, 642.5, 'C'], ['11', 2009.7, 671.3, 'E'], ['11R', 2018.4, 675.6, 'C'],
  ['12L', 2082.8, 640.0, 'C'], ['12', 2121.9, 648.3, 'E'], ['12R', 2131.4, 646.2, 'C'],
  ['13', 2150.4, 561.7, 'C'], ['14', 2151.5, 516.6, 'C'], ['15', 2151.5, 471.5, 'C'], ['16', 2151.6, 426.4, 'C'],
  ['17', 2284.7, 433.1, 'C'], ['18', 2284.6, 478.2, 'C'], ['19', 2284.6, 523.3, 'C'], ['20', 2284.5, 568.4, 'C'], ['21', 2283.1, 613.5, 'C'],
  ['22', 2317.7, 672.4, 'C'], ['23', 2386.5, 670.8, 'C'], ['24', 2431.5, 670.8, 'C'],
  ['80', 1079.0, 415.4, 'C'], ['81', 1123.9, 415.4, 'C'], ['100', 3451.6, 338.6, 'F'],
]
// Nose direction at each stand, from the chart's lead-in lines: degrees from +s toward +n.
const HEADING: Record<string, number> = { 13: 0, 14: 0, 15: 0, 16: 0, 17: 180, 18: 180, 19: 180, 20: 180, 21: 180 }
const TOWER = { s: 1502.1, n: 767.5 }
const DVOR = { s: 4436.9, n: 100.0 }
const TWY_A_N = 192
const A3 = 824, A9 = 3307, A10 = 3781
const A5_RWY = RWY_LEN - 1923
const A7_RWY = 2248
const B7 = 2055, B8 = 2352, TWY_B_N = 299

const rect = (s0: number, s1: number, n0: number, n1: number): [number, number][] => [[s0, n0], [s1, n0], [s1, n1], [s0, n1]]

/** A flat shape in runway metres, `thick` metres deep, standing on the airport's graded level (y = 0 there). */
function slab(points: [number, number][], up: number, thick: number) {
  const shape = new THREE.Shape(points.map(([s, n]) => new THREE.Vector2(X(s), (n - N0) * K)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: H(thick), bevelEnabled: false, curveSegments: 6 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, H(up), 0)
  return g
}
function band(a: [number, number], b: [number, number], w: number, up: number, thick: number) {
  const ds = b[0] - a[0], dn = b[1] - a[1], L = Math.hypot(ds, dn)
  const ps = (-dn / L) * (w / 2), pn = (ds / L) * (w / 2)
  return slab([[a[0] + ps, a[1] + pn], [b[0] + ps, b[1] + pn], [b[0] - ps, b[1] - pn], [a[0] - ps, a[1] - pn]], up, thick)
}

/** A canvas-drawn surface texture: fine grain that stays crisp close up, never a photograph. */
function grainTexture(base: string, dots: string, seed: number, size = 512, repeat = 40) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base; g.fillRect(0, 0, size, size)
  let r = seed
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  g.fillStyle = dots
  for (let i = 0; i < size * size * 0.06; i++) { g.globalAlpha = 0.05 + rnd() * 0.12; g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5) }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function textPlate(text: string, color: string, px = 96) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.font = `700 ${px}px Arial, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 66)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
}

/** A twin-engine airliner in real metres times K: nose at the origin, tail toward +x, wings along z.
 *  Code C is about the size of an A320 (37.6 m long, 35.8 m span); code E of a B787 (57 m, 60 m). */
function airliner(code: 'C' | 'E' | 'F') {
  const L = code === 'C' ? 37.6 : 57, R = code === 'C' ? 1.98 : 2.9, span = code === 'C' ? 35.8 : 60
  const k = K
  const parts: THREE.BufferGeometry[] = []
  // fuselage: a lathe of the profile (round nose, straight barrel, tail cone rising)
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    const r = u < 0.09 ? R * Math.sqrt(Math.sin((u / 0.09) * (Math.PI / 2))) : u < 0.76 ? R : R * (1 - Math.pow((u - 0.76) / 0.24, 1.3) * 0.85)
    prof.push(new THREE.Vector2(Math.max(0.04, r) * k, u * L * k))
  }
  const fus = new THREE.LatheGeometry(prof, 20)
  fus.rotateZ(-Math.PI / 2)             // lathe axis +y becomes +x: nose at x = 0, tail at x = L
  fus.translate(0, R * k, 0)
  parts.push(fus.toNonIndexed())
  /** A thin swept panel from a planform in (x, z) metres, `t` metres thick, at height `y`. */
  const panel = (pts: [number, number][], t: number, y: number, dihedral = 0) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * k, z * k)))
    const g = new THREE.ExtrudeGeometry(sh, { depth: t * k, bevelEnabled: false })
    g.rotateX(Math.PI / 2)              // shape y (span) becomes z; thickness goes down
    if (dihedral) g.rotateX(-dihedral * Math.sign(pts[1][1]))
    g.translate(0, y * k, 0)
    return g
  }
  const xr = 0.36 * L, cr = 0.2 * L, sweep = 0.24 * span * 0.5, ct = Math.max(1.5, 0.05 * L)
  for (const side of [1, -1]) {
    parts.push(panel([[xr, 0], [xr + sweep, side * span / 2], [xr + sweep + ct, side * span / 2], [xr + cr, 0]], 0.5, R * 0.75, 0.08))
    // tailplane
    const xt = 0.84 * L, ht = 0.17 * span
    parts.push(panel([[xt, 0], [xt + 0.45 * ht, side * ht], [xt + 0.45 * ht + 1.4, side * ht], [xt + 0.11 * L, 0]], 0.3, R * 1.2))
  }
  // fin: a swept panel standing up from the tail
  const fin = new THREE.Shape([[0.8 * L, 0], [0.97 * L, 0], [1.0 * L, 0.28 * L], [0.91 * L, 0.28 * L]].map(([x, y]) => new THREE.Vector2(x * k, y * k)))
  const f = new THREE.ExtrudeGeometry(fin, { depth: 0.35 * k, bevelEnabled: false })
  f.translate(0, R * 1.6 * k, -0.17 * k)
  parts.push(f)
  const eng: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    const e = new THREE.CylinderGeometry(R * 0.4 * k, R * 0.34 * k, 0.12 * L * k, 16)
    e.rotateZ(Math.PI / 2)
    e.translate(xr + 0.02 * L, R * 0.15 * k, side * 0.17 * span * k)
    eng.push(e.toNonIndexed())
  }
  const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g)
  return { body: mergeGeometries(parts.map(ni))!, engines: mergeGeometries(eng)! }
}

/** Lines that fade in only close up: a fine, world-scale grain laid over the satellite picture, so the
 *  ground stays crisp when the reader zooms in, without inventing anything at the scale it shows. */
function addDetail(mat: THREE.MeshStandardMaterial, tex: THREE.Texture, metresPerTile: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: tex }
    sh.uniforms.detailScale = { value: 1 / (metresPerTile * K) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D detailMap;\nuniform float detailScale;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dg = texture2D(detailMap, vWPos.xz * detailScale).r;
        float dg2 = texture2D(detailMap, vWPos.xz * detailScale * 0.173).r;
        diffuseColor.rgb *= mix(0.82, 1.14, dg * 0.6 + dg2 * 0.4);`)
  }
}

/** Standing-seam metal with three skylight bands, drawn on a canvas (the real roof is not published). */
function roofTexture() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#E4E1DA'; g.fillRect(0, 0, 1024, 512)
  for (let x = 0; x < 1024; x += 8) { g.fillStyle = x % 16 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.35)'; g.fillRect(x, 0, 1, 512) }
  g.fillStyle = 'rgba(40,64,80,0.85)'
  for (const y of [120, 250, 380]) g.fillRect(40, y, 944, 14)
  g.fillStyle = 'rgba(90,90,90,0.35)'; g.fillRect(0, 0, 1024, 6); g.fillRect(0, 506, 1024, 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const build: Builder<BhogapuramParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 26
  // the fit searches distances out to 30 model sizes; the far plane must lie beyond that
  stage.camera.near = 0.05
  stage.camera.far = 1200
  const frames: ((t: number, dt: number) => void)[] = []
  void useSky(stage, 44, 210).then(() => { stage.scene.environmentIntensity = 0.16 })
  stage.renderer.toneMappingExposure = 0.9
  stage.sun.intensity = 2.6
  // One model unit here is 476 m, so the engine's default shadow offsets (sized for models a unit
  // across) would push every shadow metres away from what casts it. These are a few metres' worth.
  stage.sun.shadow.bias = -0.00005
  stage.sun.shadow.normalBias = 0.0015
  const maxAniso = stage.renderer.capabilities.getMaxAnisotropy()

  // ---------------------------------------------------------------- the land: satellite picture on real terrain
  const W = (FS1 - FS0) * K, D = (FN1 - FN0) * K
  const cx = (X(FS0) + X(FS1)) / 2, cz = (Z(FN0) + Z(FN1)) / 2
  const nx = T.nx, ny = T.ny
  const terrainGeo = new THREE.PlaneGeometry(W, D, nx - 1, ny - 1)
  terrainGeo.rotateX(-Math.PI / 2)
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute
  const uv = terrainGeo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i) / K + (FS0 + FS1) / 2
    const n = -pos.getZ(i) / K + (FN0 + FN1) / 2
    pos.setXYZ(i, X(s), H(groundAt(s, n)), Z(n))
    uv.setXY(i, (s - FS0) / (FS1 - FS0), (n - FN0) / (FN1 - FN0))
  }
  terrainGeo.computeVertexNormals()
  const groundTex = new THREE.TextureLoader().load(groundUrl, () => { applyTrees(); stage.render() })
  groundTex.colorSpace = THREE.SRGBColorSpace
  groundTex.anisotropy = maxAniso
  groundTex.generateMipmaps = true
  groundTex.minFilter = THREE.LinearMipmapLinearFilter
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0, envMapIntensity: 0.6 })
  addDetail(groundMat, grainTexture('#808080', '#000000', 5, 256, 1), 24)
  const land = mesh(terrainGeo, groundMat, false, true)
  root.add(land)

  // the cut sides of the stand: the soil under the edges, down to a dark base
  const BASE = -0.22
  const skirt: THREE.BufferGeometry[] = []
  const edge = (pts: [number, number][]) => {
    const v: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, n0] = pts[i], [s1, n1] = pts[i + 1]
      const a = [X(s0), H(groundAt(s0, n0)), Z(n0)], b = [X(s1), H(groundAt(s1, n1)), Z(n1)]
      v.push(a[0], a[1], a[2], b[0], b[1], b[2], b[0], BASE, b[2], a[0], a[1], a[2], b[0], BASE, b[2], a[0], BASE, a[2])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    skirt.push(g)
  }
  const along = (a: number, b: number, k: number) => Array.from({ length: k + 1 }, (_, i) => a + ((b - a) * i) / k)
  edge(along(FS0, FS1, 200).map((s) => [s, FN0] as [number, number]))
  edge(along(FS1, FS0, 200).map((s) => [s, FN1] as [number, number]))
  edge(along(FN1, FN0, 120).map((n) => [FS0, n] as [number, number]))
  edge(along(FN0, FN1, 120).map((n) => [FS1, n] as [number, number]))
  const soil = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.dark ? '#4A3A2E' : '#8A6A4E'), roughness: 1, side: THREE.DoubleSide })
  root.add(mesh(mergeGeometries(skirt)!, soil, false, false))
  const baseSlab = mesh(new THREE.BoxGeometry(W + 0.002, 0.08, D + 0.002), M.plinth, false, true)
  baseSlab.position.set(cx, BASE - 0.04, cz)
  root.add(baseSlab)
  const floor = shadowFloor(80, P.dark ? 0.35 : 0.15); floor.position.y = BASE - 0.09; root.add(floor)

  // the Bay of Bengal: a moving water surface where the picture shows sea (land there is at 0 m)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(W, D), waterMaterial(P, 18))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(cx, H(1.2), cz)
  sea.renderOrder = 1
  const seaMat = sea.material as THREE.MeshStandardMaterial
  seaMat.opacity = 0.55
  // the water only shows where the ground is at sea level: a mask drawn from the terrain
  const maskC = document.createElement('canvas'); maskC.width = nx; maskC.height = ny
  const mctx = maskC.getContext('2d')!
  const md = mctx.createImageData(nx, ny)
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const h = heights[y * nx + x], i = (y * nx + x) * 4
    const a = h < 0.6 ? 255 : 0
    md.data[i] = md.data[i + 1] = md.data[i + 2] = a; md.data[i + 3] = 255
  }
  mctx.putImageData(md, 0, 0)
  const maskTex = new THREE.CanvasTexture(maskC)
  seaMat.alphaMap = maskTex
  seaMat.depthWrite = false
  root.add(sea)
  frames.push((t) => { if (seaMat.normalMap) seaMat.normalMap.offset.set(t * 0.004, t * 0.002) })

  // ---------------------------------------------------------------- the airfield, on its graded level
  // Everything in `air` is built flat on y = 0 and then sheared onto the runway's published slope.
  const air = new THREE.Group()
  air.matrixAutoUpdate = false
  const yAt0 = H(ELEV10 + SLOPE * S0) // the level at the model's centre line
  air.matrix.set(1, 0, 0, 0, SLOPE * VERT, 1, 0, yAt0 + H(0.35), 0, 0, 1, 0, 0, 0, 0, 1)
  root.add(air)
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = false) => { const o = mesh(g, m, cast, true); air.add(o); return o }

  const asphaltTex = grainTexture(P.dark ? '#36373B' : '#3F4045', '#16171A', 7, 512, 24)
  const asphalt = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: asphaltTex, roughness: 0.82, metalness: 0 })
  const concTex = grainTexture(P.dark ? '#7C7972' : '#A7A39A', '#5E5A52', 11, 512, 24)
  {
    // apron slab joints: a square grid, about 7.5 m apart at this tiling (one tile is about 20 m)
    const c = concTex.image as HTMLCanvasElement, g = c.getContext('2d')!
    g.strokeStyle = 'rgba(60,58,52,0.35)'; g.lineWidth = 1.5
    for (let i = 0; i <= 512; i += 192) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke() }
    concTex.needsUpdate = true
  }
  const concrete = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: concTex, roughness: 0.88 })
  const marking = new THREE.MeshStandardMaterial({ color: '#F4F4F2', roughness: 0.6, emissive: '#FFFFFF', emissiveIntensity: 0.06 })
  const yellow = new THREE.MeshStandardMaterial({ color: '#E8B92E', roughness: 0.6, emissive: '#E8B92E', emissiveIntensity: 0.08 })

  // runway end safety areas and the paved runway ends (rigid concrete for the first 250 m and last 200 m: AIP PCR remarks)
  add(slab(rect(0, RWY_LEN, -RWY_W / 2, RWY_W / 2), 0, 0.5), asphalt)
  add(slab(rect(0, 250, -RWY_W / 2, RWY_W / 2), 0.01, 0.5), concrete)
  add(slab(rect(RWY_LEN - 200, RWY_LEN, -RWY_W / 2, RWY_W / 2), 0.01, 0.5), concrete)
  add(slab([[0, 22], [140, 22], [180, 62], [40, 62]], 0, 0.5), asphalt)
  add(slab([[RWY_LEN, 22], [RWY_LEN - 140, 22], [RWY_LEN - 180, 62], [RWY_LEN - 40, 62]], 0, 0.5), asphalt)
  // paved shoulders, 7.5 m each side (ICAO for code E and F)
  add(slab(rect(0, RWY_LEN, RWY_W / 2, RWY_W / 2 + 7.5), 0, 0.4), concrete)
  add(slab(rect(0, RWY_LEN, -RWY_W / 2 - 7.5, -RWY_W / 2), 0, 0.4), concrete)

  const MY = 0.53
  const lines: THREE.BufferGeometry[] = []
  for (let s = 140; s < RWY_LEN - 160; s += 50) lines.push(slab(rect(s, s + 30, -0.45, 0.45), MY, 0.02))
  for (const s0 of [6, RWY_LEN - 36]) for (let i = 0; i < 12; i++) {
    const n = -19.5 + i * 3.6 + (i >= 6 ? 3.6 : 0) - 1.8
    lines.push(slab(rect(s0, s0 + 30, n, n + 1.8), MY, 0.02))
  }
  for (const s0 of [400, RWY_LEN - 460]) for (const n of [-9, 5]) lines.push(slab(rect(s0, s0 + 60, n, n + 4), MY, 0.02))
  // touchdown zone bars at 150 m intervals (ICAO, precision approach runway 28 and non-precision 10)
  for (const [s0, dir] of [[150, 1], [RWY_LEN - 150, -1]] as [number, number][]) for (let k = 0; k < 6; k++) {
    if (k === 2) continue
    const s = s0 + dir * k * 150
    const bars = k < 2 ? 3 : k < 4 ? 2 : 1
    for (const side of [-1, 1]) for (let b = 0; b < bars; b++) {
      const n0 = side * (6 + b * 3)
      lines.push(slab(rect(Math.min(s, s + dir * 22.5), Math.max(s, s + dir * 22.5), Math.min(n0, n0 + side * 1.8), Math.max(n0, n0 + side * 1.8)), MY, 0.02))
    }
  }
  lines.push(slab(rect(0, RWY_LEN, -22.5, -21.6), MY, 0.02), slab(rect(0, RWY_LEN, 21.6, 22.5), MY, 0.02))
  add(mergeGeometries(lines.map((g) => g.toNonIndexed()))!, marking)
  for (const [label, s, rot] of [['10', 60, Math.PI / 2], ['28', RWY_LEN - 60, -Math.PI / 2]] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(36 * K * 1.4, 18 * K * 1.4), textPlate(label, '#FFFFFF'))
    p.rotation.set(-Math.PI / 2, 0, rot)
    p.position.set(X(s), H(MY + 0.03), Z(0))
    air.add(p)
  }

  // taxiways (chart) with yellow centrelines
  const TW = 23
  const twy: THREE.BufferGeometry[] = [
    slab(rect(A3 - 30, A10 + 30, TWY_A_N - TW / 2, TWY_A_N + TW / 2), 0, 0.45),
    ...[A3, A9, A10].map((s) => slab(rect(s - TW / 2, s + TW / 2, 0, TWY_A_N), 0, 0.45)),
    band([A5_RWY, 0], [A5_RWY - 300, TWY_A_N], TW, 0, 0.45),
    band([A7_RWY, 0], [A7_RWY + 300, TWY_A_N], TW, 0, 0.45),
    ...[B7, B8].map((s) => slab(rect(s - TW / 2, s + TW / 2, TWY_A_N, 405), 0, 0.45)),
    slab(rect(B7, B8, TWY_B_N - TW / 2, TWY_B_N + TW / 2), 0, 0.45),
    slab(rect(1037 - TW / 2, 1037 + TW / 2, TWY_A_N, 380), 0, 0.45),
    slab(rect(3452 - TW / 2, 3452 + TW / 2, TWY_A_N, 300), 0, 0.45),
  ]
  add(mergeGeometries(twy.map((g) => g.toNonIndexed()))!, asphalt)
  const tl: THREE.BufferGeometry[] = [
    slab(rect(A3, A10, TWY_A_N - 0.4, TWY_A_N + 0.4), 0.47, 0.02),
    ...[A3, A9, A10].map((s) => slab(rect(s - 0.4, s + 0.4, 25, TWY_A_N), 0.47, 0.02)),
    band([A5_RWY, 0], [A5_RWY - 300, TWY_A_N], 0.8, 0.47, 0.02),
    band([A7_RWY, 0], [A7_RWY + 300, TWY_A_N], 0.8, 0.47, 0.02),
    ...[B7, B8].map((s) => slab(rect(s - 0.4, s + 0.4, TWY_A_N, 405), 0.47, 0.02)),
    slab(rect(B7, B8, TWY_B_N - 0.4, TWY_B_N + 0.4), 0.47, 0.02),
  ]
  // runway-holding positions: the double solid and double dashed yellow lines across each link (ICAO pattern A)
  for (const s of [A3, A9, A10]) for (const dn of [90, 91.2]) tl.push(slab(rect(s - TW / 2, s + TW / 2, dn, dn + 0.3), 0.47, 0.02))
  add(mergeGeometries(tl.map((g) => g.toNonIndexed()))!, yellow)

  // aprons (chart)
  add(slab([[1955, 405], [2470, 405], [2470, 700], [1955, 700]], 0, 0.5), concrete)
  add(slab(rect(1040, 1165, 380, 470), 0, 0.5), concrete)
  add(slab(rect(3412, 3492, 300, 380), 0, 0.5), concrete)
  // stand markings: lead-in arcs and stop bars
  const leads: THREE.BufferGeometry[] = []
  for (const [name, s, n, code] of STANDS) {
    const hd = THREE.MathUtils.degToRad(HEADING[name] ?? 90)
    const len = code === 'C' ? 22 : 30
    const back: [number, number] = [s - Math.cos(hd) * len, n - Math.sin(hd) * len]
    leads.push(band(back, [s, n], 0.6, 0.52, 0.02).toNonIndexed())
    const ps = -Math.sin(hd), pn = Math.cos(hd)
    leads.push(band([s + ps * 3, n + pn * 3], [s - ps * 3, n - pn * 3], 0.8, 0.52, 0.02).toNonIndexed())
  }
  add(mergeGeometries(leads)!, yellow)

  // ---------------------------------------------------------------- buildings
  const glass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#3E5866'), roughness: 0.08, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2 })
  const roofMat = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', map: roofTexture(), roughness: 0.42, metalness: 0.3, clearcoat: 0.3, side: THREE.DoubleSide })
  const frameMat = new THREE.MeshStandardMaterial({ color: '#D9DDE0', roughness: 0.4, metalness: 0.6 })
  const groundUp = 0.5

  /** A curved metal roof over a footprint: arched along one axis, rising toward the land side. */
  function roof(s0: number, s1: number, n0: number, n1: number, eave: number, crown: number, rise: number, alongS = true) {
    const seg = 28, rows = 14
    const g = new THREE.PlaneGeometry(1, 1, seg, rows)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5
      const s = s0 + (s1 - s0) * u, n = n0 + (n1 - n0) * v
      const arch = alongS ? Math.sin(Math.PI * u) : Math.sin(Math.PI * v)
      const h = eave + (crown - eave) * arch + rise * v
      p.setXYZ(i, X(s), H(groundUp + h), Z(n))
    }
    g.computeVertexNormals()
    return g
  }
  /** Glass walls along a rectangle, with steel mullions every `step` metres. */
  function glassBox(s0: number, s1: number, n0: number, n1: number, h: number, step = 9) {
    const box = slab(rect(s0, s1, n0, n1), groundUp, h)
    const o = add(box, glass, true)
    o.castShadow = true
    const posts: THREE.BufferGeometry[] = []
    const post = (s: number, n: number) => posts.push(slab(rect(s - 0.4, s + 0.4, n - 0.4, n + 0.4), groundUp, h + 0.4).toNonIndexed())
    for (let s = s0; s <= s1 + 0.1; s += step) { post(s, n0); post(s, n1) }
    for (let n = n0 + step; n < n1; n += step) { post(s0, n); post(s1, n) }
    // a floor band two-thirds up the glass
    posts.push(slab(rect(s0 - 0.3, s1 + 0.3, n0 - 0.3, n0 + 0.3), groundUp + h * 0.5, 0.9).toNonIndexed(), slab(rect(s0 - 0.3, s1 + 0.3, n1 - 0.3, n1 + 0.3), groundUp + h * 0.5, 0.9).toNonIndexed())
    add(mergeGeometries(posts)!, frameMat, true)
  }

  // terminal hall (chart footprint 2124 to 2316 m along, 700 to 859 m across)
  glassBox(2124, 2316, 700, 859, 20)
  const hallRoof = add(roof(2112, 2328, 690, 905, 21, 27, 3), roofMat, true)
  hallRoof.castShadow = true
  // the landside canopy columns, holding the roof over the kerb
  const cols: THREE.BufferGeometry[] = []
  for (let s = 2124; s <= 2316; s += 24) cols.push(slab(rect(s - 0.8, s + 0.8, 895, 896.6), 0, 23.5).toNonIndexed())
  add(mergeGeometries(cols)!, frameMat, true)
  // the funnel and the pier to the south, with the same glass and a lower arched roof along the pier
  glassBox(2160, 2280, 640, 700, 14, 8)
  add(roof(2152, 2288, 636, 704, 15, 18, 1, false), roofMat, true)
  glassBox(2200, 2240, 528, 640, 12, 8)
  add(roof(2194, 2246, 524, 644, 13, 16.5, 0, true), roofMat, true)
  // the kerb road and the forecourt on the land side
  add(slab(rect(2060, 2380, 880, 920), 0, 0.4), asphalt)
  add(slab(rect(2090, 2350, 920, 1000), 0, 0.3), concrete)

  // boarding bridges: 7 in all (AAI), at the bridge parking marks on the chart, near the pier and the funnel
  const bridgeMat = new THREE.MeshStandardMaterial({ color: '#C9CED3', roughness: 0.45, metalness: 0.5 })
  const BRIDGES: [[number, number], [number, number]][] = [
    [[2200, 600], [2165, 566]], [[2200, 560], [2166, 530]],          // west side of the pier, toward stands 13 and 14
    [[2240, 600], [2270, 571]], [[2240, 630], [2269, 616]],          // east side, toward stands 20 and 21
    [[2160, 680], [2128, 662]], [[2280, 680], [2312, 676]],          // the funnel's corners, toward stands 12 and 22
    [[2140, 700], [2102, 660]],                                       // the hall's apron face, toward stand 12L
  ]
  for (const [a, b] of BRIDGES) {
    const ds = b[0] - a[0], dn = b[1] - a[1]
    const L = Math.hypot(ds, dn)
    const tunnel = mesh(new THREE.BoxGeometry(L * K, H(3.2), 3.4 * K), bridgeMat, true, true)
    tunnel.position.set((X(a[0]) + X(b[0])) / 2, H(groundUp + 5.2), (Z(a[1]) + Z(b[1])) / 2)
    tunnel.rotation.y = Math.atan2(-(Z(b[1]) - Z(a[1])), X(b[0]) - X(a[0]))
    air.add(tunnel)
    const leg = mesh(new THREE.BoxGeometry(1.2 * K, H(5), 1.2 * K), frameMat, true, true)
    leg.position.set(X(b[0] - ds * 0.12), H(groundUp + 2.5), Z(b[1] - dn * 0.12))
    air.add(leg)
    const cab = mesh(new THREE.BoxGeometry(4.5 * K, H(3.6), 4.5 * K), bridgeMat, true, true)
    cab.position.set(X(b[0]), H(groundUp + 5.2), Z(b[1]))
    air.add(cab)
  }

  // parked aircraft, for scale (not live traffic): at the stands with bridges and two remote ones
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#EEF0F1', roughness: 0.4, metalness: 0.05, envMapIntensity: 0.5 })
  const engMat = new THREE.MeshStandardMaterial({ color: '#9AA1A8', roughness: 0.4, metalness: 0.7 })
  const parkedAt: [string, number][] = [['13', 0], ['14', 0], ['20', 180], ['21', 180], ['12', 90], ['22', 90], ['16', 0], ['18', 180]]
  const geoC = airliner('C'), geoE = airliner('E')
  const byName = new Map(STANDS.map((x) => [x[0], x]))
  for (const [name, hdg] of parkedAt) {
    const st = byName.get(name)!
    const g = st[3] === 'C' ? geoC : geoE
    const plane = new THREE.Group()
    plane.add(mesh(g.body, bodyMat, true, false), mesh(g.engines, engMat, true, false))
    // nose at the stand's stop point, body behind it along the lead-in
    plane.position.set(X(st[1]), H(groundUp), Z(st[2]))
    plane.rotation.y = THREE.MathUtils.degToRad(hdg) + Math.PI
    air.add(plane)
  }

  // air traffic control tower (surveyed): a tapering shaft, the glass cab and its roof
  const towerH = 44
  const shaft = mesh(new THREE.CylinderGeometry(4.5 * K, 7 * K, H(towerH - 6), 20), frameMat); shaft.position.set(X(TOWER.s), H(groundUp + (towerH - 6) / 2), Z(TOWER.n)); air.add(shaft)
  const towerCab = mesh(new THREE.CylinderGeometry(9 * K, 7 * K, H(4.5), 16), glass); towerCab.position.set(X(TOWER.s), H(groundUp + towerH - 3.5), Z(TOWER.n)); air.add(towerCab)
  const towerRoof = mesh(new THREE.CylinderGeometry(6 * K, 10 * K, H(1.6), 16), roofMat); towerRoof.position.set(X(TOWER.s), H(groundUp + towerH), Z(TOWER.n)); air.add(towerRoof)
  add(slab(rect(1440, 1490, 760, 800), groundUp, 10), M.clay, true)
  // fuel farm (chart): bund and four tanks
  add(slab(rect(238, 436, 407, 556), 0, 0.4), concrete)
  for (const [s, n] of [[290, 445], [380, 445], [290, 515], [380, 515]] as [number, number][]) {
    const tank = mesh(new THREE.CylinderGeometry(22 * K, 22 * K, H(12), 28), new THREE.MeshStandardMaterial({ color: '#F1F1EE', roughness: 0.45, metalness: 0.3 }))
    tank.position.set(X(s), H(groundUp + 6), Z(n)); air.add(tank)
  }
  // fire stations (chart) with their red doors, and the radar (chart), whose antenna turns
  for (const r of [rect(530, 590, 370, 410), rect(2850, 2900, 410, 440)]) {
    add(slab(r, groundUp, 8), M.clay, true)
    add(slab([[r[0][0] + 4, r[0][1] - 0.6], [r[1][0] - 4, r[0][1] - 0.6], [r[1][0] - 4, r[0][1]], [r[0][0] + 4, r[0][1]]], groundUp, 5), new THREE.MeshStandardMaterial({ color: '#B23A2E', roughness: 0.6 }))
  }
  const radarBase = mesh(new THREE.CylinderGeometry(4 * K, 6 * K, H(16), 12), frameMat); radarBase.position.set(X(3525), H(groundUp + 8), Z(550)); air.add(radarBase)
  const antenna = mesh(new THREE.BoxGeometry(18 * K, H(3), 3 * K), M.white); antenna.position.set(X(3525), H(groundUp + 17.5), Z(550)); air.add(antenna)
  frames.push((t) => { antenna.rotation.y = t * 1.2 })
  const dvor = mesh(new THREE.CylinderGeometry(15 * K, 15 * K, H(3), 32), M.white); dvor.position.set(X(DVOR.s), H(groundUp + 1.5), Z(DVOR.n)); air.add(dvor)

  // ---------------------------------------------------------------- lights (AIP AD 2.14 and 2.15)
  const lampGeo = new THREE.SphereGeometry(0.9 * K, 6, 4)
  const lampWhite = new THREE.MeshStandardMaterial({ color: '#FFF6DE', emissive: '#FFE7A6', emissiveIntensity: 1.4 })
  const lampGreen = new THREE.MeshStandardMaterial({ color: '#9BFFB0', emissive: '#4CFF7A', emissiveIntensity: 1.4 })
  const lampRed = new THREE.MeshStandardMaterial({ color: '#FF9C9C', emissive: '#FF3B3B', emissiveIntensity: 1.4 })
  const lampBlue = new THREE.MeshStandardMaterial({ color: '#9CC2FF', emissive: '#3B7BFF', emissiveIntensity: 1.2 })
  const place = (pts: [number, number][], mat: THREE.Material, up = 0.9) => {
    const im = new THREE.InstancedMesh(lampGeo, mat, pts.length)
    const m4 = new THREE.Matrix4()
    pts.forEach(([s, n], i) => { m4.makeTranslation(X(s), H(up), Z(n)); im.setMatrixAt(i, m4) })
    air.add(im)
  }
  const edgeL: [number, number][] = [], centre: [number, number][] = []
  for (let s = 0; s <= RWY_LEN; s += 60) edgeL.push([s, -23.5], [s, 23.5])
  for (let s = 30; s < RWY_LEN; s += 30) centre.push([s, 0])
  place(edgeL, lampWhite); place(centre, lampWhite, 0.6)
  const ends10: [number, number][] = [], ends28: [number, number][] = []
  for (let n = -21; n <= 21; n += 3) { ends10.push([-1, n]); ends28.push([RWY_LEN + 1, n]) }
  place(ends10, lampGreen); place(ends28, lampRed)
  const blue: [number, number][] = []
  for (let s = A3; s <= A10; s += 60) blue.push([s, TWY_A_N - 12.5], [s, TWY_A_N + 12.5])
  place(blue, lampBlue)
  // approach lights on their own poles, standing on the real ground beyond each end
  const appr: [number, number][] = []
  for (let s = RWY_LEN + 60; s <= RWY_LEN + 900; s += 30) { appr.push([s, 0]); if ((s - RWY_LEN) % 300 < 30) for (let n = -15; n <= 15; n += 5) appr.push([s, n]) }
  for (let s = -60; s >= -420; s -= 30) { appr.push([s, 0]); if (Math.abs(s + 300) < 15) for (let n = -10; n <= 10; n += 5) appr.push([s, n]) }
  const poleGeo = new THREE.CylinderGeometry(0.35 * K, 0.35 * K, 1, 5)
  const poles = new THREE.InstancedMesh(poleGeo, frameMat, appr.length)
  const lights = new THREE.InstancedMesh(lampGeo, lampWhite, appr.length)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3()
  appr.forEach(([s, n], i) => {
    const g = H(groundAt(s, n)), top = Math.max(g + H(1.5), H(airElev(s) + 0.9))
    m4.compose(v.set(X(s), (g + top) / 2, Z(n)), q, sv.set(1, Math.max(0.0005, top - g), 1)); poles.setMatrixAt(i, m4)
    m4.makeTranslation(X(s), top, Z(n)); lights.setMatrixAt(i, m4)
  })
  root.add(poles, lights)

  // the boundary wall (chart), standing on the ground
  const wall: [number, number][] = [[-440, -200], [4440, -200], [4440, 980], [2700, 980], [2600, 900], [-440, 900]]
  const wallG: THREE.BufferGeometry[] = []
  for (let i = 0; i < wall.length; i++) {
    const a = wall[i], b = wall[(i + 1) % wall.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.ceil(L / 60)
    for (let j = 0; j < k; j++) {
      const p0: [number, number] = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]
      const p1: [number, number] = [a[0] + ((b[0] - a[0]) * (j + 1)) / k, a[1] + ((b[1] - a[1]) * (j + 1)) / k]
      const g = band(p0, p1, 1.2, 0, 3).toNonIndexed()
      const mid = (p0[0] + p1[0]) / 2
      g.translate(0, H(groundAt(mid, (p0[1] + p1[1]) / 2)) - 0.0005, 0)
      wallG.push(g)
    }
  }
  root.add(mesh(mergeGeometries(wallG)!, new THREE.MeshStandardMaterial({ color: '#B9B4AA', roughness: 0.95 }), true, true))

  // trees: where the satellite picture shows green canopy outside the fence, a low crown per spot
  function applyTrees() {
    const img = groundTex.image as HTMLImageElement | undefined
    if (!img || !img.width) return
    const c = document.createElement('canvas'), w = 390, h = 205
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const spots: [number, number, number][] = []
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2]
      // dark green canopy: green above red and blue, not bright (fields), not water
      if (!(gg > r + 8 && gg > b + 4 && gg < 120 && r < 90)) continue
      if (rnd() > 0.22) continue // a sample of the canopy: enough to read as tree cover, light enough for a phone
      const s = FS0 + ((x + rnd()) / w) * (FS1 - FS0), n = FN1 - ((y + rnd()) / h) * (FN1 - FN0)
      if (s > -480 && s < 4480 && n > -210 && n < 990) continue
      if (groundAt(s, n) < 2) continue
      spots.push([s, n, 7 + rnd() * 7])
    }
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#3E5B2C', roughness: 0.95 }), spots.length)
    const mm = new THREE.Matrix4()
    spots.forEach(([s, n, ht], i) => {
      const r = ht * 0.55
      mm.compose(v.set(X(s), H(groundAt(s, n) + ht * 0.7), Z(n)), q, sv.set(r * K, H(ht * 0.45), r * K))
      crowns.setMatrixAt(i, mm)
    })
    crowns.castShadow = true
    crowns.receiveShadow = true
    crowns.userData.noFit = true
    root.add(crowns)
  }

  // a north arrow: the runway runs 100.8 degrees from true north
  const north = new THREE.Group()
  const arrow = mesh(new THREE.ConeGeometry(0.07, 0.2, 3), M.ink); arrow.rotation.x = -Math.PI / 2; north.add(arrow)
  const nLetter = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), textPlate('N', P.dark ? '#EEE' : '#222', 110)); nLetter.rotation.x = -Math.PI / 2; nLetter.position.z = -0.19; north.add(nLetter)
  north.rotation.y = THREE.MathUtils.degToRad(100.8 - 90)
  north.position.set(X(FS0 + 350), H(groundAt(FS0 + 350, FN1 - 300)) + 0.12, Z(FN1 - 300)); root.add(north)

  // ---------------------------------------------------------------- one arrival on runway 28, exiting by A5
  const lander = new THREE.Group()
  lander.add(mesh(geoC.body, bodyMat, true, false), mesh(geoC.engines, engMat, true, false))
  air.add(lander)
  const exitPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X(A5_RWY + 120), 0, Z(0)), new THREE.Vector3(X(A5_RWY), 0, Z(0)),
    new THREE.Vector3(X(A5_RWY - 150), 0, Z(TWY_A_N * 0.5)), new THREE.Vector3(X(A5_RWY - 300), 0, Z(TWY_A_N)), new THREE.Vector3(X(A5_RWY - 420), 0, Z(TWY_A_N)),
  ])
  const startS = RWY_LEN + 1300
  frames.push((t) => {
    const c = (t / 30) % 1
    let x: number, y: number, z: number, yaw = 0
    if (c < 0.32) { // final approach on the 3 degree glide path (AIP: PAPI 3 degrees) to touchdown 400 m in
      const u = c / 0.32, s = startS - (startS - (RWY_LEN - 400)) * u
      const dist = Math.max(0, s - (RWY_LEN - 400))
      x = X(s); z = Z(0); y = H(groundUp + dist * Math.tan(THREE.MathUtils.degToRad(3)))
    } else if (c < 0.7) {
      const u = (c - 0.32) / 0.38, e = 1 - (1 - u) * (1 - u)
      const s = (RWY_LEN - 400) + (A5_RWY + 120 - (RWY_LEN - 400)) * e
      x = X(s); z = Z(0); y = H(groundUp)
    } else {
      const u = Math.min(1, (c - 0.7) / 0.25)
      const p = exitPath.getPointAt(u), tg = exitPath.getTangentAt(u)
      x = p.x; z = p.z; y = H(groundUp); yaw = Math.atan2(tg.z, -tg.x)
    }
    lander.position.set(x, y, z)
    lander.rotation.set(0, yaw, 0)
    lander.visible = c < 0.97
  })

  const atAir = (s: number, n: number, up: number) => ({ x: X(s), y: H(airElev(s) + 0.35 + up), z: Z(n) })
  const anchors = [
    { id: 'runway', ...atAir(700, -20, 2) },
    { id: 'terminal', ...atAir(2220, 820, 32) },
    { id: 'tower', ...atAir(TOWER.s, TOWER.n, 50) },
    { id: 'apron', ...atAir(2460, 470, 2) },
    { id: 'coast', x: X(6300), y: H(2), z: Z(-900) },
  ]

  floor.userData.noFit = true
  sea.userData.noFit = true
  lander.traverse((o) => { o.userData.noFit = true })
  // The camera frames the airfield, not the whole tile: the land runs on past the edges of the
  // picture, and the reader zooms out to the coast. The box spans the fence, the approach lights
  // and the tower's height.
  const whole = boundsOf(root)
  const box = new THREE.Box3(
    new THREE.Vector3(X(-700), H(30), Z(1150)),
    new THREE.Vector3(X(4700), H(110), Z(-450)),
  )
  if ((window as any).__bhogDebug) (window as any).__bhog = { box, whole, stage, root }
  const radius = whole.getSize(new THREE.Vector3()).length() / 2
  fitShadow(stage, radius * 0.62, whole.getCenter(new THREE.Vector3()))
  return {
    frame: (t, dt) => {
      const wide = stage.camera.aspect > 1.6
      const az = wide ? -0.22 : -0.55, el = wide ? 0.5 : params.compact ? 0.7 : 0.62
      fitObject(stage, box, az + Math.sin((t / 34) * Math.PI * 2) * 0.035, el)
      for (const f of frames) f(t, dt)
    },
    anchors: () => anchors,
  }
}

export default build
