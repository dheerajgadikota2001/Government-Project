import * as React from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import type { Builder, SceneHandle } from './View3D'
import { createLabelPlacer } from './labels'
import { exploring } from './explore-state'

// A model, full screen, for the reader to turn and zoom. It opens from a model's card, so the page
// itself never catches a finger meant for scrolling or swiping. One finger turns the model, two
// fingers zoom and move it; on a computer, drag to turn and scroll to zoom. The model is drawn at up
// to three times the screen's pixels, so zooming in stays sharp. The reader cannot lose the model:
// the view stops above the ground line, inside a sensible distance, and Reset brings it back.

const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches


export default function Explore3D<P>({ build, params, label, children, onClose }: {
  build: () => Promise<{ default: Builder<P> }>
  params: P
  label: string
  children?: React.ReactNode
  onClose: () => void
}) {
  const { tr } = useLang()
  const box = React.useRef<HTMLDivElement>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const overlay = React.useRef<HTMLDivElement>(null)
  const closeBtn = React.useRef<HTMLButtonElement>(null)
  const api = React.useRef<{ zoom: (f: number) => void; reset: () => void; turn: (az: number, pol: number) => void } | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  // Hold the page still behind the model, and give focus to Close so the keyboard works at once.
  React.useEffect(() => {
    exploring.n++
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') api.current?.zoom(0.85)
      else if (e.key === '-') api.current?.zoom(1.18)
      else if (e.key === 'ArrowLeft') api.current?.turn(-0.12, 0)
      else if (e.key === 'ArrowRight') api.current?.turn(0.12, 0)
      else if (e.key === 'ArrowUp') api.current?.turn(0, -0.08)
      else if (e.key === 'ArrowDown') api.current?.turn(0, 0.08)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => { exploring.n--; document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  React.useEffect(() => {
    let disposed = false
    let raf = 0
    let cleanup: (() => void) | null = null
    ;(async () => {
      const [engine, mod, oc] = await Promise.all([import('./core'), build(), import('three/addons/controls/OrbitControls.js')])
      const THREE = engine.THREE
      if (disposed || !host.current || !box.current) return
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none'
      host.current.appendChild(canvas)
      let stage: import('./core').Stage
      let handle: SceneHandle
      try {
        stage = engine.createStage(canvas, engine.pickQuality(), 'explore')
        handle = mod.default(stage, params, engine)
      } catch (err) {
        console.error('[3D] could not open the model full screen:', err)
        canvas.remove(); setFailed(true); return
      }
      const el = box.current
      const size = () => { const r = el.getBoundingClientRect(); stage.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))) }
      size()
      // The scene frames itself once, as in its card; from then on the camera belongs to the reader.
      handle.frame?.(0, 0)
      stage.locked = true
      const target = stage.fitTarget?.clone() ?? new THREE.Vector3()
      const controls = new oc.OrbitControls(stage.camera, canvas)
      controls.target.copy(target)
      controls.enableDamping = !REDUCED
      controls.dampingFactor = 0.08
      controls.rotateSpeed = 0.65
      controls.zoomSpeed = 0.9
      controls.panSpeed = 0.7
      controls.screenSpacePanning = true
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
      const d0 = stage.camera.position.distanceTo(target)
      controls.minDistance = d0 * 0.22
      controls.maxDistance = d0 * 1.8
      controls.minPolarAngle = 0.12
      controls.maxPolarAngle = Math.PI * 0.46 // stays above the ground: the reader cannot go under the stand
      // moving the model is allowed, losing it is not: the point looked at stays inside the model
      const keep = (stage.fitBounds?.clone() ?? new THREE.Box3().setFromCenterAndSize(target, new THREE.Vector3(10, 4, 10))).expandByScalar(0.3)
      controls.addEventListener('change', () => { keep.clampPoint(controls.target, controls.target) })
      controls.update()
      controls.saveState()

      const off = new THREE.Vector3(), sph = new THREE.Spherical()
      api.current = {
        zoom: (f) => {
          off.copy(stage.camera.position).sub(controls.target).multiplyScalar(f)
          off.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length())))
          stage.camera.position.copy(controls.target).add(off)
          controls.update()
        },
        reset: () => controls.reset(),
        turn: (az, pol) => {
          sph.setFromVector3(off.copy(stage.camera.position).sub(controls.target))
          sph.theta += az
          sph.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, sph.phi + pol))
          stage.camera.position.copy(controls.target).add(off.setFromSpherical(sph))
          controls.update()
        },
      }

      const placer = createLabelPlacer(THREE, el, () => overlay.current, !!REDUCED)
      const ro = new ResizeObserver(size)
      ro.observe(el)
      try { await stage.renderer.compileAsync(stage.scene, stage.camera) } catch { /* compile on first draw */ }
      if (disposed) { controls.dispose(); handle.dispose?.(); stage.dispose(); canvas.remove(); ro.disconnect(); return }
      let t0 = performance.now(), last = t0
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000)
        last = now
        controls.update()
        handle.frame?.(REDUCED ? 0 : t, REDUCED ? 0 : dt)
        stage.onFrame.forEach((f) => f(REDUCED ? 0 : t, REDUCED ? 0 : dt))
        stage.render()
        placer(handle.anchors?.(), stage.camera)
      }
      raf = requestAnimationFrame(frame)
      setReady(true)
      cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); try { handle.dispose?.() } catch { /* ignore */ } stage.dispose(); canvas.remove(); api.current = null }
    })().catch((err) => { console.error('[3D] full screen failed:', err); setFailed(true) })
    return () => { disposed = true; cleanup?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const btn = 'grid size-11 place-items-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur hover:bg-accent'
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[100] bg-[radial-gradient(120%_80%_at_50%_30%,var(--color-card),var(--color-muted))]">
      <div ref={box} className="absolute inset-0">
        <div ref={host} className={`absolute inset-0 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} />
        <div ref={overlay} className="pointer-events-none absolute inset-0">{children}</div>
      </div>
      {/* top: what this is, and the way out */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingRight: 'max(12px, env(safe-area-inset-right, 0px))' }}>
        <div className="pointer-events-auto max-w-[70%] rounded-xl bg-background/85 px-3 py-2 text-[13.5px] font-semibold leading-snug shadow-sm backdrop-blur">{label}</div>
        <button ref={closeBtn} type="button" onClick={onClose} aria-label={tr('Close', 'మూసివేయండి')} className={`pointer-events-auto ${btn}`}><X className="size-5" /></button>
      </div>
      {/* bottom: how to move it, and buttons for those who prefer to tap */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-3" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingRight: 'max(12px, env(safe-area-inset-right, 0px))' }}>
        <div className="pointer-events-auto rounded-xl bg-background/85 px-3 py-2 text-[12.5px] text-muted-foreground shadow-sm backdrop-blur">
          {failed ? tr('This phone could not open the model. Close to go back.', 'ఈ ఫోన్‌లో మోడల్ తెరవలేకపోయాం. వెనక్కి వెళ్లడానికి మూసివేయండి.')
            : tr('Drag to turn. Pinch or scroll to zoom. Two fingers to move.', 'తిప్పడానికి లాగండి. దగ్గరగా చూడడానికి రెండు వేళ్లతో పెంచండి.')}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button type="button" onClick={() => api.current?.zoom(1.18)} aria-label={tr('Zoom out', 'దూరంగా')} className={btn}><ZoomOut className="size-5" /></button>
          <button type="button" onClick={() => api.current?.zoom(0.85)} aria-label={tr('Zoom in', 'దగ్గరగా')} className={btn}><ZoomIn className="size-5" /></button>
          <button type="button" onClick={() => api.current?.reset()} aria-label={tr('Reset the view', 'మొదటి దృశ్యం')} className={btn}><RotateCcw className="size-5" /></button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
