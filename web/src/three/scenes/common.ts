import * as THREE from 'three'
import type { Stage } from '../core'
import { mesh } from '../kit'

/**
 * A slice of land as an architect's model shows it: a shaped top and four cut faces,
 * the cut faces shaded like the layers of the earth. `h` gives the height at (x, z).
 */
export function terrainBlock(w: number, d: number, seg: number, h0: (x: number, z: number) => number, top: THREE.Color, low: THREE.Color, cut: THREE.Color, terrace = 0) {
  // Terraces turn the land into the stacked layers of a contour model: the look of a crafted object, and
  // it reads height at a glance. Each layer rises over a short ramp, so the steps stay crisp but not jagged.
  const h = terrace > 0 ? (x: number, z: number) => {
    const y = h0(x, z), k = Math.floor(y / terrace), f = y / terrace - k
    return terrace * (k + Math.min(1, Math.max(0, (f - 0.72) / 0.28)))
  } : h0
  const nx = seg, nz = Math.max(2, Math.round(seg * d / w))
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  const c = new THREE.Color()
  const heights: number[] = []
  let hmin = Infinity, hmax = -Infinity
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (i / nx) * w, z = -d / 2 + (j / nz) * d
    const y = Math.max(0.02, h(x, z))
    heights.push(y); hmin = Math.min(hmin, y); hmax = Math.max(hmax, y)
  }
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (i / nx) * w, z = -d / 2 + (j / nz) * d, y = heights[j * (nx + 1) + i]
    pos.push(x, y, z)
    const t = hmax > hmin ? (y - hmin) / (hmax - hmin) : 1
    c.copy(low).lerp(top, Math.pow(t, 0.6)); col.push(c.r, c.g, c.b)
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, e = a + nx + 1, f = e + 1
    idx.push(a, e, b, b, e, f)
  }
  const topGeo = new THREE.BufferGeometry()
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  topGeo.setIndex(idx)
  topGeo.computeVertexNormals()
  // steep faces of each layer a shade darker: the cheap stand-in for ambient occlusion
  const nrm = topGeo.attributes.normal as THREE.BufferAttribute, colA = topGeo.attributes.color as THREE.BufferAttribute
  for (let i = 0; i < nrm.count; i++) {
    const k = 0.84 + 0.16 * Math.pow(Math.max(0, nrm.getY(i)), 2)
    colA.setXYZ(i, colA.getX(i) * k, colA.getY(i) * k, colA.getZ(i) * k)
  }
  const group = new THREE.Group()
  group.add(mesh(topGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }), false, true))

  // The four cut faces: a strip from the base up to the surface along each edge, with faint strata.
  const side = (pts: [number, number][]) => {
    const p: number[] = [], cc: number[] = [], ii: number[] = []
    pts.forEach(([x, z], k) => {
      const y = Math.max(0.02, h(x, z))
      p.push(x, 0, z, x, y, z)
      const dark = cut.clone().multiplyScalar(0.86)
      cc.push(dark.r, dark.g, dark.b, cut.r, cut.g, cut.b)
      if (k > 0) { const a = (k - 1) * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3))
    g.setIndex(ii)
    g.computeVertexNormals()
    return mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), false, true)
  }
  const N = 80
  const line = (ax: number, az: number, bx: number, bz: number) => Array.from({ length: N + 1 }, (_, k) => [ax + (bx - ax) * k / N, az + (bz - az) * k / N] as [number, number])
  group.add(side(line(-w / 2, d / 2, w / 2, d / 2)), side(line(w / 2, -d / 2, -w / 2, -d / 2)), side(line(-w / 2, -d / 2, -w / 2, d / 2)), side(line(w / 2, d / 2, w / 2, -d / 2)))
  return group
}

/** A body of water cut like the land: a surface plus translucent cut faces where the model ends. */
export function waterBlock(x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, yBottom = 0.02) {
  const geo = new THREE.BoxGeometry(x1 - x0, y - yBottom, z1 - z0)
  geo.translate((x0 + x1) / 2, (y + yBottom) / 2, (z0 + z1) / 2)
  const m = new THREE.Mesh(geo, mat)
  m.receiveShadow = true
  return m
}

