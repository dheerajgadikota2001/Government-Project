import * as THREE from 'three'
import type { Builder } from '../View3D'
import { fbm, ghost, mats, mesh, plinth, rbox, vehicleGeo, waterMaterial, rand } from '../kit'
import { boundsOf, fitObject } from './common'
import { shadowFloor, useSky } from '../core'
import { colorTex, normalTex } from '../textures'

// Polavaram as a detailed model on a stand: the Godavari valley with real-looking soil, rock and
// scrub; the reservoir behind the dam, reflecting the sky; the concrete spillway with its piers,
// radial gates, hoist bridge and stilling basin; and the earth-and-rock dam across the river.
// The solid part of the dam shows the share of work the paper prints; the faint part is still to
// build, and the cut faces at the build line take the accent colour. It is a picture of a share,
// not a map of which parts are done, and it is not to scale; the labels say so.
// Colours stay earthy on purpose: soil, rock, dry grass and dull olive scrub, never a party's colours.

export type DamParams = { pct: number | null; compact?: boolean }

const W = 12, D = 8

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const riverX = (z: number) => 1.9 + Math.sin(z * 0.85 + 0.6) * 0.7

function ground(x: number, z: number) {
  const ax = Math.abs(x)
  const hills = smooth(3.7, 6.2, ax) * (1.75 + fbm(x * 0.35, z * 0.35, 4) * 0.7)
  const floor = 0.16 + fbm(x * 0.6 + 7, z * 0.6, 9) * 0.1
  let y = floor + hills
  if (z > 0.55) {
    const dx = Math.abs(x - riverX(z))
    y -= (1 - smooth(0.55, 1.05, dx)) * 0.32 * smooth(0.55, 1.2, z)
  }
  if (z < -0.7) y -= smooth(-0.7, -1.6, z) * 0.14 * (1 - smooth(3.4, 5, ax))
  return y
}

// Earth colours for the land, chosen by height, slope and a little noise.
const SILT = new THREE.Color('#B9AC92'), SOIL = new THREE.Color('#A2957A'), DRY = new THREE.Color('#ADA27A')
const SCRUB = new THREE.Color('#717556'), ROCK = new THREE.Color('#8C877D'), STRATA = [new THREE.Color('#8F7F68'), new THREE.Color('#9C8C73'), new THREE.Color('#857560')]

function land(w: number, d: number, seg: number) {
  const nx = seg, nz = Math.round(seg * d / w)
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = []
  const c = new THREE.Color()
  const h = (x: number, z: number) => Math.max(0.02, ground(x, z))
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (i / nx) * w, z = -d / 2 + (j / nz) * d, y = h(x, z)
    pos.push(x, y, z); uv.push(i / nx * (w / 0.9), j / nz * (d / 0.9))
    const e = 0.05
    const slope = Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e)
    const n = fbm(x * 1.7 + 3, z * 1.7, 21, 3)
    c.copy(y < 0.3 ? SILT : SOIL)
    if (y > 0.5) c.lerp(DRY, smooth(0.5, 1.2, y) * 0.8)
    if (y > 0.9 && n > 0.48) c.lerp(SCRUB, smooth(0.48, 0.62, n) * 0.85)   // patches of scrub on the hills
    c.lerp(ROCK, smooth(0.9, 1.6, slope) * 0.75)                              // bare rock on steep faces
    const k = 0.94 + (fbm(x * 6, z * 6, 5, 2) - 0.5) * 0.12
    col.push(c.r * k, c.g * k, c.b * k)
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, e2 = a + nx + 1, f = e2 + 1
    idx.push(a, e2, b, b, e2, f)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const group = new THREE.Group()
  group.add(mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, normalMap: normalTex('ground', 1), normalScale: new THREE.Vector2(0.35, 0.35) }), false, true))
  // the cut faces of the model: layers of earth, as in a real section through the valley
  const side = (pts: [number, number][]) => {
    const p: number[] = [], cc: number[] = [], ii: number[] = []
    const layers = 7
    pts.forEach(([x, z], k) => {
      const top = h(x, z)
      for (let L = 0; L <= layers; L++) {
        const y = (L / layers) * top
        p.push(x, y, z)
        const s = STRATA[(L + Math.round(fbm(x * 0.8, z * 0.8, 2, 2) * 2)) % 3]
        const dk = 0.82 + 0.18 * (L / layers)
        cc.push(s.r * dk, s.g * dk, s.b * dk)
      }
      if (k > 0) for (let L = 0; L < layers; L++) {
        const a = (k - 1) * (layers + 1) + L, b = a + 1, a2 = k * (layers + 1) + L, b2 = a2 + 1
        ii.push(a, a2, b, b, a2, b2)
      }
    })
    const g2 = new THREE.BufferGeometry()
    g2.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g2.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3))
    g2.setIndex(ii)
    g2.computeVertexNormals()
    return mesh(g2, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, flatShading: true }), false, true)
  }
  const N = 120
  const line = (ax: number, az: number, bx: number, bz: number) => Array.from({ length: N + 1 }, (_, k) => [ax + (bx - ax) * k / N, az + (bz - az) * k / N] as [number, number])
  group.add(side(line(-w / 2, d / 2, w / 2, d / 2)), side(line(w / 2, -d / 2, -w / 2, -d / 2)), side(line(-w / 2, -d / 2, -w / 2, d / 2)), side(line(w / 2, d / 2, w / 2, -d / 2)))
  return group
}

