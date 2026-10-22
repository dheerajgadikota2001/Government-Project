import * as React from 'react'
import { BadgeCheck, Calendar, FileText, Flag, Gauge, Handshake, Landmark, Milestone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { dateLong, dateTe, num } from '@/lib/format'
import { PaperChip, Te } from '@/components/kit'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ProjectRoad, type RoadReading, type RoadStep } from '@/graphics/Road'
import { ProgressBar } from '@/vendor/tremor/ProgressBar'
import {
  Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle,
} from '@/vendor/origin/timeline'
import { YearTimeline } from '@/components/year-timeline'
import ScrollIndex from '@/vendor/kokonut/scroll-index'

/* ======================================================================
   The three tiles. Three real designs, the same facts in each.
   ====================================================================== */
export type Tile = {
  label: string; te?: string; value: React.ReactNode; caption: React.ReactNode
  paper?: { label: string; url?: string; date?: string }; bar?: number | null; extra?: React.ReactNode
}

export function Tiles({ variant, tiles }: { variant: string; tiles: Tile[] }) {
  const { lang } = useLang()
  const other = lang === 'te' ? 'en' : 'te'
  if (variant === 'strip') {
    // shadcnui-blocks Stats 01: big figures in one band, no boxes
    return (
      <div className="grid gap-x-10 gap-y-10 border-y border-border py-8 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <div className="text-[13px] font-medium text-muted-foreground">{t.label}{t.te ? <span lang={other} className="ml-2">{t.te}</span> : null}</div>
            <div className="mt-2 font-heading text-[44px] font-semibold leading-none tracking-tight tnum">{t.value}</div>
            <p className="mt-4 text-[15px] leading-snug text-foreground/85">{t.caption}</p>
            {t.extra ? <div className="mt-2">{t.extra}</div> : null}
            {t.paper ? <div className="mt-3"><PaperChip {...t.paper} /></div> : null}
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'tremor') {
    // Tremor Raw cards: each figure with a small bar drawn to scale
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-0 py-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">{t.label}{t.te ? <span lang={other}>{t.te}</span> : null}</div>
              <div className="mt-2 font-heading text-[32px] font-semibold leading-tight tnum">{t.value}</div>
              {t.bar != null ? <ProgressBar value={t.bar} variant={'record' as never} className="mt-3" /> : <div className="mt-3 h-2" />}
              <p className="mt-3 text-[14px] leading-snug text-muted-foreground">{t.caption}</p>
              {t.extra ? <div className="mt-2">{t.extra}</div> : null}
              {t.paper ? <div className="mt-3 border-t border-border pt-3"><PaperChip {...t.paper} /></div> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }
  // blocks.so Stats 01: joined cards with hairline gaps
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label} className="gap-0 rounded-none border-0 py-0 shadow-none">
          <CardContent className="flex h-full flex-col gap-y-2 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium text-muted-foreground">{t.label}{t.te ? <span lang={other} className="text-[13px]">{t.te}</span> : null}</div>
            <div className="font-heading text-[34px] font-semibold leading-tight tracking-tight tnum">{t.value}</div>
            <p className="text-[14.5px] leading-snug text-foreground/80">{t.caption}</p>
            {t.extra}
            {t.paper ? <div className="mt-auto pt-2"><PaperChip {...t.paper} /></div> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ======================================================================
   The project road, in four designs.
   ====================================================================== */
const ICONS = [BadgeCheck, Landmark, Handshake, Flag, Gauge, Milestone]

export function RoadBlock({ variant, steps, readings, due, dueLabel, duePaper }: {
  variant: string; steps: (RoadStep & { long?: string })[]; readings: RoadReading[]; due?: string | null; dueLabel?: string; duePaper?: string
}) {
  const { lang } = useLang()
  const te = lang === 'te'
  const day = (s: string) => (te ? dateTe(s) : dateLong(s))
  type Ev = { date: string; title: string; body?: string; paper?: string; url?: string; kind: 'step' | 'reading' | 'due' }
  const evs: Ev[] = React.useMemo(() => [
    ...steps.map((s) => ({ date: s.date, title: s.label, body: s.long ?? s.text, paper: s.paper, url: s.url, kind: 'step' as const })),
    ...readings.filter((r) => r.pct != null && !steps.some((s) => s.date.slice(0, 7) === r.date.slice(0, 7) && s.paper === r.paper))
      .map((r) => ({ date: r.date, title: te ? `${num(r.pct)}% భౌతిక పురోగతి` : `${num(r.pct)}% physical progress`, body: r.note ?? (te ? 'కేంద్ర గణాంకాల మంత్రిత్వ శాఖకు నివేదించినది.' : 'As reported to the Union Statistics Ministry.'), paper: r.paper, url: r.url, kind: 'reading' as const })),
    ...(due ? [{ date: due, title: dueLabel ?? (te ? 'గడువు' : 'Due date'), body: te ? 'ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు.' : 'A plan, not an event.', paper: duePaper, kind: 'due' as const }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date)), [steps, readings, due, dueLabel, duePaper, te])

  if (variant === 'origin') {
    // Origin UI Timeline (comp-535): steps up to the latest paper are filled; the plan is not
    const done = evs.filter((e) => e.kind !== 'due').length
    return (
      <Timeline defaultValue={done} className="max-w-3xl">
        {evs.map((e, i) => {
          const Icon = e.kind === 'reading' ? Gauge : e.kind === 'due' ? Calendar : ICONS[i % ICONS.length]
          return (
            <TimelineItem key={i} step={i + 1} className="group-data-[orientation=vertical]/timeline:ms-10">
              <TimelineHeader>
                <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
                <TimelineDate className="mb-0.5">{day(e.date)}</TimelineDate>
                <TimelineTitle className="text-[16px]">{e.title}</TimelineTitle>
                <TimelineIndicator className={cn('flex size-6 items-center justify-center group-data-[orientation=vertical]/timeline:-left-7',
                  e.kind === 'due' ? 'border-2 border-dashed border-foreground/50 bg-background' : 'border-none bg-primary/10 group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground')}>
                  <Icon size={13} />
                </TimelineIndicator>
              </TimelineHeader>
              <TimelineContent className="text-[14.5px]">
                {e.body}
                {e.paper ? <div className="mt-2"><PaperChip label={e.paper} url={e.url} /></div> : null}
              </TimelineContent>
            </TimelineItem>
          )
        })}
      </Timeline>
    )
  }
  if (variant === 'blocks') {
    // shadcnui-blocks Timeline 03: each step a dated card on one line
    return (
      <div className="relative ml-4 max-w-3xl">
        <div className="absolute inset-y-0 left-0 border-l-2" />
        {evs.map((e, i) => {
          const Icon = e.kind === 'reading' ? Gauge : e.kind === 'due' ? Calendar : ICONS[i % ICONS.length]
          return (
            <div className="relative pb-10 pl-10 last:pb-0" key={i}>
              <div className={cn('absolute left-px flex size-9 -translate-x-1/2 items-center justify-center rounded-full ring-8 ring-background', e.kind === 'due' ? 'border-2 border-dashed border-foreground/40 bg-background' : 'bg-accent')}>
                <Icon className="size-5" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="size-4" /><span>{day(e.date)}</span></div>
                <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{e.title}</h3>
                {e.body ? <p className="text-pretty text-[15px] text-muted-foreground">{e.body}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Badge className="rounded-full" variant="secondary">{e.kind === 'reading' ? (te ? 'పురోగతి నమోదు' : 'Progress reading') : e.kind === 'due' ? (te ? 'ప్రణాళిక' : 'Plan') : (te ? 'పత్రంలో అడుగు' : 'Step in a paper')}</Badge>
                  {e.paper ? <PaperChip label={e.paper} url={e.url} /> : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  if (variant === 'years') {
    // Years stay in view while their steps scroll by (our own component, see year-timeline.tsx)
    const byYear = d3group(evs, (e) => e.date.slice(0, 4))
    return (
      <div>
        <YearTimeline data={byYear.map(([y, es]) => ({
          title: y,
          content: (
            <div className="space-y-5">
              {es.map((e, i) => (
                <div key={i} className={cn('rounded-xl border bg-card p-4', e.kind === 'due' ? 'border-dashed border-foreground/40' : 'border-border')}>
                  <div className="text-[12.5px] text-muted-foreground">{day(e.date)}</div>
                  <div className="mt-0.5 text-[17px] font-semibold">{e.title}</div>
                  {e.body ? <p className="mt-1 text-[14.5px] text-muted-foreground">{e.body}</p> : null}
                  {e.paper ? <div className="mt-2"><PaperChip label={e.paper} url={e.url} /></div> : null}
                </div>
              ))}
            </div>
          ),
        }))} />
      </div>
    )
  }
  return <ProjectRoad steps={steps} readings={readings} due={due} dueLabel={dueLabel} duePaper={duePaper} />
  void lang
}

function d3group<T>(arr: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const a of arr) { const k = key(a); if (!m.has(k)) m.set(k, []); m.get(k)!.push(a) }
  return [...m.entries()]
}

/* ======================================================================
   The full story, in two designs.
   ====================================================================== */
export type Chapter = { id: string; title: { en: string; te?: string }; line: { en: string; te?: string }; paras: { en: string; te?: string; sources?: string[] }[] }

export function Story({ variant, chapters, paperOf }: { variant: string; chapters: Chapter[]; paperOf: (id: string) => { label: string; url?: string } | null }) {
  const { lang } = useLang()
  const txt = (b: { en: string; te?: string }) => (lang === 'te' && b.te ? <Te>{b.te}</Te> : b.en)
  const Sources = ({ ids }: { ids?: string[] }) => ids?.length ? (
    <span className="mt-1.5 flex flex-wrap gap-1.5">{ids.map((id) => { const p = paperOf(id); return p ? <PaperChip key={id} label={p.label} url={p.url} /> : null })}</span>
  ) : null
  if (variant === 'accordion') {
    return (
      <Accordion type="multiple" defaultValue={[chapters[0].id]} className="rounded-xl border border-border bg-card px-4 md:px-6">
        {chapters.map((c, i) => (
          <AccordionItem key={c.id} value={c.id}>
            <AccordionTrigger className="py-5 hover:no-underline">
              <div className="flex gap-4 text-left">
                <span className="mt-0.5 w-6 shrink-0 font-heading text-[15px] font-semibold text-muted-foreground tnum">{String(i + 1).padStart(2, '0')}</span>
                <span><span className="block font-heading text-[19px] font-semibold leading-snug">{txt(c.title)}</span><span className="mt-1 block text-[14.5px] font-normal text-muted-foreground">{txt(c.line)}</span></span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pl-10">
              <div className="max-w-[68ch] space-y-4 text-[16px] leading-[1.7]">
                {c.paras.map((p, k) => <div key={k}><p>{txt(p)}</p><Sources ids={p.sources} /></div>)}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    )
  }
  // Kokonut UI Scroll Index beside an editorial long read
  return (
    <ScrollIndex scroller="window" selector="h3[data-chapter]" className="max-w-none">
      <div className="mx-auto max-w-[70ch] space-y-14">
        {chapters.map((c, i) => (
          <article key={c.id} className="scroll-mt-24">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{lang === 'te' ? `అధ్యాయం ${i + 1}` : `Chapter ${i + 1}`}</div>
            <h3 data-chapter className="mt-1 font-serif text-[27px] font-semibold leading-tight tracking-tight md:text-[31px]">{txt(c.title)}</h3>
            <p className="mt-3 font-serif text-[19px] italic leading-relaxed text-foreground/80">{txt(c.line)}</p>
            <div className="mt-5 space-y-5 font-serif text-[18px] leading-[1.75]">
              {c.paras.map((p, k) => <div key={k}><p>{txt(p)}</p><Sources ids={p.sources} /></div>)}
            </div>
          </article>
        ))}
      </div>
    </ScrollIndex>
  )
}

export function PaperList({ papers }: { papers: { id: string; short: string; title: string; publisher: string; date: string; url: string; tier: string }[] }) {
  const { lang } = useLang()
  const te = lang === 'te'
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {papers.map((p) => (
        <li key={p.id}>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3.5 hover:bg-accent/60">
            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium leading-snug" lang="en">{p.title}</div>
              <div className="text-[13px] text-muted-foreground"><span lang="en">{p.publisher}</span> · {te ? dateTe(p.date) : dateLong(p.date)}</div>
            </div>
            <span className="hidden shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-background sm:inline">{te ? 'ప్రభుత్వ రికార్డు' : 'Government record'}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
