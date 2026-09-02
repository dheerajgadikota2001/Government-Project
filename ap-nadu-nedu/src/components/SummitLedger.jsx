import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT, makeDateFmt, fmtCrore } from '../i18n'
import { HBarChart, VizSection, useChartTip } from './advanced/ChartPrimitives'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TINT, TENURE_HATCHED, PATTERN_ID } from '../lib/tenure'


/**
 * Formatters that carry a translated unit or month name. They need `t`, so
 * they are built per render inside the component that prints them.
 */
function useFmt() {
  const { t, tn } = useT()
  return {
    t,
    tn,
    lakhCr: v => fmtCrore(v, { lakhCrLabel: t('unit.lakhCrore'), crLabel: t('unit.crore') }),
    lakh: v =>
      v == null || v === 0 ? null : v >= 100000 ? `${(v / 100000).toFixed(2)} ${t('unit.lakh')}` : v.toLocaleString('en-IN'),
    inr: v => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} ${t('unit.crore')}`),
    niceDate: makeDateFmt(t),
  }
}

/** A source chip: publisher name that opens the document it came from. */
function Cite({ url, publisher, date }) {
  const { t, niceDate } = useFmt()
  if (!url) return <span className="text-label-sm text-outline">{t('summits.noDocument')}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-label-sm text-primary hover:underline break-words"
    >
      <span className="material-symbols-outlined text-[13px] leading-none">description</span>
      {publisher}
      {date ? <span className="text-outline">· {niceDate(date)}</span> : null}
    </a>
  )
}

function Collapse({ summary, children, tone = 'plain' }) {
  const [open, setOpen] = useState(false)
  const border = tone === 'warn' ? 'border-amber-400/50 bg-amber-50/40' : 'border-surface-variant bg-surface-container-lowest'
  return (
    <details
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
      className={`border rounded-xl ${border}`}
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-2 text-label-md font-bold text-on-surface">
        <span className={`material-symbols-outlined text-[18px] transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <span className="flex-1 min-w-0">{summary}</span>
      </summary>
      <div className="px-4 pb-4 pt-0 flex flex-col gap-3">{children}</div>
    </details>
  )
}

