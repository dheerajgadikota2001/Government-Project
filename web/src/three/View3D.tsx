import * as React from 'react'
import { cn } from '@/lib/utils'
import { useThemeTick } from '@/lib/design'
import { useLang } from '@/lib/i18n'
import { Rotate3d } from 'lucide-react'
import { createLabelPlacer, type Place } from './labels'
import { exploring, LayerDepth } from './explore-state'
import { createGovernor, pageQuiet, perfMeter, settle, startLevel, type Level } from './governor'
import { afterLoad, holdEarlyLoad, loadEngine, type Engine } from './engine'
import { Poster } from './Poster'

const Explore3D = React.lazy(() => import('./Explore3D'))

// The one React door into the 3D models.
//  - A baked picture of the model (`poster`) fills the place at once, so there is never an empty box.
//  - The model library starts downloading the moment the page has loaded, not after a further wait for
//    a quiet moment; only building the scene and compiling its shaders wait for that, so a model never
//    slows down the text around it. A device on data saver, or one that can only run the lightest level,
//    waits for the quiet moment before it downloads anything.
//  - A governor (governor.ts) watches real frame times and steps the model down when a phone
//    struggles: fewer pixels, cheaper shadows, then a still picture with "Tap to see in 3D".
//  - A model animates only while it is on screen, and never when the reader has asked for less motion.
//  - Phones keep at most two live models; a model that leaves keeps a still picture of itself.
//  - With no WebGL, or before the library arrives, the reader sees the flat version (`fallback`).
// Labels are ordinary HTML laid over the model, so they stay sharp, readable and translatable.

export type Anchor = { id: string; x: number; y: number; z: number }
export type SceneHandle = {
  /** Called every animated frame. */
  frame?: (t: number, dt: number) => void
  /** Where each label sits in the model; projected to the screen every frame. */
  anchors?: () => Anchor[]
  /** A tap or click on the model, in normalised device coordinates. */
  pick?: (x: number, y: number) => void
  hover?: (x: number, y: number) => void
  /** Update without rebuilding (for example a new year chosen). */
  update?: (params: unknown) => void
  dispose?: () => void
}
export type Builder<P> = (stage: import('./core').Stage, params: P, engine: Engine) => SceneHandle

const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const PHONE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const LIVE_MAX = PHONE ? 2 : 4

// Live models, oldest first. When a new one needs room, the oldest that is off screen gives its place up.
const live: { id: number; visible: () => boolean; release: () => void }[] = []
let nextId = 1

type ViewState = 'idle' | 'loading' | 'live' | 'still' | 'flat' | 'resting'

