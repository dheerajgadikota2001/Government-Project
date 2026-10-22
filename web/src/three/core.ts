import * as THREE from 'three'
import { settingsFor, wantAntialias, type Level } from './governor'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
export { THREE }

// One small engine for every model on the site: the big works, the four question cards,
// the city of works. Each model is a clean "model on a stand": real light, soft shadows,
// neutral clay colours (no party colours), and one accent colour that means "built".

export type Quality = 'high' | 'low'
export type Mode = 'inline' | 'explore'
export type { Level }

/** Kept for scenes that ask for a coarse quality: level 3 is "high", anything lower is "low". */
export const qualityOf = (level: Level): Quality => (level >= 3 ? 'high' : 'low')

/** How many device pixels to draw per CSS pixel. Small canvases get the screen's full sharpness up to
 *  the level's cap; large ones are held to the level's pixel budget so a phone never draws more than
 *  it can keep smooth. Explore allows more, because the point of exploring is to zoom in and read detail. */
export function pixelRatioFor(w: number, h: number, mode: Mode, level: Level) {
  const { budget, cap } = settingsFor(Math.max(1, level) as Level, mode)
  const dpr = window.devicePixelRatio || 1
  const byBudget = Math.sqrt(budget / Math.max(1, w * h))
  return Math.max(1, Math.min(dpr, cap, byBudget))
}

let webglOk: boolean | null = null
/** Test machines draw with software WebGL. They set this flag so the checks see the 3D view a phone shows, not the flat backup. */
const qaForce3d = () => { try { return localStorage.getItem('apfc-qa-3d') === '1' } catch { return false } }
export function canUseWebGL(): boolean {
  if (webglOk != null) return webglOk
  try {
    const c = document.createElement('canvas')
    const caveat = !qaForce3d()
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: caveat }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: caveat })
    webglOk = !!gl
    ;(gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { webglOk = false }
  return webglOk
}

/** Colours every model shares. Built parts are clay white; planned parts are ghosts; the accent marks the build line. */
export type Palette = ReturnType<typeof readPalette>
export function readPalette() {
  const cs = getComputedStyle(document.documentElement)
  const g = (k: string, f: string) => cs.getPropertyValue(k).trim() || f
  const dark = document.documentElement.classList.contains('dark')
  return {
    dark,
    accent: new THREE.Color(g('--chart-1', '#2563EB')),
    accent2: new THREE.Color(g('--chart-2', '#D2457F')),
    ink: new THREE.Color(dark ? '#E9E7E2' : '#26262B'),
    clay: new THREE.Color('#FBFAF8'),       // built: near-white model clay
    stone: new THREE.Color('#D5D4D1'),      // land: neutral stone, never sand-yellow
    stone2: new THREE.Color('#BAB9B5'),     // land low down, earthworks
    plinth: new THREE.Color(dark ? '#3A3B41' : '#2F3034'),   // a dark stand makes the model stand out
    plinthSide: new THREE.Color(dark ? '#2A2B30' : '#26272B'),
    water: new THREE.Color('#8CA3B1'),      // slate water, not a bright blue
    asphalt: new THREE.Color('#55565B'),
    steel: new THREE.Color('#B9BDC3'),
    rock: new THREE.Color('#A39E95'),
    wood: new THREE.Color('#EEECE8'),       // model trees: pale wood, never green
    ghost: new THREE.Color(dark ? '#C9CBD3' : '#5A5C66'),
  }
}

export type Stage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: THREE.DirectionalLight
  palette: Palette
  quality: Quality
  level: Level
  mode: Mode
  /** Move to another level without rebuilding the model: sharpness and shadows change in place. */
  setLevel: (level: Level) => void
  /** When the reader is turning the model by hand, scenes must not move the camera. */
  locked: boolean
  /** Where the scene last framed the camera: the point it looks at, and the model's bounds. */
  fitTarget: THREE.Vector3 | null
  fitBounds: THREE.Box3 | null
  /** Called every frame with seconds since start; return true to keep animating. */
  onFrame: Set<(t: number, dt: number) => void>
  resize: (w: number, h: number) => void
  render: () => void
  dispose: () => void
}

