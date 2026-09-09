import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { applySeo } from '../lib/seo'
import { findFinanceQuestion, FINANCE_QUESTIONS, financeQuestionPath } from '../lib/financeQuestions'
import FinanceQuestionMenu from '../components/FinanceQuestionMenu'
import { VizSection, StatTiles, useChartTip, fmtIN, SEQ, HBarChart } from '../components/advanced/ChartPrimitives'
import Deferred from '../components/Deferred'
import { FinancesHero } from '../components/HeroInsights'
import DepartmentSpending from '../components/DepartmentSpending'
import DebtClock from '../components/DebtClock'
import CommittedSpending from '../components/CommittedSpending'
import PromisedVsSpent from '../components/PromisedVsSpent'
import { useT } from '../i18n'
import PageThread from '../components/community/PageThread'

/**
 * State Finances — AP's debt story since bifurcation, told from three
 * independent official source families side by side (RBI · AP's own budget
 * books · CAG audits), with political white papers shown strictly as claims.
 * Every figure on this page is transcribed from a cited document; where
 * sources disagree, the disagreement IS the content.
 */

// Labels and descriptions are keys, resolved at render so they follow the
// chosen language. Colours are not translatable.
const FAMILY_META = {
  RBI: { labelKey: 'finances.family.rbi.label', descKey: 'finances.family.rbi.desc', color: SEQ[1] },
  AP_BUDGET: { labelKey: 'finances.family.apBudget.label', descKey: 'finances.family.apBudget.desc', color: SEQ[3] },
  CAG: { labelKey: 'finances.family.cag.label', descKey: 'finances.family.cag.desc', color: SEQ[5] },
  NSO: { labelKey: 'finances.family.nso.label', descKey: 'finances.family.nso.desc', color: SEQ[4] },
}

/** Unit words come from the catalogue, so callers pass `t` in. */
const fmtCr = (v, t) => {
  if (v == null) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  return `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`
}

/**
 * A sentence is one translation unit, so emphasis travels inside the string:
 * **bold** and *italic* markers become elements here. A translation that drops
 * the markers still renders, just unstyled.
 */
function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

/** Grouped columns: one cluster per fiscal year, one column per source family. */
function GroupedYearColumns({ series, years, tip, height = 190 }) {
  const { t } = useT()
  const W = 780
  const H = height
  const PAD_L = 8
  const maxV = Math.max(...series.flatMap(s => s.points.map(p => p.value)))
  const mag = Math.pow(10, Math.floor(Math.log10(maxV)))
  const top = Math.ceil(maxV / mag) * mag
  const groupW = (W - PAD_L) / years.length
  const barW = Math.min(14, (groupW - 10) / series.length)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="min-w-[640px] w-full" role="img"
        aria-label={t('finances.chart.groupedAria')}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W} y1={H - H * f} y2={H - H * f} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
            <text x={PAD_L} y={H - H * f - 3} className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {top >= 10000 ? fmtIN(Math.round((top * f) / 1000) * 1000) : Math.round(top * f)}
            </text>
          </g>
        ))}
        {years.map((yr, yi) => (
          <g key={yr}>
            {series.map((s, si) => {
              const pt = s.points.find(p => p.fy_end === yr)
              if (!pt) return null
              const h = Math.max(2, (pt.value / top) * (H - 14))
              const x = PAD_L + yi * groupW + 5 + si * (barW + 2)
              const label = s.label || t(FAMILY_META[s.family].labelKey)
              const color = s.color || FAMILY_META[s.family].color
              const stage = pt.stage === 'RE' ? t('hero.stage.re') : t('hero.stage.be')
              return (
                <rect key={label} x={x} y={H - h} width={barW} height={h} rx="2"
                  fill={color}
                  opacity={pt.stage === 'A' ? 1 : 0.55}
                  onMouseMove={e => tip.show(e,
                    t('finances.chart.fyEndingMarch', { year: yr, label }),
                    `${fmtCr(pt.value, t)}${pt.stage !== 'A' ? ` (${stage})` : ''}${pt.note ? ` · ${pt.note}` : ''}`)}
                  onMouseLeave={tip.hide}
                />
              )
            })}
            <text x={PAD_L + yi * groupW + groupW / 2} y={H + 14} textAnchor="middle"
              className="text-[9px]" fill="currentColor" fillOpacity="0.65">{String(yr).slice(2)}</text>
          </g>
        ))}
        <text x={PAD_L} y={H + 24} className="text-[8px]" fill="currentColor" fillOpacity="0.45">
          {t('finances.chart.axisNote')}
        </text>
      </svg>
    </div>
  )
}

