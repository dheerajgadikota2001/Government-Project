import * as React from 'react'
import { ArrowUpRight, Check, ChevronDown, Circle, CircleDashed, CircleDot, CircleHelp, CirclePause, Expand, FileText, Info, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { KIND_WORDS, STAGE_WORDS, STATUS_WORDS } from '@/lib/format'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export const Te = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span lang="te" className={className}>{children}</span>
)

/* --------------------------------------------------------------- source kind
   Government records look solid. Company and newspaper figures never look like facts. */
export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const { lang } = useLang()
  const w = KIND_WORDS[kind] ?? KIND_WORDS.government
  const style =
    kind === 'press' ? 'border-dashed border-foreground/40 text-foreground/80'
      : kind === 'company' ? 'border-dotted border-foreground/45 text-foreground/80'
        : 'border-transparent bg-foreground text-background'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap', style, className)}>
      {lang === 'te' ? <Te>{w.te}</Te> : w.en}
    </span>
  )
}

/** The paper a figure comes from: short name, date, and one tap to open it. */
export function PaperChip({ label, url, date, kind, className }: { label: string; url?: string | null; date?: string; kind?: string; className?: string }) {
  const body = (
    <>
      <FileText className="mt-px size-3.5 shrink-0 opacity-70" aria-hidden />
      {/* the paper's whole name, wrapped, never cut: the name is how a reader finds it again */}
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}{date ? <span className="text-muted-foreground">, {date}</span> : null}</span>
      {url ? <ArrowUpRight className="mt-px size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
    </>
  )
  const cls = cn(
    'inline-flex max-w-full items-start gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-left text-[12.5px] leading-tight text-foreground/90',
    url && 'hover:border-foreground/30 hover:bg-accent transition-colors',
    className,
  )
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      {kind && kind !== 'government' && kind !== 'gov' ? <KindBadge kind={kind} /> : null}
      {url ? <a className={cls} href={url} target="_blank" rel="noopener noreferrer" lang="en">{body}</a> : <span className={cls} lang="en">{body}</span>}
    </span>
  )
}

/** Estimates are labelled in words and drawn hollow everywhere. */
export function StageTag({ stage, className }: { stage?: string | null; className?: string }) {
  const { lang } = useLang()
  if (!stage || !STAGE_WORDS[stage]) return null
  const s = STAGE_WORDS[stage]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
      s.est ? 'border border-dashed border-foreground/40 text-foreground/75' : 'bg-secondary text-foreground/80', className)}>
      {s.est ? <CircleDashed className="size-3" aria-hidden /> : <Circle className="size-3 fill-current" aria-hidden />}
      {lang === 'te' ? <Te>{s.te}</Te> : s.en}
    </span>
  )
}

/** Status carried by a word and a shape, never by colour alone (no red, no yellow). */
export function StatusWord({ status, className, size = 'sm' }: { status: string; className?: string; size?: 'sm' | 'md' }) {
  const { lang } = useLang()
  const w = STATUS_WORDS[status] ?? { en: status, te: status }
  const Icon = status === 'completed' ? Check : status === 'suspended' ? CirclePause : status === 'under_construction' ? CircleDot : CircleDashed
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', size === 'md' ? 'text-sm' : 'text-[13px]', className)}>
      <span className={cn('grid place-items-center rounded-full',
        status === 'completed' ? 'bg-foreground text-background size-4' : 'text-foreground/80 size-4')}>
        <Icon className={status === 'completed' ? 'size-3' : 'size-4'} strokeWidth={2.4} aria-hidden />
      </span>
      {lang === 'te' ? <Te>{w.te}</Te> : w.en}
    </span>
  )
}

/** Honest blanks: each kind of gap has its own words and its own look. */
export function Blank({ kind = 'notPublished', children, className }: { kind?: 'notPublished' | 'notRead' | 'noDistrict' | 'newDistrict'; children?: React.ReactNode; className?: string }) {
  const { t } = useLang()
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border border-dashed border-foreground/25 bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,var(--foreground)_4%,transparent)_6px_7px)] px-3 py-2.5 text-[13.5px] text-muted-foreground', className)}>
      <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div><span className="font-medium text-foreground/85">{t(kind)}</span>{children ? <span>. {children}</span> : null}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ glossary */
