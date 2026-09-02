import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../../lib/api'
import { useT } from '../../i18n'
import {
  HBarChart, CountStrip, StatTiles, VizSection,
  useChartTip, fmtIN, SEQ, STATUS_COLORS,
} from './ChartPrimitives'

/**
 * Advanced view for the Projects portfolio — live data from the API.
 * Same rules as the Investments view: filter row scopes everything,
 * coverage note states what this is (and isn't), honest empty states.
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
  completed: { color: STATUS_COLORS.good, icon: '✓' },
  under_construction: { color: SEQ[2], icon: '◐' },
  tendered: { color: STATUS_COLORS.warning, icon: '◔' },
  approved: { color: SEQ[4], icon: '☑' },
  announced: { color: STATUS_COLORS.neutral, icon: '◌' },
  delayed: { color: STATUS_COLORS.critical, icon: '▲' },
  suspended: { color: STATUS_COLORS.serious, icon: '⏸' },
  cancelled: { color: STATUS_COLORS.critical, icon: '✕' },
}

export default function AdvancedProjects({ open, onClose }) {
  const { t } = useT()
  const dialogRef = useRef(null)
  const [all, setAll] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ type: '', status: '', district: '' })
  const tip = useChartTip()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open || all) return
    let cancelled = false
    ;(async () => {
      try {
        // Fetch every page so the charts describe the full register, not a sample.
        const first = await apiGet('/projects/', { page: 1, page_size: 100, sort: 'cost', order: 'desc' })
        let items = first.items
        const totalPages = Math.min(Math.ceil(first.total / 100), 15)
        for (let p = 2; p <= totalPages; p += 1) {
          const res = await apiGet('/projects/', { page: p, page_size: 100, sort: 'cost', order: 'desc' })
          items = items.concat(res.items)
        }
        if (!cancelled) { setAll(items); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err)
      }
    })()
    return () => { cancelled = true }
  }, [open, all])

  const typeOptions = useMemo(() => (all ? [...new Set(all.map(p => p.project_type))].sort() : []), [all])
  const statusOptions = useMemo(() => (all ? [...new Set(all.map(p => p.status))].sort() : []), [all])
  const districtOptions = useMemo(
    () => (all ? [...new Set(all.map(p => p.district).filter(Boolean))].sort() : []),
    [all],
  )

  const data = useMemo(() => {
    if (!all) return []
    return all.filter(p => {
      if (filters.type && p.project_type !== filters.type) return false
      if (filters.status && p.status !== filters.status) return false
      if (filters.district && p.district !== filters.district) return false
      return true
    })
  }, [all, filters])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  const withCost = data.filter(p => p.estimated_cost_crore != null)
  const totalCost = withCost.reduce((s, p) => s + p.estimated_cost_crore, 0)
  const withProgress = data.filter(p => p.completion_percentage != null)

  const typeTotals = useMemo(() => {
    const acc = {}
    withCost.forEach(p => { acc[p.project_type] = (acc[p.project_type] || 0) + p.estimated_cost_crore })
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusCounts = useMemo(() => {
    const acc = {}
    data.forEach(p => { acc[p.status] = (acc[p.status] || 0) + 1 })
    return acc
  }, [data])

  const cleanMax = v => {
    if (v <= 0) return 1
    const mag = Math.pow(10, Math.floor(Math.log10(v)))
    return Math.ceil(v / mag) * mag
  }

  // With hundreds of projects, the per-project chart shows the largest N and
  // says exactly what the rest add up to — the table below still has every row.
  const TOP_BARS = 40
  const costSorted = useMemo(
    () => [...withCost].sort((a, b) => b.estimated_cost_crore - a.estimated_cost_crore),
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const topCost = costSorted.slice(0, TOP_BARS)
  const restCount = costSorted.length - topCost.length
  const restSum = costSorted.slice(TOP_BARS).reduce((s, p) => s + p.estimated_cost_crore, 0)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-2xl p-0 w-[min(880px,calc(100vw-24px))] max-h-[calc(100vh-48px)] bg-surface backdrop:bg-black/45"
      aria-label={t('advProjects.dialogAria')}
    >
      <div className="sticky top-0 bg-surface z-10 flex justify-between items-center px-6 pt-5 pb-3 border-b border-surface-variant">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{t('advProjects.title')}</h2>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wide mt-0.5">
            {all ? t('advProjects.tracked', { count: all.length }) : t('advProjects.loading')} · {t('advProjects.everyFigureCited')}
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
            <p className="text-body-md text-on-surface">{t('advProjects.error', { message: error.message })}</p>
          </div>
        )}

        {!error && all && (
          <>
            <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-4 py-2.5">
              {rich(t('advProjects.coverage', { count: all.length }))}
            </p>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl px-4 py-3 flex flex-wrap gap-4 items-end">
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
                {t('advProjects.filters.type')}
                <select
                  value={filters.type} onChange={e => set('type', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[140px]"
                >
                  <option value="">{t('advProjects.filters.allTypes')}</option>
                  {typeOptions.map(o => <option key={o} value={o}>{label(o)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
                {t('advProjects.filters.status')}
                <select
                  value={filters.status} onChange={e => set('status', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[150px]"
                >
                  <option value="">{t('advProjects.filters.allStatuses')}</option>
                  {statusOptions.map(s => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
                {t('advProjects.filters.district')}
                <select
                  value={filters.district} onChange={e => set('district', e.target.value)}
                  className="rounded-lg border border-outline-variant bg-surface text-on-surface text-label-md py-2 px-3 min-w-[150px]"
                >
                  <option value="">{t('advProjects.filters.allDistricts')}</option>
                  {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <span className="ms-auto text-label-sm text-on-surface-variant pb-2.5 min-w-0">
                {data.length === all.length
                  ? t('advProjects.filters.allShown', { count: all.length })
                  : t('advProjects.filters.someShown', { shown: data.length, total: all.length })}
              </span>
            </div>

            {data.length === 0 ? (
              <div className="border border-dashed border-outline-variant rounded-xl px-5 py-8 text-center">
                <p className="text-body-md font-semibold text-on-surface">{t('advProjects.empty.title')}</p>
                <p className="text-body-md text-on-surface-variant mt-1 max-w-lg mx-auto">
                  {t('advProjects.empty.body')}
                </p>
              </div>
            ) : (
              <>
                <StatTiles tiles={[
                  { label: t('advProjects.tiles.combinedCost'), value: totalCost ? `₹${fmtIN(Math.round(totalCost))} ${t('unit.crore')}` : '—', detail: t('advProjects.tiles.stateAFigure', { n: withCost.length, total: data.length }) },
                  { label: t('advProjects.tiles.projectsShown'), value: String(data.length), detail: t('advProjects.tiles.inSelection') },
                  { label: t('advProjects.tiles.withProgress'), value: t('chart.countOfTotal', { count: withProgress.length, total: data.length }), detail: t('advProjects.tiles.noBarNoGuess') },
                  { label: t('advProjects.tiles.largestSingle'), value: withCost.length ? `₹${fmtIN(Math.max(...withCost.map(p => p.estimated_cost_crore)))} ${t('unit.crore')}` : '—', detail: withCost.length ? withCost.reduce((a, b) => (a.estimated_cost_crore > b.estimated_cost_crore ? a : b)).title.slice(0, 42) : '' },
                ]} />

                <VizSection
                  title={restCount > 0 ? t('advProjects.viz.cost.titleTop', { n: TOP_BARS }) : t('advProjects.viz.cost.title')}
                  sub={t('advProjects.viz.cost.sub')}
                  provenance={t('advProjects.viz.cost.provenance')}
                >
                  <HBarChart
                    tip={tip}
                    maxValue={cleanMax(Math.max(1, ...topCost.map(p => p.estimated_cost_crore)))}
                    unit={t('unit.crore')}
                    rows={topCost.map(p => ({
                      label: p.title,
                      value: p.estimated_cost_crore,
                      tipDetail: `${label(p.project_type)} · ${p.district || t('advProjects.statewide')} · ${label(p.status)}`,
                    }))}
                  />
                  {restCount > 0 && (
                    <p className="text-label-sm text-on-surface-variant mt-2">
                      {t('advProjects.viz.cost.rest', { count: restCount, amount: `₹${fmtIN(Math.round(restSum))} ${t('unit.crore')}` })}
                    </p>
                  )}
                </VizSection>

                {typeTotals.length > 1 && (
                  <VizSection
                    title={t('advProjects.viz.byType.title')}
                    sub={t('advProjects.viz.byType.sub')}
                  >
                    <HBarChart
                      tip={tip}
                      maxValue={cleanMax(typeTotals[0][1])}
                      unit={t('unit.crore')}
                      rows={typeTotals.map(([type, total]) => ({
                        label: label(type),
                        value: total,
                        tipDetail: t('advProjects.viz.byType.tipDetail'),
                      }))}
                    />
                  </VizSection>
                )}

                <VizSection
                  title={t('advProjects.viz.status.title')}
                  sub={t('advProjects.viz.status.sub')}
                >
                  <CountStrip
                    tip={tip}
                    total={data.length}
                    tipDetail={t('advProjects.viz.status.tipDetail')}
                    segments={Object.entries(STATUS_META)
                      .map(([key, meta]) => ({
                        label: label(key),
                        count: statusCounts[key] || 0,
                        color: meta.color,
                        icon: meta.icon,
                        textOnFill: ['tendered', 'approved', 'announced'].includes(key) ? '#0b0b0b' : '#fff',
                      }))}
                  />
                </VizSection>

                <details className="text-label-md">
                  <summary className="text-primary cursor-pointer">{t('advProjects.table.viewAll', { count: data.length })}</summary>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-label-md">
                      <thead>
                        <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                          <th className="py-1.5 pe-3">{t('advProjects.table.project')}</th>
                          <th className="py-1.5 pe-3 text-end">{t('advProjects.table.estCost')}</th>
                          <th className="py-1.5 pe-3 text-end">{t('advProjects.table.progress')}</th>
                          <th className="py-1.5 pe-3">{t('advProjects.table.district')}</th>
                          <th className="py-1.5">{t('advProjects.table.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map(p => (
                          <tr key={p.id} className="border-b border-surface-variant/60">
                            <td className="py-1.5 pe-3 text-on-surface">{p.title}</td>
                            <td className="py-1.5 pe-3 text-end tabular-nums">{p.estimated_cost_crore != null ? fmtIN(p.estimated_cost_crore) : t('common.notPublished')}</td>
                            <td className="py-1.5 pe-3 text-end tabular-nums">{p.completion_percentage != null ? `${p.completion_percentage}%` : t('common.notPublished')}</td>
                            <td className="py-1.5 pe-3 text-on-surface-variant">{p.district || t('advProjects.statewide')}</td>
                            <td className="py-1.5 text-on-surface-variant">{label(p.status)}</td>
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