/** Stacked columns: composition per year (audited CAG three-way split). */
function StackedYearColumns({ years, segments, tip, height = 190 }) {
  const { t } = useT()
  const W = 780
  const H = height
  const PAD_L = 8
  const totals = years.map(y => segments.reduce((s, seg) => s + (seg.byYear[y] || 0), 0))
  const maxV = Math.max(...totals)
  const mag = Math.pow(10, Math.floor(Math.log10(maxV)))
  const top = Math.ceil(maxV / mag) * mag
  const groupW = (W - PAD_L) / years.length
  const barW = Math.min(30, groupW - 12)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="min-w-[640px] w-full" role="img"
        aria-label={t('finances.chart.stackedAria')}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W} y1={H - H * f} y2={H - H * f} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
            <text x={PAD_L} y={H - H * f - 3} className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {top >= 10000 ? fmtIN(Math.round((top * f) / 1000) * 1000) : Math.round(top * f)}
            </text>
          </g>
        ))}
        {years.map((yr, yi) => {
          let acc = 0
          const x = PAD_L + yi * groupW + (groupW - barW) / 2
          return (
            <g key={yr}>
              {segments.map(seg => {
                const v = seg.byYear[yr]
                if (!v) return null
                const h = (v / top) * (H - 14)
                const y = H - acc * ((H - 14) / top) - h
                acc += v
                return (
                  <rect key={seg.key} x={x} y={y} width={barW} height={Math.max(1.5, h)}
                    fill={seg.color}
                    onMouseMove={e => tip.show(e,
                      t('finances.chart.fyEndingMarch', { year: yr, label: seg.label }),
                      t('finances.chart.ofTotal', { value: fmtCr(v, t), total: fmtCr(totals[yi], t) }))}
                    onMouseLeave={tip.hide}
                  />
                )
              })}
              <text x={x + barW / 2} y={H + 14} textAnchor="middle"
                className="text-[9px]" fill="currentColor" fillOpacity="0.65">{String(yr).slice(2)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Legend({ families }) {
  const { t } = useT()
  return (
    <div className="flex flex-wrap gap-3 text-label-sm text-on-surface-variant">
      {families.map(f => (
        <span key={f} className="inline-flex items-center gap-1.5 min-w-0">
          <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: FAMILY_META[f].color }} />
          <strong className="text-on-surface">{t(FAMILY_META[f].labelKey)}</strong> — {t(FAMILY_META[f].descKey)}
        </span>
      ))}
    </div>
  )
}

/**
 * "i" explainer — hover shows the plain-language tooltip; click/tap opens a
 * small popover (for phones, where there is no hover). One per section.
 */
function InfoTip({ tip, text }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={t('finances.infoTip.aria')}
        aria-expanded={open}
        className="w-5 h-5 rounded-full border border-outline-variant text-on-surface-variant text-[11px] leading-none inline-flex items-center justify-center hover:bg-surface-container cursor-help font-serif italic font-bold"
        onMouseEnter={e => !open && tip.show(e, t('finances.infoTip.title'), '', text)}
        onMouseMove={e => !open && tip.show(e, t('finances.infoTip.title'), '', text)}
        onMouseLeave={tip.hide}
        onClick={() => { tip.hide(); setOpen(o => !o) }}
      >i</button>
      {open && (
        <span role="note" className="absolute start-0 top-7 z-40 w-80 max-w-[80vw] bg-surface border border-outline-variant rounded-xl shadow-lg p-3 text-label-md text-on-surface font-normal not-italic normal-case tracking-normal">
          {text}
          <button type="button" className="block mt-1.5 text-primary text-label-sm" onClick={() => setOpen(false)}>{t('common.close')}</button>
        </span>
      )}
    </span>
  )
}

/** Chips linking every official document behind a section — page + direct PDF. */
function SectionSources({ data, sectionKey }) {
  const { t } = useT()
  const keys = data.section_sources?.[sectionKey]
  if (!keys?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-dashed border-surface-variant">
      <span className="text-label-sm text-on-surface-variant me-1">{t('finances.sources.official')}</span>
      {keys.map(k => {
        const src = data.sources[k]
        if (!src) return null
        return (
          <span key={k} className="inline-flex items-center gap-1 text-label-sm bg-surface-container rounded-full px-2.5 py-1 min-w-0">
            <a className="text-primary hover:underline" href={src.url} target="_blank" rel="noreferrer" title={src.title}>
              {src.short || src.title.slice(0, 36)}
            </a>
            {src.pdf && (
              <a className="text-primary font-bold hover:underline" href={src.pdf} target="_blank" rel="noreferrer"
                title={t('finances.sources.directPdf', { title: src.title })}>PDF↓</a>
            )}
          </span>
        )
      })}
    </div>
  )
}

function Story({ children }) {
  return (
    <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{children}</p>
  )
}

/**
 * One question, one answer, then the evidence.
 *
 * Every section on this page is a question a person might actually ask, in
 * their own words. Directly under it sits the answer in one or two sentences
 * — enough for a reader who has thirty seconds. The chart, the caveats and
 * the documents sit below that, for the reader who wants to check.
 *
 * The order matters: a reader who only reads the bold line must still come
 * away with something true, so the answer line never says more than the chart
 * beneath it can support.
 */
function QuestionSection({ id, question, answer, children }) {
  return (
    <section id={id} className="scroll-mt-20 flex flex-col gap-3">
      <h2 className="text-headline-md font-headline-md text-on-surface font-bold max-w-3xl">{question}</h2>
      {answer && (
        <p className="text-body-lg font-body-lg text-on-surface leading-relaxed max-w-3xl">{answer}</p>
      )}
      {children}
    </section>
  )
}

export default function Finances() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [gov, setGov] = useState(null)
  const [error, setError] = useState(null)
  const tip = useChartTip()

  // Which question is open comes from the address, never from state: see
  // financeQuestions.js. /finances opens on the first question; a slug that is
  // not on the list goes back to /finances rather than showing an empty menu.
  const { question: slug } = useParams()
  const active = (slug && findFinanceQuestion(slug)) || FINANCE_QUESTIONS[0]
  const unknownSlug = Boolean(slug) && !findFinanceQuestion(slug)

  // The route table only knows "/finances/:question". The question knows its
  // own title, so it sets it. Runs after the Seo component's effect (that one
  // is mounted before the routes), so this is the title that stays.
  useEffect(() => {
    if (unknownSlug) return
    if (slug) applySeo(financeQuestionPath(active.slug), { title: active.title, description: active.description })
    else applySeo('/finances')
  }, [slug, active, unknownSlug])

  useEffect(() => {
    apiGet('/governments/').then(g => setGov(g)).catch(() => {})
    apiGet('/finances/').then(d => { setData(d); setError(null) }).catch(setError)
  }, [])

  const bySeries = useMemo(() => {
    if (!data) return {}
    const m = {}
    data.series.forEach(s => { m[`${s.indicator}:${s.source_family}`] = s })
    return m
  }, [data])

  const debtSeries = useMemo(() => {
    if (!data) return []
    return ['RBI', 'AP_BUDGET', 'CAG']
      .map(f => ({ family: f, points: bySeries[`outstanding_liabilities:${f}`]?.points || [] }))
      .filter(s => s.points.length)
  }, [data, bySeries])

  const years = useMemo(() => {
    const ys = new Set(debtSeries.flatMap(s => s.points.map(p => p.fy_end)))
    return [...ys].sort()
  }, [debtSeries])

  // Per-tenure debt added — same source family, actuals only, boundaries stated.
  const tenureTiles = useMemo(() => {
    if (!data) return []
    const rbi = bySeries['outstanding_liabilities:RBI']?.points || []
    const ap = bySeries['outstanding_liabilities:AP_BUDGET']?.points || []
    const at = (pts, yr) => pts.find(p => p.fy_end === yr && p.stage === 'A')?.value ?? null
    const mk = (label, dates, from, to) => {
      const r0 = at(rbi, from); const r1 = at(rbi, to)
      const a0 = at(ap, from); const a1 = at(ap, to)
      return {
        label,
        value: r0 != null && r1 != null
          ? `+${fmtCr(r1 - r0, t)}`
          : (a0 != null && a1 != null ? `+${fmtCr(a1 - a0, t)}` : t('finances.tiles.awaiting')),
        detail: r0 != null && r1 != null
          ? t('finances.tiles.rbiDetail', { from, to, dates })
          : (a0 != null && a1 != null ? t('finances.tiles.apDetail', { from, to, dates }) : dates),
      }
    }
    return [
      mk(t('finances.tiles.tdp1'), t('finances.tiles.tdp1Dates'), 2015, 2019),
      mk(t('finances.tiles.ysrcp'), t('finances.tiles.ysrcpDates'), 2019, 2024),
      mk(t('finances.tiles.tdp2'), t('finances.tiles.tdp2Dates'), 2024, 2025),
      {
        label: t('finances.tiles.onTop'),
        value: fmtCr((bySeries['off_budget_borrowings:CAG']?.points || []).at(-1)?.value, t),
        detail: t('finances.tiles.onTopDetail'),
      },
    ]
  }, [data, bySeries, t])

  const offBudget = bySeries['off_budget_borrowings:CAG']?.points || []
  const guarantees = bySeries['guarantees:RBI']?.points || []
  const gsdp = bySeries['gsdp:NSO']?.points || []
  const fd = bySeries['fiscal_deficit:AP_BUDGET']?.points || []
  const rd = bySeries['revenue_deficit:AP_BUDGET']?.points || []

  const ratioPoints = useMemo(() => {
    const rbi = bySeries['outstanding_liabilities:RBI']?.points || []
    return rbi.map(p => {
      const g = gsdp.find(x => x.fy_end === p.fy_end)
      return g ? { fy_end: p.fy_end, value: +(100 * p.value / g.value).toFixed(1), stage: p.stage } : null
    }).filter(Boolean)
  }, [bySeries, gsdp])

  if (unknownSlug) return <Navigate to="/finances" replace />

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-body-md text-on-surface">{t('finances.error', { message: error.message })}</p>
      </div>
    )
  }
  if (!data) {
    return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('finances.loading')}</div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-headline-lg font-headline-lg text-on-surface">{t('finances.title')}</h1>
        <Story>{rich(t('finances.intro'))}</Story>
        <p className="text-label-md text-on-surface-variant bg-surface-container rounded-lg px-4 py-2.5 max-w-3xl leading-relaxed">
          {rich(t('finances.threeGovernments'))}
          {' '}{data.tenure_boundary_note || data.boundary_note}
        </p>
      </header>

      {/* The headline: two official totals for the same state, and the gap. */}
      <DebtClock data={data} />

      <QuestionSection
        id="per-government"
        question={t('finances.q.perGovernment')}
        answer={t('finances.a.perGovernment')}
      >
        <StatTiles tiles={tenureTiles} />
        {gov && <FinancesHero finances={data} governments={gov} />}
      </QuestionSection>

      {/* Everything above stays on every visit. Everything below is one
          question at a time: the menu decides which of these renders. */}
      <FinanceQuestionMenu active={active}>

      {active.id === 'three-sources' && (
      <QuestionSection
        id="three-sources"
        question={t('finances.q.threeSources')}
        answer={t('finances.a.threeSources')}
      >
        <VizSection
          title={t('finances.debt.title')}
          info={<InfoTip tip={tip} text={data.glossary?.debt} />}
          sub={t('finances.debt.sub')}
          provenance={t('finances.debt.provenance')}
        >
          <Legend families={['RBI', 'AP_BUDGET', 'CAG']} />
          <GroupedYearColumns tip={tip} years={years} series={debtSeries} />
          <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
            {rich(t('finances.debt.body'))}
          </p>
          <SectionSources data={data} sectionKey="debt" />
        </VizSection>
      </QuestionSection>
      )}

      {active.id === 'debt-composition' && (
        <QuestionSection
          id="debt-composition"
          question={t('finances.q.composition')}
          answer={t('finances.a.composition')}
        >
          {data.composition?.cag_three_way && (
          <VizSection
            title={t('finances.composition.title')}
            info={<InfoTip tip={tip} text={data.glossary?.composition} />}
            sub={t('finances.composition.sub')}
            provenance={t('finances.composition.provenance')}
          >
            <div className="flex flex-wrap gap-3 text-label-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5 min-w-0"><span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: SEQ[1] }} /><strong className="text-on-surface">{t('finances.composition.internal')}</strong> — {t('finances.composition.internalDesc')}</span>
              <span className="inline-flex items-center gap-1.5 min-w-0"><span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: SEQ[3] }} /><strong className="text-on-surface">{t('finances.composition.goi')}</strong> — {t('finances.composition.goiDesc')}</span>
              <span className="inline-flex items-center gap-1.5 min-w-0"><span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: SEQ[5] }} /><strong className="text-on-surface">{t('finances.composition.publicAccount')}</strong> — {t('finances.composition.publicAccountDesc')}</span>
            </div>
            <StackedYearColumns
              tip={tip}
              years={data.composition.cag_three_way.years.map(y => y.fy_end)}
              segments={[
                { key: 'internal', label: t('finances.composition.internal'), color: SEQ[1], byYear: Object.fromEntries(data.composition.cag_three_way.years.map(y => [y.fy_end, y.internal_debt])) },
                { key: 'goi', label: t('finances.composition.goi'), color: SEQ[3], byYear: Object.fromEntries(data.composition.cag_three_way.years.map(y => [y.fy_end, y.goi_loans])) },
                { key: 'pa', label: t('finances.composition.publicAccount'), color: SEQ[5], byYear: Object.fromEntries(data.composition.cag_three_way.years.map(y => [y.fy_end, y.public_account])) },
              ]}
            />
            <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
              {data.composition.cag_three_way.note}
            </p>
            {data.composition.rbi_latest_detail && (
              <div className="mt-5 flex flex-col gap-2">
                <h4 className="text-title-md font-title-md text-on-surface">{data.composition.rbi_latest_detail.label}</h4>
                <HBarChart
                  tip={tip}
                  unit={t('unit.crore')}
                  maxValue={400000}
                  rows={data.composition.rbi_latest_detail.items.map(i => ({
                    label: i.name,
                    value: i.value,
                    tipDetail: t('finances.composition.ofTotalDebt', {
                      total: fmtCr(data.composition.rbi_latest_detail.total, t),
                    }),
                  }))}
                />
                <ul className="text-label-md text-on-surface-variant flex flex-col gap-1.5 max-w-3xl list-disc ps-5 leading-relaxed">
                  {data.composition.growth_facts?.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                <p className="text-label-sm text-outline max-w-3xl leading-relaxed">{data.composition.definitions_note}</p>
                <SectionSources data={data} sectionKey="composition" />
              </div>
            )}
          </VizSection>
          )}
        </QuestionSection>
      )}

      {active.id === 'off-budget' && (
      <QuestionSection
        id="off-budget"
        question={t('finances.q.hidden')}
        answer={t('finances.a.hidden')}
      >
        <div className="grid lg:grid-cols-2 gap-4">
          <VizSection
            title={t('finances.offBudget.title')}
            info={<InfoTip tip={tip} text={data.glossary?.offbudget} />}
            sub={t('finances.offBudget.sub')}
            provenance={t('finances.offBudget.provenance')}
          >
            <GroupedYearColumns tip={tip} years={offBudget.map(p => p.fy_end)}
              series={[{ family: 'CAG', points: offBudget }]} height={150} />
            <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
              {rich(t('finances.offBudget.body'))}
            </p>
            {bySeries['off_budget_borrowings:CAG']?.pending_note && (
              <p className="text-label-sm text-on-surface-variant mt-2 max-w-3xl border border-dashed border-outline-variant rounded-lg px-3 py-2 leading-relaxed">
                <strong className="text-on-surface">{t('finances.offBudget.awaiting')}</strong>{' '}
                {bySeries['off_budget_borrowings:CAG'].pending_note}
              </p>
            )}
            <SectionSources data={data} sectionKey="offbudget" />
          </VizSection>

          <VizSection
            title={t('finances.guarantees.title')}
            info={<InfoTip tip={tip} text={data.glossary?.guarantees} />}
            sub={t('finances.guarantees.sub')}
            provenance={t('finances.guarantees.provenance')}
          >
            <GroupedYearColumns tip={tip} years={guarantees.map(p => p.fy_end)}
              series={[{ family: 'RBI', points: guarantees }]} height={150} />
            <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
              {rich(t('finances.guarantees.body'))}
            </p>
            <SectionSources data={data} sectionKey="guarantees" />
          </VizSection>
        </div>
      </QuestionSection>
      )}

      {active.id === 'ratio' && (
      <QuestionSection
        id="ratio"
        question={t('finances.q.tooBig')}
        answer={t('finances.a.tooBig')}
      >
        <VizSection
          title={t('finances.ratio.title')}
          info={<InfoTip tip={tip} text={data.glossary?.ratio} />}
          sub={t('finances.ratio.sub')}
          provenance={t('finances.ratio.provenance')}
        >
          <GroupedYearColumns tip={tip} years={ratioPoints.map(p => p.fy_end)}
            series={[{ family: 'RBI', points: ratioPoints.map(p => ({ ...p, note: t('finances.ratio.note') })) }]} height={130} />
          <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
            {rich(t('finances.ratio.body'))}
          </p>
          <SectionSources data={data} sectionKey="ratio" />
        </VizSection>
      </QuestionSection>
      )}

      {/* What interest takes before any new decision is possible. */}
      {active.id === 'committed' && <CommittedSpending data={data} tip={tip} />}

      {active.id === 'deficits' && (
      <QuestionSection
        id="deficits"
        question={t('finances.q.deficits')}
        answer={t('finances.a.deficits')}
      >
        <VizSection
          title={t('finances.deficits.title')}
          info={<InfoTip tip={tip} text={data.glossary?.deficits} />}
          sub={t('finances.deficits.sub')}
          provenance={t('finances.deficits.provenance')}
        >
          <GroupedYearColumns tip={tip} years={fd.map(p => p.fy_end)}
            series={[
              { family: 'AP_BUDGET', label: t('finances.deficits.fiscal'), color: SEQ[2], points: fd },
              { family: 'AP_BUDGET', label: t('finances.deficits.revenue'), color: SEQ[5], points: rd },
            ]} height={150} />
          <p className="text-label-md text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
            {t('finances.deficits.body')}
          </p>
          <SectionSources data={data} sectionKey="deficits" />
        </VizSection>
      </QuestionSection>
      )}

      {/* Voted by the Assembly, against what actually left the treasury. */}
      {active.id === 'promised' && <PromisedVsSpent data={data} tip={tip} />}

      {active.id === 'departments' && (
      <QuestionSection
        id="departments"
        question={t('finances.q.departments')}
        answer={t('finances.a.departments')}
      >
        <Deferred minHeight={520}><DepartmentSpending /></Deferred>
      </QuestionSection>
      )}

      {active.id === 'claims' && (
      <QuestionSection
        id="claims"
        question={t('finances.q.claims')}
        answer={t('finances.a.claims')}
      >
        <div className="grid md:grid-cols-2 gap-4">
          {data.claims.map(c => (
            <article key={c.id} className="border border-outline-variant rounded-xl p-5 flex flex-col gap-2 bg-surface-container-lowest">
              <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">{c.date} · {t('finances.claims.claimDocument')}</p>
              <h3 className="text-title-md font-title-md text-on-surface">{c.made_by}</h3>
              <ul className="list-disc ps-5 text-body-md text-on-surface flex flex-col gap-1 leading-relaxed">
                {c.claims.map((cl, i) => <li key={i}>{cl}</li>)}
              </ul>
              <p className="text-label-md text-on-surface-variant border-t border-surface-variant pt-2 mt-1 leading-relaxed">
                <strong className="text-on-surface">{t('finances.claims.checkAgainst')}</strong> {c.context}
              </p>
              <a className="text-label-md text-primary hover:underline" href={data.sources[c.source]?.url} target="_blank" rel="noreferrer">
                {t('finances.claims.sourceRecord')}
              </a>
            </article>
          ))}
        </div>
        <SectionSources data={data} sectionKey="claims" />
      </QuestionSection>
      )}

      </FinanceQuestionMenu>

      <section id="all-sources" className="scroll-mt-20 flex flex-col gap-2 border-t border-surface-variant pt-6">
        <h2 className="text-title-lg font-title-lg text-on-surface">{t('finances.sources.allTitle')}</h2>
        <ul className="text-label-md text-on-surface-variant flex flex-col gap-1.5 leading-relaxed">
          {Object.entries(data.sources).map(([k, s]) => (
            <li key={k}>
              <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
              {' '}— {s.publisher}{s.date ? `, ${s.date}` : ''}
              {s.pdf && (
                <>{' '}<a className="text-primary font-bold hover:underline" href={s.pdf} target="_blank" rel="noreferrer">PDF↓</a></>
              )}
            </li>
          ))}
        </ul>
        <p className="text-label-md text-on-surface-variant max-w-3xl leading-relaxed mt-1">
          {t('finances.sources.correction')}
        </p>
      </section>
      <Deferred minHeight={320}><PageThread pageKey="finances" /></Deferred>
      {tip.node}
    </div>
  )
}
