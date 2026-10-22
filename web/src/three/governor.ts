// How hard each phone is allowed to work on the 3D models, decided by measuring, not guessing.
//
// The old rule picked "low" only for phones that report 2 GB of memory or ask to save data.
// iPhones and Firefox never report memory, so almost every phone got the full laptop look.
// Now every device starts at a level from what it says about itself (memory, data saver, the
// graphics chip's name), and then a governor watches the real frame times while a model is on
// screen. If frames run slow, the model steps down a level; at the bottom it becomes a still
// picture with a "tap to see in 3D" button. The level a device settles at is remembered, so
// the next visit starts there instead of stuttering again.
//
// Level 3: full look. Level 2: fewer pixels, smaller shadows. Level 1: fewest pixels, shadows
// redrawn now and then instead of every frame. Level 0: no live model, a still picture.

export type Level = 0 | 1 | 2 | 3
type Saved = { level: Level; at: number; v: number }

const KEY = 'apfc-3d-level'
const VERSION = 1
const PROBE_AFTER_MS = 14 * 24 * 3600 * 1000   // try one level higher a fortnight later: phones get updates

// Graphics chips that cannot keep a shadowed, anti-aliased model smooth on a phone-sized screen.
// Matched against the WEBGL_debug_renderer_info string. Older Mali, Adreno 3xx to 5xx and 61x,
// PowerVR, Intel HD 2000 to 5000, and every software renderer. A chip not listed is not trusted
// blindly either: the governor still steps it down if its frames run slow.
const WEAK_GPU = /Mali-(?:[2-4]\d\d|T[6-8]\d\d|G(?:31|51|52|57))\b|Adreno \(TM\) (?:[2-5]\d\d|61\d)\b|PowerVR|SGX|GE8\d{3}|Intel.*HD Graphics [2-5]\d{3}\b|SwiftShader|llvmpipe|Software|Microsoft Basic/i

let gpu: string | null = null
/** The graphics chip's name, read once from a throwaway context. Empty when the browser hides it. */
export function gpuName(): string {
  if (gpu != null) return gpu
  gpu = ''
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch { /* some browsers throw on the debug extension; the name stays empty */ }
  return gpu
}

const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

/** The best level this device could ever reach, from what it says about itself. */
export function ceilingLevel(): Level {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return 1
  if (nav.deviceMemory != null && nav.deviceMemory <= 2) return 1
  if (WEAK_GPU.test(gpuName())) return 1
  if (nav.deviceMemory != null && nav.deviceMemory <= 4 && coarse()) return 2
  return 3
}

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null
    return s && s.v === VERSION && s.level >= 0 && s.level <= 3 ? s : null
  } catch { return null }
}

let session: Level | null = null
/** Where a new model starts on this page view. */
export function startLevel(): Level {
  // A laptop or desktop never rests: one stutter on a busy machine (many tabs, a video call) must not
  // switch its 3D off for a fortnight. Only phones and tablets may go down to a still picture.
  const floor: Level = coarse() ? 0 : 1
  if (session != null) return Math.max(floor, session) as Level
  const ceil = ceilingLevel()
  const saved = readSaved()
  let start: Level = ceil
  if (saved) {
    const probe = Date.now() - saved.at > PROBE_AFTER_MS
    start = Math.min(ceil, probe ? Math.min(3, saved.level + 1) : saved.level) as Level
  }
  start = Math.max(floor, start) as Level
  session = start
  return start
}

/** A model settled lower than where it started: every model on this page and the next visit start there. */
export function settle(level: Level) {
  if (session == null || level < session) session = level
  try { localStorage.setItem(KEY, JSON.stringify({ level, at: Date.now(), v: VERSION } satisfies Saved)) } catch { /* private mode: the session still remembers */ }
  meter.update({ level })
}

/** Pixels per CSS pixel and the shadow size for each level. */
export function settingsFor(level: Level, mode: 'inline' | 'explore') {
  const budget = mode === 'explore'
    ? [0, 1.2e6, 2.6e6, 7.2e6][level]
    : [0, 0.6e6, 1.0e6, 1.7e6][level]
  const cap = [1, 1, 1.5, mode === 'explore' ? 3 : 2][level]
  const shadow = [0, 512, 1024, mode === 'explore' ? 4096 : 2048][level]
  return { budget, cap, shadow, shadowEveryFrame: level >= 2 }
}

/** Edge smoothing only where it shows: a full-level model on a screen under 2x. On sharper screens
 *  the pixels are already too small to see jagged edges, and MSAA costs the most there. */
export function wantAntialias(level: Level) {
  return level >= 3 && (window.devicePixelRatio || 1) < 2
}

/** Resolves once the page has loaded and the browser has a quiet moment, so building a model
 *  never competes with the text the reader came for. Capped, so a busy page still gets its model. */
let ready: Promise<void> | null = null
export function pageQuiet(): Promise<void> {
  return (ready ??= new Promise<void>((resolve) => {
    const idle = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (ric) ric(() => resolve(), { timeout: 1500 })
      else setTimeout(resolve, 300)
    }
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }))
}

