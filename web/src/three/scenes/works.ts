import * as THREE from 'three'
import type { Builder } from '../View3D'
import { fbm, ghost, mats, mesh, plinth, rbox, trees, vehicleGeo, waterMaterial, rand, mergeGeometries } from '../kit'
import { fitBox, terrainBlock } from './common'
import { shadowFloor } from '../core'

// One model maker for every kind of big work. Line works (road, rail, canal, metro, power line,
// pipeline) follow one route across the stand; site works (port, airport, capital city, steel plant,
// offshore gas field) are laid out on their own ground. In every model the solid part is the share
// of work the latest paper prints, and the ghost part is still to build. With no share printed,
// the whole work is a ghost: the plan, not a claim of progress.

export type WorkKind = 'road' | 'rail' | 'canal' | 'metro' | 'power' | 'pipeline' | 'port' | 'airport' | 'city' | 'steel' | 'gas'
export type WorksParams = { kind: WorkKind; pct: number | null; compact?: boolean; seed?: number }

const W = 12, D = 7
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

const build: Builder<WorksParams> = (stage, params) => {
  const { scene, palette: P } = stage
  const M = mats(P)
  const root = new THREE.Group()
  scene.add(root)
  stage.camera.fov = 27
  const seed = params.seed ?? 3
  const share = params.pct == null ? 0 : Math.max(0, Math.min(1, params.pct / 100))
  const planned = params.pct == null
  const frames: ((t: number) => void)[] = []
  const anchors: { id: string; x: number; y: number; z: number }[] = []

  root.add(plinth(W + 0.5, D + 0.5, M))
  const floor = shadowFloor(60, P.dark ? 0.35 : 0.15); floor.position.y = -0.6; root.add(floor)

  const isLine = ['road', 'rail', 'canal', 'metro', 'power', 'pipeline'].includes(params.kind)
  const coastal = ['port', 'gas'].includes(params.kind)

  // ---------------------------------------------------------------- the route for line works
  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W / 2 - 0.2, 0, 1.7), new THREE.Vector3(-3.0, 0, -0.2), new THREE.Vector3(0.2, 0, 1.0),
    new THREE.Vector3(3.2, 0, -0.6), new THREE.Vector3(W / 2 + 0.2, 0, -1.6),
  ])
  const samples = route.getSpacedPoints(400)
  const distToRoute = (x: number, z: number) => {
    let best = Infinity
    for (let i = 0; i < samples.length; i += 2) { const dx = samples[i].x - x, dz = samples[i].z - z; const d = dx * dx + dz * dz; if (d < best) best = d }
    return Math.sqrt(best)
  }
  const grade = 0.34 // the level the route is built at
  const baseHeight = (x: number, z: number) => {
    let y = 0.22 + fbm(x * 0.32 + seed, z * 0.32, seed) * 0.9 + smooth(2.0, 3.4, Math.abs(z + (x * 0.05))) * 0.5
    if (coastal) y = Math.max(0.02, y * smooth(-0.6, 1.4, -x) + (x < 0 ? 0.1 : 0)) // the sea side drops away to the right
    return y
  }
  const ground = (x: number, z: number) => {
    const y = baseHeight(x, z)
    if (!isLine || params.kind === 'metro' || params.kind === 'power') return y
    const d = distToRoute(x, z)
    const k = smooth(0.55, 1.25, d) // cut and fill: the land meets the route's level near it
    return grade * (1 - k) + y * k
  }
  root.add(terrainBlock(W, D, 150, ground, P.stone, P.stone2, new THREE.Color('#A8A39A'), 0.18))

  // a ribbon that follows the route between two shares of its length
  const ribbon = (from: number, to: number, width: number, y: number, offset = 0) => {
    const n = Math.max(2, Math.round((to - from) * 260))
    const pos: number[] = [], idx: number[] = []
    for (let i = 0; i <= n; i++) {
      const u = from + (to - from) * (i / n)
      const p = route.getPointAt(Math.min(1, u)), t = route.getTangentAt(Math.min(1, u))
      const nx = -t.z, nz = t.x
      const l = new THREE.Vector3(p.x + nx * (offset - width / 2), y, p.z + nz * (offset - width / 2))
      const r = new THREE.Vector3(p.x + nx * (offset + width / 2), y, p.z + nz * (offset + width / 2))
      pos.push(l.x, l.y, l.z, r.x, r.y, r.z)
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  const slab = (from: number, to: number, width: number, y: number, thick: number) => {
    // a ribbon with thickness, so built parts throw shadows and read as solid
    const top = ribbon(from, to, width, y)
    const n = top.attributes.position.count / 2
    const pos = Array.from(top.attributes.position.array as Float32Array)
    const base = pos.length / 3
    for (let i = 0; i < base; i++) pos.push(pos[i * 3], pos[i * 3 + 1] - thick, pos[i * 3 + 2])
    const idx = Array.from(top.index!.array as Uint16Array | Uint32Array)
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 2
      idx.push(a, b, base + a, b, base + b, base + a) // left side
      idx.push(a + 1, base + a + 1, b + 1, b + 1, base + a + 1, base + b + 1) // right side
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  const along = (u: number, side = 0, y = grade) => {
    const p = route.getPointAt(u), t = route.getTangentAt(u)
    return new THREE.Vector3(p.x - t.z * side, y, p.z + t.x * side)
  }
  const headingAt = (u: number) => { const t = route.getTangentAt(u); return Math.atan2(-t.z, t.x) }

  // ---------------------------------------------------------------- line works
  if (params.kind === 'road') {
    if (share > 0) {
      root.add(mesh(slab(0, share, 1.05, grade + 0.05, 0.08), M.asphalt))
      // centre line and edge lines, dashed in the middle
      const dash = new THREE.BoxGeometry(0.16, 0.012, 0.025)
      const n = Math.floor(share * 70)
      const marks = new THREE.InstancedMesh(dash, M.white, n)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / 70
        const p = along(u, 0, grade + 0.057)
        m4.makeRotationY(headingAt(u)); m4.setPosition(p); marks.setMatrixAt(i, m4)
      }
      root.add(marks)
      for (const side of [-0.47, 0.47]) root.add(mesh(ribbon(0, share, 0.025, grade + 0.056, side), M.white, false, false))
    }
    if (share < 1) root.add(ghost(slab(share, 1, 1.05, grade + 0.05, 0.08), P))
    const carGeo = vehicleGeo(0.24, 0.12, 0.08)
    const cars = [0, 1, 2, 3].map((i) => { const c = mesh(carGeo, i % 2 ? M.white : M.ink); root.add(c); return c })
    frames.push((t) => cars.forEach((c, i) => {
      if (share < 0.05) { c.visible = false; return }
      const dir = i % 2 ? -1 : 1
      let u = ((t * 0.035 + i * 0.27) % 1) * share
      if (dir < 0) u = share - u
      u = Math.min(share - 0.001, Math.max(0.001, u))
      c.position.copy(along(u, dir * 0.22, grade + 0.12))
      c.rotation.y = headingAt(u) + (dir < 0 ? Math.PI : 0)
    }))
    anchors.push({ id: 'built', ...along(Math.max(0.02, share * 0.5), 0, grade + 0.4) }, { id: 'todo', ...along(Math.min(0.98, share + (1 - share) / 2), 0, grade + 0.4) })
  }

  if (params.kind === 'rail' || params.kind === 'pipeline') {
    if (params.kind === 'rail') {
      if (share > 0) {
        root.add(mesh(slab(0, share, 0.8, grade + 0.06, 0.1), new THREE.MeshStandardMaterial({ color: new THREE.Color('#8C8981'), roughness: 1 })))
        const n = Math.floor(share * 150)
        const sleeper = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.03, 0.46), M.wood, n)
        const m4 = new THREE.Matrix4()
        for (let i = 0; i < n; i++) { const u = (i + 0.5) / 150; m4.makeRotationY(headingAt(u)); m4.setPosition(along(u, 0, grade + 0.075)); sleeper.setMatrixAt(i, m4) }
        sleeper.castShadow = true
        root.add(sleeper)
        for (const side of [-0.15, 0.15]) root.add(mesh(ribbon(0, share, 0.035, grade + 0.115, side), M.steel, false, true))
      }
      if (share < 1) root.add(ghost(slab(share, 1, 0.8, grade + 0.06, 0.1), P))
      const wagon = rbox(0.42, 0.18, 0.2, 0.04)
      const train = [0, 1, 2, 3].map((i) => { const c = mesh(wagon, i === 0 ? M.accent : M.white); root.add(c); return c })
      frames.push((t) => train.forEach((c, i) => {
        const span = share
        if (span < 0.12) { c.visible = i === 0; const u = Math.max(0.005, share - 0.004); c.position.copy(along(u, 0, grade + 0.22)); c.rotation.y = headingAt(u); return }
        const head = 0.03 + ((Math.sin(t * 0.18) * 0.5 + 0.5) * (span - 0.08))
        const u = Math.max(0.002, head - i * 0.018)
        c.position.copy(along(u, 0, grade + 0.22)); c.rotation.y = headingAt(u)
      }))
    } else {
      if (share > 0) {
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(route.getSpacedPoints(120).filter((_, i) => i / 120 <= share).map((p) => new THREE.Vector3(p.x, grade + 0.14, p.z))), 120, 0.07, 10, false)
        root.add(mesh(tube, M.steel))
      }
      if (share < 1) {
        const pts = route.getSpacedPoints(120).filter((_, i) => i / 120 >= share).map((p) => new THREE.Vector3(p.x, grade + 0.14, p.z))
        if (pts.length > 1) root.add(ghost(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 8, false), P))
      }
    }
    anchors.push({ id: 'built', ...along(Math.max(0.02, share * 0.5), 0, grade + 0.4) }, { id: 'todo', ...along(Math.min(0.98, share + (1 - share) / 2), 0, grade + 0.4) })
  }

  if (params.kind === 'canal') {
    const water = waterMaterial(P, 8)
    if (share > 0) {
      // a lined channel: a concrete bed, two low walls, and water flowing in it
      root.add(mesh(slab(0, share, 0.9, grade + 0.02, 0.05), M.clay))
      for (const side of [-0.48, 0.48]) root.add(mesh(ribbon(0, share, 0.12, grade + 0.2, side), M.clay))
      const wr = mesh(ribbon(0, share, 0.86, grade + 0.15), water, false, true)
      root.add(wr)
      frames.push((t) => water.normalMap!.offset.set(-t * 0.04, 0))
    }
    if (share < 1) root.add(ghost(slab(share, 1, 0.98, grade + 0.2, 0.18), P))
    // the lift: a pump house where the canal starts
    const ph = mesh(rbox(0.9, 0.5, 0.6, 0.05), M.clay); ph.position.copy(along(0.03, 0.9, grade + 0.25)); root.add(ph)
    anchors.push({ id: 'built', ...along(Math.max(0.02, share * 0.5), 0, grade + 0.4) }, { id: 'todo', ...along(Math.min(0.98, share + (1 - share) / 2), 0, grade + 0.4) })
  }

  if (params.kind === 'metro') {
    const deckY = 1.35
    const pierGeo = mergeGeometries([rbox(0.12, deckY, 0.12, 0.03), (() => { const g = rbox(0.62, 0.12, 0.18, 0.03); g.translate(0, deckY / 2 - 0.02, 0); return g })()])!
    const pierN = 16
    for (let i = 0; i <= pierN; i++) {
      const u = i / pierN
      const p = along(u, 0, 0)
      const y0 = ground(p.x, p.z)
      const g = pierGeo.clone(); g.translate(0, deckY / 2, 0)
      const obj = u <= share ? mesh(g, M.clay) : ghost(g, P)
      obj.position.set(p.x, y0, p.z); obj.rotation.y = headingAt(u)
      root.add(obj)
    }
    const deckYAbs = (u: number) => { const p = along(u); return ground(p.x, p.z) + deckY + 0.06 }
    const avgDeck = deckYAbs(0.5)
    if (share > 0) root.add(mesh(slab(0, share, 0.55, avgDeck + 0.08, 0.14), M.clay))
    if (share < 1) root.add(ghost(slab(share, 1, 0.55, avgDeck + 0.08, 0.14), P))
    for (const su of [0.3, 0.72]) {
      const st = rbox(1.0, 0.28, 0.75, 0.05)
      const o = su <= share ? mesh(st, M.clay) : ghost(st, P)
      o.position.copy(along(su, 0, avgDeck + 0.3)); o.rotation.y = headingAt(su)
      root.add(o)
    }
    // the city it runs through: low clay blocks, kept clear of the line
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.clay, 70)
    const m4 = new THREE.Matrix4()
    let k = 0
    for (let i = 0; k < 70 && i < 600; i++) {
      const x = (rand(i, seed) - 0.5) * (W - 0.8), z = (rand(i, seed + 4) - 0.5) * (D - 0.8)
      if (distToRoute(x, z) < 0.9) continue
      const h = 0.25 + rand(i, seed + 9) * 0.9, s = 0.35 + rand(i, seed + 2) * 0.35
      m4.compose(new THREE.Vector3(x, ground(x, z) + h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(i, 7) * 0.3, 0)), new THREE.Vector3(s, h, s))
      blocks.setMatrixAt(k++, m4)
    }
    blocks.count = k
    blocks.castShadow = blocks.receiveShadow = true
    root.add(blocks)
    if (share > 0.08) {
      const car = rbox(0.5, 0.2, 0.26, 0.06)
      const train = [0, 1, 2].map((i) => { const c = mesh(car, i === 0 ? M.accent : M.white); root.add(c); return c })
      frames.push((t) => train.forEach((c, i) => {
        const head = 0.04 + (Math.sin(t * 0.16) * 0.5 + 0.5) * (share - 0.1)
        const u = Math.max(0.003, head - i * 0.024)
        c.position.copy(along(u, 0, avgDeck + 0.26)); c.rotation.y = headingAt(u)
      }))
    }
    anchors.push({ id: 'built', ...along(Math.max(0.02, share * 0.5), 0, avgDeck + 0.6) }, { id: 'todo', ...along(Math.min(0.98, share + (1 - share) / 2), 0, avgDeck + 0.6) })
  }

  if (params.kind === 'power') {
    const towerGeo = (() => {
      const legs = new THREE.CylinderGeometry(0.03, 0.16, 1.7, 4, 1, true); legs.translate(0, 0.85, 0)
      const arm1 = new THREE.BoxGeometry(0.9, 0.035, 0.05); arm1.translate(0, 1.45, 0)
      const arm2 = new THREE.BoxGeometry(0.62, 0.035, 0.05); arm2.translate(0, 1.2, 0)
      const top = new THREE.ConeGeometry(0.05, 0.25, 4); top.translate(0, 1.82, 0)
      return mergeGeometries([legs.toNonIndexed(), arm1.toNonIndexed(), arm2.toNonIndexed(), top.toNonIndexed()])!
    })()
    const N = 9
    const tops: THREE.Vector3[][] = []
    for (let i = 0; i <= N; i++) {
      const u = 0.06 + (i / N) * 0.92
      const p = along(u, 0, 0)
      const y0 = ground(p.x, p.z)
      const built = u <= share + 1e-6
      const o = built ? mesh(towerGeo, M.steel) : ghost(towerGeo, P)
      o.position.set(p.x, y0, p.z); o.rotation.y = headingAt(u) + Math.PI / 2
      root.add(o)
      const tg = route.getTangentAt(u)
      tops.push([-0.42, 0, 0.42].map((off) => new THREE.Vector3(p.x - tg.z * off, y0 + 1.43, p.z + tg.x * off)))
      ;(o as THREE.Object3D).userData.built = built
    }
    const wireMat = new THREE.MeshStandardMaterial({ color: P.ink, roughness: 0.6 })
    for (let i = 0; i < N; i++) {
      const u = 0.06 + ((i + 1) / N) * 0.92
      if (u > share + 1e-6) break
      for (let c = 0; c < 3; c++) {
        const a = tops[i][c], b = tops[i + 1][c]
        const mid = a.clone().lerp(b, 0.5); mid.y -= 0.22
        root.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.008, 4, false), wireMat, false, false))
      }
    }
    // the solar fields the line will carry power from
    const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3B4250'), roughness: 0.25, metalness: 0.4 }), 120)
    const m4 = new THREE.Matrix4(); let k = 0
    for (let r = 0; r < 8; r++) for (let c = 0; c < 15; c++) {
      const x = -W / 2 + 0.6 + c * 0.58, z = -D / 2 + 0.6 + r * 0.4
      if (distToRoute(x, z) < 0.6) continue
      m4.compose(new THREE.Vector3(x, ground(x, z) + 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), new THREE.Vector3(1, 1, 1))
      panel.setMatrixAt(k++, m4)
    }
    panel.count = k; panel.castShadow = true
    root.add(panel)
    anchors.push({ id: 'built', ...along(Math.max(0.06, share * 0.5), 0, 2.2) }, { id: 'todo', ...along(Math.min(0.96, share + (1 - share) / 2), 0, 2.2) })
  }

  // the work front: where the built part ends today, marked with a small accent flag
  if (isLine && share > 0 && share < 1) {
    const p = along(share, 0.62, 0)
    const y0 = ground(p.x, p.z)
    const pole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), M.ink); pole.position.set(p.x, y0 + 0.55, p.z)
    const flag = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.012), M.accent); flag.position.set(p.x + 0.17, y0 + 0.98, p.z)
    root.add(pole, flag)
    frames.push((t) => { flag.rotation.y = Math.sin(t * 1.6) * 0.25 })
  }

  // ---------------------------------------------------------------- site works
  const site = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const o = planned ? ghost(geo, P, 1.7) : mesh(geo, mat)
    o.position.set(x, y, z); o.rotation.y = ry
    root.add(o)
    return o
  }

  if (coastal) {
    const sea = waterMaterial(P, 5)
    const s = new THREE.Mesh(new THREE.BoxGeometry(W * 0.52, 0.32, D), sea)
    s.position.set(W * 0.24, 0.16, 0)
    s.receiveShadow = true
    root.add(s)
    frames.push((t) => sea.normalMap!.offset.set(t * 0.01, t * 0.006))
  }

  if (params.kind === 'port') {
    // two breakwater arms enclosing the harbour, a quay with cranes, and a ship at berth
    const arm = (pts: THREE.Vector3[]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.22, 8, false)
    site(arm([new THREE.Vector3(0.4, 0.3, -2.9), new THREE.Vector3(2.6, 0.3, -2.4), new THREE.Vector3(4.4, 0.3, -0.8)]), M.rock, 0, 0, 0)
    site(arm([new THREE.Vector3(0.4, 0.3, 2.9), new THREE.Vector3(2.4, 0.3, 2.5), new THREE.Vector3(3.6, 0.3, 1.2)]), M.rock, 0, 0, 0)
    const quay = rbox(0.9, 0.42, 4.2, 0.04)
    site(quay, M.clay, 0.75, 0.2, 0)
    const crane = (() => {
      const legs = mergeGeometries([0, 1, 2, 3].map((i) => { const g = new THREE.BoxGeometry(0.05, 1.1, 0.05); g.translate(i < 2 ? -0.2 : 0.2, 0.55, i % 2 ? -0.18 : 0.18); return g.toNonIndexed() }))!
      const boom = new THREE.BoxGeometry(1.6, 0.06, 0.08); boom.translate(0.45, 1.15, 0)
      const cab = new THREE.BoxGeometry(0.22, 0.14, 0.4); cab.translate(0, 1.05, 0)
      return mergeGeometries([legs, boom.toNonIndexed(), cab.toNonIndexed()])!
    })()
    for (const z of [-1.3, 0, 1.3]) site(crane, M.steel, 1.0, 0.41, z)
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.14), M.clay, 60)
    const m4 = new THREE.Matrix4(); let k = 0
    for (let i = 0; i < 60; i++) { m4.setPosition(-1.4 + (i % 6) * 0.38, 0.45 + Math.floor(i / 30) * 0.15, -1.6 + Math.floor((i % 30) / 6) * 0.7); boxes.setMatrixAt(k++, m4) }
    boxes.castShadow = true
    if (!planned) root.add(boxes)
    const ship = mergeGeometries([rbox(3.0, 0.3, 0.6, 0.12).toNonIndexed(), (() => { const g = rbox(0.6, 0.4, 0.5, 0.05); g.translate(-1.1, 0.33, 0); return g.toNonIndexed() })()])!
    const shipObj = site(ship, M.white, 2.0, 0.36, 0.2, Math.PI / 2 + 0.05)
    frames.push((t) => { shipObj.position.y = 0.36 + Math.sin(t * 0.8) * 0.012 })
    anchors.push({ id: 'built', x: 0.8, y: 1.8, z: 0 }, { id: 'todo', x: 3.4, y: 0.8, z: -2.2 })
  }

  if (params.kind === 'gas') {
    // an offshore platform far out, a pipeline on the sea bed, and the terminal on land
    const deck = mergeGeometries([
      rbox(1.3, 0.16, 1.0, 0.04).toNonIndexed(),
      ...[0, 1, 2, 3].map((i) => { const g = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8); g.translate(i < 2 ? -0.5 : 0.5, -0.6, i % 2 ? -0.38 : 0.38); return g.toNonIndexed() }),
      (() => { const g = new THREE.BoxGeometry(0.5, 0.5, 0.5); g.translate(-0.25, 0.33, 0); return g.toNonIndexed() })(),
      (() => { const g = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6); g.translate(0.45, 0.6, 0.3); return g.toNonIndexed() })(),
    ])!
    site(deck, M.white, 4.4, 1.0, -1.6)
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#F2A65A') }))
    flame.position.set(4.85, 2.18, -1.3)
    if (!planned) root.add(flame)
    frames.push((t) => flame.scale.setScalar(0.85 + Math.sin(t * 7) * 0.15))
    const line = new THREE.CatmullRomCurve3([new THREE.Vector3(4.4, 0.1, -1.6), new THREE.Vector3(2.2, 0.08, -0.6), new THREE.Vector3(0.2, 0.3, 0.2), new THREE.Vector3(-2.6, 0.5, 0.6)])
    const pts = line.getSpacedPoints(100)
    const builtPts = pts.filter((_, i) => i / 100 <= share)
    if (builtPts.length > 1) root.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(builtPts), 80, 0.06, 8, false), M.steel))
    const restPts = pts.filter((_, i) => i / 100 >= share)
    if (restPts.length > 1) root.add(ghost(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(restPts), 40, 0.06, 8, false), P))
    for (const [x, z] of [[-3.4, 0.2], [-3.4, 1.2], [-2.5, 1.5]]) site(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 24), M.clay, x, ground(x, z) + 0.25, z)
    anchors.push({ id: 'built', x: 4.4, y: 2.0, z: -1.6 }, { id: 'todo', x: 0.2, y: 0.9, z: 0.2 })
  }

  if (params.kind === 'airport') {
    const runway = new THREE.BoxGeometry(9.6, 0.06, 0.9)
    site(runway, M.asphalt, 0, grade + 0.03, 1.3, -0.08)
    // runway markings
    if (!planned) {
      const mk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.012, 0.05), M.white, 18)
      const m4 = new THREE.Matrix4()
      for (let i = 0; i < 18; i++) { m4.makeRotationY(-0.08); m4.setPosition(-4.25 + i * 0.5, grade + 0.067, 1.3 + (-4.25 + i * 0.5) * 0.08); mk.setMatrixAt(i, m4) }
      root.add(mk)
    }
    site(new THREE.BoxGeometry(6.0, 0.05, 0.35), M.asphalt, 0.3, grade + 0.03, 0.2, -0.08)
    // the terminal: a long low hall under a gently curved roof
    site(new THREE.BoxGeometry(5.2, 0.04, 1.4), M.asphalt, 0.4, grade + 0.02, -0.55, -0.08)
    const hall = rbox(3.6, 0.5, 1.2, 0.08)
    site(hall, new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#DDE3E8'), roughness: 0.15, metalness: 0.1, clearcoat: 1 }), 0.6, grade + 0.25, -1.3, -0.08)
    const roof = new THREE.CylinderGeometry(2.4, 2.4, 3.8, 32, 1, false, -0.42, 0.84)
    roof.rotateZ(Math.PI / 2); roof.scale(1, 0.32, 0.55); roof.translate(0, -0.18, 0)
    site(roof, M.white, 0.6, grade + 0.55, -1.3, -0.08)
    const tower = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.16, 1.4, 12).toNonIndexed(), (() => { const g = new THREE.CylinderGeometry(0.3, 0.22, 0.25, 12); g.translate(0, 0.8, 0); return g.toNonIndexed() })()])!
    site(tower, M.clay, -3.2, grade + 0.7, -1.4)
    // an aircraft rolling for take-off along the runway
    const plane = mergeGeometries([
      (() => { const g = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10); g.rotateZ(Math.PI / 2); return g.toNonIndexed() })(),
      (() => { const g = new THREE.BoxGeometry(0.22, 0.02, 1.0); g.translate(0.05, 0, 0); return g.toNonIndexed() })(),
      (() => { const g = new THREE.BoxGeometry(0.12, 0.25, 0.02); g.translate(-0.45, 0.12, 0); return g.toNonIndexed() })(),
    ])!
    if (!planned) {
      const pl = mesh(plane, M.white)
      root.add(pl)
      frames.push((t) => {
        const c = (t * 0.07) % 1
        const x = -4.2 + c * 8.4
        const lift = Math.max(0, c - 0.65) * 3.0
        pl.position.set(x, grade + 0.14 + lift * 0.9, 1.3 + x * 0.08)
        pl.rotation.set(0, -0.08, lift * 0.25)
      })
    }
    anchors.push({ id: 'built', x: 0.6, y: 1.5, z: -1.1 }, { id: 'todo', x: 2, y: 1, z: 1.3 })
  }

  if (params.kind === 'city') {
    // a grid of avenues; the government complex at the centre with its towers
    for (let i = -2; i <= 2; i++) {
      site(new THREE.BoxGeometry(W - 1, 0.02, 0.16), M.asphalt, 0, 0.42, i * 1.3)
      site(new THREE.BoxGeometry(0.16, 0.02, D - 1), M.asphalt, i * 2.2, 0.42, 0)
    }
    const towers: [number, number, number][] = [[-1.2, -0.9, 2.6], [-0.4, -0.9, 2.6], [0.4, -0.9, 2.6], [1.2, -0.9, 2.6], [2.0, -0.9, 2.1]]
    for (const [x, z, h] of towers) site(rbox(0.5, h, 0.5, 0.05), M.clay, x, 0.42 + h / 2, z)
    const assembly = mergeGeometries([rbox(1.6, 0.5, 1.6, 0.06).toNonIndexed(), (() => { const g = new THREE.CylinderGeometry(0.06, 0.2, 1.9, 4); g.translate(0, 1.2, 0); return g.toNonIndexed() })()])!
    site(assembly, M.white, 0.2, 0.67, 1.4)
    const blocks = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < 26; i++) {
      const x = (rand(i, seed) - 0.5) * (W - 1.5), z = (rand(i, seed + 5) - 0.5) * (D - 1.5)
      if (Math.abs(x) < 2.6 && Math.abs(z) < 2.3) continue
      const h = 0.3 + rand(i, 9) * 0.8
      const g = blocks.clone(); g.scale(0.7, h, 0.6)
      site(g, M.clay, x, 0.42 + h / 2, z)
    }
    anchors.push({ id: 'built', x: 0.2, y: 3.4, z: -0.9 }, { id: 'todo', x: 0.2, y: 2.4, z: 1.4 })
  }

  if (params.kind === 'steel') {
    const furnace = mergeGeometries([
      new THREE.CylinderGeometry(0.42, 0.55, 1.8, 20).toNonIndexed(),
      (() => { const g = new THREE.ConeGeometry(0.42, 0.5, 20); g.translate(0, 1.15, 0); return g.toNonIndexed() })(),
    ])!
    site(furnace, M.steel, -0.8, 0.4 + 0.9, -0.6)
    for (let i = 0; i < 3; i++) site(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 18), M.clay, 0.4 + i * 0.7, 0.4 + 0.8, -1.4)
    site(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 14), M.clay, 2.9, 0.4 + 1.6, -1.6)
    const conveyor = new THREE.BoxGeometry(3.4, 0.12, 0.22); conveyor.rotateZ(0.32)
    site(conveyor, M.steel, -2.6, 1.1, 0.4)
    for (let i = 0; i < 3; i++) site(rbox(2.6, 0.7, 0.9, 0.05), M.clay, 1.4, 0.4 + 0.35, 0.6 + i * 1.05)
    anchors.push({ id: 'built', x: -0.8, y: 2.8, z: -0.6 }, { id: 'todo', x: 1.4, y: 1.5, z: 1.6 })
  }

  // trees where nothing is built
  const tp: [number, number, number][] = []
  for (let i = 0; tp.length < 34 && i < 500; i++) {
    const x = (rand(i, seed + 21) - 0.5) * (W - 0.7), z = (rand(i, seed + 22) - 0.5) * (D - 0.7)
    if (isLine && distToRoute(x, z) < 1.2) continue
    if (!isLine && Math.abs(x) < 4.6 && Math.abs(z) < 2.6) continue
    if (coastal && x > -0.4) continue
    tp.push([x, ground(x, z), z])
  }
  root.add(trees(tp, M, 0.8))

  const center = new THREE.Vector3(0, 0.6, 0)
  const az = -0.5, el = params.compact ? 0.68 : 0.6
  return {
    frame: (t) => {
      fitBox(stage, center, W + 0.6, 1.4, D + 0.6, az + Math.sin((t / 24) * Math.PI * 2) * 0.07, el, params.compact ? 1.0 : 1.02)
      for (const f of frames) f(t)
    },
    anchors: () => anchors,
  }
}

export default build