/** Trees as a model maker builds them for a realistic scene: a trunk and two or three leafy blobs,
 *  each tree a slightly different dull olive, never a bright green. */
function realTrees(points: [number, number, number][]) {
  const trunkG = new THREE.CylinderGeometry(0.018, 0.026, 0.2, 6); trunkG.translate(0, 0.1, 0)
  const blobG = new THREE.IcosahedronGeometry(0.13, 1)
  const trunkM = new THREE.MeshStandardMaterial({ color: '#6A5A47', roughness: 0.95 })
  const leafM = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9, flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, points.length)
  const blobs = new THREE.InstancedMesh(blobG, leafM, points.length * 3)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color()
  const tones = ['#5F6648', '#68704F', '#74785A', '#596145'].map((x) => new THREE.Color(x))
  points.forEach(([x, y, z], i) => {
    const k = 0.75 + rand(i, 3) * 0.6
    m.compose(p.set(x, y, z), q, s.set(k, k, k)); trunks.setMatrixAt(i, m)
    for (let b = 0; b < 3; b++) {
      const r = (0.55 + rand(i * 3 + b, 7) * 0.5) * k
      p.set(x + (rand(i + b, 11) - 0.5) * 0.12 * k, y + (0.24 + b * 0.07) * k, z + (rand(i - b, 13) - 0.5) * 0.12 * k)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(i * 7 + b, 17) * 6.28)
      m.compose(p, q, s.set(r, r * (0.85 + rand(b, i) * 0.3), r)); blobs.setMatrixAt(i * 3 + b, m)
      c.copy(tones[(i + b) % tones.length]).multiplyScalar(0.92 + rand(i, b + 1) * 0.16)
      blobs.setColorAt(i * 3 + b, c)
    }
    q.identity()
  })
  trunks.castShadow = blobs.castShadow = true
  blobs.receiveShadow = true
  const g = new THREE.Group(); g.add(trunks, blobs)
  return g
}