export const GLOSSARY: Record<string, { en: string; te?: string }> = {
  'MoSPI report': { en: 'The central government’s monthly report on big projects', te: 'కేంద్ర ప్రభుత్వ నెలవారీ నివేదిక' },
  CAG: { en: 'The country’s official auditor', te: 'దేశ అధికారిక ఆడిటర్' },
  MoU: { en: 'A promise signed between the state and a company', te: 'ఒప్పంద హామీ' },
  GSDP: { en: 'The value of everything produced in the state in a year', te: 'రాష్ట్ర వార్షిక ఆదాయం' },
  'Revised cost': { en: 'A newer cost the government approved later, in place of the first one', te: 'సవరించిన అంచనా వ్యయం' },
  'Budget estimate': { en: 'The plan made before the year begins', te: 'బడ్జెట్ అంచనా' },
  'Revised estimate': { en: 'The plan changed during the year', te: 'సవరించిన అంచనా' },
  'Audited figure': { en: 'The final figure, checked by the country’s official auditor' },
  'Actual figure': { en: 'The figure from the government’s accounts for a year that is over. It is not an estimate.', te: 'ముగిసిన ఏడాది ప్రభుత్వ లెక్కల్లోని సంఖ్య. ఇది అంచనా కాదు.' },
  'Provisional figure': { en: 'An early figure that may still change' },
  'Capital outlay': { en: 'Money spent on things that last: roads, dams, buildings', te: 'మూలధన వ్యయం' },
  'Off-budget borrowing': { en: 'Loans taken through state companies, not shown in the budget', te: 'బడ్జెట్ బయటి అప్పులు' },
  AMRUT: { en: 'A central government programme that pays for town works such as drinking water, sewerage and ponds' },
  TMC: { en: 'Thousand million cubic feet, the unit used for river water' },
}

