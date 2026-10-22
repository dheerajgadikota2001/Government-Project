import * as React from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtByName } from '@/lib/data'
import { dateLong, num } from '@/lib/format'
import { PaperChip, Te } from '@/components/kit'
import { RM } from '@/graphics/util'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PGID_MEASURES, PGID_PAPER, PGID_ROWS, type PgidMeasure } from '@/data/pgid'

// Districts side by side, in the manner of Flourish's "Highly rated": one bar per district,
// sorted by the measure shown, the reader's own district always in the accent colour. Change
// the measure and the bars re-sort with motion, so the reader watches their district move.
//
// House rules this keeps: every number is printed in the paper (nothing added up or averaged
// here); the order is only a sort, so no rank number is printed; the paper and its date sit
// under the chart; the headline asks a question and never judges.

const ROW = 30
const HDR = 24
// One remembered district for the whole site: the cards, this chart and the district pages share it.
const STORE = 'apfc-district'

// Short names keep a row on one line on a phone; the full name is in the picker and the answer.
const SHORT_EN = (n: string) => n.replace('Dr. B.R. Ambedkar ', '').replace('Sri Potti Sriramulu ', 'SPS ').replace('Parvathipuram ', '')
const SHORT_TE = (n: string) => n.replace('డా. బి.ఆర్. అంబేద్కర్ ', '').replace('శ్రీ పొట్టి శ్రీరాములు ', '').replace('పార్వతీపురం ', '')

function readStored(): string | null {
  try { return localStorage.getItem(STORE) } catch { return null }
}
function writeStored(v: string | null) {
  try { if (v) localStorage.setItem(STORE, v); else localStorage.removeItem(STORE) } catch { /* private window: fine */ }
  window.dispatchEvent(new CustomEvent('apfc-district', { detail: v }))
}