export function createStage(canvas: HTMLCanvasElement, startLevel: Level, mode: Mode = 'inline'): Stage {
  let level: Level = Math.max(1, startLevel) as Level
  // preserveDrawingBuffer stays off: keeping every frame costs memory bandwidth on phones. The still
  // picture is taken right after a render, in the same task, when the buffer is still intact.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: wantAntialias(level), alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  renderer.setPixelRatio(pixelRatioFor(canvas.clientWidth || 300, canvas.clientHeight || 300, mode, level))
  // Planes that cut a model are how the built share of a work grows and shrinks without rebuilding it.
  renderer.localClippingEnabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.42

  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 400)

  // A warm sun from the upper left, a cool sky fill, and a faint bounce from the ground.
  const hemi = new THREE.HemisphereLight(0xf3f4f6, 0xb3b0aa, 0.78)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfffdf9, 3.1)
  sun.position.set(-18, 26, 14)
  sun.castShadow = true
  const shadowSize = settingsFor(level, mode).shadow
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  sun.shadow.radius = level >= 3 ? 4 : 2
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80
  scene.add(sun)
  scene.add(sun.target)

  const palette = readPalette()
  const onFrame = new Set<(t: number, dt: number) => void>()

  let size = { w: canvas.clientWidth || 300, h: canvas.clientHeight || 300 }
  const resize = (w: number, h: number) => {
    size = { w, h }
    renderer.setPixelRatio(pixelRatioFor(w, h, mode, level))
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    renderer.shadowMap.needsUpdate = true
  }
  // At level 1 the shadow is redrawn every eighth frame instead of every frame. The models move
  // slowly, so a shadow a quarter of a second old is invisible, and the shadow pass is the second
  // most expensive thing a phone draws after the pixels themselves.
  let frameNo = 0
  const render = () => {
    if (level < 2) renderer.shadowMap.needsUpdate = frameNo++ % 8 === 0
    renderer.render(scene, camera)
  }
  const setLevel = (to: Level) => {
    const next = Math.max(1, to) as Level
    if (next === level) return
    level = next
    stage.level = level
    stage.quality = qualityOf(level)
    const s = settingsFor(level, mode)
    if (sun.shadow.mapSize.x !== s.shadow) {
      sun.shadow.mapSize.set(s.shadow, s.shadow)
      sun.shadow.map?.dispose()
      sun.shadow.map = null   // three makes a new map of the new size on the next render
    }
    sun.shadow.radius = level >= 3 ? 4 : 2
    renderer.shadowMap.autoUpdate = s.shadowEveryFrame
    renderer.shadowMap.needsUpdate = true
    resize(size.w, size.h)
  }
  renderer.shadowMap.autoUpdate = settingsFor(level, mode).shadowEveryFrame
  const dispose = () => {
    onFrame.clear()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(disposeMaterial)
      else if (mat) disposeMaterial(mat)
    })
    envTex.dispose()
    scene.environment?.dispose()
    pmrem.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  const stage: Stage = { renderer, scene, camera, sun, palette, quality: qualityOf(level), level, mode, setLevel, locked: false, fitTarget: null, fitBounds: null, onFrame, resize, render, dispose }
  return stage
}

function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
  m.dispose()
}

/** Point the sun's shadow box at a model of the given radius, so shadows stay sharp at every size. */
export function fitShadow(stage: Stage, radius: number, center = new THREE.Vector3()) {
  const sc = stage.sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius
  sc.updateProjectionMatrix()
  stage.sun.target.position.copy(center)
  stage.sun.position.copy(center).add(new THREE.Vector3(-0.62, 0.95, 0.5).multiplyScalar(radius * 2.4))
  sc.far = radius * 6
}

/** A floor that only shows the soft shadow, so the model seems to stand on the page itself. */
export function shadowFloor(size: number, opacity = 0.18) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity, transparent: true }))
  m.rotation.x = -Math.PI / 2
  m.receiveShadow = true
  m.userData.noFit = true
  return m
}

/** Light a realistic model from a real sky: the sun's position sets the colour of the light and of
 *  every reflection (water, steel, glass). The sky itself is not drawn; the page stays the backdrop. */
export async function useSky(stage: Stage, elevationDeg = 38, azimuthDeg = 215) {
  const { Sky } = await import('three/addons/objects/Sky.js')
  // the model may have been put away while the sky module loaded
  if (stage.renderer.getContext().isContextLost()) return null
  const sky = new Sky()
  sky.scale.setScalar(1000)
  const u = sky.material.uniforms
  u.turbidity.value = 6
  u.rayleigh.value = 0.9
  u.mieCoefficient.value = 0.004
  u.mieDirectionalG.value = 0.82
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg), theta = THREE.MathUtils.degToRad(azimuthDeg)
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
  u.sunPosition.value.copy(sunDir)
  const tmp = new THREE.Scene()
  tmp.add(sky)
  const pmrem = new THREE.PMREMGenerator(stage.renderer)
  let env: THREE.Texture
  try { env = pmrem.fromScene(tmp as unknown as THREE.Scene, 0).texture } catch { pmrem.dispose(); return null } finally { /* nothing */ }
  pmrem.dispose()
  sky.geometry.dispose(); sky.material.dispose()
  const old = stage.scene.environment
  stage.scene.environment = env
  stage.scene.environmentIntensity = 0.2
  old?.dispose()
  return sunDir
}
