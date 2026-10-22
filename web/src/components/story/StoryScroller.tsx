import * as React from 'react'
import { GalleryHorizontalEnd, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { RM } from '@/graphics/util'
import type { Story } from '@/data/stories/polavaram'
import { StoryPicture, pictureNote } from './StoryPicture'
import { DraftBadge, Segments, StepBody } from './parts'

const StoryTapThrough = React.lazy(() => import('./StoryTapThrough'))

// A story told with a picture that stays in view. On a phone the picture sits at the top of the
// screen and the steps pass beneath it; on a computer the steps run down the left and the picture
// stays on the right. The step that crosses the reading line takes over the picture.
// The same story can be read one card at a time, full screen (StoryTapThrough).

export function StoryScroller({ story, className, id = 'story' }: { story: Story; className?: string; id?: string }) {
  const { lang, tr } = useLang()
  const n = story.steps.length
  const [active, setActive] = React.useState(0)
  const [cards, setCards] = React.useState<number | null>(null)
  const refs = React.useRef<(HTMLElement | null)[]>([])
  const sticky = React.useRef<HTMLDivElement>(null)

  // The reading line. On a computer it is mid-screen. On a phone it sits just under the picture once the
  // picture has settled at the top, so the step being read is the one right below the picture.
  const line = () => {
    const H = window.innerHeight
    if (window.matchMedia('(min-width: 1024px)').matches || !sticky.current) return H * 0.58
    const top = parseFloat(getComputedStyle(sticky.current).top) || 64
    return Math.max(H * 0.4, Math.min(H * 0.85, top + sticky.current.offsetHeight + 72))
  }

  React.useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const y = line()
      let a = 0
      refs.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top < y) a = i })
      setActive((p) => (p === a ? p : a))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])

  const jump = (i: number) => {
    const el = refs.current[i]
    if (!el) return
    const top = window.scrollY + el.getBoundingClientRect().top - line() + 40
    window.scrollTo({ top: Math.max(0, top), behavior: RM ? 'auto' : 'smooth' })
  }

  const pic = story.steps[active].pic
  const te = lang === 'te'
  return (
    <section id={id} className={cn('scroll-mt-24', className)} aria-label={te ? story.title.te : story.title.en}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr(`The story in ${n} steps`, `${n} అడుగుల్లో కథ`)}</span>
            {story.status === 'draft' ? <DraftBadge /> : null}
          </div>
          <h2 className="text-[26px] font-semibold leading-[1.15] tracking-tight md:text-[30px]" lang={te ? 'te' : undefined}>{te ? story.title.te : story.title.en}</h2>
          <p className="mt-2.5 text-[16px] leading-relaxed text-muted-foreground">{tr('Scroll down. The picture changes with each step, and every step names its paper.', 'కిందికి జరపండి. ప్రతి అడుగుతో చిత్రం మారుతుంది. ప్రతి అడుగుకూ దాని పత్రం ఉంది.')}</p>
        </div>
        <button type="button" onClick={() => setCards(active)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-semibold shadow-sm hover:border-foreground/30 hover:bg-accent">
          <GalleryHorizontalEnd className="size-4" aria-hidden />{tr('Read one card at a time', 'ఒక్కో కార్డుగా చదవండి')}
        </button>
      </div>

      <div className="relative grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        {/* The picture comes first in the page, so on a phone it is above the words. Its band is opaque:
            the steps slide under it as the reader scrolls. */}
        <div ref={sticky} className="sticky z-10 lg:col-start-2 lg:row-start-1 lg:self-start" style={{ top: 'calc(var(--header-h) + env(safe-area-inset-top, 0px))' }}>
          <div className="bg-background pb-2 lg:pt-4">
            <Segments n={n} active={active} onJump={jump} />
            <StoryPicture pic={pic} explorable className="mt-1 h-[clamp(200px,40svh,440px)] lg:h-[calc(100svh-4rem-8.5rem)] lg:min-h-[420px]" />
            <p className="mt-2 hidden items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground lg:flex" lang={te ? 'te' : undefined}>
              <ImageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{pictureNote(pic, lang)}
            </p>
          </div>
        </div>

        <ol className="relative lg:col-start-1 lg:row-start-1">
          {story.steps.map((s, i) => (
            <li key={s.id} className={cn('flex min-h-[46svh] items-start pt-5 lg:min-h-[76svh] lg:items-center lg:pt-0', i === 0 && 'lg:min-h-[64svh] lg:items-start lg:pt-[14svh]')}>
              <article ref={(el) => { refs.current[i] = el }}
                className={cn('w-full rounded-2xl border bg-card p-4 transition-[opacity,box-shadow,border-color] duration-300 sm:p-5',
                  i === active ? 'border-foreground/25 opacity-100 shadow-md' : 'border-border opacity-55 shadow-none')}>
                <StepBody story={story} i={i} />
                <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground lg:hidden" lang={te ? 'te' : undefined}>
                  <ImageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{pictureNote(s.pic, lang)}
                </p>
              </article>
            </li>
          ))}
          <li aria-hidden className="h-[24svh] lg:h-[22svh]" />
        </ol>
      </div>

      {cards != null ? (
        <React.Suspense fallback={null}>
          <StoryTapThrough story={story} start={cards} onClose={(at) => { setCards(null); if (at !== active) jump(at) }} />
        </React.Suspense>
      ) : null}
    </section>
  )
}