/**
 * Watches the gaps between animation frames for one live model.
 *
 * The gap between two requestAnimationFrame calls is the honest measure of smoothness: it grows
 * when the GPU cannot finish a frame in time and when the main thread is blocked. Each window of
 * 45 frames (or 2 seconds on a slow device) gives a 75th percentile. Over 40 ms (under 25 frames
 * a second) the model steps down, and two frozen frames over 300 ms step it down at once; under 20 ms for three windows in a row it may step back up once, never above where it
 * started. Windows restart after a resize, a level change or the model coming back on screen,
 * so one-off work (compiling, a new size) is never counted as slowness.
 */
export function createGovernor(opts: { start: Level; floor: Level; onChange: (level: Level) => void }) {
  let level = opts.start
  const ceiling = opts.start
  let samples: number[] = []
  let windowStart = 0
  let goodWindows = 0
  let steppedUp = false
  let quietUntil = performance.now() + 1200
  let prev = 0
  let lastHuge = -Infinity
  let lastHugeGap = 0
  const reset = (ms = 800) => { samples = []; prev = 0; windowStart = 0; quietUntil = performance.now() + ms }
  const change = (to: Level) => {
    level = to
    reset(1000)
    opts.onChange(level)
  }
  const down = () => { goodWindows = 0; if (level > opts.floor) change((level - 1) as Level) }
  return {
    get level() { return level },
    reset,
    /** Call once per animation frame while the model is drawing. */
    sample(now: number) {
      if (now < quietUntil) { prev = now; return }
      if (prev) {
        const gap = now - prev
        samples.push(gap)
        // A frame over 300 ms is a freeze the reader feels. Two of them within 5 seconds is not a
        // one-off hitch, so the model steps down at once instead of waiting for a full window that
        // a frozen phone would take minutes to fill.
        // Two frames over a full second mean the device cannot draw this model at all: skip the
        // in-between levels and go straight to the lowest allowed one.
        if (gap > 300) {
          if (now - lastHuge < 5000) {
            const frozen = gap > 1000 && lastHugeGap > 1000
            lastHuge = -Infinity
            if (frozen && level > opts.floor) { goodWindows = 0; change(opts.floor); return }
            down(); return
          }
          lastHuge = now
          lastHugeGap = gap
        }
      }
      if (!windowStart) windowStart = now
      prev = now
      meter.frame(now)
      // A window closes after 45 frames, or after 2 seconds on a slow device (with at least 4 frames).
      if (samples.length < 45 && !(now - windowStart >= 2000 && samples.length >= 4)) return
      const sorted = samples.slice().sort((a, b) => a - b)
      const p75 = sorted[Math.floor(sorted.length * 0.75)]
      const p90 = sorted[Math.floor(sorted.length * 0.9)]
      meter.update({ p75: Math.round(p75) })
      samples = []
      windowStart = now
      if (p75 > 40) { down(); return }
      if (p90 < 20 && sorted.length >= 45) {
        goodWindows++
        if (goodWindows >= 3 && !steppedUp && level < ceiling) { steppedUp = true; goodWindows = 0; change((level + 1) as Level) }
      } else goodWindows = 0
    },
  }
}

// A small readout for checking a real phone: add ?perf=1 to any address. It shows the level,
// the graphics chip, the frame rate and how many models are live. Off for everyone else.
const meter = (() => {
  let el: HTMLDivElement | null = null
  let on: boolean | null = null
  const state: Record<string, string | number> = {}
  let frames = 0, since = 0
  const enabled = () => {
    if (on != null) return on
    try {
      const q = new URLSearchParams(location.search).get('perf')
      if (q === '1') sessionStorage.setItem('apfc-perf', '1')
      if (q === '0') sessionStorage.removeItem('apfc-perf')
      on = sessionStorage.getItem('apfc-perf') === '1'
    } catch { on = false }
    return on
  }
  const draw = () => {
    if (!enabled()) return
    if (!el) {
      el = document.createElement('div')
      el.setAttribute('aria-hidden', 'true')
      el.style.cssText = 'position:fixed;left:8px;top:calc(8px + env(safe-area-inset-top,0px));z-index:99999;background:rgba(0,0,0,.78);color:#fff;font:11px/1.45 ui-monospace,monospace;padding:6px 8px;border-radius:6px;pointer-events:none;max-width:70vw;white-space:pre-wrap'
      document.body.appendChild(el)
    }
    el.textContent = [
      `3D level ${state.level ?? startLevel()} (ceiling ${ceilingLevel()})`,
      `fps ${state.fps ?? '-'}  p75 ${state.p75 ?? '-'} ms  live ${state.live ?? 0}`,
      `dpr ${(window.devicePixelRatio || 1).toFixed(2)}  ${gpuName() || 'gpu hidden'}`,
    ].join('\n')
  }
  return {
    update(s: Record<string, string | number>) { Object.assign(state, s); draw() },
    frame(now: number) {
      if (!enabled()) return
      frames++
      if (!since) since = now
      if (now - since > 1000) { state.fps = Math.round((frames * 1000) / (now - since)); frames = 0; since = now; draw() }
    },
  }
})()
export const perfMeter = meter
