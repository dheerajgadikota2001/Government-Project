import * as THREE from 'three'
import { fbm } from './kit'

// Surface detail drawn once on canvases: no image files to download, and sharp up close.
// Each texture tiles seamlessly (the noise is sampled on a torus), so a small canvas can cover a
// large surface many times without a visible seam. Made once per page and shared by every model.

const cache = new Map<string, THREE.CanvasTexture>()

function tileable(N: number, f: (u: number, v: number) => number) {
  // sample noise on a torus so the left edge meets the right and the top meets the bottom
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = (x / N) * Math.PI * 2, b = (y / N) * Math.PI * 2
    h[y * N + x] = f(Math.cos(a) + Math.cos(b) * 0.37, Math.sin(a) + Math.sin(b) * 0.37 + Math.cos(b) * 0.61)
  }
  return h
}

/** A normal map from tileable noise: `rough` for rock, `fine` for concrete, `ground` for soil. */
export function normalTex(kind: 'rock' | 'fine' | 'ground', repeat = 1) {
  const key = 'n-' + kind
  let tex = cache.get(key)
  if (!tex) {
    const N = 512
    const cfg = { rock: { s: 3.2, o: 5, k: 2.4, seed: 31 }, fine: { s: 7, o: 3, k: 1.6, seed: 47 }, ground: { s: 6, o: 4, k: 1.8, seed: 59 } }[kind]
    const h = tileable(N, (u, v) => fbm(u * cfg.s + 11, v * cfg.s + 3, cfg.seed, cfg.o))
    const cv = document.createElement('canvas'); cv.width = cv.height = N
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(N, N)
    const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * cfg.k, dy = (at(x, y + 1) - at(x, y - 1)) * cfg.k
      const l = Math.hypot(dx, dy, 1)
      const i = (y * N + x) * 4
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255; img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    cache.set(key, tex)
  }
  const t = tex.clone()
  t.needsUpdate = true
  t.repeat.set(repeat, repeat)
  return t
}

/** Concrete or rock colour with gentle blotches, so large surfaces are not flat paint. */
export function colorTex(base: string, spread = 0.07, repeat = 1, seed = 5) {
  const key = `c-${base}-${spread}-${seed}`
  let tex = cache.get(key)
  if (!tex) {
    const N = 256
    const h = tileable(N, (u, v) => fbm(u * 5 + seed, v * 5, seed, 4))
    const cv = document.createElement('canvas'); cv.width = cv.height = N
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(N, N)
    // the canvas holds sRGB values: read the colour back in sRGB, or every surface comes out too dark
    const c = { r: 0, g: 0, b: 0 }
    new THREE.Color(base).getRGB(c, THREE.SRGBColorSpace)
    for (let i = 0; i < N * N; i++) {
      const k = 1 + (h[i] - 0.5) * spread * 2
      img.data[i * 4] = Math.min(255, c.r * 255 * k); img.data[i * 4 + 1] = Math.min(255, c.g * 255 * k); img.data[i * 4 + 2] = Math.min(255, c.b * 255 * k); img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    cache.set(key, tex)
  }
  const t = tex.clone()
  t.needsUpdate = true
  t.repeat.set(repeat, repeat)
  return t
}
