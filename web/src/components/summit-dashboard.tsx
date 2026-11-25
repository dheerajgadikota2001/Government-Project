import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { href } from '@/lib/route'
import { num } from '@/lib/format'
import { KindBadge } from '@/components/kit'
import { districtBySlug, drawnDistricts, mapViewBox } from '@/lib/data'
import type { Bi, SummitReport } from '@/lib/docs'
import type { useReportWords } from '@/components/summit-parts'

// The summit report's dashboard: what a reader sees first. Built to the rules the Japanese Digital Agency's
// dashboard guidebook and the UK Analysis Function set for public dashboards: the summary sits top left and
// heaviest, every number carries a comparison and its source, bars start at zero, one to eight colours, colour
// never alone (every coloured mark has its name and value printed), and the detail sits below the summary.
//
// The site's own rules still hold. Every amount is a figure as a newspaper printed it, named beside it; nothing
// is added up. The two counts (companies named, districts named) count our own records and say so.

type W = ReturnType<typeof useReportWords>
type Co = SummitReport['companies'][number]
type Sector = 'manufacturing' | 'energy' | 'digital' | 'vehicles' | 'chemicals' | 'food' | 'defence' | 'other'

/** One colour per sector, from the validated palette in index.css. "Other" is grey: it is a remainder, not an identity. */
export const SECTORS: Record<Sector, { en: string; te: string; c: string }> = {
  manufacturing: { en: 'Manufacturing', te: 'తయారీ', c: 'var(--viz-1)' },
  energy: { en: 'Energy', te: 'ఇంధనం', c: 'var(--viz-3)' },
  digital: { en: 'IT, electronics and data centres', te: 'ఐటీ, ఎలక్ట్రానిక్స్, డేటా సెంటర్లు', c: 'var(--viz-7)' },
  vehicles: { en: 'Vehicles', te: 'వాహనాలు', c: 'var(--viz-2)' },
  chemicals: { en: 'Chemicals', te: 'రసాయనాలు', c: 'var(--viz-5)' },
  food: { en: 'Food processing', te: 'ఆహార శుద్ధి', c: 'var(--viz-6)' },
  defence: { en: 'Aerospace and defence', te: 'ఏరోస్పేస్, రక్షణ', c: 'var(--viz-4)' },
  other: { en: 'Other or not stated', te: 'ఇతర లేదా చెప్పనివి', c: 'var(--viz-0)' },
}
const ORDER = Object.keys(SECTORS) as Sector[]
const TILE = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-7)', 'var(--viz-5)', 'var(--viz-6)']

const Dot = ({ s, className }: { s: string; className?: string }) => (
  <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: SECTORS[s as Sector]?.c ?? SECTORS.other.c }} />
)

