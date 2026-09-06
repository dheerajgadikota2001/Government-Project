import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT, fmtCrore } from '../i18n'
import AdvancedInvestments from '../components/advanced/AdvancedInvestments'
import Deferred from '../components/Deferred'
import { InvestmentsHero } from '../components/HeroInsights'
import SummitLedger from '../components/SummitLedger'
import PageThread from '../components/community/PageThread'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'
import { EVENTS, track } from '../lib/analytics'


/** What each government's tenure signed, by the dates on the records.
 * Click to filter the register to that tenure's MoUs. */
function TenureStrip({ byTenure, active, onPick }) {
  const { t } = useT()
  const fmtTenureCr = v => fmtCrore(v, { lakhCrLabel: t('unit.lakhCrore'), crLabel: t('unit.crore') })
  if (!byTenure?.tenures?.length) return null
  return (
    <section id="by-government-mous" className="flex flex-col gap-2 scroll-mt-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {byTenure.tenures.map(ten => {
          const isActive = active === ten.key
          return (
            <div key={ten.key}
              className={`bg-surface-container-lowest border rounded-xl px-4 py-3 transition-all ${isActive ? 'border-primary ring-2 ring-primary' : 'border-surface-variant'}`}
              style={{ borderLeft: `4px solid ${TENURE_TINT[ten.key]}` }}
            >
              <p className="text-label-md font-bold text-on-surface">{ten.label}</p>
              {ten.signed_count > 0 ? (
                <>
                  <p className="text-body-md text-on-surface mt-1">
                    <strong>{ten.signed_count.toLocaleString('en-IN')}</strong> {t('investments.tenure.mousOnRecord')}
                    {fmtTenureCr(ten.investment_crore)
                      ? <> · <strong>{fmtTenureCr(ten.investment_crore)}</strong> {t('investments.tenure.promised')}</>
                      : null}
                  </p>
                  <p className="text-label-sm text-on-surface-variant mt-0.5">
                    {ten.expected_jobs > 0
                      ? t('investments.tenure.jobsAcross', {
                          jobs: ten.expected_jobs.toLocaleString('en-IN'),
                          n: ten.with_jobs_count,
                        })
                      : t('investments.tenure.noJobsFigure')}
                    {' · '}
                    {t('investments.tenure.operationalSoFar', { n: ten.operational_count })}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                    <Link to={`/investments/tenure/${ten.key}`}
                      className="text-label-md text-primary font-bold hover:underline">
                      {t('investments.tenure.dive')}
                    </Link>
                    <button onClick={() => onPick(isActive ? '' : ten.key)} aria-pressed={isActive}
                      className="text-label-sm text-on-surface-variant hover:text-on-surface underline">
                      {isActive ? t('investments.tenure.clearFilter') : t('investments.tenure.filterList')}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-label-md text-on-surface-variant mt-1">
                  {t('investments.tenure.noneInTerm')}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-label-sm text-on-surface-variant">
        {t('investments.tenure.note')}
        {byTenure.unattributed_count > 0 && (
          <> {t('investments.tenure.unattributed', { n: byTenure.unattributed_count.toLocaleString('en-IN') })}</>
        )}
        {' '}<Link className="text-primary underline" to="/sources">{t('common.dataSources')}</Link>
      </p>
    </section>
  )
}

/**
 * Investments & MoUs — fully wired to the backend API.
 *
 * Rows come from GET /mous/, headline stats from GET /mous/stats (live
 * database totals, not sums of whatever page is loaded), and filter
 * options from GET /mous/filters. If the backend is unreachable we say
 * so plainly — no sample MoUs are ever shown.
 */

const STATUS_STYLES = {
  operational: { badge: 'bg-green-100 text-green-800 border-green-200', top: 'bg-green-500' },
  investment_started: { badge: 'bg-orange-100 text-orange-800 border-orange-200', top: 'bg-secondary-container' },
  signed: { badge: 'bg-blue-100 text-blue-800 border-blue-200', top: 'bg-blue-500' },
  stalled: { badge: 'bg-red-100 text-red-800 border-red-200', top: 'bg-error' },
  cancelled: { badge: 'bg-surface-container-high text-on-surface-variant border-outline-variant', top: 'bg-outline' },
}

const PAGE_SIZE = 20
const EMPTY = { q: '', sector: '', status: '', district: '', tenure: '', year: '', sort: 'investment', order: 'desc' }

const label = v => (v ? v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : v)
const fmtAmount = n => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`)

/* ------------------------------------------- what the total is made of */

const TIER_FILL = {
  government: '#2f6bb5',
  company:    '#8d8b83',
  press:      '#b5851b',
  unlabelled: '#c9c6bd',
}

function ProvenanceStrip({ stats, t }) {
  const order = ['government', 'company', 'press', 'unlabelled']
  const rows = order
    .map(k => ({ key: k, ...(stats.by_source_tier[k] || {}) }))
    .filter(r => (r.mous || 0) > 0)
  if (!rows.length) return null
  const total = stats.total_investment_crore || 0

  return (
    <section className="border border-surface-variant rounded-xl bg-surface-container-lowest p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-title-sm font-title-sm text-on-surface">{t('investments.provenance.title')}</h3>
        <p className="text-label-sm text-outline max-w-[70ch]">{stats.provenance_note}</p>
      </div>

      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-variant" role="img"
        aria-label={t('investments.provenance.barAria')}>
        {rows.map(r => (
          <span key={r.key} style={{ background: TIER_FILL[r.key], flex: r.investment_crore || 0.0001 }} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rows.map(r => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-label-sm font-semibold text-on-surface-variant">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: TIER_FILL[r.key] }} />
              {t(`investments.card.tier.${r.key}`, {}) || r.key}
            </span>
            <span className="text-title-md font-title-md text-on-surface tabular-nums" data-numeric>
              {fmtAmount(r.investment_crore)} <span className="text-label-sm text-outline">{t('unit.crore')}</span>
            </span>
            <span className="text-label-sm text-outline">
              {t('investments.provenance.detail', { n: r.mous, pct: r.share_pct })}
            </span>
          </div>
        ))}
      </div>

      <p className="text-label-sm text-outline leading-relaxed max-w-[90ch] border-t border-dashed border-outline-variant pt-3">
        {t('investments.provenance.footnote', {
          gov: fmtAmount((stats.by_source_tier.government || {}).investment_crore || 0),
          total: fmtAmount(total),
        })}
      </p>
    </section>
  )
}

const fmtSigned = iso => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null)
const fmtFull = iso => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null)

// Values are key paths, resolved at render so they follow the chosen language.
const STATUS_EXPLAIN = {
  signed: 'investments.statusExplain.signed',
  investment_started: 'investments.statusExplain.investmentStarted',
  operational: 'investments.statusExplain.operational',
  stalled: 'investments.statusExplain.stalled',
  cancelled: 'investments.statusExplain.cancelled',
}

/** Full record of one MoU — opens when a card is clicked. */
function MouDetail({ id, onClose }) {
  const { t } = useT()
  const ref = useRef(null)
  const [mou, setMou] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (id != null && !d.open) d.showModal()
    if (id == null && d.open) d.close()
  }, [id])

  useEffect(() => {
    if (id == null) return
    setMou(null); setErr(null)
    apiGet(`/mous/${id}`).then(setMou).catch(setErr)
  }, [id])

  const steps = mou ? [
    mou.signed_date && { d: mou.signed_date, t: t('investments.detail.stepSigned'), done: true },
    mou.expected_start_date && { d: mou.expected_start_date, t: t('investments.detail.stepStart'), done: ['investment_started', 'operational'].includes(mou.status) },
    mou.expected_completion && { d: mou.expected_completion, t: t('investments.detail.stepCompletion'), done: mou.status === 'operational' },
  ].filter(Boolean) : []

  return (
    <dialog ref={ref} onClose={onClose}
      className="rounded-2xl p-0 w-[min(720px,calc(100vw-24px))] max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain bg-surface backdrop:bg-black/45">
      {mou && (
        <>
          <div className="sticky top-0 bg-surface z-10 flex justify-between items-start px-6 pt-5 pb-3 border-b border-surface-variant gap-3">
            <div className="min-w-0">
              <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{mou.company_name}</h2>
              <p className="text-label-sm text-on-surface-variant mt-0.5">
                {mou.title}{mou.summit_name ? ` · ${mou.summit_name}` : ''}
              </p>
            </div>
            <button onClick={onClose} aria-label={t('common.close')}
              className="w-9 h-9 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors shrink-0">✕</button>
          </div>
          <div className="px-6 py-5 flex flex-col gap-5">
            {/* Where this came from, stated before the figures rather than after.
                Most entries in this register are press or company sourced; an
                unlabelled investment figure reads as confirmed when it is not. */}
            {mou.source_label && (
              <div className={`rounded-xl border-s-4 px-4 py-3 ${
                mou.source_tier === 'government'
                  ? 'border-emerald-500/70 bg-emerald-50/40'
                  : 'border-amber-400/80 bg-amber-50/40'}`}>
                <p className="text-label-md font-bold text-on-surface">{mou.source_label}</p>
                {mou.source_caveat && (
                  <p className="text-body-sm text-on-surface-variant mt-1 max-w-[70ch]">{mou.source_caveat}</p>
                )}
                {mou.date_status === 'undated' && (
                  <p className="text-label-sm text-on-surface-variant mt-1">{t('investments.detail.undated')}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['investments.detail.committedInvestment', mou.investment_crore != null ? `${fmtAmount(mou.investment_crore)} ${t('unit.crore')}` : t('common.notPublished')],
                ['investments.detail.expectedJobs', mou.expected_employment != null ? mou.expected_employment.toLocaleString('en-IN') : t('common.notPublished')],
                ['investments.detail.sector', label(mou.sector)],
                ['investments.detail.district', mou.district || t('investments.detail.notSpecified')],
              ].map(([k, v]) => (
                <div key={k} className="border border-surface-variant rounded-xl px-3 py-2.5 bg-surface-container-lowest">
                  <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t(k)}</p>
                  <p className="text-title-md font-bold text-on-surface mt-0.5">{v}</p>
                </div>
              ))}
            </div>

            <div>
              <span className={`text-label-md px-3 py-1 rounded-full border ${(STATUS_STYLES[mou.status] || STATUS_STYLES.signed).badge}`}>{label(mou.status)}</span>
              <p className="text-label-sm text-on-surface-variant mt-2 max-w-xl">
                {STATUS_EXPLAIN[mou.status] ? t(STATUS_EXPLAIN[mou.status]) : ''}
              </p>
            </div>

            {mou.description && (
              <div>
                <h3 className="text-title-md font-bold text-on-surface mb-1">{t('investments.detail.whatRecordSays')}</h3>
                <p className="text-body-md text-on-surface leading-relaxed whitespace-pre-line">{mou.description}</p>
              </div>
            )}

            {steps.length > 0 && (
              <div>
                <h3 className="text-title-md font-bold text-on-surface mb-2">{t('investments.detail.schedule')}</h3>
                <ol className="relative border-s-2 border-surface-variant ms-24 flex flex-col gap-4 py-1">
                  {steps.map((s, i) => (
                    <li key={i} className="relative ps-5">
                      <span className={`absolute -start-[7px] top-1 w-3 h-3 rounded-full border-2 border-surface ${s.done ? 'bg-primary' : 'bg-outline-variant'}`} />
                      <span className="absolute -start-24 top-0 w-20 text-end text-label-sm tabular-nums text-on-surface-variant">{fmtSigned(s.d)}</span>
                      <p className="text-body-md text-on-surface">{s.t}</p>
                    </li>
                  ))}
                </ol>
                <p className="text-label-sm text-on-surface-variant mt-2 max-w-xl">
                  {t('investments.detail.scheduleNote')}
                </p>
              </div>
            )}
            {steps.length === 0 && (
              <p className="text-label-sm text-on-surface-variant">
                {t('investments.detail.noDates')}
              </p>
            )}

            <p className="text-label-sm pt-3 border-t border-dashed border-surface-variant">
              <span className="text-on-surface-variant">{t('investments.detail.recordSource')} </span>
              {mou.source_url
                ? <a className="text-primary" href={mou.source_url} target="_blank" rel="noreferrer">{mou.source_portal} ↗</a>
                : <span className="text-on-surface">{mou.source_portal}</span>}
              <span className="text-on-surface-variant"> · {t('investments.detail.inRegisterSince', { date: fmtFull(mou.created_at) })}</span>
            </p>
          </div>
        </>
      )}
      {err && <div className="p-6 text-body-md text-on-surface">{t('investments.detail.loadError', { message: err.message })}</div>}
      {!mou && !err && id != null && <div className="p-6 text-body-md text-on-surface-variant">{t('investments.detail.loading')}</div>}
    </dialog>
  )
}

export default function Investments() {
  const { t, tn } = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => ({
    ...EMPTY,
    tenure: ['tdp1', 'ysrcp', 'tdp2'].includes(searchParams.get('tenure')) ? searchParams.get('tenure') : '',
  }))
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [byTenure, setByTenure] = useState(null)
  const [insights, setInsights] = useState(null)
  const debounceRef = useRef(null)

  // Three views of the same subject, kept in the URL exactly like the
  // Projects page: /investments (overview), ?view=mous (the register),
  // ?view=sources (who stands behind the numbers). A shared link lands
  // where it says.
  const view = ['mous', 'sources'].includes(searchParams.get('view'))
    ? searchParams.get('view')
    : 'overview'
  const setView = next => {
    const q = new URLSearchParams(searchParams)
    if (next === 'overview') q.delete('view')
    else q.set('view', next)
    setSearchParams(q)
  }

  const set = (k, v) => {
    setPage(1)
    setFilters(f => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([apiGet('/mous/stats'), apiGet('/mous/filters')])
      .then(([s, f]) => {
        if (cancelled) return
        setStats(s)
        setOptions(f)
      })
      .catch(() => { /* the list fetch reports connectivity problems */ })
    apiGet('/mous/by-tenure')
      .then(bt => { if (!cancelled) setByTenure(bt) })
      .catch(() => { /* strip simply doesn't render */ })
    apiGet('/mous/insights')
      .then(i => { if (!cancelled) setInsights(i) })
      .catch(() => { /* hero simply doesn't render */ })
    return () => { cancelled = true }
  }, [reloadKey])

  useEffect(() => {
    let cancelled = false
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const run = () => {
      setLoading(true)
      apiGet('/mous/', {
        q: filters.q.trim() || null,
        sector: filters.sector || null,
        status: filters.status || null,
        district: filters.district || null,
        tenure: filters.tenure || null,
        year: filters.year && filters.year !== 'none' ? Number(filters.year) : null,
        undated: filters.year === 'none' ? true : null,
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

  const activeCount = Object.entries(filters).filter(([k, v]) => !['sort', 'order'].includes(k) && v).length
  const mous = data?.items ?? []
  const total = data?.total ?? 0

  const statCards = stats ? [
    { label: t('investments.stats.committedAnnounced'), value: fmtAmount(stats.total_investment_crore), unit: t('unit.crore'), accent: 'bg-secondary-container', icon: 'currency_rupee' },
    { label: t('investments.stats.totalMous'), value: String(stats.total_mous), unit: t('investments.stats.agreements'), accent: 'bg-primary-container', icon: 'handshake' },
    { label: t('investments.stats.expectedJobs'), value: (stats.total_expected_jobs ?? 0).toLocaleString('en-IN'), unit: t('investments.stats.projected'), accent: 'bg-green-600', icon: 'work' },
    { label: t('investments.stats.foreignInvestors'), value: String(stats.foreign_investments), unit: t('investments.stats.nonDomestic'), accent: 'bg-purple-600', icon: 'public' },
  ] : []

  return (
    <div className="w-full px-4 md:px-8 max-w-[1280px] mx-auto py-8 flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <h1 className="text-display-lg-mobile font-display-lg-mobile md:text-display-lg md:font-display-lg text-primary">
            {t('investments.title')}
          </h1>
          <h2 className="text-headline-md font-headline-md text-on-surface-variant">
            {t('investments.titleSub')}
          </h2>
          <p className="text-body-lg font-body-lg text-outline">
            {t('investments.intro')}
          </p>
        </div>
        {!error && (
          <button
            onClick={() => { setAdvancedOpen(true); track(EVENTS.ADVANCED_VIEW_OPENED, { section: 'investments' }) }}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary text-primary text-label-md font-label-md font-semibold hover:bg-primary hover:text-on-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">insights</span>
            {t('investments.advancedView')}
          </button>
        )}
      </section>

      {!error && (
        <nav className="border-b border-surface-variant -mt-2" aria-label={t('investments.tabs.aria')}>
          <div className="flex gap-1 overflow-x-auto">
            {[
              { k: 'overview', label: t('investments.tabs.overview') },
              { k: 'mous', label: t('investments.tabs.mous') },
              { k: 'sources', label: t('investments.tabs.sources') },
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

      <AdvancedInvestments open={advancedOpen} onClose={() => setAdvancedOpen(false)} />

      {error && (
        <section className="border border-error/40 bg-error/5 rounded-xl p-6 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-error">
            <span className="material-symbols-outlined">cloud_off</span>
            <h3 className="text-headline-sm font-headline-sm">{t('investments.error.title')}</h3>
          </div>
          <p className="text-body-md text-on-surface-variant">
            {t('investments.error.body', { message: error.message })}
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
          {/* The picture first — four insights, then the rest of the story */}
          {insights && <InvestmentsHero insights={insights} byTenure={byTenure} stats={stats} />}

          {/* Stats — live database totals */}
          {statCards.length > 0 && (
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map(card => (
                <div key={card.label} className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
                  <div className={`absolute top-0 start-0 w-full h-1 ${card.accent}`} />
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">{card.label}</span>
                    <span className="material-symbols-outlined text-outline text-lg">{card.icon}</span>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-headline-md font-headline-md text-primary font-bold">{card.value}</span>
                    <span className="text-label-sm font-label-sm text-outline">{card.unit}</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* What each government's tenure signed. Filtering jumps to the
              register tab, which is where the filtered list now lives. */}
          <TenureStrip byTenure={byTenure} active={filters.tenure}
            onPick={k => { set('tenure', k); setView('mous') }} />

          {/* One line on who stands behind the totals; the full breakdown
              lives in the Sources tab so the overview stays readable. */}
          {stats?.by_source_tier && (
            <p className="text-label-md text-on-surface-variant -mt-2 max-w-[90ch]">
              {t('investments.provenance.compact', {
                gov: (stats.by_source_tier.government || {}).share_pct ?? 0,
                company: (stats.by_source_tier.company || {}).share_pct ?? 0,
                press: (stats.by_source_tier.press || {}).share_pct ?? 0,
              })}{' '}
              <button type="button" onClick={() => setView('sources')}
                className="text-primary underline font-semibold">
                {t('investments.provenance.seeBreakdown')}
              </button>
            </p>
          )}

          {/* Summits since bifurcation: announced against built, and the
              projects that straddle a change of government */}
          <SummitLedger />
        </>
      )}

      {!error && view === 'mous' && (
        <>
          {/* Filters */}
          <section id="mou-register" className="scroll-mt-20 bg-surface-container border border-surface-variant rounded-xl p-4 shadow-sm flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative lg:col-span-2">
                <label htmlFor="inv-q" className="sr-only">{t('investments.filters.searchLabel')}</label>
                <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">search</span>
                <input
                  id="inv-q"
                  value={filters.q}
                  onChange={e => set('q', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-2.5 ps-10 pe-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-md"
                  placeholder={t('investments.filters.searchPlaceholder')}
                  type="search"
                />
              </div>

              <select
                aria-label={t('investments.filters.bySector')}
                value={filters.sector}
                onChange={e => set('sector', e.target.value)}
                className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="">{t('investments.filters.allSectors')}</option>
                {(options?.sectors ?? []).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <select
                aria-label={t('investments.filters.byStatus')}
                value={filters.status}
                onChange={e => set('status', e.target.value)}
                className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="">{t('investments.filters.allStatuses')}</option>
                {(options?.statuses ?? []).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <select
                aria-label={t('investments.filters.byDistrict')}
                value={filters.district}
                onChange={e => set('district', e.target.value)}
                className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="">{t('investments.filters.allDistricts')}</option>
                {(options?.districts ?? []).map(d => (
                  <option key={d.code || d.name} value={d.name}>{d.name}</option>
                ))}
              </select>

              <select
                aria-label={t('investments.filters.byYear')}
                value={filters.year}
                onChange={e => set('year', e.target.value)}
                className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="">{t('investments.filters.anyYear')}</option>
                {(options?.years ?? []).map(y => (
                  <option key={y.value} value={y.value}>{y.value} ({y.count})</option>
                ))}
                {options?.undated_count > 0 && (
                  <option value="none">{t('investments.filters.noDate', { n: options.undated_count })}</option>
                )}
              </select>

              <div className="flex gap-2 lg:col-span-2">
                <select
                  aria-label={t('investments.filters.sortBy')}
                  value={filters.sort}
                  onChange={e => set('sort', e.target.value)}
                  className="flex-1 min-w-0 bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                >
                  {(options?.sort_options ?? [{ value: 'investment', label: t('investments.filters.sortInvestmentSize') }]).map(o => (
                    <option key={o.value} value={o.value}>{t('investments.filters.sortPrefix', { label: o.label })}</option>
                  ))}
                </select>
                <button
                  onClick={() => set('order', filters.order === 'asc' ? 'desc' : 'asc')}
                  aria-label={filters.order === 'asc' ? t('investments.filters.sortAscending') : t('investments.filters.sortDescending')}
                  className="px-3 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {filters.order === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                </button>
              </div>
            </div>

            {activeCount > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-label-sm text-on-surface-variant">
                  {tn('investments.filters.matching', total)}
                </span>
                <button
                  onClick={() => { setPage(1); setFilters(EMPTY) }}
                  className="ms-auto text-label-md font-label-md text-primary hover:text-primary-container underline"
                >
                  {tn('investments.filters.clear', activeCount)}
                </button>
              </div>
            )}
          </section>

          {/* Cards */}
          {loading ? (
            <div className="border border-surface-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3 bg-surface-container-lowest">
              <span className="material-symbols-outlined text-outline text-4xl animate-spin">progress_activity</span>
              <p className="text-body-md text-on-surface-variant">{t('investments.loading')}</p>
            </div>
          ) : mous.length === 0 ? (
            <div className="border border-dashed border-outline-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-outline text-4xl">
                {activeCount > 0 ? 'search_off' : 'handshake'}
              </span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface">
                {activeCount > 0 ? t('investments.empty.noMatch') : t('investments.empty.noneYet')}
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
                  {t('investments.empty.body')}
                </p>
              )}
            </div>
          ) : (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {mous.map(mou => {
                const style = STATUS_STYLES[mou.status] || STATUS_STYLES.signed
                return (
                  <article key={mou.id}
                    onClick={() => setDetailId(mou.id)}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setDetailId(mou.id) }}
                    className="bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden group cursor-pointer focus:ring-2 focus:ring-primary outline-none">
                    <div className={`absolute top-0 start-0 w-full h-1 ${style.top}`} />
                    <div className="p-6 flex-grow flex flex-col gap-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                          <h3 className="text-headline-sm font-headline-sm text-primary font-bold line-clamp-1">{mou.company_name}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-surface-container-high text-on-surface-variant text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md">
                              {label(mou.sector)}
                            </span>
                            {mou.is_foreign_investment && (
                              <span className="text-label-sm font-label-sm text-outline">{t('investments.card.foreign')}</span>
                            )}
                            {/* A reader scanning the grid should be able to tell a
                                government-confirmed entry from a press report without
                                opening each card. Most of this register is the latter. */}
                            {mou.source_tier && (
                              <span
                                title={mou.source_label || ''}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${
                                  mou.source_tier === 'government'
                                    ? 'border-emerald-500/50 text-emerald-800 bg-emerald-50/60'
                                    : 'border-amber-400/60 text-amber-900 bg-amber-50/60'}`}
                              >
                                {t(`investments.card.tier.${mou.source_tier}`)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`text-label-sm font-label-sm px-2.5 py-1 rounded-full border whitespace-nowrap ${style.badge}`} data-nowrap-en>
                          {label(mou.status)}
                        </div>
                      </div>

                      <div className="bg-surface-container p-4 rounded-lg flex justify-between items-center border border-surface-variant gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider mb-1">{t('investments.card.committed')}</span>
                          <div className="flex items-baseline gap-1 text-primary">
                            <span className="text-headline-md font-headline-md">{fmtAmount(mou.investment_crore)}</span>
                            {mou.investment_crore != null && <span className="text-label-md font-label-md font-bold">{t('unit.crore')}</span>}
                          </div>
                        </div>
                        <div className="text-end flex flex-col min-w-0">
                          <span className="text-label-sm font-label-sm text-outline uppercase tracking-wider mb-1">{t('investments.card.expectedJobs')}</span>
                          <span className="text-headline-sm font-headline-sm text-on-surface font-bold">
                            {mou.expected_employment != null ? mou.expected_employment.toLocaleString('en-IN') : '—'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                        <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant">
                          <span className="material-symbols-outlined text-outline text-lg">place</span>
                          <span className="line-clamp-1">{mou.district || '—'}</span>
                        </div>
                        {!fmtSigned(mou.signed_date) && mou.date_status === 'undated' && (
                          <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant">
                            <span className="material-symbols-outlined text-outline text-lg">calendar_month</span>
                            <span>{t('investments.card.undated')}</span>
                          </div>
                        )}
                        {fmtSigned(mou.signed_date) && (
                          <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant">
                            <span className="material-symbols-outlined text-outline text-lg">calendar_month</span>
                            <span>{t('investments.card.signed', { date: fmtSigned(mou.signed_date) })}</span>
                          </div>
                        )}
                        {mou.summit_name && (
                          <div className="flex items-center gap-2 text-body-md font-body-md text-on-surface-variant col-span-2">
                            <span className="material-symbols-outlined text-outline text-lg">event</span>
                            <span className="line-clamp-1">{mou.summit_name}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-label-md text-primary font-semibold mt-auto pt-2 inline-flex items-center gap-1 group-hover:underline">
                        {t('investments.card.fullRecord')} <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </p>
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
              <span className="text-label-md text-on-surface-variant">{t('investments.pageN', { page })}</span>
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

      {!error && view === 'sources' && (
        <>
          <p className="text-body-md text-on-surface-variant max-w-[80ch]">
            {t('investments.sources.intro')}
          </p>
          {/* What the headline total is made of — each register card carries a
              source-tier badge; this is the same accounting for the total. */}
          {stats?.by_source_tier && <ProvenanceStrip stats={stats} t={t} />}
          <p className="text-label-md">
            <Link to="/sources" className="text-primary font-semibold hover:underline">
              {t('common.dataSources')}
            </Link>
          </p>
        </>
      )}

      <Deferred minHeight={320}><PageThread pageKey="investments" /></Deferred>
      <MouDetail id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
