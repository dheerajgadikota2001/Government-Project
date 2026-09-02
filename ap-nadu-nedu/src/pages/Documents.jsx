import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchDocuments,
  fetchDocumentStats,
  fetchDocumentFilters,
} from '../lib/api'
import { useT } from '../i18n'
import DocumentLibrary from '../components/DocumentLibrary'

/**
 * Document Library — every row on this page comes from the backend API,
 * which in turn only holds what our scrapers collected from official
 * government portals. Nothing here is hardcoded or invented:
 *   - the table rows are real database rows,
 *   - the filter dropdowns only offer values that exist in the data,
 *   - the stats tiles are live counts,
 *   - and if the backend is unreachable we say so instead of showing
 *     placeholder documents.
 *
 * Document titles, reference numbers, departments, portal names and source
 * URLs are the record itself and are never translated. The document *type*
 * arrives as a slug, so the reader-facing name for each slug is a key,
 * resolved at render; an unknown slug falls back to the raw value.
 */

const TYPE_LABEL_KEYS = {
  budget: 'documents.type.budget',
  assembly_bill: 'documents.type.assemblyBill',
  government_order: 'documents.type.governmentOrder',
  policy: 'documents.type.policy',
  annual_report: 'documents.type.annualReport',
  audit_report: 'documents.type.auditReport',
  white_paper: 'documents.type.whitePaper',
  press_release: 'documents.type.pressRelease',
  mou_document: 'documents.type.mouDocument',
  project_report: 'documents.type.projectReport',
  other: 'documents.type.other',
}

const TYPE_STYLES = {
  budget: { badge: 'bg-secondary-container/20 text-secondary-container', icon: 'description' },
  government_order: { badge: 'bg-primary/10 text-primary', icon: 'gavel' },
  policy: { badge: 'bg-surface-container-high text-on-surface-variant', icon: 'policy' },
  audit_report: { badge: 'bg-primary-container/20 text-primary-container', icon: 'fact_check' },
  annual_report: { badge: 'bg-secondary-container/20 text-secondary-container', icon: 'summarize' },
  assembly_bill: { badge: 'bg-primary/10 text-primary', icon: 'balance' },
  white_paper: { badge: 'bg-surface-container-high text-on-surface-variant', icon: 'article' },
}

const DEFAULT_TYPE_STYLE = { badge: 'bg-surface-container-high text-on-surface-variant', icon: 'description' }

/** Short badge label for the table, where column width is tight. */
const SHORT_TYPE_KEYS = {
  government_order: 'documents.shortType.governmentOrder',
  audit_report: 'documents.shortType.auditReport',
  assembly_bill: 'documents.shortType.assemblyBill',
  white_paper: 'documents.shortType.whitePaper',
  annual_report: 'documents.shortType.annualReport',
  project_report: 'documents.shortType.projectReport',
  press_release: 'documents.shortType.pressRelease',
  mou_document: 'documents.shortType.mouDocument',
}

const STAT_ICONS = {
  audit_report: { icon: 'fact_check', color: 'text-[#137333]' },
  budget: { icon: 'description', color: 'text-secondary-container' },
  government_order: { icon: 'gavel', color: 'text-primary' },
  policy: { icon: 'policy', color: 'text-tertiary' },
}

const SORT_OPTIONS = [
  { value: 'date', key: 'documents.sort.date' },
  { value: 'retrieved', key: 'documents.sort.retrieved' },
  { value: 'title', key: 'documents.sort.title' },
  { value: 'year', key: 'documents.sort.year' },
]

const PAGE_SIZE = 20
const EMPTY = { q: '', type: '', dept: '', year: '', portal: '', sort: 'date', order: 'desc' }

const fmtDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null

/**
 * A sentence is one translation unit, so emphasis travels inside the string:
 * **bold** and *italic* markers become elements here. A translation that drops
 * the markers still renders, just unstyled.
 */