export function View3D<P>({ build, params, className, style, fallback, label, children, interactive, onReady, aspect, explorable, paused, poster }: {
  build: () => Promise<{ default: Builder<P> }>
  params: P
  className?: string
  style?: React.CSSProperties
  /** The flat version: shown without WebGL, while loading, and as the still picture's backup. */
  fallback?: React.ReactNode
  /** What the model shows, read by screen readers. */
  label: string
  /** HTML laid over the model; elements with data-anchor="id" follow that anchor. */
  children?: React.ReactNode
  interactive?: boolean
  onReady?: () => void
  aspect?: number
  /** Offer "Explore in 3D": the model opens full screen for the reader to turn and zoom. */
  explorable?: boolean
  /** Hold the model still without letting it go (for example while another picture covers it). */
  paused?: boolean
  /** Base of the baked picture files (see posters.ts); omit when none matches the data. */
  poster?: string
}) {
  const { tr } = useLang()
  const [open, setOpen] = React.useState(false)
  const wrap = React.useRef<HTMLDivElement>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const overlay = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<ViewState>('idle')
  const stateRef = React.useRef<ViewState>('idle')
  stateRef.current = state
  const [still, setStill] = React.useState<string | null>(null)
  const [posterState, setPosterState] = React.useState<'wait' | 'ok' | 'fail'>('wait')
  React.useEffect(() => { setPosterState('wait') }, [poster])
  const posterOk = !!poster && posterState === 'ok'
  // `near` only ever turns on: a model that has loaded stays loaded until the live budget asks for its place.
  const [near, setNear] = React.useState(false)
  // Bumped when a model that gave its place up comes back on screen, so it comes back to life.
  const [wake, setWake] = React.useState(0)
  const visibleRef = React.useRef(false)
  // Set when the reader taps "See in 3D" on a model the governor put to rest: from then on it may
  // go down to the lightest live level but never back to a still picture on its own.
  const askedRef = React.useRef(false)
  const paramsRef = React.useRef(params)
  const handleRef = React.useRef<SceneHandle | null>(null)
  // asks a still model (less motion asked for) to draw again: new params, new labels, a new size
  const kickRef = React.useRef<(() => void) | null>(null)
  const tick = useThemeTick()
  // a model inside a full-screen story keeps drawing while the story is open; models in the page pause
  const depth = React.useContext(LayerDepth)
  const depthRef = React.useRef(depth)
  depthRef.current = depth
  const pausedRef = React.useRef(!!paused)
  pausedRef.current = !!paused

  // Watch distance to the screen: load when near, animate when visible.
  React.useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ioNear = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true) }, { rootMargin: '400px 0px' })
    const ioVis = new IntersectionObserver(([e]) => {
      const was = visibleRef.current
      visibleRef.current = e.isIntersecting
      if (e.isIntersecting && !was && stateRef.current === 'still') setWake((n) => n + 1)
    }, { threshold: 0.05 })
    ioNear.observe(el); ioVis.observe(el)
    return () => { ioNear.disconnect(); ioVis.disconnect() }
  }, [])

  React.useEffect(() => {
    paramsRef.current = params
    handleRef.current?.update?.(params)
    kickRef.current?.()
  }, [params])
  // labels laid over the model may have changed with this render
  React.useEffect(() => { kickRef.current?.() })

  // Set while the component is leaving the page, so a rebuild (new theme) can keep a picture and a leave does not pay for one.
  const leaving = React.useRef(false)
  React.useEffect(() => { leaving.current = false; return () => { leaving.current = true } }, [])

  React.useEffect(() => {
    if (!near) return
    let cancelled = false
    let cleanup: (() => void) | null = null
    const run = async () => {
      const start = startLevel()
      // This device or this visit has shown it cannot keep a live model smooth: hold a still or the
      // flat drawing and let the reader ask for the model, instead of making the page stutter.
      if (start === 0 && !askedRef.current) { setState('resting'); return }
      setState((s) => (s === 'live' ? s : 'loading'))
      // Fetch the library and the scene once the page has loaded; building waits for a quiet moment.
      const early = holdEarlyLoad() ? null : afterLoad().then(() => Promise.all([loadEngine(), build()]))
      early?.catch(() => { /* the await below reports it */ })
      await pageQuiet()
      if (cancelled) return
      const [engine, mod] = await (early ?? Promise.all([loadEngine(), build()]))
      if (cancelled) return
      if (!engine.canUseWebGL()) { setState('flat'); return }
      const box = wrap.current, place = host.current
      if (!box || !place) return
      // make room within the budget of live models
      while (live.length >= LIVE_MAX) {
        const victim = live.find((l) => !l.visible()) ?? live[0]
        victim.release()
      }
      // Every model gets a fresh canvas. A canvas whose context was let go cannot hold a new one,
      // and some phones refuse a new context outright: then the reader keeps the flat version.
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
      place.appendChild(canvas)
      let stage: import('./core').Stage | null = null
      let handle: SceneHandle
      // Timings land in the browser's performance panel as 3d:stage, 3d:build and 3d:compile, so a
      // slow phone can be diagnosed from a trace instead of guessed at.
      const mark = (name: string, from: number) => { try { performance.measure(name, { start: from, end: performance.now() }) } catch { /* old browsers */ } }
      const tStage = performance.now()
      try {
        stage = engine.createStage(canvas, Math.max(1, start) as Level)
        mark('3d:stage', tStage)
        const tBuild = performance.now()
        handle = mod.default(stage, paramsRef.current, engine)
        mark('3d:build', tBuild)
      } catch (err) {
        // a model that cannot be built must say why in the console, then fall back to the flat version
        console.error('[3D] could not build the model:', err)
        try { stage?.dispose() } catch { /* ignore */ }
        canvas.remove()
        setState((s) => (s === 'still' ? s : 'flat'))
        return
      }
      handleRef.current = handle
      // Compile every shader before the first frame, in parallel where the GPU allows it, so a
      // detailed model does not freeze the page while it appears.
      const tCompile = performance.now()
      try { handle.frame?.(0, 0); await stage.renderer.compileAsync(stage.scene, stage.camera) } catch { /* older browsers compile on first draw */ }
      mark('3d:compile', tCompile)
      if (cancelled || !stage) { try { handle.dispose?.(); stage?.dispose() } catch { /* ignore */ } canvas.remove(); return }
      const id = nextId++
      let raf = 0
      let stopped = false
      const t0 = performance.now()
      let last = t0
      const placer = createLabelPlacer(engine.THREE, box, () => overlay.current, REDUCED)
      const placeLabels = () => { if (stage) placer(handle.anchors?.(), stage.camera) }
      const draw = (now: number) => {
        if (!stage) return
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000)
        last = now
        handle.frame?.(REDUCED ? 0 : t, REDUCED ? 0 : dt)
        stage.onFrame.forEach((f) => f(REDUCED ? 0 : t, REDUCED ? 0 : dt))
        stage.render()
        placeLabels()
      }
      const size = () => {
        if (!stage) return
        const r = box.getBoundingClientRect()
        stage.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)))
      }
      let dirty = 2
      const kick = () => { dirty = Math.max(dirty, 2) }
      kickRef.current = kick
      // eslint-disable-next-line prefer-const
      let gov: ReturnType<typeof createGovernor>
      const ro = new ResizeObserver(() => { size(); kick(); gov?.reset() })
      // Letting a model go ends its graphics context on purpose, and the browser reports that with the
      // same event as a GPU taken away. Only a loss we did not cause may lower the device's level.
      let onLost: ((e: Event) => void) | null = null
      const stop = () => {
        if (stopped) return
        stopped = true
        if (onLost) canvas.removeEventListener('webglcontextlost', onLost)
        cancelAnimationFrame(raf)
        ro.disconnect()
        try { handle.dispose?.() } catch { /* ignore */ }
        try { stage?.dispose() } catch { /* ignore */ }
        stage = null
        canvas.remove()
        if (handleRef.current === handle) handleRef.current = null
        if (kickRef.current === kick) kickRef.current = null
        const i = live.findIndex((l) => l.id === id)
        if (i >= 0) live.splice(i, 1)
        perfMeter.update({ live: live.length })
        setState((s) => (s === 'resting' ? s : 'still'))
      }
      const release = () => {
        // Keep a still picture so the place never goes blank. The drawing buffer is not preserved,
        // so the picture is read in the same task as a fresh render, before the browser clears it.
        try { stage?.render(); setStill(canvas.toDataURL('image/webp', 0.86)) } catch { /* ignore */ }
        stop()
      }
      gov = createGovernor({
        start: stage.level,
        floor: askedRef.current || !PHONE ? 1 : 0,
        onChange: (lv) => {
          settle(lv)
          if (lv === 0) { release(); setState('resting'); return }
          stage?.setLevel(lv)
          kick()
        },
      })
      // A phone can take the GPU back (memory pressure, a background app). Then the model rests
      // and the device starts one level lower next time, instead of showing a black box.
      onLost = (e) => {
        e.preventDefault()
        if (stopped || !stage) return
        settle(Math.max(PHONE ? 0 : 1, stage.level - 1) as Level)
        stop()
        setState('resting')
      }
      canvas.addEventListener('webglcontextlost', onLost, { once: true })
      live.push({ id, visible: () => visibleRef.current, release })
      perfMeter.update({ live: live.length })
      // A rebuild (the theme changed) keeps the current picture up until the new model is ready,
      // so the box never flashes empty in between.
      cleanup = () => (leaving.current ? stop() : release())
      try {
        size()
        ro.observe(box)
        const frame = (now: number) => {
          raf = requestAnimationFrame(frame)
          if (!visibleRef.current || pausedRef.current || document.hidden || exploring.n > depthRef.current) { gov.reset(600); return }
          // with less motion asked for, the model holds still and is drawn again only when something changed
          if (REDUCED) { if (dirty > 0) { dirty--; draw(now) } return }
          gov.sample(now)
          // 30 frames a second is plenty for slow model motion and kinder to phone batteries
          if (now - last < 1000 / 31) return
          draw(now)
        }
        raf = requestAnimationFrame(frame)
        draw(performance.now())
      } catch {
        stop()
        setState('flat')
        return
      }
      setState('live')
      setStill(null)
      onReady?.()
      window.dispatchEvent(new Event('apfc-3d-live'))
    }
    run().catch((err) => { console.error('[3D] model failed:', err); setState('flat') })
    return () => { cancelled = true; cleanup?.() }
  }, [near, tick, wake]) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointer = (e: React.PointerEvent, kind: 'pick' | 'hover') => {
    const h = handleRef.current
    const box = wrap.current
    if (!h || !box) return
    const r = box.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1
    if (kind === 'pick') h.pick?.(x, y)
    else h.hover?.(x, y)
  }

  // The flat drawing is only for a reader who cannot get the 3D model. Shown while the model loads,
  // it read as an old picture swapped for a new one a moment later, so a quiet placeholder holds the place instead.
  const resting = state === 'resting'
  const showFlat = !posterOk && (state === 'flat' || (resting && !still))
  const showWait = !showFlat && !resting && state !== 'live' && !still && !posterOk
  const canExplore = explorable && state !== 'flat'
  return (
    <>
    <div ref={wrap} className={cn('relative isolate overflow-hidden', canExplore && !interactive && 'cursor-zoom-in', className)} style={{ ...(aspect ? { aspectRatio: String(aspect) } : {}), ...style }}
      role="img" aria-label={label}
      onClick={canExplore && !interactive ? () => setOpen(true) : undefined}
      onPointerUp={interactive ? (e) => onPointer(e, 'pick') : undefined}
      onPointerMove={interactive ? (e) => onPointer(e, 'hover') : undefined}>
      {showFlat ? <div className="absolute inset-0">{fallback}</div> : null}
      {showWait ? (
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="size-8 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground/50 motion-reduce:animate-none" />
            <span>{tr('Loading the 3D model', '3D నమూనా వస్తోంది')}</span>
          </div>
        </div>
      ) : null}
      {poster ? (
        <Poster base={poster} eager onStatus={setPosterState}
          className={cn('pointer-events-none absolute inset-0 size-full select-none object-cover transition-opacity duration-500', state === 'live' || posterState !== 'ok' ? 'opacity-0' : 'opacity-100')} />
      ) : null}
      {still && state !== 'live' ? <img src={still} alt="" className="absolute inset-0 size-full object-cover" /> : null}
      <div ref={host} className={cn('absolute inset-0 transition-opacity duration-500', state === 'live' ? 'opacity-100' : 'opacity-0')} />
      <div ref={overlay} className={cn('pointer-events-none absolute inset-0 transition-opacity duration-500', state === 'live' ? 'opacity-100' : 'opacity-0')}>
        {children}
      </div>
      {resting ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); askedRef.current = true; setState('idle'); setWake((n) => n + 1) }}
          className="absolute left-2.5 top-2.5 z-[2] inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12.5px] font-semibold shadow-sm backdrop-blur hover:bg-accent">
          <Rotate3d className="size-4" aria-hidden />{tr('Tap to see in 3D', '3Dలో చూడటానికి నొక్కండి')}
        </button>
      ) : null}
      {canExplore ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="absolute bottom-2.5 right-2.5 z-[2] inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12.5px] font-semibold shadow-sm backdrop-blur hover:bg-accent">
          <Rotate3d className="size-4" aria-hidden />{tr('Explore in 3D', '3Dలో చూడండి')}
        </button>
      ) : null}
    </div>
    {/* Outside the box on purpose. React hands a portal's clicks up the tree it was rendered in, so inside
        the box the close button's click reached the box's own "open" and the viewer opened again at once. */}
    {open ? (
      <React.Suspense fallback={null}>
        <Explore3D build={build as unknown as () => Promise<{ default: Builder<unknown> }>} params={params as unknown} label={label} onClose={() => setOpen(false)}>{children}</Explore3D>
      </React.Suspense>
    ) : null}
    </>
  )
}

/** A label that follows a point in the model. Its own corner sits on the point; `place` picks which corner.
 *  Labels make room for each other: `priority` goes first, `fixed` never moves (ruler ticks). */
export function Pin({ id, place = 'top', children, className, priority, fixed }: { id: string; place?: Place; children: React.ReactNode; className?: string; priority?: number; fixed?: boolean }) {
  const shift = { top: 'translate(-50%, calc(-100% - 6px))', bottom: 'translate(-50%, 6px)', left: 'translate(calc(-100% - 8px), -50%)', right: 'translate(8px, -50%)', center: 'translate(-50%, -50%)' }[place]
  return (
    <div data-anchor={id} data-place={place} data-priority={priority} data-fixed={fixed ? '' : undefined} className="absolute left-0 top-0 will-change-transform" style={{ visibility: 'hidden' }}>
      <div className={cn('whitespace-nowrap', className)} style={{ transform: shift }}>{children}</div>
      <span data-leader="" aria-hidden className="absolute left-0 top-0 h-px origin-left bg-foreground/40" style={{ display: 'none' }} />
    </div>
  )
}
