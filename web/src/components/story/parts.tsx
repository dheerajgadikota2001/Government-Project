import * as React from 'react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { pol } from '@/lib/data-polavaram'
import { PaperChip } from '@/components/kit'
import type { Story } from '@/data/stories/polavaram'

// Small pieces shared by the scrolling story and the card-by-card story.

const P = pol.papers as Record<string, { short: string; url: string }>

export function DraftBadge({ className }: { className?: string }) {
  const { tr } = useLang()
  return (
    <span className={cn('inline-flex items-center rounded-full border border-dashed border-foreground/45 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/80', className)}>
      {tr('Draft, not yet reviewed', 'ముసాయిదా, ఇంకా సమీక్షించలేదు')}
    </span>
  )
}

/** Thin bars, one per step: done, current, still to come. Each one jumps to its step. */
export function Segments({ n, active, onJump, className, tone = 'page' }: { n: number; active: number; onJump?: (i: number) => void; className?: string; tone?: 'page' | 'cards' }) {
  const { tr } = useLang()
  return (
    <div className={cn('flex gap-1', className)}>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button" onClick={() => onJump?.(i)} aria-label={tr(`Go to step ${i + 1}`, `అడుగు ${i + 1}కి వెళ్లండి`)} aria-current={i === active ? 'step' : undefined}
          className="group flex h-6 min-w-0 flex-1 items-center">
          <span className={cn('h-1.5 w-full rounded-full transition-colors duration-300',
            i < active ? 'bg-foreground/70' : i === active ? 'bg-foreground' : tone === 'cards' ? 'bg-foreground/15' : 'bg-foreground/12 group-hover:bg-foreground/25')} />
        </button>
      ))}
    </div>
  )
}

export function StepBody({ story, i, big }: { story: Story; i: number; big?: boolean }) {
  const { lang, tr } = useLang()
  const s = story.steps[i]
  const te = lang === 'te'
  return (
    <>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr(`Step ${i + 1} of ${story.steps.length}`, `అడుగు ${i + 1} / ${story.steps.length}`)}</div>
      <p className={cn('leading-[1.6]', big ? 'text-[18px] sm:text-[19px]' : 'text-[17px] md:text-[18px]')} lang={te ? 'te' : undefined}>{te ? s.text.te : s.text.en}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.sources.map((id) => (P[id] ? <PaperChip key={id} label={P[id].short} url={P[id].url} /> : null))}
      </div>
    </>
  )
}