const build: Builder<DamParams> = (stage, first) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  void useSky(stage, 40, 220)
  stage.sun.color.set('#FFF2DF')

  root.add(plinth(W + 0.5, D + 0.5, M))
  root.add(land(W, D, 180))
  const floor = shadowFloor(40, P.dark ? 0.35 : 0.16); floor.position.y = -0.6; root.add(floor)

  // Water: the reservoir held behind the dam, and the river leaving through the spillway channel.
  const resMat = waterMaterial(P, 4)
  resMat.color.set('#4F6B70'); resMat.opacity = 0.9
  const riverMat = waterMaterial(P, 6)
  riverMat.color.set('#5D7A7C')
  const res = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.96, D / 2 - 0.95), resMat)
  res.position.set(0, 0.5, (-D / 2 + -0.95) / 2); res.receiveShadow = true
  root.add(res)
  const river = new THREE.Mesh(new THREE.PlaneGeometry(2.2, D / 2 + 0.1, 1, 30), riverMat)
  river.rotation.x = -Math.PI / 2
  const rp = river.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < rp.count; i++) { const z = -rp.getY(i) + D / 4; rp.setX(i, rp.getX(i) + riverX(z)) }
  river.position.set(0, 0.07, D / 4)
  river.receiveShadow = true
  root.add(river)

  // ---- materials with texture, so surfaces stay crisp when the reader zooms in
  const concrete = new THREE.MeshStandardMaterial({ map: colorTex('#CFCAC0', 0.06, 3, 7), normalMap: normalTex('fine', 4), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.82 })
  const concreteDark = new THREE.MeshStandardMaterial({ map: colorTex('#B4AEA3', 0.07, 3, 9), normalMap: normalTex('fine', 4), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.88 })
  const steel = new THREE.MeshStandardMaterial({ color: '#8E969E', roughness: 0.4, metalness: 0.65 })
  const rail = new THREE.MeshStandardMaterial({ color: '#E8E6E1', roughness: 0.5 })

  // ---- the dam line runs across the valley at z = DZ
  const DZ = -0.55
  const xL = -5.3, xR = 4.6, spill0 = 0.7
  const total = xR - xL
  const sw = xR - spill0

  // Spillway: ogee crest block, piers with rounded noses, radial gates, a hoist bridge and a road
  // deck, then the chute between training walls and a stilling basin at its foot.
  const spill = new THREE.Group()
  const crest = mesh(rbox(sw, 1.05, 1.25, 0.05), concrete)
  crest.position.set(spill0 + sw / 2, 0.52, DZ); spill.add(crest)
  const piers = 24
  const bay = (sw - 0.16) / piers
  const gateGeo = new THREE.CylinderGeometry(0.55, 0.55, bay - 0.05, 18, 1, true, Math.PI * 0.4, Math.PI * 0.2)
  gateGeo.rotateZ(Math.PI / 2)
  for (let i = 0; i <= piers; i++) {
    const px = spill0 + 0.08 + i * bay
    const pier = mesh(rbox(0.07, 1.48, 1.6, 0.025), concrete); pier.position.set(px, 0.74, DZ + 0.06); spill.add(pier)
    const nose = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.48, 10), concrete); nose.position.set(px, 0.74, DZ - 0.74); spill.add(nose)
    if (i < piers) {
      const gate = mesh(gateGeo, steel); gate.position.set(px + bay / 2, 0.62, DZ + 0.1); spill.add(gate)
      const arm = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.45), steel); arm.position.set(px + bay / 2, 0.95, DZ + 0.05); arm.rotation.x = -0.5; spill.add(arm)
    }
  }
  const deck = mesh(rbox(sw + 0.1, 0.07, 0.42, 0.02), concrete); deck.position.set(spill0 + sw / 2, 1.5, DZ + 0.18); spill.add(deck)
  const hoist = mesh(rbox(sw + 0.1, 0.06, 0.18, 0.02), concreteDark); hoist.position.set(spill0 + sw / 2, 1.72, DZ - 0.32); spill.add(hoist)
  for (let i = 0; i <= piers; i += 2) { const post = mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), concreteDark); post.position.set(spill0 + 0.08 + i * bay, 1.6, DZ - 0.32); spill.add(post) }
  for (const zz of [DZ + 0.02, DZ + 0.38]) { const r = mesh(new THREE.BoxGeometry(sw + 0.1, 0.02, 0.012), rail); r.position.set(spill0 + sw / 2, 1.6, zz); spill.add(r) }
  const chuteLen = 1.9
  const chute = mesh(new THREE.BoxGeometry(sw - 0.3, 0.07, chuteLen), concrete)
  chute.position.set(spill0 + sw / 2, 0.5, DZ + 0.62 + chuteLen / 2 - 0.15); chute.rotation.x = 0.42; spill.add(chute)
  for (const sx of [spill0 + 0.1, xR - 0.1]) {
    const wall = mesh(rbox(0.08, 0.5, chuteLen + 0.2, 0.02), concreteDark)
    wall.position.copy(chute.position).setX(sx).setY(0.62); wall.rotation.x = 0.42; spill.add(wall)
  }
  const basin = mesh(new THREE.BoxGeometry(sw - 0.2, 0.06, 0.7), concreteDark); basin.position.set(spill0 + sw / 2, 0.08, DZ + 2.35); spill.add(basin)
  for (let i = 0; i < 9; i++) { const block = mesh(rbox(0.12, 0.09, 0.12, 0.02), concrete); block.position.set(spill0 + 0.4 + i * (sw - 0.8) / 8, 0.15, DZ + 2.3); spill.add(block) }
  root.add(spill)
  const spillGhost = (() => { const g = new THREE.BoxGeometry(sw, 1.5, 1.6); g.translate(spill0 + sw / 2, 0.75, DZ); return ghost(g, P) })()
  root.add(spillGhost)

  // Earth-and-rock dam: a trapezoid swept along the dam line, rock-faced, with a road on its crest.
  const ecrfShape = new THREE.Shape()
  ecrfShape.moveTo(-1.65, 0); ecrfShape.lineTo(1.75, 0); ecrfShape.lineTo(0.24, 1.5); ecrfShape.lineTo(-0.24, 1.5); ecrfShape.lineTo(-1.65, 0)
  const ecrfGeo = (x0: number, x1: number) => {
    const g = new THREE.ExtrudeGeometry(ecrfShape, { depth: x1 - x0, bevelEnabled: false, steps: Math.max(2, Math.round((x1 - x0) * 10)) })
    g.rotateY(Math.PI / 2)
    g.translate(x0, 0, DZ)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.05 && y < 1.45) p.setY(i, y + (fbm(p.getX(i) * 3, p.getZ(i) * 3, 2) - 0.5) * 0.05) }
    // world-space uvs so the rock texture keeps its size along the whole dam
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 1.6, (p.getY(i) + p.getZ(i)) * 1.6)
    g.computeVertexNormals()
    return g
  }

  // The build line is two planes that cut the dam: solid on either side, faint in the gap between.
  const gapC = -2.3
  const pA = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), pB = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
  const pC = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), pD = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
  const built = { clippingPlanes: [pA, pB], clipIntersection: true, clipShadows: true }
  const rockFill = new THREE.MeshStandardMaterial({ map: colorTex('#9A9488', 0.12, 1, 13), normalMap: normalTex('rock', 1), normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.96, ...built })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#3E3F43', roughness: 0.9, ...built })
  const parapet = new THREE.MeshStandardMaterial({ map: colorTex('#CFCAC0', 0.06, 3, 7), roughness: 0.85, ...built })
  const lines = new THREE.MeshStandardMaterial({ color: '#EDEBE6', roughness: 0.6, ...built })
  root.add(mesh(ecrfGeo(xL, spill0), rockFill))
  const crestRoad = mesh(new THREE.BoxGeometry(spill0 - xL, 0.035, 0.42), asphalt); crestRoad.position.set((xL + spill0) / 2, 1.52, DZ - 0.02); root.add(crestRoad)
  const wallUp = mesh(new THREE.BoxGeometry(spill0 - xL, 0.07, 0.04), parapet); wallUp.position.set((xL + spill0) / 2, 1.57, DZ - 0.24); root.add(wallUp)
  for (const zz of [DZ - 0.17, DZ + 0.13]) { const l = mesh(new THREE.BoxGeometry(spill0 - xL, 0.004, 0.012), lines, false); l.position.set((xL + spill0) / 2, 1.54, zz); root.add(l) }
  const ecrfGhost = ghost(ecrfGeo(xL, spill0), P, 1.3)
  ecrfGhost.traverse((o) => { const mt = (o as THREE.Mesh).material as THREE.Material | undefined; if (mt) mt.clippingPlanes = [pC, pD] })
  root.add(ecrfGhost)
  const caps = [1, -1].map((dir) => {
    const cap = mesh(new THREE.ShapeGeometry(ecrfShape), M.accent, false, false)
    cap.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    if (dir < 0) cap.scale.x = -1
    root.add(cap)
    return cap
  })

  // A tower crane at the gap (grey and white, as the model never borrows a party colour) and
  // dumpers running along the finished crest.
  const crane = new THREE.Group()
  const mast = mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09), steel); mast.position.y = 1.3
  const jib = new THREE.Group(); jib.position.y = 2.55
  const arm = mesh(new THREE.BoxGeometry(2.2, 0.07, 0.07), steel); arm.position.x = 0.75
  const counter = mesh(rbox(0.32, 0.16, 0.16, 0.03), concreteDark); counter.position.x = -0.4
  const cab = mesh(rbox(0.16, 0.14, 0.14, 0.03), M.accent); cab.position.set(0.08, -0.08, 0)
  const hook = mesh(new THREE.BoxGeometry(0.012, 0.9, 0.012), M.ink); hook.position.set(1.5, -0.45, 0)
  jib.add(arm, counter, cab, hook)
  crane.add(mast, jib)
  root.add(crane)
  const truckGeo = vehicleGeo(0.3, 0.14, 0.1)
  const trucks = [0, 1].map((i) => { const t = mesh(truckGeo, i ? M.white : steel); t.position.set(0, 1.58, DZ + (i ? 0.09 : -0.09)); root.add(t); return t })

  // Trees on both hills.
  const pts: [number, number, number][] = []
  for (let i = 0; pts.length < 90 && i < 900; i++) {
    const x = (rand(i, 3) - 0.5) * W * 0.96, z = (rand(i, 9) - 0.5) * D * 0.94
    const y = ground(x, z)
    if (Math.abs(x) > 4.4 && y > 1.0 && Math.abs(z - DZ) > 1.3 && fbm(x * 1.7 + 3, z * 1.7, 21, 3) > 0.42) pts.push([x, y, z])
  }
  root.add(realTrees(pts))

  // The power house on the left bank below the dam, with its penstocks from the reservoir.
  const ph = mesh(rbox(1.0, 0.42, 0.62, 0.05), concrete); ph.position.set(-4.35, ground(-4.35, 1.3) + 0.18, 1.3); root.add(ph)
  const phr = mesh(rbox(1.05, 0.06, 0.68, 0.02), concreteDark); phr.position.copy(ph.position).setY(ph.position.y + 0.24); root.add(phr)
  for (let i = 0; i < 4; i++) {
    const pen = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 12), steel)
    pen.rotation.x = Math.PI / 2 - 0.42; pen.position.set(-4.7 + i * 0.22, 0.95, 0.3); root.add(pen)
  }

  // ---- the share built, gliding when a new reading arrives
  let target = first.pct == null ? null : Math.max(0, Math.min(100, first.pct)) / 100
  let share = target ?? 0
  let g0 = 0, g1 = 0
  const applyShare = () => {
    const plan = target == null && share < 0.002
    const gapW = plan ? total + 2 : (1 - share) * total
    g0 = Math.max(xL - 1, gapC - gapW / 2); g1 = Math.min(spill0 + 1, gapC + gapW / 2)
    if (plan) { g0 = xL - 1; g1 = spill0 + 1 }
    pA.constant = g0; pB.constant = -g1
    pC.constant = -g0; pD.constant = g1
    const open = g1 - g0 > 0.01
    caps[0].visible = open && g0 > xL + 0.01; caps[0].position.set(g0 + 0.004, 0, DZ)
    caps[1].visible = open && g1 < spill0 - 0.01; caps[1].position.set(g1 - 0.004, 0, DZ)
    spill.visible = !plan
    spillGhost.visible = plan
    crane.visible = !plan && share < 0.999
    crane.position.set(Math.min(spill0 - 0.3, g1 + 0.35), 0, DZ + 1.15)
  }
  applyShare()

  const bounds = boundsOf(root)
  const az = -0.55, el = first.compact ? 0.66 : 0.6
  return {
    frame: (t, dt) => {
      const goal = target ?? 0
      share = dt > 0 ? share + (goal - share) * (1 - Math.exp(-dt * 2.6)) : goal
      if (Math.abs(goal - share) < 0.0005) share = goal
      applyShare()
      fitObject(stage, bounds, az + Math.sin(t / 24 * Math.PI * 2) * 0.08, el, { x: 0.05, top: 0.1, bottom: 0.06 })
      resMat.normalMap!.offset.set(t * 0.006, t * 0.004)
      riverMat.normalMap!.offset.set(0, -t * 0.05)
      jib.rotation.y = Math.sin(t * 0.25) * 0.6 + 0.4
      trucks.forEach((tr, i) => {
        const span = Math.max(0.2, spill0 - 0.25 - (g1 + 0.25))
        const u = (Math.sin(t * 0.32 + i * Math.PI) * 0.5 + 0.5)
        tr.position.x = g1 + 0.25 + u * span
        tr.visible = g1 < spill0 - 0.5
        tr.rotation.y = Math.cos(t * 0.32 + i * Math.PI) > 0 ? 0 : Math.PI
      })
    },
    anchors: () => [
      { id: 'spill', x: spill0 + sw / 2, y: 1.8, z: DZ },
      { id: 'ecrf', x: (Math.max(g1, xL) + spill0) / 2, y: 1.62, z: DZ },
      { id: 'gap', x: (Math.max(g0, xL) + Math.min(g1, spill0)) / 2, y: 1.7, z: DZ },
      { id: 'river', x: -1.5, y: 1.0, z: -2.8 },
      { id: 'res', x: 0.6, y: 1.05, z: -2.5 },
      { id: 'power', x: ph.position.x, y: ph.position.y + 0.3, z: ph.position.z },
    ],
    update: (next) => {
      const p = next as DamParams
      target = p.pct == null ? null : Math.max(0, Math.min(100, p.pct)) / 100
    },
  }
}

export default build