export function DistrictCompare({ district, className }: { district?: string | null; className?: string }) {
  const { lang, tr } = useLang()
  const [measure, setMeasure] = React.useState<PgidMeasure>(PGID_MEASURES[0])
  // A district page always highlights its own district; elsewhere the reader's last pick is remembered.
  const [picked, setPicked] = React.useState<string | null>(() => district ?? readStored())
  React.useEffect(() => { if (district) setPicked(district) }, [district])
  const choose = (name: string | null) => { setPicked(name); if (!district) writeStored(name) }

  const sorted = React.useMemo(() => {
    const withIndex = PGID_ROWS.map((r, i) => ({ r, i, v: r[measure.key] }))
    // Highest first; equal scores keep the order the report prints them in.
    return withIndex.sort((a, b) => b.v - a.v || a.i - b.i)
  }, [measure])
  const place = new Map(sorted.map((s, k) => [s.r.site, k]))
  // On the overall score the report prints a grade for each group of districts. Each group
  // gets a small header, so the reader sees where one grade ends and the next begins.
  // Grades belong to the overall score only, so the other measures show no headers.
  const grouped = measure.key === 'overall'
  const headers: { k: number; grade: string }[] = []
  if (grouped) sorted.forEach((s, k) => { if (k === 0 || s.r.grade !== sorted[k - 1].r.grade) headers.push({ k, grade: s.r.grade }) })
  const yOf = (k: number) => k * ROW + (grouped ? headers.filter((h) => h.k <= k).length * HDR : 0)
  const height = sorted.length * ROW + headers.length * HDR
  // Round scale marks, then the category's full points at the end of the track.
  const ticks = [...d3.ticks(0, measure.max, 3).filter((t) => t > 0 && t <= measure.max * 0.85), measure.max]
  const grade = (g: string) => g.replace('-', '\u2011') // keeps "Uttam-3" on one line
  const mine = picked ? PGID_ROWS.find((r) => r.site === picked) ?? null : null
  // A district of 2026 lights the district its area was part of when the report was written.
  const litSite = picked && districtByName.get(picked)?.formed ? districtByName.get(picked)!.from! : picked
  const label = (site: string) => {
    const d = districtByName.get(site)
    return lang === 'te' && d ? SHORT_TE(d.te) : SHORT_EN(site)
  }
  const full = (site: string) => {
    const d = districtByName.get(site)
    return lang === 'te' && d ? d.te : site
  }
  const mName = lang === 'te' ? measure.te : measure.en

  return (
    <div className={cn('@container rounded-2xl border border-border bg-card', className)}>
      <div className="space-y-4 p-4 @md:p-6">
        {/* the question, then the paper's answer for the reader's district */}
        <div>
          <h3 className="text-[20px] font-semibold leading-snug tracking-tight @md:text-[24px]">
            {mine
              ? (lang === 'te' ? <Te>{`పాఠశాల గ్రేడింగ్‌లో ${full(mine.site)} ఎక్కడ ఉంది?`}</Te> : `Where does ${mine.site} stand in school grading?`)
              : (lang === 'te' ? <Te>పాఠశాల గ్రేడింగ్‌లో జిల్లాలు ఎలా ఉన్నాయి?</Te> : 'How do the districts compare in school grading?')}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/85">
            {mine ? (
              lang === 'te'
                ? <Te>{`${full(mine.site)}: ${mName}లో ${measure.max}కి ${mine[measure.key]}.${measure.key === 'overall' ? ` గ్రేడు ${grade(mine.grade)}.` : ''}`}</Te>
                : <><b>{mine.site}</b>: <b className="tnum">{mine[measure.key]}</b> of {measure.max} for {measure.en.toLowerCase()}.{measure.key === 'overall' ? <> Grade <b>{grade(mine.grade)}</b>.</> : null}</>
            ) : picked && districtByName.get(picked)?.formed ? (() => {
              // Markapuram and Polavaram did not exist when the report was written; their area is in
              // the district they were cut from. The report's row is shown for that district, said as such.
              const n = districtByName.get(picked)!, p = districtByName.get(n.from!)!
              return lang === 'te'
                ? <Te>{`ఈ నివేదిక 2026కి ముందున్న 26 జిల్లాలదే. అప్పట్లో ${n.te} ప్రాంతం ${p.te}లో ఉంది; దాని బార్‌ను చూడండి.`}</Te>
                : `The report covers the 26 districts before 2026. ${n.name} was then part of ${p.name}; follow its bar.`
            })() : lang === 'te' ? <Te>మీ జిల్లాను ఎంచుకోండి. బార్లు కదిలినప్పుడు అది కనిపిస్తూనే ఉంటుంది.</Te> : 'Pick your district to follow it as the bars move.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={picked ?? ''} onValueChange={(v) => choose(v || null)}>
            <SelectTrigger className="h-10 w-full max-w-xs" aria-label={tr('Your district', 'మీ జిల్లా')}>
              <SelectValue placeholder={tr('Pick your district', 'మీ జిల్లాను ఎంచుకోండి')} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {[...PGID_ROWS].sort((a, b) => a.site.localeCompare(b.site)).map((r) => (
                <SelectItem key={r.site} value={r.site}>{lang === 'te' ? full(r.site) : r.site}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* measures: one scrolling row, so they never wrap into each other */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Measure', 'కొలమానం')}>
          {PGID_MEASURES.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={m.key === measure.key} onClick={() => setMeasure(m)}
              className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium',
                m.key === measure.key ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/40')}>
              {lang === 'te' ? <span lang="te">{m.te}</span> : m.en}
            </button>
          ))}
        </div>
        <div className="text-[12.5px] text-muted-foreground">
          {measure.key === 'overall'
            ? tr(`Each bar is out of ${measure.max} points.`, `ప్రతి బార్ ${measure.max} పాయింట్లకు.`)
            : tr(`The report's category "${measure.official}". Each bar is out of ${measure.max} points.`, `నివేదికలో "${measure.official}". ప్రతి బార్ ${measure.max} పాయింట్లకు.`)}
        </div>

        {/* the bars: absolutely placed rows, so a new order slides instead of jumping */}
        <div className="relative">
          {/* a light scale in the bar column, so a bar can be read against its full points */}
          <div aria-hidden className="pointer-events-none grid grid-cols-[104px_minmax(0,1fr)_40px] gap-2 px-1 @sm:grid-cols-[160px_minmax(0,1fr)_44px] @sm:gap-3">
            <span />
            <span className="relative h-5">
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 -translate-x-1/2 text-[10.5px] text-muted-foreground tnum" style={{ left: `${(t / measure.max) * 100}%`, transform: t === measure.max ? 'translateX(-100%)' : undefined }}>{t}</span>
              ))}
            </span>
            <span />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-5 grid grid-cols-[104px_minmax(0,1fr)_40px] gap-2 px-1 @sm:grid-cols-[160px_minmax(0,1fr)_44px] @sm:gap-3">
            <span />
            <span className="relative">
              {ticks.map((t) => <span key={t} className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${(t / measure.max) * 100}%` }} />)}
            </span>
            <span />
          </div>
          <ol className="relative" style={{ height, transition: RM ? undefined : 'height 650ms cubic-bezier(.22,.8,.2,1)' }} aria-label={tr(`${measure.en}, every district, highest first`, `${measure.te}, అన్ని జిల్లాలు`)}>
            {headers.map((h) => (
              <li key={'g-' + h.grade} aria-hidden className="absolute inset-x-0 top-0 flex items-end px-1 pb-1" style={{ height: HDR, transform: `translateY(${yOf(h.k) - HDR}px)` }}>
                <span className="rounded bg-card pr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr('Grade', 'గ్రేడు')} {grade(h.grade)}</span>
              </li>
            ))}
            {PGID_ROWS.map((r) => {
              const k = place.get(r.site) ?? 0
              const v = r[measure.key]
              const me = r.site === litSite
              return (
                <li key={r.site} className="absolute inset-x-0 top-0" style={{ height: ROW, transform: `translateY(${yOf(k)}px)`, transition: RM ? undefined : 'transform 650ms cubic-bezier(.22,.8,.2,1)' }}>
                  <button type="button" onClick={() => choose(me && !district ? null : r.site)} aria-pressed={me}
                    aria-label={`${full(r.site)}: ${v} ${tr('of', '/')} ${measure.max}`}
                    className={cn('grid size-full grid-cols-[104px_minmax(0,1fr)_40px] items-center gap-2 rounded-md px-1 text-left @sm:grid-cols-[160px_minmax(0,1fr)_44px] @sm:gap-3',
                      me ? 'bg-[color-mix(in_oklab,var(--chart-1)_10%,transparent)]' : 'hover:bg-accent/60')}>
                    <span className={cn('line-clamp-2 text-[12.5px] leading-[1.1] @sm:text-[13.5px]', me ? 'font-semibold text-foreground' : 'text-foreground/80')} lang={lang === 'te' ? 'te' : undefined}>{label(r.site)}</span>
                    <span className="relative h-[14px] overflow-hidden rounded-[4px] bg-muted/80">
                      <span className="absolute inset-y-0 left-0 rounded-[4px]"
                        style={{
                          width: `${(v / measure.max) * 100}%`,
                          background: me ? 'linear-gradient(90deg, color-mix(in oklab, var(--chart-1) 78%, white), var(--chart-1))' : 'color-mix(in oklab, var(--foreground) 28%, transparent)',
                          boxShadow: me ? '0 1px 6px color-mix(in oklab, var(--chart-1) 45%, transparent)' : undefined,
                          transition: RM ? undefined : 'width 650ms cubic-bezier(.22,.8,.2,1)',
                        }} />
                    </span>
                    <span className={cn('text-right text-[13px] tnum', me ? 'font-semibold' : 'text-foreground/80')}>{num(v, 0)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="space-y-1.5 border-t border-border pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <p>{tr('Sorted by the score shown. We print no rank: only the scores and grades the report prints.', 'చూపిన స్కోరు ప్రకారం వరుస. మేము ర్యాంకు ఇవ్వం. నివేదికలోని స్కోర్లు, గ్రేడ్లు చూపిస్తాం.')}</p>
          <p>{tr('The report lists the 26 districts that existed before January 2026. It names three its own way: Asr is Alluri Sitharama Raju, Manyam is Parvathipuram Manyam, Kadapa is YSR Kadapa.',
            'నివేదికలో జనవరి 2026కి ముందున్న 26 జిల్లాలు ఉన్నాయి. మూడు జిల్లాలకు నివేదిక వేరే పేర్లు వాడింది: Asr అంటే అల్లూరి సీతారామరాజు, Manyam అంటే పార్వతీపురం మన్యం, Kadapa అంటే వైఎస్ఆర్ కడప.')}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PaperChip label={`${PGID_PAPER.title}, ${PGID_PAPER.page}`} url={PGID_PAPER.url} />
            <PaperChip label={`PIB, ${dateLong(PGID_PAPER.released)}`} url={PGID_PAPER.pressUrl} />
          </div>
        </div>
      </div>
    </div>
  )
}
