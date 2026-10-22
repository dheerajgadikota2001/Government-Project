import * as React from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, Image as ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { exploring, LayerDepth } from '@/three/explore-state'
import type { Bi, Story } from '@/data/stories/polavaram'
import { StoryPicture, pictureNote } from './StoryPicture'
import { DraftBadge, Segments, StepBody } from './parts'

// The story full screen, one card at a time, the way people already read status updates on their
// phones: tap the right of the picture (or Next) to go on, the left to go back, or swipe. On a
// computer the arrow keys work, and Escape closes. Nothing moves on its own: the reader sets the pace.

export default function StoryTapThrough({ story, start = 0, onClose, pageLink }: {
  story: Story
  start?: number
  /** Called with the step the reader stopped at. */
  onClose: (at: number) => void
  /** Shown on the last card: where to read the whole page. */
  pageLink?: { href: string; label: Bi }
}) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const n = story.steps.length
  const [i, setI] = React.useState(Math.max(0, Math.min(n - 1, start)))
  const iRef = React.useRef(i)
  iRef.current = i
  const panel = React.useRef<HTMLDivElement>(null)
  const nextBtn = React.useRef<HTMLButtonElement>(null)
  const textBox = React.useRef<HTMLDivElement>(null)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)
  const swiped = React.useRef(false)
  const close = React.useCallback(() => onClose(iRef.current), [onClose])
  const go = React.useCallback((k: number) => setI(Math.max(0, Math.min(n - 1, k))), [n])
  const next = React.useCallback(() => { if (iRef.current >= n - 1) close(); else go(iRef.current + 1) }, [n, go, close])
  const back = React.useCallback(() => go(iRef.current - 1), [go])

  // a new card starts at its top
  React.useEffect(() => { textBox.current?.scrollTo({ top: 0 }) }, [i])

  React.useEffect(() => {
    exploring.n++
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    nextBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
      else if (e.key === 'Tab' && panel.current) {
        // keep the keyboard inside the story while it is open
        const f = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null)
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      exploring.n--
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [close, next, back])

  const onDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY }; swiped.current = false }
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped.current = true
      if (dx < 0) next(); else back()
    }
  }
  const tap = (fn: () => void) => () => { if (swiped.current) { swiped.current = false; return } fn() }

  const step = story.steps[i]
  const last = i === n - 1
  const title = te ? story.question.te : story.question.en
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm sm:grid sm:place-items-center" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className="relative flex h-[100svh] w-full flex-col bg-background sm:h-[min(calc(100svh-2rem),900px)] sm:w-[min(calc(100vw-2rem),560px)] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
        onPointerDown={onDown} onPointerUp={onUp}>
        {/* top: where you are, what this is, and the way out */}
        <div className="px-4 pt-2">
          <Segments n={n} active={i} onJump={go} tone="cards" />
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-snug" lang={te ? 'te' : undefined}>{title}</div>
              {story.status === 'draft' ? <DraftBadge className="mt-1" /> : null}
            </div>
            <button type="button" onClick={close} aria-label={tr('Close the story', 'కథను మూసివేయండి')}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card hover:bg-accent"><X className="size-5" /></button>
          </div>
        </div>

        {/* the picture; its left third goes back, the rest goes on */}
        <LayerDepth.Provider value={1}>
          <div className="relative mx-3 mt-3 min-h-[180px] flex-[1.1]">
            <StoryPicture pic={step.pic} className="absolute inset-0" />
            <div className="absolute inset-0 z-[3] grid grid-cols-[1fr_2fr]">
              <button type="button" tabIndex={-1} aria-hidden onClick={tap(back)} className="cursor-w-resize" />
              <button type="button" tabIndex={-1} aria-hidden onClick={tap(next)} className="cursor-e-resize" />
            </div>
          </div>
        </LayerDepth.Provider>

        {/* the words */}
        <div ref={textBox} className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-4" aria-live="polite">
          <StepBody story={story} i={i} big />
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground" lang={te ? 'te' : undefined}>
            <ImageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{pictureNote(step.pic, lang)}
          </p>
          {last && pageLink ? (
            <a href={pageLink.href} onClick={() => onClose(i)} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold underline underline-offset-4">
              {te ? pageLink.label.te : pageLink.label.en}<ArrowUpRight className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>

        {/* bottom: big buttons for those who prefer them to taps */}
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <button type="button" onClick={back} disabled={i === 0}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-4 text-[15px] font-semibold disabled:opacity-40">
            <ArrowLeft className="size-5" aria-hidden />{tr('Back', 'వెనక్కి')}
          </button>
          <div className="flex-1 text-center text-[13px] text-muted-foreground tnum">{i + 1} / {n}</div>
          <button ref={nextBtn} type="button" onClick={next}
            className={cn('inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold', 'bg-foreground text-background hover:bg-foreground/90')}>
            {last ? tr('Done', 'ముగించండి') : tr('Next', 'తర్వాత')}{last ? null : <ArrowRight className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