/** Place the camera so a sphere of `radius` fits whatever the canvas shape, from a given angle. */
export function frameCamera(stage: Stage, center: THREE.Vector3, radius: number, azimuth: number, elevation: number, margin = 1.06) {
  const cam = stage.camera
  const vfov = THREE.MathUtils.degToRad(cam.fov)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect)
  const dist = (radius * margin) / Math.sin(Math.min(vfov, hfov) / 2)
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
  cam.position.copy(center).addScaledVector(dir, dist)
  cam.lookAt(center)
  cam.updateProjectionMatrix()
  return dist
}

/** A slow, small sway of the viewpoint, so the model feels alive without ever spinning away from the reader. */
export function swayer(stage: Stage, center: THREE.Vector3, radius: number, az: number, el: number, amp = 0.1, period = 22) {
  let lastAspect = -1
  return (t: number) => {
    const a = az + Math.sin((t / period) * Math.PI * 2) * amp
    if (stage.camera.aspect !== lastAspect || amp > 0) { frameCamera(stage, center, radius, a, el); lastAspect = stage.camera.aspect }
  }
}

/** Place the camera so a box of the given size fills the canvas from a given angle (width-limited or height-limited). */
export function fitBox(stage: Stage, center: THREE.Vector3, width: number, height: number, depth: number, azimuth: number, elevation: number, margin = 1.08) {
  if (stage.locked) return
  stage.fitTarget = center.clone()
  const cam = stage.camera
  const vfov = THREE.MathUtils.degToRad(cam.fov)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect)
  // the box as seen from this angle: its width grows a little with depth when turned
  const seenW = width * Math.cos(azimuth) + depth * Math.abs(Math.sin(azimuth))
  const seenH = height * Math.cos(elevation) + depth * Math.sin(elevation)
  const dist = Math.max((seenW * margin) / 2 / Math.tan(hfov / 2), (seenH * margin) / 2 / Math.tan(vfov / 2)) + depth / 2
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
  cam.position.copy(center).addScaledVector(dir, dist)
  cam.lookAt(center)
  cam.updateProjectionMatrix()
}

/** The model's real bounds: every mesh, but not the floor that only catches its shadow. */
export function boundsOf(root: THREE.Object3D) {
  const box = new THREE.Box3(), part = new THREE.Box3()
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.noFit || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)
    box.union(part)
  })
  return box
}

export type Margins = { x: number; top: number; bottom: number }
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3())
const _p = new THREE.Vector3(), _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3()

/**
 * Frame the camera so the whole model fits the canvas, whatever its shape, with a margin on every side.
 * It projects the eight corners of the model's box and searches for the nearest distance at which all
 * of them sit inside the margins, then centres the result. So a model never touches or crosses the
 * edge of its card, on a narrow phone or a wide screen. Margins are in parts of the half-frame.
 */
export function fitObject(stage: Stage, box: THREE.Box3, azimuth: number, elevation: number, m: Margins = { x: 0.07, top: 0.12, bottom: 0.07 }) {
  stage.fitBounds = box
  if (stage.locked) return
  const cam = stage.camera
  const min = box.min, max = box.max
  let k = 0
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) _corners[k++].set(x, y, z)
  const target = box.getCenter(new THREE.Vector3())
  _dir.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
  const size = box.getSize(_p).length() || 1
  const place = (d: number) => {
    cam.position.copy(target).addScaledVector(_dir, d)
    cam.lookAt(target)
    cam.updateMatrixWorld(true)
  }
  const extent = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false
    for (const c of _corners) {
      _p.copy(c).project(cam)
      if (_p.z > 1) behind = true
      x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y)
    }
    return { x0, x1, y0, y1, behind }
  }
  const fits = (e: ReturnType<typeof extent>) => !e.behind && e.x0 >= -1 + m.x && e.x1 <= 1 - m.x && e.y0 >= -1 + m.bottom && e.y1 <= 1 - m.top
  cam.updateProjectionMatrix()
  let d = size
  for (let pass = 0; pass < 2; pass++) {
    let lo = size * 0.2, hi = size * 30
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; place(mid); if (fits(extent())) hi = mid; else lo = mid }
    d = hi
    place(d)
    if (pass === 0) {
      // centre what the reader sees inside the margins, then fit again from there
      const e = extent()
      const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2 - (m.top - m.bottom) / 2
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * d, halfW = halfH * cam.aspect
      _right.setFromMatrixColumn(cam.matrixWorld, 0); _up.setFromMatrixColumn(cam.matrixWorld, 1)
      target.addScaledVector(_right, cx * halfW).addScaledVector(_up, cy * halfH)
    }
  }
  stage.fitTarget = target
  return d
}