/** A hard word that opens its one-line meaning on tap. */
export function Term({ term, children }: { term: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const { lang } = useLang()
  const g = GLOSSARY[term]
  if (!g) return <>{children ?? term}</>
  return (
    <Popover>
      <PopoverTrigger className="cursor-help underline decoration-dotted decoration-foreground/40 underline-offset-[3px] hover:decoration-foreground">
        {children ?? term}
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" side="top">
        <div className="mb-1 font-semibold">{term}</div>
        {lang === 'te' && g.te ? <Te>{g.te}</Te> : <span lang="en">{g.en}</span>}
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ layout */
export function Section({ id, eyebrow, title, te, lede, children, className, actions }: {
  id?: string; eyebrow?: React.ReactNode; title: React.ReactNode; te?: string; lede?: React.ReactNode
  children?: React.ReactNode; className?: string; actions?: React.ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-24', className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{eyebrow}</div> : null}
          <h2 className="text-[26px] leading-[1.15] font-semibold tracking-tight md:text-[30px]">{title}</h2>
          {te ? <p lang={/[\u0C00-\u0C7F]/.test(te) ? 'te' : 'en'} className="mt-1 text-[15px] text-muted-foreground">{te}</p> : null}
          {lede ? <div className="mt-2.5 text-[16px] leading-relaxed text-muted-foreground">{lede}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------- the six parts
   Every chart explains itself the same way: the question, the short answer,
   how to read it (with an everyday example where the idea is new), notes on
   the chart, what it does not tell you, and the paper with its date. */
export type Bi = { en: React.ReactNode; te: React.ReactNode }

/** A household example with round numbers. Marked, so it is never mistaken for the paper's figures. */
export function ExampleBox({ children, madeUp = true, className }: { children: React.ReactNode; madeUp?: boolean; className?: string }) {
  const { t } = useLang()
  return (
    <div className={cn('rounded-lg border border-dashed px-3.5 py-2.5 text-[14px] leading-relaxed text-foreground/85',
      'border-[color-mix(in_oklab,var(--chart-3)_45%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,var(--card))]', className)}>
      <span className="font-semibold">{t('example')}</span>
      {madeUp ? <span className="text-muted-foreground"> ({t('madeUp')})</span> : null}
      <span>: </span>{children}
    </div>
  )
}

/** "How to read it" and "What this does not tell you": one labelled line each. */
export function ReadLine({ kind, children, className }: { kind: 'how' | 'limits'; children: React.ReactNode; className?: string }) {
  const { t } = useLang()
  return (
    <p className={cn('text-[14px] leading-relaxed text-muted-foreground', className)}>
      <span className="font-semibold text-foreground/85">{t(kind === 'how' ? 'howToRead' : 'notTell')}: </span>{children}
    </p>
  )
}

/** The short answer of a chart, in one or two lines. */
export function ShortAnswer({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useLang()
  return (
    <div className={cn('rounded-lg border-l-[3px] border-brand bg-brand-soft/60 px-3.5 py-2.5', className)}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand">{t('shortAnswer')}</div>
      <div className="mt-0.5 text-[15.5px] leading-relaxed">{children}</div>
    </div>
  )
}

/** Every graphic: the question, its short answer, how to read it, the chart, its limits, its papers, the numbers as a table, and a full-screen view. */
export function ChartFrame({ title, te, q, sub, answer, how, example, exampleMadeUp, limits, sources, table, children, className, note }: {
  title?: React.ReactNode; te?: string; q?: Bi; sub?: React.ReactNode
  answer?: React.ReactNode; how?: React.ReactNode; example?: React.ReactNode; exampleMadeUp?: boolean; limits?: React.ReactNode
  sources: { label: string; url?: string; date?: string; kind?: string }[]
  table?: React.ReactNode; children: React.ReactNode; className?: string; note?: React.ReactNode
}) {
  const { t, lang } = useLang()
  const [open, setOpen] = React.useState(false)
  // With a bilingual question, the reader's language leads and the other language sits beneath it.
  const head = q ? (lang === 'te' ? q.te : q.en) : title
  const second = q ? (lang === 'te' ? q.en : q.te) : te
  const secondLang = q ? (lang === 'te' ? 'en' : 'te') : 'te'
  return (
    <figure className={cn('min-w-0 rounded-xl border border-border bg-card p-4 md:p-6', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <figcaption lang={q && lang === 'te' ? 'te' : undefined} className="text-[17px] font-semibold leading-snug tracking-tight md:text-[18px]">{head}</figcaption>
          {second ? <p lang={secondLang} className="text-[14px] text-muted-foreground">{second}</p> : null}
          {sub ? <div className="mt-1 text-[13.5px] text-muted-foreground">{sub}</div> : null}
        </div>
        <Dialog>
          <DialogTrigger className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={lang === 'te' ? 'ఈ చిత్రాన్ని పూర్తి తెరపై తెరవండి' : 'Open this graphic full screen'}>
            <Expand className="size-4" />
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] w-[min(96vw,1200px)] max-w-none overflow-auto sm:max-w-none">
            <DialogHeader>
              <DialogTitle>{head}</DialogTitle>
              <DialogDescription>{sub}</DialogDescription>
            </DialogHeader>
            {how ? <ReadLine kind="how">{how}</ReadLine> : null}
            <div className="min-w-0">{children}</div>
            {table ? <div className="mt-4 overflow-x-auto">{table}</div> : null}
          </DialogContent>
        </Dialog>
      </div>
      {answer || how || example ? (
        <div className="mb-4 space-y-2.5">
          {answer ? <ShortAnswer>{answer}</ShortAnswer> : null}
          {how ? <ReadLine kind="how">{how}</ReadLine> : null}
          {example ? <ExampleBox madeUp={exampleMadeUp !== false}>{example}</ExampleBox> : null}
        </div>
      ) : null}
      <div className="min-w-0">{children}</div>
      {note ? <div className="mt-3 flex gap-2 text-[13.5px] text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /><div className="min-w-0">{note}</div></div> : null}
      {limits ? <ReadLine kind="limits" className="mt-3 text-[13.5px]">{limits}</ReadLine> : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('source')}</span>
        {sources.map((s, i) => <PaperChip key={i} label={s.label} url={s.url} date={s.date} kind={s.kind} />)}
        {table ? (
          <Collapsible open={open} onOpenChange={setOpen} className="ml-auto">
            <CollapsibleTrigger className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground/80 hover:text-foreground">
              {open ? t('hideNumbers') : t('seeNumbers')}<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
            </CollapsibleTrigger>
          </Collapsible>
        ) : null}
      </div>
      {table && open ? <div className="mt-3 overflow-x-auto">{table}</div> : null}
    </figure>
  )
}

/** A plain table for "See the numbers". */
export function NumTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="w-full min-w-[480px] border-collapse text-[13.5px]">
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={cn('border-b border-border py-2 pr-4 text-left font-semibold text-muted-foreground', i > 0 && 'text-right')}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            {r.map((c, j) => <td key={j} className={cn('py-2 pr-4 align-top', j > 0 && 'text-right tnum')}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The place for the voice feature. It makes no sound until the voice service is connected. */
export function ListenButton({ className }: { className?: string }) {
  const { t } = useLang()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-disabled className={cn('inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground/70', className)}>
          <Volume2 className="size-4" aria-hidden />{t('listen')}
        </button>
      </TooltipTrigger>
      <TooltipContent>The voice assistant connects here. It is not switched on yet.</TooltipContent>
    </Tooltip>
  )
}

export function AnswerBox({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  const { tr } = useLang()
  label = label ?? tr('The short answer', 'సంక్షిప్త సమాధానం')
  return (
    <div className={cn('relative rounded-2xl border border-border bg-card p-5 md:p-6', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        <ListenButton />
      </div>
      <div className="space-y-2 text-[17px] leading-relaxed md:text-[18px]">{children}</div>
    </div>
  )
}

/** A figure with what it measures, its date and its paper beneath. */
export function Figure({ value, unit, caption, paper, est, className, big = true }: {
  value: React.ReactNode; unit?: React.ReactNode; caption: React.ReactNode
  paper?: { label: string; url?: string; date?: string; kind?: string }; est?: boolean; className?: string; big?: boolean
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('font-heading font-semibold tracking-tight tnum', big ? 'text-[34px] leading-none md:text-[40px]' : 'text-[24px] leading-tight', est && 'text-foreground/75')}>
        {value}{unit ? <span className="ml-1 text-[0.5em] font-medium text-muted-foreground">{unit}</span> : null}
      </div>
      <div className="mt-2 text-[14px] leading-snug text-muted-foreground">{caption}</div>
      {paper ? <div className="mt-2"><PaperChip {...paper} /></div> : null}
    </div>
  )
}