export function SummitDashboard({ x, w, others }: { x: SummitReport; w: W; others: (c: Co) => React.ReactNode }) {
  const { tr, pick, by, when } = w
  const fig = (report: string, group: string) => x.figures.find((f) => f.report === report && f.group === group)!
  const shown = (k: { report: string; group: string; field: 'crore' | 'jobs' }) => {
    const f = fig(k.report, k.group)
    return k.field === 'jobs' ? num(f.jobs, 0) : pick(f.amount)
  }
  const companies = x.companies.length
  const differ = x.companies.filter((c) => c.check === 'differ').length
  const districts = new Set(x.companies.map((c) => c.district).filter(Boolean)).size
  return (
    <div className="space-y-5">
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {tr('The summit at a glance', 'ఒక చూపులో సదస్సు')}<KindBadge kind="press" />
        </div>
        {x.finding ? <h2 className="mt-2 text-[24px] font-semibold leading-[1.2] tracking-tight [text-wrap:balance] md:text-[34px]">{pick(x.finding.title)}</h2> : null}
        <p className="mt-2 text-[14px] text-muted-foreground">{tr(`Every figure is a newspaper report, named beside it. Checked ${when(x.checked)}. Promises, not money spent.`, `ప్రతి అంకె వార్తా నివేదికదే, పక్కనే పేరుతో. ${when(x.checked)}న సరిచూశాం. హామీలు, ఖర్చు చేసిన డబ్బు కాదు.`)}</p>
      </div>

      {/* The summary tiles: four printed figures, each with the figure it should be read against, and two counts of our records. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(x.kpis ?? []).map((k, i) => (
          <div key={k.id} className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 md:p-5">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: TILE[i % TILE.length] }} />
            <div className="text-[13px] font-medium text-muted-foreground">{pick(k.label)}</div>
            <div className="mt-1 font-heading text-[30px] font-semibold leading-tight tracking-tight tnum md:text-[34px]">{shown(k)}</div>
            <div className="text-[12.5px] text-muted-foreground">{by(k.report)}</div>
            {k.compare ? (
              <div className="mt-3 rounded-lg px-3 py-2 text-[13px] leading-snug" style={{ background: `color-mix(in oklab, ${TILE[i % TILE.length]} 10%, transparent)` }}>
                {pick(k.compare.label)} <b className="tnum">{shown(k.compare)}</b>
                <div className="text-[12px] text-muted-foreground">{by(k.compare.report)}</div>
              </div>
            ) : null}
          </div>
        ))}
        <a href="#scorecard" className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 hover:border-foreground/40 md:p-5">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: TILE[4] }} />
          <div className="text-[13px] font-medium text-muted-foreground">{tr('Companies named in the reports', 'నివేదికల్లో పేర్కొన్న కంపెనీలు')}</div>
          <div className="mt-1 font-heading text-[30px] font-semibold leading-tight tnum md:text-[34px]">{companies}</div>
          <div className="text-[12.5px] text-muted-foreground">{tr('Our count of the companies we found named with an amount', 'మొత్తంతో పేర్కొన్న కంపెనీల మా లెక్క')}</div>
          <div className="mt-3 rounded-lg px-3 py-2 text-[13px]" style={{ background: `color-mix(in oklab, ${TILE[4]} 10%, transparent)` }}>
            {tr('Papers print different figures for', 'వేర్వేరు అంకెలు ముద్రించినవి')} <b className="tnum">{differ}</b>
          </div>
        </a>
        <a href="#map" className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 hover:border-foreground/40 md:p-5">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: TILE[5] }} />
          <div className="text-[13px] font-medium text-muted-foreground">{tr('Districts the reports name', 'నివేదికలు పేర్కొన్న జిల్లాలు')}</div>
          <div className="mt-1 font-heading text-[30px] font-semibold leading-tight tnum md:text-[34px]">{districts} <span className="text-[18px] font-medium text-muted-foreground">{tr('of 28', '28లో')}</span></div>
          <div className="text-[12.5px] text-muted-foreground">{tr('Our count; most reports name no place', 'మా లెక్క; చాలా నివేదికలు ప్రదేశం చెప్పలేదు')}</div>
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectorPanel x={x} w={w} />
        <MapPanel x={x} w={w} />
      </div>

      <Scorecard x={x} w={w} others={others} />
    </div>
  )
}

/* ------------------------------------------------------------------ sectors */
function SectorPanel({ x, w }: { x: SummitReport; w: W }) {
  const { tr, pick, srcs } = w
  const [tab, setTab] = React.useState(0)
  const sc = x.sectors?.[tab]
  if (!sc) return null
  const top = Math.max(...sc.rows.map((r) => r.crore))
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4 md:p-5" aria-labelledby="sector-h">
      <h3 id="sector-h" className="text-[17px] font-semibold">{tr('Which industries the money is promised to', 'హామీ డబ్బు ఏ పరిశ్రమలకు')}</h3>
      <div className="mt-3 inline-flex rounded-full border border-border p-0.5" role="tablist">
        {(x.sectors ?? []).map((s, i) => (
          <button key={s.id} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
            className={cn('rounded-full px-3 py-1 text-[13px] font-medium', tab === i ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
            {s.id === 'day1' ? tr('Day 1', 'మొదటి రోజు') : tr('All 303 MoUs', 'మొత్తం 303')}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">{pick(sc.label)}</p>
      <ol className="mt-3 space-y-2.5">
        {sc.rows.map((r, i) => (
          <li key={i} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="inline-flex min-w-0 items-center gap-2"><Dot s={r.sector} /><span className="truncate">{pick(r.name)}</span></span>
              <b className="shrink-0 tnum">{pick(r.amount)}</b>
            </div>
            <span aria-hidden className="mt-1 block h-2.5 rounded-r-[4px]" style={{ width: `max(3px, ${(r.crore / top) * 100}%)`, background: SECTORS[r.sector as Sector]?.c ?? SECTORS.other.c }} />
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{pick(sc.note)} {tr('Sources:', 'ఆధారాలు:')} {srcs(sc.reports).map((s) => s.label).join(', ')}.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ the map */
function MapPanel({ x, w }: { x: SummitReport; w: W }) {
  const { te, tr, money, by } = w
  const named = React.useMemo(() => {
    const m = new Map<string, Co[]>()
    for (const c of x.companies) if (c.district) m.set(c.district, [...(m.get(c.district) ?? []), c])
    return m
  }, [x])
  const first = [...named.keys()][0] ?? null
  const [sel, setSel] = React.useState<string | null>(first)
  const d = sel ? districtBySlug.get(sel) : null
  return (
    <section id="map" className="min-w-0 scroll-mt-24 rounded-2xl border border-border bg-card p-4 md:p-5" aria-labelledby="map-h">
      <h3 id="map-h" className="text-[17px] font-semibold">{tr('Where in Andhra Pradesh', 'ఆంధ్రప్రదేశ్‌లో ఎక్కడ')}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">{tr('Coloured: a district at least one report names. Tap one to see its companies.', 'రంగు: కనీసం ఒక నివేదిక పేర్కొన్న జిల్లా. దాని కంపెనీల కోసం తాకండి.')}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <svg viewBox={mapViewBox} role="img" aria-label={tr('Map of Andhra Pradesh districts', 'ఆంధ్రప్రదేశ్ జిల్లాల పటం')} className="h-auto w-full">
          {drawnDistricts.map((dd) => {
            const on = named.has(dd.slug)
            const path = <path d={dd.shape} strokeWidth={1.5} className="stroke-card transition-[fill]" style={{ fill: on ? (sel === dd.slug ? 'var(--foreground)' : 'var(--viz-1)') : 'var(--muted)' }} />
            return on ? (
              <a key={dd.slug} href={`#map`} onClick={(e) => { e.preventDefault(); setSel(dd.slug) }} aria-label={te ? dd.te : dd.name} className="cursor-pointer">{path}</a>
            ) : <g key={dd.slug}>{path}</g>
          })}
        </svg>
        <div className="min-w-0">
          {d ? (
            <>
              <a href={href(`district-${d.slug}`)} className="text-[16px] font-semibold hover:underline" lang={te ? 'te' : undefined}>{te ? d.te : d.name}</a>
              <ul className="mt-2 space-y-2">
                {(named.get(d.slug) ?? []).map((c) => (
                  <li key={c.name + c.day} className="text-[13px] leading-snug">
                    <span className="inline-flex items-center gap-1.5"><Dot s={c.sector} /><span className="font-medium" lang="en">{c.name}</span></span> <b className="tnum">{money(c.crore)}</b>
                    <div className="text-[12px] text-muted-foreground">{by(c.report)}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...named.keys()].map((s) => (
              <button key={s} type="button" onClick={() => setSel(s)} aria-pressed={sel === s}
                className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', sel === s ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}>
                {te ? districtBySlug.get(s)?.te : districtBySlug.get(s)?.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ every company */
const CHECK = {
  differ: { en: 'Papers differ', te: 'పత్రికలు వేరు', sym: '≠', cls: 'border-foreground bg-foreground text-background' },
  agree: { en: 'Papers agree', te: 'పత్రికలు ఒకటే', sym: '=', cls: 'border-foreground/40 text-foreground' },
  one: { en: 'One paper', te: 'ఒకే పత్రిక', sym: '1', cls: 'border-dashed border-foreground/30 text-muted-foreground' },
} as const

function Scorecard({ x, w, others }: { x: SummitReport; w: W; others: (c: Co) => React.ReactNode }) {
  const { te, tr, pick, money, by } = w
  const [sector, setSector] = React.useState<Sector | 'all'>('all')
  const [onlyDiffer, setOnlyDiffer] = React.useState(false)
  const [day, setDay] = React.useState<'all' | '1' | '2' | 'none'>('all')
  const [all, setAll] = React.useState(false)
  const rows = x.companies
    .filter((c) => (sector === 'all' || c.sector === sector) && (!onlyDiffer || c.check === 'differ') && (day === 'all' || (day === 'none' ? c.day === null : String(c.day) === day)))
    .sort((a, b) => b.crore - a.crore)
  const sorted = [...x.companies].sort((a, b) => b.crore - a.crore)
  const ruler = sorted[0].crore > 3 * sorted[1].crore ? sorted[1].crore : sorted[0].crore
  const shown = all ? rows : rows.slice(0, 12)
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-[13px] font-medium', on ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')
  return (
    <section id="scorecard" className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 md:p-5" aria-labelledby="score-h">
      <h3 id="score-h" className="text-[17px] font-semibold">{tr('Every company named, and whether the papers agree', 'పేర్కొన్న ప్రతి కంపెనీ, పత్రికలు ఏకీభవించాయా')}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={tr('Sector', 'రంగం')}>
        <button type="button" aria-pressed={sector === 'all'} onClick={() => setSector('all')} className={chip(sector === 'all')}>{tr('All sectors', 'అన్ని రంగాలు')}</button>
        {ORDER.filter((s) => x.companies.some((c) => c.sector === s)).map((s) => (
          <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(s)} className={cn(chip(sector === s), 'inline-flex items-center gap-1.5')}><Dot s={s} />{te ? SECTORS[s].te : SECTORS[s].en}</button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['all', '1', '2', 'none'] as const).map((d) => <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)} className={chip(day === d)}>{d === 'all' ? tr('Both days', 'రెండు రోజులు') : d === 'none' ? tr('Day not stated', 'రోజు చెప్పలేదు') : tr(`Day ${d}`, d === '1' ? 'మొదటి రోజు' : 'రెండో రోజు')}</button>)}
        <button type="button" aria-pressed={onlyDiffer} onClick={() => setOnlyDiffer((v) => !v)} className={cn(chip(onlyDiffer), 'inline-flex items-center gap-1.5')}><span aria-hidden>≠</span>{tr('Only where papers differ', 'పత్రికలు వేరుగా చెప్పినవి మాత్రమే')}</button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{tr(`${rows.length} shown. Amounts as printed, biggest first; the bars share one ruler and nothing is added up.`, `${rows.length} చూపుతున్నాం. ముద్రించిన మొత్తాలు, పెద్దది ముందు; బార్లు ఒకే కొలతపై, ఏదీ కలపలేదు.`)}</p>
      <ol className="mt-2 divide-y divide-border">
        {shown.map((c) => {
          const k = CHECK[c.check]
          const more = others(c)
          const big = c.crore > ruler
          return (
            <li key={`${c.name}-${c.day}`} className="grid gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_9.5rem]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[15px] font-semibold leading-snug"><Dot s={c.sector} /><span lang="en">{c.name}</span></div>
                <div className="pl-[18px] text-[12.5px] leading-snug text-muted-foreground">{pick(c.what)}{c.place ? <> · <span lang="en">{c.place}</span></> : null}{c.day ? <> · {tr(`Day ${c.day}`, c.day === 1 ? 'మొదటి రోజు' : 'రెండో రోజు')}</> : null} · {by(c.report)}</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3"><b className="text-[16px] tnum" lang={te ? 'te' : undefined}>{money(c.crore)}</b>{c.jobs ? <span className="text-[12.5px] text-muted-foreground tnum">{tr(`${num(c.jobs, 0)} jobs`, `${num(c.jobs, 0)} ఉద్యోగాలు`)}</span> : null}</div>
                <span aria-hidden className="mt-1.5 flex h-2.5 items-center">
                  <span className="block h-2.5 rounded-r-[4px]" style={{ width: `max(3px, ${Math.min(1, c.crore / ruler) * 100}%)`, background: SECTORS[c.sector as Sector]?.c ?? SECTORS.other.c }} />
                  {big ? <span className="ml-1 text-[12px] font-bold">→</span> : null}
                </span>
                {big ? <div className="mt-1 text-[11.5px] text-muted-foreground">{tr('Beyond the ruler, which stops at the next largest company', 'కొలతకు మించి; కొలత తర్వాతి పెద్ద కంపెనీ వద్ద ఆగుతుంది')}</div> : null}
                {more ? (
                  <details className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground/80">{tr('What the other papers print', 'మిగతా పత్రికలు ఏం ముద్రించాయి')}</summary>
                    <div className="mt-1">{more}</div>
                  </details>
                ) : null}
              </div>
              <div className="order-first md:order-none md:text-right">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold', k.cls)}><span aria-hidden>{k.sym}</span>{te ? k.te : k.en}</span>
              </div>
            </li>
          )
        })}
      </ol>
      {rows.length > 12 ? (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[14px] font-semibold hover:bg-accent">
          {all ? tr('Show fewer', 'తక్కువ చూపండి') : tr(`Show all ${rows.length}`, `మొత్తం ${rows.length} చూపండి`)}<ChevronDown className={cn('size-4 transition-transform', all && 'rotate-180')} />
        </button>
      ) : null}
      {!rows.length ? <p className="py-6 text-[14px] text-muted-foreground">{tr('No company matches these filters.', 'ఈ వడపోతలకు ఏ కంపెనీ సరిపోలలేదు.')}</p> : null}
      <div className="mt-4 space-y-1 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
        {(x.companies_notes ?? []).map((n, i) => <p key={i}>{pick(n)}</p>)}
      </div>
    </section>
  )
}

export type { Bi }