/** Announced against grounded, one column per government. */
function LedgerColumns({ byTenure }) {
  const { t, tn, lakhCr, lakh, niceDate } = useFmt()
  const keys = ['tdp1', 'ysrcp', 'tdp2']
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {keys.map(k => {
        const ten = byTenure?.[k]
        if (!ten) return null
        const a = ten.announced
        const g = ten.grounded
        return (
          <div
            key={k}
            className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 flex flex-col gap-3"
            style={{ borderLeft: `4px solid ${TINT[k]}` }}
          >
            <div>
              <p className="text-label-md font-bold text-on-surface">{ten.label}</p>
              <p className="text-label-sm text-outline">
                {ten.to >= '2026'
                  ? t('summits.columns.dateRangeToday', { from: niceDate(ten.from) })
                  : t('summits.columns.dateRange', { from: niceDate(ten.from), to: niceDate(ten.to) })}
              </p>
            </div>

            <div className="border-t border-dashed border-surface-variant pt-3">
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">{t('summits.columns.announced')}</p>
              {a.summits > 0 ? (
                <>
                  <p className="text-headline-sm font-bold text-on-surface mt-1">{lakhCr(a.investment_crore)}</p>
                  <p className="text-label-md text-on-surface-variant">
                    {tn('summits.columns.mousAcross', a.summits, {
                      mous: a.mou_count.toLocaleString('en-IN'),
                      count: a.summits,
                    })}
                    {a.jobs ? <> · {t('summits.columns.jobsPromised', { jobs: lakh(a.jobs) })}</> : null}
                  </p>
                </>
              ) : (
                <p className="text-label-md text-on-surface-variant mt-1">{t('summits.columns.noSummit')}</p>
              )}
            </div>

            <div className="border-t border-dashed border-surface-variant pt-3">
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">{t('summits.columns.built')}</p>
              {g.years_published > 0 ? (
                <>
                  <p className="text-headline-sm font-bold text-on-surface mt-1">{lakhCr(g.sum_published_crore)}</p>
                  <p className="text-label-md text-on-surface-variant">
                    {t('summits.columns.acrossYears', { published: g.years_published, covered: g.years_covered })}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-headline-sm font-bold text-outline mt-1">{t('common.notPublished')}</p>
                  <p className="text-label-md text-on-surface-variant">{t('summits.columns.nothingPublished')}</p>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SUMMIT_COLUMNS = [
  'summits.table.summit',
  'summits.table.mous',
  'summits.table.announced',
  'summits.table.jobs',
  'summits.table.document',
]

/** The summit table. */
function SummitTable({ summits, overlay }) {
  const { t, tn, lakhCr, lakh, niceDate } = useFmt()
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[720px] text-start border-collapse">
        <thead>
          <tr className="border-b border-surface-variant">
            {SUMMIT_COLUMNS.map(h => (
              <th key={h} className="py-2 px-3 text-label-sm uppercase tracking-wider text-on-surface-variant font-normal text-start">
                {t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summits.map(s => (
            <tr key={s.key} className="border-b border-surface-variant/60 align-top">
              <td className="py-3 px-3" style={{ borderLeft: `4px solid ${TINT[s.tenure]}` }}>
                <p className="text-body-md font-bold text-on-surface">{s.name}</p>
                <p className="text-label-sm text-on-surface-variant">{s.long_name}</p>
                <p className="text-label-sm text-outline">
                  {s.city} · {niceDate(s.start_date)}
                  {s.end_date && s.end_date !== s.start_date
                    ? ` ${t('summits.table.toDate', { date: niceDate(s.end_date) })}`
                    : ''}
                </p>
              </td>
              <td className="py-3 px-3 text-body-md text-on-surface tabular-nums">{s.mou_count?.toLocaleString('en-IN') ?? '—'}</td>
              <td className="py-3 px-3 text-body-md font-bold text-on-surface tabular-nums">{lakhCr(s.investment_crore) ?? '—'}</td>
              <td className="py-3 px-3 text-body-md text-on-surface tabular-nums">{lakh(s.jobs) ?? '—'}</td>
              <td className="py-3 px-3 max-w-[300px]">
                <Cite url={s.source_url} publisher={s.source_publisher} date={s.source_date} />
                <p className="text-label-sm text-on-surface-variant mt-1">{s.stated_by}</p>
                {overlay?.[s.key]?.documented_in_same_year > 0 && (
                  <p className="text-label-sm text-outline mt-1">
                    {tn('summits.table.documented', overlay[s.key].documented_in_same_year)}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Year-by-year grounded figures, with the missing years drawn as missing. */
function GroundedYears({ rows, tip }) {
  const { t, inr } = useFmt()
  const max = Math.max(...rows.map(r => r.investment_crore || 0), 1)
  const W = 900
  const H = 240
  const PAD_L = 60
  const PAD_B = 46
  const colW = (W - PAD_L - 12) / rows.length

  const hasUnchecked = rows.some(r => r.investment_crore == null && r.missing_kind === 'unchecked')
  return (
    <div className="flex flex-col gap-1.5">
      {/* What the three kinds of bar mean, said before the chart rather than
          inside it — a striped bar tagged mid-chart reads as an error, not a
          category, to a first-time reader. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-label-sm text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex" aria-hidden="true">
            <span className="w-2 h-3 rounded-s-sm" style={{ background: TINT.tdp1 }} />
            <span className="w-2 h-3 mx-px" style={{ background: TINT.ysrcp }} />
            <span className="w-2 h-3 rounded-e-sm" style={{ background: TINT.tdp2 }} />
          </span>
          {t('summits.grounded.legendPublished')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="12" aria-hidden="true">
            <defs>
              <pattern id="apnnLegendPartial" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={TINT.ysrcp} opacity="0.22" />
                <rect width="2.5" height="6" fill={TINT.ysrcp} />
              </pattern>
            </defs>
            <rect width="17" height="11" x="0.5" y="0.5" rx="2" fill="url(#apnnLegendPartial)" stroke={TINT.ysrcp} strokeWidth="1" />
          </svg>
          {t('summits.grounded.legendPartial')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[18px] h-3 rounded-sm border border-dashed border-outline" aria-hidden="true" />
          {t('summits.grounded.legendNone')}
        </span>
        {hasUnchecked && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="12" aria-hidden="true">
              <defs>
                <pattern id="apnnLegendUnchecked" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="transparent" />
                  <rect width="2" height="6" fill="#d6d4cc" />
                </pattern>
              </defs>
              <rect width="17" height="11" x="0.5" y="0.5" rx="2" fill="url(#apnnLegendUnchecked)" stroke="#b9b7ae" strokeWidth="1" strokeDasharray="3 3" />
            </svg>
            {t('summits.grounded.legendUnchecked')}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[640px]" role="img">
        <defs>
          {/* Hatch for "unchecked": the blank is ours (we could not open the document),
              visually distinct from the plain dashed "state published none". */}
          <pattern id="apnnUnchecked" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="transparent" />
            <rect width="2" height="6" fill="#d6d4cc" />
          </pattern>
          {/* "partial": the state published a figure, but not on the same basis as the
              solid bars -- a narrower category, or part of a year. Drawn in the tenure
              colour so it still reads as that government's, but striped so it can never
              be mistaken for a like-for-like measurement. */}
          <pattern id="apnnPartialTdp1" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={TINT.tdp1} opacity="0.22" />
            <rect width="3" height="7" fill={TINT.tdp1} />
          </pattern>
          <pattern id="apnnPartialYsrcp" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={TINT.ysrcp} opacity="0.22" />
            <rect width="3" height="7" fill={TINT.ysrcp} />
          </pattern>
          <pattern id="apnnPartialTdp2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={TINT.tdp2} opacity="0.22" />
            <rect width="3" height="7" fill={TINT.tdp2} />
          </pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = 12 + (H - PAD_B - 12) * (1 - f)
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W - 12} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="11" className="fill-outline" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round((max * f) / 1000)}k
              </text>
            </g>
          )
        })}
        {rows.map((r, i) => {
          const x = PAD_L + i * colW
          const bw = Math.min(46, colW - 10)
          const cx = x + (colW - bw) / 2
          const published = r.investment_crore != null
          const h = published ? Math.max(2, ((H - PAD_B - 12) * r.investment_crore) / max) : 0
          const y = H - PAD_B - h
          return (
            <g key={r.year}>
              {published ? (
                <>
                  <rect
                    x={cx} y={y} width={bw} height={h} rx="3"
                    fill={
                      r.missing_kind === 'published_partial'
                        ? `url(#apnnPartial${r.tenure.charAt(0).toUpperCase()}${r.tenure.slice(1)})`
                        : TINT[r.tenure]
                    }
                    stroke={r.missing_kind === 'published_partial' ? TINT[r.tenure] : 'none'}
                    strokeWidth="1"
                  />
                  {r.missing_kind === 'published_partial' && (
                    <text x={cx + bw / 2} y={y + 13} textAnchor="middle" fontSize="9"
                      className="fill-on-surface" opacity="0.85">
                      {t('summits.grounded.partialTag')}
                    </text>
                  )}
                  <text x={cx + bw / 2} y={y - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-on-surface" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(r.investment_crore).toLocaleString('en-IN')}
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={cx}
                    y={H - PAD_B - 26}
                    width={bw}
                    height={26}
                    fill={r.missing_kind === 'unchecked' ? 'url(#apnnUnchecked)' : 'none'}
                    stroke="#b9b7ae"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    rx="3"
                  />
                  <text x={cx + bw / 2} y={H - PAD_B - 10} textAnchor="middle" fontSize="9.5" className="fill-outline">
                    {t(r.missing_kind === 'unchecked' ? 'summits.grounded.unchecked' : 'summits.grounded.none')}
                  </text>
                </>
              )}
              <rect
                x={x} y={12} width={colW} height={H - PAD_B - 12} fill="transparent" tabIndex={0}
                className="cursor-pointer outline-primary"
                onPointerMove={e =>
                  tip.show(
                    e,
                    r.year,
                    published ? inr(r.investment_crore) : t(r.missing_kind === 'unchecked' ? 'summits.grounded.unchecked' : 'summits.grounded.noFigure'),
                    published
                      ? `${r.basis} ${r.period_note}${r.not_comparable_note ? ' ' + r.not_comparable_note : ''}`
                      : r.missing_reason
                  )
                }
                onPointerLeave={tip.hide}
                onFocus={e =>
                  tip.show(
                    e,
                    r.year,
                    published ? inr(r.investment_crore) : t(r.missing_kind === 'unchecked' ? 'summits.grounded.unchecked' : 'summits.grounded.noFigure'),
                    published
                      ? `${r.basis}${r.not_comparable_note ? ' ' + r.not_comparable_note : ''}`
                      : r.missing_reason
                  )
                }
                onBlur={tip.hide}
              />
              <text x={x + colW / 2} y={H - PAD_B + 16} textAnchor="middle" fontSize="10.5" className="fill-on-surface-variant">
                {r.year.slice(2)}
              </text>
              <rect x={cx} y={H - PAD_B + 24} width={bw} height={4} fill={TINT[r.tenure]} rx="2" opacity="0.75" />
            </g>
          )
        })}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - 12} y2={H - PAD_B} stroke="#c3c2b7" strokeWidth="1" />
      </svg>
      </div>
    </div>
  )
}

/** One project's progress readings, split by who was in office. */
/**
 * One project, collapsed by default.
 *
 * These entries grew long once the government orders were added — Bhogapuram alone
 * carries twenty dated readings — and four of them stacked open turned the section
 * into a wall. Collapsed, the summary row still carries the whole claim: what the
 * project is, which government announced it, which one opened it, and how much of
 * the evidence is the government's own. A reader who wants the dated trail opens
 * one. Native <details> is used rather than a JS toggle so it keyboard-navigates,
 * prints expanded, and is findable by the browser's own in-page search.
 */
function CrossTenureProject({ p, defaultOpen }) {
  const { t, niceDate } = useFmt()
  const withPct = p.readings.filter(r => r.percent != null)
  const govCount = p.readings.filter(r => r.is_government).length
  return (
    <details
      open={defaultOpen}
      className="group border border-surface-variant rounded-xl bg-surface-container-lowest
                 open:bg-surface-container-lowest"
    >
      <summary
        className="cursor-pointer list-none p-4 flex items-start gap-3
                   rounded-xl hover:bg-surface-container focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span
          aria-hidden="true"
          className="mt-1 shrink-0 text-on-surface-variant transition-transform
                     group-open:rotate-90"
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-lg font-bold text-on-surface">{p.name}</span>
          <span className="block text-label-sm text-on-surface-variant">{p.full_name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-label-sm text-on-surface-variant">
              {t('summits.crossTenure.announcedOpened', {
                a: t(`depts.tenure.${p.announced_under}`),
                o: t(`depts.tenure.${p.opened_under}`),
              })}
            </span>
            <span className="text-label-sm text-outline">
              {t('summits.crossTenure.readingCount', { n: p.readings.length, g: govCount })}
            </span>
          </span>
        </span>
      </summary>

      <div className="px-4 pb-4 flex flex-col gap-3">
      {p.cost_note && <p className="text-label-sm text-outline">{p.cost_note}</p>}

      {withPct.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {p.readings.map((r, i) =>
            r.tenure === 'boundary' ? (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="flex-1 border-t-2 border-dashed border-on-surface-variant" />
                <span className="text-label-sm font-bold text-on-surface-variant whitespace-nowrap" data-nowrap-en>
                  {niceDate(r.date)} — {r.event}
                </span>
                <div className="flex-1 border-t-2 border-dashed border-on-surface-variant" />
              </div>
            ) : (
              <div key={i} className="flex items-center gap-3">
                <span className="text-label-sm text-outline w-[92px] shrink-0 tabular-nums">{niceDate(r.date)}</span>
                <div className="flex-1 min-w-0 h-5 bg-surface-container rounded relative overflow-hidden">
                  {r.percent != null && (
                    <div
                      className="h-full rounded"
                      style={{ width: `${r.percent}%`, background: TINT[r.tenure] || '#9b9992' }}
                    />
                  )}
                  <span className="absolute inset-0 flex items-center px-2 text-label-sm text-on-surface">
                    {r.percent != null ? `${r.percent}%` : r.event}
                  </span>
                </div>
                {r.source_url ? (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-label-sm shrink-0 hover:underline ${r.is_government ? 'text-primary' : 'text-on-surface-variant'}`}
                    title={r.publisher}
                  >
                    {r.is_government ? t('common.government') : t('common.company')}
                  </a>
                ) : (
                  <span className="text-label-sm text-outline shrink-0 w-[70px]">—</span>
                )}
              </div>
            )
          )}
        </div>
      )}

      <div className="border-t border-dashed border-surface-variant pt-3 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{p.split.statement}</p>
        {p.split.correction_note && (
          <p className="text-label-md text-on-surface-variant border-s-2 border-amber-400 ps-3">
            {p.split.correction_note}
          </p>
        )}
        <p className="text-label-sm text-outline">{p.source_quality}</p>
      </div>
      </div>
    </details>
  )
}

/**
 * Summits, and what reached the ground.
 *
 * The section answers one question: each government stood on a stage and
 * announced a number — how much of it got built? Everything here is the
 * state's own words, quoted, with the document one click away. Where the
 * state published nothing, the space is left visibly empty.
 */
export default function SummitLedger() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const tip = useChartTip()
  const { t, lakhCr, lakh, inr } = useFmt()

  useEffect(() => {
    let alive = true
    apiGet('/mous/summits')
      .then(d => alive && setData(d))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [])

  if (err || !data) return null

  const totalAnnounced = data.summits.reduce((s, x) => s + (x.investment_crore || 0), 0)
  const totalMous = data.summits.reduce((s, x) => s + (x.mou_count || 0), 0)

  const summitBars = data.summits.map(s => ({
    label: s.name,
    value: s.investment_crore,
    tipDetail: `${t('summits.chart.tipMous', { n: s.mou_count?.toLocaleString('en-IN') })} · ${s.stated_by}`,
  }))
  const maxBar = Math.max(...summitBars.map(b => b.value))

  return (
    <section id="summits" className="scroll-mt-20 flex flex-col gap-4">
      {tip.node}

      <header className="flex flex-col gap-2">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">{t('summits.title')}</h2>
        <p className="text-body-md text-on-surface-variant max-w-[70ch]">
          {t('summits.intro.lead')}{' '}
          <strong className="text-on-surface">{lakhCr(totalAnnounced)}</strong>{' '}
          {t('summits.intro.across')}{' '}
          <strong className="text-on-surface">
            {t('summits.intro.agreements', { n: totalMous.toLocaleString('en-IN') })}
          </strong>
          {t('summits.intro.rest')}
        </p>
      </header>

      <LedgerColumns byTenure={data.by_tenure} />

      <div className="border border-amber-400/60 bg-amber-50/50 rounded-xl p-4">
        <p className="text-label-md font-bold text-on-surface">{data.definition_warning.title}</p>
        <p className="text-body-md text-on-surface-variant mt-1 max-w-[75ch]">{data.definition_warning.body}</p>
        <p className="text-label-sm text-outline mt-2">{data.definition_warning.sources_note}</p>
      </div>

      <VizSection
        id="summit-ledger"
        title={t('summits.viz.ledger.title')}
        sub={t('summits.viz.ledger.sub')}
        provenance={t('summits.viz.ledger.provenance')}
      >
        <HBarChart rows={summitBars} maxValue={maxBar} unit={t('unit.crore')} tip={tip} />
        <div className="mt-4">
          <SummitTable summits={data.summits} overlay={data.register_overlay} />
        </div>
        <p className="text-label-sm text-on-surface-variant mt-3">{data.register_note}</p>
      </VizSection>

      {data.summits.some(s => s.disagreement) && (
        <Collapse summary={t('summits.disagree.summary')} tone="warn">
          {data.summits
            .filter(s => s.disagreement)
            .map(s => (
              <div key={s.key} className="border-s-2 ps-3" style={{ borderColor: TINT[s.tenure] }}>
                <p className="text-label-md font-bold text-on-surface">{s.name}</p>
                <p className="text-body-md text-on-surface-variant mt-0.5">{s.disagreement}</p>
                {(s.alt_figures || []).map((a, i) => (
                  <p key={i} className="text-label-sm text-on-surface-variant mt-1">
                    {a.label}: {lakhCr(a.investment_crore)}
                    {a.companies ? t('summits.disagree.companies', { n: a.companies }) : ''}
                    {a.jobs ? t('summits.disagree.jobs', { jobs: lakh(a.jobs) }) : ''}.{' '}
                    <Cite url={a.source_url} publisher={a.source_publisher} date={a.source_date} />
                  </p>
                ))}
              </div>
            ))}
        </Collapse>
      )}

      {data.not_a_summit?.length > 0 && (
        <Collapse summary={t('summits.notSummit.summary')}>
          {data.not_a_summit.map((n, i) => (
            <div key={i}>
              <p className="text-label-md font-bold text-on-surface">{n.claim}</p>
              <p className="text-body-md text-on-surface-variant mt-0.5">{n.finding}</p>
            </div>
          ))}
        </Collapse>
      )}

      <VizSection
        id="grounded-years"
        title={t('summits.viz.grounded.title')}
        sub={t('summits.viz.grounded.sub')}
        provenance={t('summits.viz.grounded.provenance')}
      >
        <GroundedYears rows={data.grounded_by_year} tip={tip} />
        <div className="mt-4 flex flex-col gap-2">
          {data.grounded_by_year
            .filter(r => r.investment_crore != null)
            .map(r => (
              <details key={r.year} className="border border-surface-variant rounded-lg">
                <summary className="cursor-pointer px-3 py-2 text-label-md text-on-surface">
                  <span className="font-bold tabular-nums">{r.year}</span> · {inr(r.investment_crore)}
                  {r.employment ? ` · ${t('summits.grounded.jobs', { n: r.employment.toLocaleString('en-IN') })}` : ''} · {r.basis}
                </summary>
                <div className="px-3 pb-3 flex flex-col gap-1.5">
                  <p className="text-body-md text-on-surface-variant italic border-s-2 border-surface-variant ps-3">
                    “{r.quote}”
                  </p>
                  <p className="text-label-sm text-on-surface-variant">{r.period_note}</p>
                  <Cite url={r.source_url} publisher={r.source_publisher} />
                </div>
              </details>
            ))}
        </div>
      </VizSection>

      <VizSection
        id="signed-vs-grounded"
        title={t('summits.viz.bothSides.title')}
        sub={t('summits.viz.bothSides.sub')}
        provenance={t('summits.viz.bothSides.provenance')}
      >
        <div className="flex flex-col gap-3">
          {data.gap_statements.map(g => (
            <div
              key={g.key}
              className="border border-surface-variant rounded-xl p-4 bg-surface-container-lowest"
              style={g.tenure ? { borderLeft: `4px solid ${TINT[g.tenure]}` } : undefined}
            >
              <p className="text-body-lg font-bold text-on-surface">{g.headline}</p>
              {g.derived?.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-2 mb-2">
                  {g.derived.map(d => (
                    <div key={d.label}>
                      <p className="text-headline-sm font-bold text-on-surface tabular-nums">
                        {d.value}
                        {d.unit}
                      </p>
                      <p className="text-label-sm text-on-surface-variant">{d.label}</p>
                      <p className="text-label-sm text-outline">{d.working}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-body-md text-on-surface-variant italic border-s-2 border-surface-variant ps-3 mt-1">
                “{g.quote}”
              </p>
              <p className="text-body-md text-on-surface mt-2 max-w-[75ch]">{g.reading}</p>
              <p className="text-label-sm text-on-surface-variant mt-2">
                {g.stated_by} · <Cite url={g.source_url} publisher={g.source_publisher} date={g.source_date} />
              </p>
            </div>
          ))}
        </div>
      </VizSection>

      <VizSection
        id="cross-tenure"
        title={t('summits.viz.crossTenure.title')}
        sub={t('summits.viz.crossTenure.sub')}
        provenance={data.cross_tenure.method}
      >
        <p className="text-body-md text-on-surface-variant max-w-[75ch] mb-4">{data.cross_tenure.intro}</p>
        <div className="flex flex-col gap-4">
          {/* The first is open so the section shows its shape at a glance; the rest
              wait to be asked for. */}
          {data.cross_tenure.projects.map((p, i) => (
            <CrossTenureProject key={p.key} p={p} defaultOpen={i === 0} />
          ))}
        </div>
      </VizSection>
    </section>
  )
}
