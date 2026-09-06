import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../../lib/api'
import { useT } from '../../i18n'
import {
  HBarChart, CountStrip, YearColumns, StatTiles, VizSection,
  useChartTip, fmtIN, SEQ, STATUS_COLORS,
} from './ChartPrimitives'

/**
 * Advanced view for Investments & MoUs — live data from the API.
 *
 * Filter row sits above everything and re-scopes every tile and chart below
 * (all numbers always agree). Year options are derived from the data, span
 * the full range with per-year counts, and undated records get their own
 * option. Zero results renders an honest empty state.
 */

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

// Enum values arrive from the API; they are content, prettified, not translated.
const label = v => (v ? v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : v)

const STATUS_META = {
  operational: { color: STATUS_COLORS.good, icon: '✓' },
  investment_started: { color: SEQ[2], icon: '◐' },
  signed: { color: STATUS_COLORS.warning, icon: '◔' },
  stalled: { color: STATUS_COLORS.serious, icon: '⏸' },
  cancelled: { color: STATUS_COLORS.critical, icon: '✕' },
}

export default function AdvancedInvestments({ open, onClose }) {
  const { t, tn } = useT()
  const dialogRef = useRef(null)
  const [all, setAll] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ year: '', sector: '', origin: '' })
  const tip = useChartTip()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Fetch the full tracked set once per open (small dataset; client-side scoping).
  useEffect(() => {
    if (!open || all) return
    apiGet('/mous/', { page_size: 100 })
      .then(res => { setAll(res.items); setError(null) })
      .catch(err => setError(err))
  }, [open, all])

  const yearOf = m => (m.signed_date ? new Date(m.signed_date).getFullYear() : null)

  const yearOptions = useMemo(() => {
    if (!all) return []
    const counts = {}
    let undated = 0
    all.forEach(m => {
      const y = yearOf(m)
      y === null ? undated++ : (counts[y] = (counts[y] || 0) + 1)
    })
    const dated = Object.keys(counts).map(Number)
    if (!dated.length) return []
    const opts = []
    for (let y = Math.min(...dated); y <= Math.max(...dated); y++) {
      const n = counts[y] || 0
      opts.push({ value: String(y), text: tn('advInvestments.filters.yearOption', n, { year: y }) })
    }
    if (undated) opts.push({ value: 'undated', text: t('advInvestments.filters.noDateOption', { count: undated }) })
    return opts
  }, [all, t, tn])

  const sectorOptions = useMemo(() => {
    if (!all) return []
    return [...new Set(all.map(m => m.sector))].sort()
  }, [all])

  const data = useMemo(() => {
    if (!all) return []
    return all.filter(m => {
      const y = yearOf(m)
      if (filters.year === 'undated' && y !== null) return false
      if (filters.year && filters.year !== 'undated' && String(y) !== filters.year) return false
      if (filters.sector && m.sector !== filters.sector) return false
      if (filters.origin === 'foreign' && !m.is_foreign_investment) return false
      if (filters.origin === 'domestic' && m.is_foreign_investment) return false
      return true
    })
  }, [all, filters])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  // Derived, all from the filtered slice
  const withInv = data.filter(m => m.investment_crore != null)
  const totalInv = withInv.reduce((s, m) => s + m.investment_crore, 0)
  const jobsKnown = data.filter(m => m.expected_employment != null)
  const totalJobs = jobsKnown.reduce((s, m) => s + m.expected_employment, 0)
  const nForeign = data.filter(m => m.is_foreign_investment).length

  const sectorTotals = useMemo(() => {
    const acc = {}
    withInv.forEach(m => { acc[m.sector] = (acc[m.sector] || 0) + m.investment_crore })
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusCounts = useMemo(() => {
    const acc = {}
    data.forEach(m => { acc[m.status] = (acc[m.status] || 0) + 1 })
    return acc
  }, [data])

  const yearCounts = useMemo(() => {
    const acc = {}
    data.forEach(m => { const y = yearOf(m); if (y !== null) acc[y] = (acc[y] || 0) + 1 })
    return acc
  }, [data])

  const cleanMax = v => {
    if (v <= 0) return 1
    const mag = Math.pow(10, Math.floor(Math.log10(v)))
    return Math.ceil(v / mag) * mag
  }

  const invMax = cleanMax(Math.max(1, ...withInv.map(m => m.investment_crore)))
  const jobsMax = cleanMax(Math.max(1, ...jobsKnown.map(m => m.expected_employment)))
  const noJobsNames = data.filter(m => m.expected_employment == null).map(m => m.company_name)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-2xl p-0 w-[min(880px,calc(100vw-24px))] max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain bg-surface backdrop:bg-black/45"
      aria-label={t('advInvestments.dialogAria')}
    >
      <div className="sticky top-0 bg-surface z-10 flex justify-between items-center px-6 pt-5 pb-3 border-b border-surface-variant">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{t('advInvestments.title')}</h2>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wide mt-0.5">
            {all ? t('advInvestments.tracked', { count: all.length }) : t('advInvestments.loading')} · {t('advInvestments.everyFigureCited')}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-9 h-9 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0"
        >✕</button>
      </div>

      <div className="px-6 py-5 flex flex-col gap-5">
        {error && (
          <div className="border border-error/40 bg-error/5 rounded-xl p-5">
            <p className="text-body-md text-on-surface">{t('advInvestments.error', { message: error.message })}</p>
          </div>
        )}

        {!error && all && (
          <>
            {/* Coverage note — never imply completeness we don't have */}
            <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-4 py-2.5">
              {rich(t('advInvestments.coverage', { count: all.length }))}
            </p>

            {/* Filter row — scopes everything below */}
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl px-4 py-3 flex flex-wrap gap-4 items-end">
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant min-w-[9rem] flex-1 sm:flex-none [&>select]:w-full">
                {t('advInvestments.filters.yearSigned')}
                <select
                  value={filters.year} onChange={e => set('year', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[150px]"
                >
                  <option value="">{t('advInvestments.filters.allYears', { count: all.length })}</option>
                  {yearOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant min-w-[9rem] flex-1 sm:flex-none [&>select]:w-full">
                {t('advInvestments.filters.sector')}
                <select
                  value={filters.sector} onChange={e => set('sector', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[150px]"
                >
                  <option value="">{t('advInvestments.filters.allSectors')}</option>
                  {sectorOptions.map(s => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant min-w-[9rem] flex-1 sm:flex-none [&>select]:w-full">
                {t('advInvestments.filters.origin')}
                <select
                  value={filters.origin} onChange={e => set('origin', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[130px]"
                >
                  <option value="">{t('advInvestments.filters.allOrigins')}</option>
                  <option value="foreign">{t('advInvestments.filters.foreign')}</option>
                  <option value="domestic">{t('advInvestments.filters.domestic')}</option>
                </select>
              </label>
              <span className="ms-auto text-label-sm text-on-surface-variant pb-2.5 min-w-0">
                {data.length === all.length
                  ? t('advInvestments.filters.allShown', { count: all.length })
                  : t('advInvestments.filters.someShown', { shown: data.length, total: all.length })}
              </span>
            </div>

            {data.length === 0 ? (
              <div className="border border-dashed border-outline-variant rounded-xl px-5 py-8 text-center">
                <p className="text-body-md font-semibold text-on-surface">{t('advInvestments.empty.title')}</p>
                <p className="text-body-md text-on-surface-variant mt-1 max-w-lg mx-auto">
                  {t('advInvestments.empty.body')}
                </p>
              </div>
            ) : (
              <>
                <StatTiles tiles={[
                  { label: t('advInvestments.tiles.totalCommitted'), value: totalInv ? `₹${fmtIN(Math.round(totalInv))} ${t('unit.crore')}` : '—', detail: t('advInvestments.tiles.stateAFigure', { n: withInv.length, total: data.length }) },
                  { label: t('advInvestments.tiles.expectedJobs'), value: totalJobs ? fmtIN(totalJobs) : '—', detail: t('advInvestments.tiles.publishAFigure', { n: jobsKnown.length, total: data.length }) },
                  { label: t('advInvestments.tiles.foreignInvestors'), value: t('chart.countOfTotal', { count: nForeign, total: data.length }), detail: t('advInvestments.tiles.byCompanyOrigin') },
                  { label: t('advInvestments.tiles.largestSingle'), value: withInv.length ? `₹${fmtIN(Math.max(...withInv.map(m => m.investment_crore)))} ${t('unit.crore')}` : '—', detail: withInv.length ? withInv.reduce((a, b) => (a.investment_crore > b.investment_crore ? a : b)).company_name : '' },
                ]} />

                <VizSection
                  defaultOpen
                  title={t('advInvestments.viz.byCompany.title')}
                  sub={t('advInvestments.viz.byCompany.sub')}
                  provenance={t('advInvestments.viz.byCompany.provenance')}
                >
                  <HBarChart
                    tip={tip}
                    maxValue={invMax}
                    unit={t('unit.crore')}
                    rows={[...withInv].sort((a, b) => b.investment_crore - a.investment_crore).map(m => ({
                      label: m.company_name,
                      value: m.investment_crore,
                      tipDetail: `${label(m.sector)} · ${m.is_foreign_investment ? t('advInvestments.foreign') : t('advInvestments.domestic')} · ${label(m.status)}`,
                    }))}
                  />
                  {data.length > withInv.length && (
                    <p className="text-label-sm text-outline mt-2">
                      {t('advInvestments.viz.byCompany.noFigure', {
                        names: data.filter(m => m.investment_crore == null).map(m => m.company_name).join(', '),
                      })}
                    </p>
                  )}
                </VizSection>

                {sectorTotals.length > 1 && (
                  <VizSection
                    title={t('advInvestments.viz.bySector.title')}
                    sub={t('advInvestments.viz.bySector.sub')}
                  >
                    <HBarChart
                      tip={tip}
                      maxValue={cleanMax(sectorTotals[0][1])}
                      unit={t('unit.crore')}
                      rows={sectorTotals.map(([sector, total]) => ({
                        label: label(sector),
                        value: total,
                        tipDetail: t('advInvestments.viz.bySector.tipDetail'),
                      }))}
                    />
                  </VizSection>
                )}

                {jobsKnown.length > 0 && (
                  <VizSection
                    title={t('advInvestments.viz.jobs.title')}
                    sub={t('advInvestments.viz.jobs.sub', { n: jobsKnown.length, total: data.length })}
                    provenance={noJobsNames.length ? t('advInvestments.viz.jobs.provenance', { names: noJobsNames.join(', ') }) : null}
                  >
                    <HBarChart
                      tip={tip}
                      maxValue={jobsMax}
                      rows={[...jobsKnown].sort((a, b) => b.expected_employment - a.expected_employment).map(m => ({
                        label: m.company_name,
                        value: m.expected_employment,
                        tipDetail: t('advInvestments.viz.jobs.tipDetail'),
                      }))}
                    />
                  </VizSection>
                )}

                <VizSection
                  title={t('advInvestments.viz.status.title')}
                  sub={t('advInvestments.viz.status.sub')}
                >
                  <CountStrip
                    tip={tip}
                    total={data.length}
                    tipDetail={t('advInvestments.viz.status.tipDetail')}
                    segments={Object.entries(STATUS_META)
                      .map(([key, meta]) => ({
                        label: label(key),
                        count: statusCounts[key] || 0,
                        color: meta.color,
                        icon: meta.icon,
                        textOnFill: key === 'signed' ? '#0b0b0b' : '#fff',
                      }))}
                  />
                </VizSection>

                {Object.keys(yearCounts).length > 0 && (
                  <VizSection
                    title={t('advInvestments.viz.years.title')}
                    sub={t('advInvestments.viz.years.sub')}
                    provenance={data.some(m => !m.signed_date)
                      ? tn('advInvestments.viz.years.provenance', data.filter(m => !m.signed_date).length)
                      : null}
                  >
                    <YearColumns tip={tip} counts={yearCounts} tipDetail={t('advInvestments.viz.years.tipDetail')} />
                  </VizSection>
                )}

                <details className="text-label-md">
                  <summary className="text-primary cursor-pointer">{t('advInvestments.table.viewAll', { count: data.length })}</summary>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-label-md">
                      <thead>
                        <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                          <th className="py-1.5 pe-3">{t('advInvestments.table.company')}</th>
                          <th className="py-1.5 pe-3 text-end">{t('advInvestments.table.crore')}</th>
                          <th className="py-1.5 pe-3 text-end">{t('advInvestments.table.jobs')}</th>
                          <th className="py-1.5 pe-3">{t('advInvestments.table.sector')}</th>
                          <th className="py-1.5 pe-3">{t('advInvestments.table.status')}</th>
                          <th className="py-1.5">{t('advInvestments.table.signed')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map(m => (
                          <tr key={m.id} className="border-b border-surface-variant/60">
                            <td className="py-1.5 pe-3 text-on-surface">{m.company_name}</td>
                            <td className="py-1.5 pe-3 text-end tabular-nums">{m.investment_crore != null ? fmtIN(m.investment_crore) : t('common.notPublished')}</td>
                            <td className="py-1.5 pe-3 text-end tabular-nums">{m.expected_employment != null ? fmtIN(m.expected_employment) : t('common.notPublished')}</td>
                            <td className="py-1.5 pe-3 text-on-surface-variant">{label(m.sector)}</td>
                            <td className="py-1.5 pe-3 text-on-surface-variant">{label(m.status)}</td>
                            <td className="py-1.5 text-on-surface-variant">{m.signed_date ? new Date(m.signed_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </>
        )}
      </div>
      {tip.node}
    </dialog>
  )
}