function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i} className="font-bold text-on-surface">{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export default function Documents() {
  const { t, tn } = useT()
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)       // paginated response
  const [stats, setStats] = useState(null)     // live counts
  const [options, setOptions] = useState(null) // real filter values
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const debounceRef = useRef(null)

  // A document type is a slug from the API; show its keyed name, or the slug.
  const typeLabel = slug => (TYPE_LABEL_KEYS[slug] ? t(TYPE_LABEL_KEYS[slug]) : slug)
  const shortTypeLabel = slug => (SHORT_TYPE_KEYS[slug] ? t(SHORT_TYPE_KEYS[slug]) : typeLabel(slug))

  const set = (k, v) => {
    setPage(1)
    setFilters(f => ({ ...f, [k]: v }))
  }

  // Stats + filter options: fetched once (and on manual retry).
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDocumentStats(), fetchDocumentFilters()])
      .then(([s, f]) => {
        if (cancelled) return
        setStats(s)
        setOptions(f)
      })
      .catch(() => {
        /* the list fetch below reports connectivity problems */
      })
    return () => { cancelled = true }
  }, [reloadKey])

  // Document list: refetched whenever filters/page change. Search is
  // debounced so we don't hit the API on every keystroke.
  useEffect(() => {
    let cancelled = false
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const run = () => {
      setLoading(true)
      fetchDocuments({
        q: filters.q.trim() || null,
        document_type: filters.type || null,
        year: filters.year || null,
        department: filters.dept || null,
        source_portal: filters.portal || null,
        sort: filters.sort,
        order: filters.order,
        page,
        page_size: PAGE_SIZE,
      })
        .then(res => {
          if (cancelled) return
          setData(res)
          setError(null)
        })
        .catch(err => {
          if (cancelled) return
          setError(err)
          setData(null)
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    debounceRef.current = setTimeout(run, filters.q ? 300 : 0)
    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters, page, reloadKey])

  const activeCount = Object.entries(filters)
    .filter(([k, v]) => !['sort', 'order'].includes(k) && v).length

  // Labels stay unresolved here so they follow the chosen language at render.
  const statTiles = useMemo(() => {
    if (!stats) return []
    const tiles = [
      { id: 'total', labelKey: 'documents.stats.total', value: stats.total, icon: 'folder_open', color: 'text-primary' },
    ]
    const byType = Object.entries(stats.by_type || {}).sort((a, b) => b[1] - a[1])
    for (const [type, count] of byType.slice(0, 3)) {
      const meta = STAT_ICONS[type] || { icon: 'description', color: 'text-on-surface-variant' }
      tiles.push({ id: type, type, value: count, ...meta })
    }
    return tiles
  }, [stats])

  const docs = data?.items ?? []
  const total = data?.total ?? 0
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="w-full px-4 md:px-8 max-w-[1280px] mx-auto py-8 flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <h1 className="text-display-lg-mobile font-display-lg-mobile md:text-display-lg md:font-display-lg text-primary">
          {t('documents.title')}
        </h1>
        <h2 className="text-headline-md font-headline-md text-on-surface-variant" lang="te">{t('documents.titleTe')}</h2>
        <p className="text-body-lg font-body-lg text-outline">
          {t('documents.intro')}
        </p>
      </section>

      {/* The library: the map of the whole official record, fetched or not */}
      <DocumentLibrary />

      {/* Backend unreachable — say so honestly, never show placeholder rows */}
      {error && (
        <section className="border border-error/40 bg-error/5 rounded-xl p-6 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-error">
            <span className="material-symbols-outlined">cloud_off</span>
            <h3 className="text-headline-sm font-headline-sm">{t('documents.error.title')}</h3>
          </div>
          <p className="text-body-md text-on-surface-variant">
            {t('documents.error.body', { message: error.message })}
          </p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-label-md"
          >
            {t('common.tryAgain')}
          </button>
        </section>
      )}

      {!error && (
        <>
          {/* Stats — live counts from the database */}
          {statTiles.length > 0 && (
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statTiles.map(stat => (
                <div key={stat.id} className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <span className={`material-symbols-outlined ${stat.color} text-2xl`}>{stat.icon}</span>
                  <div className="min-w-0">
                    <p className="text-headline-sm font-headline-sm text-on-surface font-bold">{stat.value}</p>
                    <p className="text-label-sm font-label-sm text-on-surface-variant">
                      {stat.labelKey ? t(stat.labelKey) : typeLabel(stat.type)}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Filter Bar — options come from the data, not a hardcoded list */}
          <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 flex flex-col gap-4 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="relative flex-grow w-full lg:max-w-sm min-w-0">
                <label htmlFor="doc-q" className="sr-only">{t('documents.search.label')}</label>
                <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">search</span>
                <input
                  id="doc-q"
                  value={filters.q}
                  onChange={e => set('q', e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-lg border border-outline-variant bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md text-on-surface"
                  placeholder={t('documents.search.placeholder')}
                  type="search"
                />
              </div>
              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                <select
                  aria-label={t('documents.filter.typeAria')}
                  value={filters.type}
                  onChange={e => set('type', e.target.value)}
                  className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-label-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                >
                  <option value="">{t('documents.filter.allTypes')}</option>
                  {(options?.document_types ?? []).map(dt => (
                    <option key={dt} value={dt}>{typeLabel(dt)}</option>
                  ))}
                </select>
                <select
                  aria-label={t('documents.filter.deptAria')}
                  value={filters.dept}
                  onChange={e => set('dept', e.target.value)}
                  className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-label-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                >
                  <option value="">{t('documents.filter.allDepts')}</option>
                  {(options?.departments ?? []).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  aria-label={t('documents.filter.yearAria')}
                  value={filters.year}
                  onChange={e => set('year', e.target.value)}
                  className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-label-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                >
                  <option value="">{t('documents.filter.allYears')}</option>
                  {(options?.years ?? []).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    aria-label={t('documents.filter.sortAria')}
                    value={filters.sort}
                    onChange={e => set('sort', e.target.value)}
                    className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-label-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                  >
                    {SORT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>
                        {t('documents.filter.sortPrefix', { label: t(o.key) })}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => set('order', filters.order === 'asc' ? 'desc' : 'asc')}
                    aria-label={filters.order === 'asc' ? t('documents.filter.sortAsc') : t('documents.filter.sortDesc')}
                    className="px-3 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {filters.order === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {activeCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-label-sm text-on-surface-variant">
                  {tn('documents.matching', total)}
                </span>
                <button
                  onClick={() => { setPage(1); setFilters(EMPTY) }}
                  className="ms-auto text-label-md font-label-md text-primary hover:text-primary-container underline"
                >
                  {tn('documents.clearN', activeCount)}
                </button>
              </div>
            )}
          </section>

          {/* Table */}
          <section className="flex flex-col gap-4">
            <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">
              {activeCount > 0 ? t('documents.heading.matching') : t('documents.heading.all')}
            </h2>

            {loading ? (
              <div className="border border-surface-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3 bg-surface-container-lowest">
                <span className="material-symbols-outlined text-outline text-4xl animate-spin">progress_activity</span>
                <p className="text-body-md text-on-surface-variant">{t('documents.loading')}</p>
              </div>
            ) : docs.length === 0 ? (
              <div className="border border-dashed border-outline-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-outline text-4xl">search_off</span>
                <h3 className="text-headline-sm font-headline-sm text-on-surface">
                  {activeCount > 0 ? t('documents.empty.filtered') : t('documents.empty.none')}
                </h3>
                {activeCount > 0 ? (
                  <button
                    onClick={() => { setPage(1); setFilters(EMPTY) }}
                    className="mt-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-label-md"
                  >
                    {t('common.clearFilters')}
                  </button>
                ) : (
                  <p className="text-body-md text-on-surface-variant max-w-md">
                    {t('documents.empty.body')}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-surface-container border-b border-surface-variant">
                        <th className="text-start px-4 py-3 text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">{t('documents.table.info')}</th>
                        <th className="text-start px-4 py-3 text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider hidden md:table-cell">{t('documents.table.department')}</th>
                        <th className="text-start px-4 py-3 text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider hidden lg:table-cell">{t('documents.table.published')}</th>
                        <th className="text-end px-4 py-3 text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">{t('documents.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant">
                      {docs.map(doc => {
                        const style = TYPE_STYLES[doc.document_type] || DEFAULT_TYPE_STYLE
                        return (
                          <tr key={doc.id} className="hover:bg-surface-container-low transition-colors group">
                            <td className="px-4 py-4">
                              <div className="flex items-start gap-3">
                                <span data-nowrap-en className={`text-label-sm font-label-sm px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0 ${style.badge}`}>
                                  {shortTypeLabel(doc.document_type)}
                                </span>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-body-md font-body-md text-on-surface font-medium line-clamp-2 group-hover:text-primary transition-colors">
                                    {doc.title}
                                  </span>
                                  {doc.reference_number && (
                                    <span className="text-label-sm font-label-sm text-outline font-mono">{doc.reference_number}</span>
                                  )}
                                  <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1 flex-wrap">
                                    <span className="material-symbols-outlined text-[13px] text-outline">verified</span>
                                    {t('documents.from')}{' '}
                                    {doc.source_page_url ? (
                                      <a
                                        href={doc.source_page_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                                      >
                                        {doc.source_portal}
                                        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                      </a>
                                    ) : (
                                      <span className="font-semibold">{doc.source_portal}</span>
                                    )}
                                    {fmtDate(doc.retrieved_at) && <>· {t('documents.fetchedOn', { date: fmtDate(doc.retrieved_at) })}</>}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 hidden md:table-cell">
                              <span className="text-body-md text-on-surface-variant">{doc.department || '—'}</span>
                            </td>
                            <td className="px-4 py-4 hidden lg:table-cell">
                              <span className="text-body-md text-on-surface-variant whitespace-nowrap">
                                {fmtDate(doc.published_date) || (doc.year ?? '—')}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-2">
                                {doc.source_url && (
                                  <a
                                    href={doc.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-nowrap-en
                                    className="flex items-center gap-1 py-1.5 px-3 bg-primary text-on-primary rounded-lg text-label-sm font-label-sm hover:bg-primary-container transition-colors whitespace-nowrap"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                                    <span className="hidden sm:inline">{t('documents.originalPdf')}</span>
                                  </a>
                                )}
                                {doc.source_page_url && (
                                  <a
                                    href={doc.source_page_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t('documents.openSourcePage')}
                                    className="p-1.5 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-surface-variant px-4 py-3 bg-surface-container-low">
                  <span className="text-label-sm font-label-sm text-on-surface-variant min-w-0">
                    {rich(tn('documents.showing', total, { from: showingFrom, to: showingTo }))}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={!data?.has_prev}
                      className="px-3 py-1.5 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
                    >
                      {t('common.previous')}
                    </button>
                    <span className="text-label-sm text-on-surface-variant">{t('documents.pageN', { page })}</span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={!data?.has_next}
                      className="px-3 py-1.5 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
                    >
                      {t('common.next')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
