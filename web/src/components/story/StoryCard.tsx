import * as React from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { pol } from '@/lib/data'
import { dateLong, dateTe, num } from '@/lib/format'
import { Dam } from '@/graphics/Dam'
import type { Bi, Story } from '@/data/stories/polavaram'
import { DraftBadge } from './parts'

const StoryTapThrough = React.lazy(() => import('./StoryTapThrough'))

// A story's cover on the home page: a round picture ringed by one mark per step, as people know it
// from status updates on their phones. Tapping it opens the story full screen, one card at a time.

function Ring({ n, size }: { n: number; size: number }) {
  const r = size / 2 - 3, c = size / 2
  const gap = 0.07 // radians between marks
  const seg = (Math.PI * 2) / n
  return (
    <svg width={size} height={size} className="absolute inset-0" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a0 = -Math.PI / 2 + i * seg + gap / 2, a1 = a0 + seg - gap
        const p = (a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`
        return <path key={i} d={`M${p(a0)} A${r},${r} 0 0 1 ${p(a1)}`} fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      })}
    </svg>
  )
}

export function StoryCard({ story, pageHref, pageLabel, cover }: { story: Story; pageHref: string; pageLabel: Bi; cover?: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const [open, setOpen] = React.useState(false)
  const n = story.steps.length
  const last = pol.readings[pol.readings.length - 1]
  return (
    <div className="grid items-center gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-7 md:p-7">
      <button type="button" onClick={() => setOpen(true)} aria-label={tr(`Start the story: ${story.question.en}`, `కథ మొదలుపెట్టండి: ${story.question.te}`)}
        className="group relative mx-auto grid size-[148px] shrink-0 place-items-center rounded-full text-foreground transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Ring n={n} size={148} />
        <span className="absolute inset-[10px] grid place-items-center overflow-hidden rounded-full border border-border bg-[radial-gradient(circle_at_50%_35%,var(--color-card),var(--color-muted))]">
          {cover
            ? <img src={cover} alt="" className="pointer-events-none size-full scale-[1.18] object-cover" draggable={false} />
            : <span className="pointer-events-none block w-[150%]"><Dam readings={pol.readings} index={pol.readings.length - 1} gauge={false} notes={false} /></span>}
        </span>
        <span className="absolute -bottom-1 right-2 grid size-10 place-items-center rounded-full bg-foreground text-background shadow-md ring-4 ring-card"><Play className="size-4 translate-x-[1px]" aria-hidden /></span>
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr(`${n} short steps`, `${n} చిన్న అడుగులు`)}</span>
          {story.status === 'draft' ? <DraftBadge /> : null}
        </div>
        <h3 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]" lang={te ? 'te' : undefined}>{te ? story.question.te : story.question.en}</h3>
        <p className="mt-1 text-[15px] text-muted-foreground" lang={te ? 'en' : 'te'}>{te ? story.question.en : story.question.te}</p>
        <p className="mt-3 max-w-[60ch] text-[15.5px] leading-relaxed text-foreground/85">
          {tr(`From the first idea in 1941 to ${num(last.pct)}% physical progress in the ${dateLong(last.date.slice(0, 7))} report, each step with its paper. Tap to go forward, at your own pace.`,
            `1941 నాటి ఆలోచన నుంచి ${dateTe(last.date.slice(0, 7))} నివేదికలోని ${num(last.pct)}% భౌతిక పురోగతి వరకు, ప్రతి అడుగుకూ దాని పత్రంతో. మీ వేగంతో, తాకుతూ ముందుకు వెళ్లండి.`)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background hover:bg-foreground/90">
            <Play className="size-4" aria-hidden />{tr('Start the story', 'కథ మొదలుపెట్టండి')}
          </button>
          <a href={pageHref} className="inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline">
            {te ? pageLabel.te : pageLabel.en}<ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
      {open ? (
        <React.Suspense fallback={null}>
          <StoryTapThrough story={story} onClose={() => setOpen(false)} pageLink={{ href: pageHref, label: pageLabel }} />
        </React.Suspense>
      ) : null}
    </div>
  )
}
