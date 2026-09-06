import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT, makeDateFmt } from '../i18n'
import AdvancedProjects from '../components/advanced/AdvancedProjects'
import { ProjectsHero } from '../components/HeroInsights'
import AllProjects from '../components/AllProjects'
import ErrorBoundary from '../components/ErrorBoundary'

import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'
import { EVENTS, track } from '../lib/analytics'
const fmtTenureCr = (t, v) => (v == null || v === 0 ? null : v >= 100000
  ? `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  : `₹${Math.round(v).toLocaleString('en-IN')} ${t('unit.crore')}`)

/** Per-government strip: what each tenure shows in this register, counted
 * strictly by the dates on the records. Click a tenure to filter the list
 * to projects announced under it. */
function TenureStrip({ byTenure, active, onPick }) {
  const { t } = useT()
  if (!byTenure?.tenures?.length) return null
  return (
    <section id="by-government" className="flex flex-col gap-2 scroll-mt-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {byTenure.tenures.map(ten => {
          const isActive = active === ten.key
          const cost = fmtTenureCr(t, ten.announced_cost_crore)
          return (
            <div key={ten.key}
              className={`bg-surface-container-lowest border rounded-xl px-4 py-3 transition-all ${isActive ? 'border-primary ring-2 ring-primary' : 'border-surface-variant'}`}
              style={{ borderInlineStart: `4px solid ${TENURE_TINT[ten.key]}` }}
            >
              {/* tenure label is API content — left as the record has it */}
              <p className="text-label-md font-bold text-on-surface">{ten.label}</p>
              <p className="text-body-md text-on-surface mt-1">
                <strong>{ten.announced_count.toLocaleString('en-IN')}</strong> {t('projects.tenure.announced')}
                {cost ? <> · <strong>{cost}</strong></> : null}
              </p>
              <p className="text-label-sm text-on-surface-variant mt-0.5">
                {ten.started_count > 0 ? `${t('projects.tenure.worksBegun', { count: ten.started_count })} · ` : ''}
                {t('projects.tenure.completedInTenure', { count: ten.completed_count })}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <Link to={`/projects/tenure/${ten.key}`}
                  className="text-label-md text-primary font-bold hover:underline">
                  {t('projects.tenure.dive')}
                </Link>
                <button onClick={() => onPick(isActive ? '' : ten.key)} aria-pressed={isActive}
                  className="text-label-sm text-on-surface-variant hover:text-on-surface underline">
                  {isActive ? t('projects.tenure.clearFilter') : t('projects.tenure.filterList')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-label-sm text-on-surface-variant">
        {t('projects.tenure.countedNote')}
        {byTenure.unattributed_count > 0 && <> {t('projects.tenure.unattributed', { count: byTenure.unattributed_count.toLocaleString('en-IN') })}</>}
        {' '}<Link className="text-primary underline" to="/sources">{t('common.dataSources')}</Link>
      </p>
    </section>
  )
}

/**
 * Projects — everything on this page comes from the backend API.
 *
 * The filter dropdowns are populated from GET /projects/filters (districts,
 * types, statuses, and only the departments that actually appear in the
 * data). The status chips show live counts from GET /projects/stats.
 * If the backend is unreachable we say so — no sample projects, ever.
 *
 * Cards render a cover photo ONLY when the project actually has one in the
 * database, complete with its credit line. No placeholders, no stock images.
 */

const STATUS_COLORS = {
  under_construction: {
    badge: 'bg-secondary-fixed text-on-secondary-fixed',
    border: 'border-t-secondary-container',
    progress: 'bg-secondary-container',
    text: 'text-secondary-container',
  },
  completed: {
    badge: 'bg-[#E6F4EA] text-[#137333]',
    border: 'border-t-[#137333]',
    progress: 'bg-[#137333]',
    text: 'text-[#137333]',
  },
  delayed: {
    badge: 'bg-error-container text-on-error-container',
    border: 'border-t-error',
    progress: 'bg-error',
    text: 'text-error',
  },
  announced: {
    badge: 'bg-surface-container-highest text-on-surface',
    border: 'border-t-outline',
    progress: 'bg-outline',
    text: 'text-outline',
  },
  tendered: {
    badge: 'bg-primary-container/15 text-primary-container',
    border: 'border-t-primary-container',
    progress: 'bg-primary-container',
    text: 'text-primary-container',
  },
}

const DEFAULT_STATUS_COLOR = STATUS_COLORS.announced

const PAGE_SIZE = 21
const EMPTY_FILTERS = {
  q: '', district: '', type: '', status: '', dept: '', tenure: '', placement: '',
  sort: 'updated', order: 'desc',
}

/**
 * Status / type / sort labels arrive as API enum values ("under_construction").
 * We translate the ones we know and fall back to whatever the API sent for the
 * rest, so a new enum value shows up readable instead of as a missing key.
 * The known sets mirror PROJECT_TYPES / PROJECT_STATUSES in src/constants.
 */
const KNOWN_STATUSES = new Set([
  'announced', 'approved', 'tendered', 'under_construction',
  'completed', 'delayed', 'suspended', 'cancelled',
])
const KNOWN_TYPES = new Set([
  'infrastructure', 'roads', 'irrigation', 'power', 'industrial',
  'urban_development', 'education', 'health', 'agriculture', 'ports',
  'airports', 'railways', 'housing', 'tourism', 'it_tech',
])
const KNOWN_SORTS = new Set(['updated', 'cost', 'progress', 'title', 'announced', 'completion'])

/** Title-case an unmapped enum value: "water_supply" -> "Water Supply". */
const prettifyEnum = value =>
  value ? String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : value

/** t + group + known-set -> a labeller for that enum. `fallback` is the label
 * the API supplied, used only for values we have no key for. */
const enumLabel = (t, group, known) => (value, fallback) =>
  !value ? value
    : known.has(value) ? t(`projects.${group}.${value}`)
      : (fallback || prettifyEnum(value))

function formatCost(t, crore) {
  if (crore == null) return '—'
  if (crore >= 100000) return `₹ ${(crore / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  return `₹ ${crore.toLocaleString('en-IN')} ${t('unit.crore')}`
}

export default function Projects() {
  const { t, tn } = useT()
  const fmtDate = makeDateFmt(t)
  const statusLabel = enumLabel(t, 'status', KNOWN_STATUSES)
  const typeLabel = enumLabel(t, 'type', KNOWN_TYPES)
  const sortLabel = enumLabel(t, 'sort', KNOWN_SORTS)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Scroll to the #hash the URL asks for.
  //
  // React Router does not do this on a client-side navigation, and nothing else
  // in the app did either — so /projects?district=X#project-register simply
  // landed at the top of the page. On desktop the register sits close enough
  // that this looked correct; on a phone the hero and tenure strip stack above
  // it and push it off the screen entirely, which is why the filter looked
  // ignored on mobile and fine on the web.
  //
  // The target does not exist until the data has arrived and the register has
  // rendered, so this polls briefly rather than looking once and giving up.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!id) return
    let tries = 0
    let lastTop = null
    let timer = null

    // Scrolling once, the moment the element appears, is not enough — that was
    // the first version of this and it left the register 1288px down the page
    // on a phone. The hero, the tenure strip and the cards above it are still
    // arriving and still growing, so the position that was correct when we
    // scrolled is wrong a moment later.
    //
    // So it keeps re-scrolling until the element's position stops moving, then
    // stops. Cheap, and it does not fight the reader: any scroll of their own
    // cancels it.
    const tick = () => {
      const el = document.getElementById(id)
      if (el) {
        const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
        el.scrollIntoView({ behavior: 'auto', block: 'start' })
        if (top === lastTop) return          // settled
        lastTop = top
      }
      if (tries++ < 30) timer = setTimeout(tick, 120)   // ~3.5s, then give up quietly
    }

    const stop = () => { if (timer) clearTimeout(timer); timer = null; tries = 99 }
    window.addEventListener('wheel', stop, { passive: true, once: true })
    window.addEventListener('touchmove', stop, { passive: true, once: true })

    tick()
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
    }
  }, [location.hash, location.key])
  // Two views of the same subject: the overview that was already here, and the
  // register. Kept in the URL so a link to ?view=all lands where it says.
  // Every filter is readable from the URL, not just `tenure`.
  //
  // This is why a district link from the map showed all 526 projects: the map
  // linked to /projects?district=Prakasam, which was correct, and this page
  // built its filters from EMPTY_FILTERS and read only `tenure`. The parameter
  // arrived and was dropped on the floor. Reading them all fixes the map link
  // and every other link into a filtered list at the same time — search
  // results, a department, a status — rather than special-casing one of them.
  const URL_FILTERS = ['q', 'district', 'type', 'status', 'dept', 'tenure', 'placement']
  const fromUrl = () => {
    const picked = {}
    for (const key of URL_FILTERS) {
      const value = searchParams.get(key)
      if (value) picked[key] = value
    }
    if (picked.tenure && !['tdp1', 'ysrcp', 'tdp2'].includes(picked.tenure)) delete picked.tenure
    return picked
  }
  const urlFilters = fromUrl()

  // The tab is decided ONLY by the explicit `view` parameter.
  //
  // I first made a district link force view=all, on the reasoning that someone
  // who asked for a district wants a list rather than an overview. That was
  // wrong, and worse than the bug it was meant to fix: the filtered list lives
  // in the Overview tab, driven by `filters` and /projects/. The "All projects"
  // tab is a different thing — the register, which fetches /projects/register
  // for itself and never saw the URL at all. So the link went from showing all
  // 526 projects to showing the whole register: still not one district's
  // projects, just a different way of being wrong.
  //
  // Overview is the destination. The map link carries #project-register so the
  // reader lands on the filtered list rather than on the hero above it.
  const view = searchParams.get('view') === 'all' ? 'all' : 'overview'
  const setView = next => {
    const q = new URLSearchParams(searchParams)
    if (next === 'all') q.set('view', 'all')
    else q.delete('view')
    setSearchParams(q, { replace: false })
  }
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...fromUrl() }))
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [options, setOptions] = useState(null)
  const [byTenure, setByTenure] = useState(null)
  const [insights, setInsights] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const debounceRef = useRef(null)

  const set = (key, value) => {
    setPage(1)
    // `q` is excluded on purpose, twice over: it fires on every keystroke,
    // which would flood the counts, and its value is the reader's own words,
    // which never leave this browser.
    if (key !== 'q' && value) track(EVENTS.FILTER_APPLIED, { filter: key, value: String(value).slice(0, 60) })
    setFilters(f => {
      const next = { ...f, [key]: value }
      // Keep the URL in step with the filters, so the address bar always
      // describes what is on screen and can be copied to someone else. replace,
      // not push: typing in the search box must not fill the back button with
      // one entry per keystroke.
      if (URL_FILTERS.includes(key)) {
        const q = new URLSearchParams(searchParams)
        value ? q.set(key, value) : q.delete(key)
        if (view === 'all') q.set('view', 'all')
        setSearchParams(q, { replace: true })
      }
      return next
    })
  }

  // A link into this page while it is already open (the map, a search result)
  // changes the URL without remounting, so the filters have to follow it.
  useEffect(() => {
    const incoming = fromUrl()
    setFilters(f => {
      const merged = { ...EMPTY_FILTERS, ...incoming, sort: f.sort, order: f.order }
      return URL_FILTERS.every(k => (merged[k] || '') === (f[k] || '')) ? f : merged
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Filter options + live status counts: once per load / retry.
  useEffect(() => {
    let cancelled = false
    Promise.all([apiGet('/projects/filters'), apiGet('/projects/stats')])
      .then(([f, s]) => {
        if (cancelled) return
        setOptions(f)
        setStats(s)
      })
      .catch(() => { /* the list fetch reports connectivity problems */ })
    apiGet('/projects/by-tenure')
      .then(bt => { if (!cancelled) setByTenure(bt) })
      .catch(() => { /* strip simply doesn't render */ })
    apiGet('/projects/insights')
      .then(i => { if (!cancelled) setInsights(i) })
      .catch(() => { /* hero simply doesn't render */ })
    return () => { cancelled = true }
  }, [reloadKey])

  // Project list: refetched on every filter/page change (search debounced).
  useEffect(() => {
    let cancelled = false
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const run = () => {
      setLoading(true)
      apiGet('/projects/', {
        q: filters.q.trim() || null,
        district: filters.district || null,
        placement: filters.placement || null,
        project_type: filters.type || null,
        status: filters.status || null,
        department: filters.dept || null,
        tenure: filters.tenure || null,
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

  const activeCount = Object.entries(filters).filter(
    ([k, v]) => !['sort', 'order'].includes(k) && v
  ).length

  const projects = data?.items ?? []
  const total = data?.total ?? 0

  const statusChips = [
    { value: 'under_construction', count: stats?.ongoing ?? 0 },
    { value: 'completed', count: stats?.completed ?? 0 },
    { value: 'delayed', count: stats?.delayed ?? 0 },
    { value: 'announced', count: stats?.announced ?? 0 },
  ]

  return (
    <div className="w-full px-4 md:px-8 max-w-[1280px] mx-auto py-8 flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-surface">
            {t('projects.title')}{' '}
            <span className="text-on-surface-variant font-normal text-headline-md block md:inline md:ms-4" lang="te">
              {t('projects.titleSub')}
            </span>
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant">
            {t('projects.intro')}
          </p>
        </div>
        {!error && (
          <button
            onClick={() => { setAdvancedOpen(true); track(EVENTS.ADVANCED_VIEW_OPENED, { section: 'projects' }) }}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary text-primary text-label-md font-label-md font-semibold hover:bg-primary hover:text-on-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">insights</span>
            {t('projects.advancedView')}
          </button>
        )}
      </section>

      {!error && (
        <nav className="border-b border-surface-variant -mt-2" aria-label={t('projects.tabs.aria')}>
          <div className="flex gap-1 overflow-x-auto">
            {[
              { k: 'overview', label: t('projects.tabs.overview') },
              { k: 'all', label: t('projects.tabs.all') },
            ].map(tab => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setView(tab.k)}
                aria-current={view === tab.k ? 'page' : undefined}
                className={[
                  'px-4 py-3 text-label-lg font-label-lg border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                  view === tab.k
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <AdvancedProjects open={advancedOpen} onClose={() => setAdvancedOpen(false)} />

      {/* Backend unreachable — honest error, never sample projects */}
      {error && (
        <section className="border border-error/40 bg-error/5 rounded-xl p-6 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-error">
            <span className="material-symbols-outlined">cloud_off</span>
            <h3 className="text-headline-sm font-headline-sm">{t('projects.error.title')}</h3>
          </div>
          <p className="text-body-md text-on-surface-variant">
            {t('projects.error.body', { message: error.message })}
          </p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-label-md"
          >
            {t('common.tryAgain')}
          </button>
        </section>
      )}

      {!error && view === 'overview' && (
        <>
          {/* The picture first — four insights, then the register */}
          {insights && <ProjectsHero insights={insights} byTenure={byTenure} />}

          {/* What each government's tenure shows in this register */}
          <TenureStrip byTenure={byTenure} active={filters.tenure} onPick={k => set('tenure', k)} />

          {/* Filters */}
          <section id="project-register" className="bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm p-4 flex flex-col gap-4 scroll-mt-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2 lg:col-span-2">
                <label htmlFor="pf-q" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.search')}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">search</span>
                  <input
                    id="pf-q"
                    value={filters.q}
                    onChange={e => set('q', e.target.value)}
                    className="w-full ps-10 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 pe-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder={t('projects.filters.searchPlaceholder')}
                    type="search"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pf-district" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.district')}</label>
                <select
                  id="pf-district"
                  value={filters.district}
                  onChange={e => set('district', e.target.value)}
                  className="w-full rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 px-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">{t('projects.filters.allDistricts')}</option>
                  {(options?.districts ?? []).map(d => (
                    <option key={d.code || d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pf-type" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.type')}</label>
                <select
                  id="pf-type"
                  value={filters.type}
                  onChange={e => set('type', e.target.value)}
                  className="w-full rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 px-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">{t('projects.filters.allTypes')}</option>
                  {(options?.project_types ?? []).map(opt => (
                    <option key={opt.value} value={opt.value}>{typeLabel(opt.value, opt.label)}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pf-status" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.status')}</label>
                <select
                  id="pf-status"
                  value={filters.status}
                  onChange={e => set('status', e.target.value)}
                  className="w-full rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 px-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">{t('projects.filters.allStatuses')}</option>
                  {(options?.statuses ?? []).map(s => (
                    <option key={s.value} value={s.value}>{statusLabel(s.value, s.label)}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pf-dept" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.department')}</label>
                <select
                  id="pf-dept"
                  value={filters.dept}
                  onChange={e => set('dept', e.target.value)}
                  className="w-full rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 px-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">{t('projects.filters.allDepartments')}</option>
                  {(options?.departments ?? []).map(d => (
                    <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="pf-sort" className="text-label-sm font-label-sm text-on-surface-variant uppercase">{t('projects.filters.sortBy')}</label>
                <div className="flex gap-2">
                  <select
                    id="pf-sort"
                    value={filters.sort}
                    onChange={e => set('sort', e.target.value)}
                    className="flex-1 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 px-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  >
                    {(options?.sort_options ?? [{ value: 'updated' }]).map(o => (
                      <option key={o.value} value={o.value}>{sortLabel(o.value, o.label)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => set('order', filters.order === 'asc' ? 'desc' : 'asc')}
                    title={filters.order === 'asc' ? t('projects.filters.ascending') : t('projects.filters.descending')}
                    aria-label={filters.order === 'asc' ? t('projects.filters.sortAscending') : t('projects.filters.sortDescending')}
                    className="px-3 rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {filters.order === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <hr className="border-surface-variant" />

            {/* Status chips double as filters — counts are live from the DB */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-label-sm font-label-sm text-on-surface-variant uppercase me-1">{t('projects.chips.jumpTo')}</span>
              {statusChips.map(chip => {
                const c = STATUS_COLORS[chip.value] || DEFAULT_STATUS_COLOR
                const active = filters.status === chip.value
                return (
                  <button
                    key={chip.value}
                    onClick={() => set('status', active ? '' : chip.value)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${c.badge} ${
                      active ? 'ring-2 ring-primary ring-offset-1' : 'opacity-90 hover:opacity-100'
                    }`}
                  >
                    <span className="text-label-md font-label-md font-semibold">
                      {chip.count} {statusLabel(chip.value)}
                    </span>
                  </button>
                )
              })}
              {activeCount > 0 && (
                <button
                  onClick={() => { setPage(1); setFilters(EMPTY_FILTERS) }}
                  className="ms-auto text-label-md font-label-md text-primary hover:text-primary-container underline"
                >
                  {tn('projects.chips.clearFilters', activeCount)}
                </button>
              )}
            </div>
          </section>

          {/* Result count */}
          <div className="flex items-baseline justify-between gap-4 -mb-2">
            <p className="text-body-md text-on-surface-variant">
              <span className="font-bold text-on-surface">{total}</span>
              {' '}{tn('projects.results.unit', total)}
              {activeCount > 0 && <span> {t('projects.results.matching')}</span>}
            </p>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="border border-surface-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3 bg-surface-container-lowest">
              <span className="material-symbols-outlined text-outline text-4xl animate-spin">progress_activity</span>
              <p className="text-body-md text-on-surface-variant">{t('projects.loading')}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="border border-dashed border-outline-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-outline text-4xl">
                {activeCount > 0 ? 'search_off' : 'engineering'}
              </span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface">
                {activeCount > 0 ? t('projects.empty.noMatch') : t('projects.empty.none')}
              </h3>
              {activeCount > 0 ? (
                <>
                  <p className="text-body-md text-on-surface-variant max-w-md">
                    {t('projects.empty.tryWidening')}
                  </p>
                  <button
                    onClick={() => { setPage(1); setFilters(EMPTY_FILTERS) }}
                    className="mt-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-label-md"
                  >
                    {t('common.clearFilters')}
                  </button>
                </>
              ) : (
                <p className="text-body-md text-on-surface-variant max-w-md">
                  {t('projects.empty.noneBody')}
                </p>
              )}
            </div>
          ) : (
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => {
                const colors = STATUS_COLORS[project.status] || DEFAULT_STATUS_COLOR
                const cover = project.cover_image
                const extraImages = (project.image_count || 0) - 1
                const progress = project.completion_percentage

                return (
                  <article
                    key={project.id}
                    className={`bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden relative group border-t-4 ${colors.border}`}
                  >
                    {/* Cover photo renders ONLY when the project actually has one. */}
                    {cover && (
                      <div className="relative h-44 bg-surface-container-highest overflow-hidden">
                        <img
                          src={cover.thumbnail_url || cover.url}
                          alt={cover.caption || project.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {extraImages > 0 && (
                          <span className="absolute bottom-2 end-2 bg-black/70 text-white text-label-sm px-2 py-1 rounded-md flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">photo_library</span>
                            +{extraImages}
                          </span>
                        )}
                        {cover.credit && (
                          <span className="absolute bottom-2 start-2 bg-black/60 text-white/90 text-[10px] px-1.5 py-0.5 rounded">
                            © {cover.credit}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="p-4 flex flex-col gap-3 flex-grow">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
                            {typeLabel(project.project_type)}
                          </span>
                          <h3 className="text-headline-sm font-headline-sm text-on-surface line-clamp-2">{project.title}</h3>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors.badge} shrink-0 max-w-[45%] text-center leading-snug`}>
                          {statusLabel(project.status)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 mt-1">
                        <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">place</span>
                          <span className="line-clamp-1 min-w-0">{project.district || t('projects.statewide')}</span>
                        </div>
                        {project.department && (
                          <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant">
                            <span className="material-symbols-outlined text-[18px]">account_balance</span>
                            <span className="line-clamp-1 min-w-0">{project.department}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto pt-4 flex flex-col gap-3">
                        <div className="flex justify-between items-end">
                          <div className="flex flex-col">
                            <span className="text-label-sm font-label-sm text-on-surface-variant">{t('projects.card.estCost')}</span>
                            <span className="text-headline-sm font-headline-sm text-primary">{formatCost(t, project.estimated_cost_crore)}</span>
                          </div>
                          {progress != null && (
                            <div className="text-end">
                              <span className="text-label-sm font-label-sm text-on-surface-variant">{t('projects.card.progress')}</span>
                              <span className={`text-headline-sm font-headline-sm block ${colors.text}`}>{progress}%</span>
                            </div>
                          )}
                        </div>
                        {/* Progress bar only when the government has published a figure */}
                        {progress != null && (
                          <div
                            className="w-full bg-surface-variant rounded-full h-2"
                            role="progressbar"
                            aria-valuenow={progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div className={`${colors.progress} h-2 rounded-full transition-all`} style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-surface border-t border-surface-variant p-4 flex justify-between items-center gap-2">
                      <span className="text-label-sm font-label-sm text-on-surface-variant">
                        {project.expected_completion
                          ? t('projects.card.expected', { date: fmtDate(String(project.expected_completion).slice(0, 7)) })
                          : ''}
                      </span>
                      <Link
                        to={`/projects/${project.id}`}
                        data-nowrap-en
                        className="text-label-md font-label-md text-primary font-semibold hover:text-primary-container flex items-center gap-1 group-hover:underline whitespace-nowrap"
                      >
                        {t('projects.card.viewDetails')} <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </Link>
                    </div>
                  </article>
                )
              })}
            </section>
          )}

          {/* Pagination */}
          {!loading && total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!data?.has_prev}
                className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
              >
                {t('common.previous')}
              </button>
              <span className="text-label-md text-on-surface-variant">{t('projects.pagination.page', { page })}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!data?.has_next}
                className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}

      {!error && view === 'all' && (
        /* The register is where every district link from the map now lands, so
           a malformed response here would blank the page readers arrive on. */
        <ErrorBoundary label="AllProjects" resetKey={searchParams.toString()}>
          {/* The register has its own filters and its own endpoint. Without
              this it would quietly drop the district when a reader switched
              tabs, which reads as the site losing their filter. */}
          <AllProjects district={filters.district} onClearDistrict={() => set('district', '')} />
        </ErrorBoundary>
      )}
    </div>
  )
}
