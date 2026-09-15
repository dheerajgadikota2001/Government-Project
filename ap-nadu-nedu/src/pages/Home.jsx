import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useChartTip, fmtIN, DonutChart, HBarChart } from '../components/advanced/ChartPrimitives'
import APMap from '../components/APMap'
import { useT } from '../i18n'

/**
 * Home — every number on this page is live from the database; nothing is
 * typed in by hand. Each stat card opens a drill-down with real charts on
 * click. If the backend is unreachable we say so — no invented totals.
 */

// Self hosted on purpose. This used to point at an lh3.googleusercontent.com
// aida-public URL, which is a temporary Google asset link. The day Google
// expired it the homepage hero would have gone blank and we would have heard
// about it from a visitor. A site whose whole argument is "you can check us"
// should not have its first screen borrowed from a URL we do not control.
const heroImg = '/hero.jpg'

// Status labels are keys, resolved at render so they follow the chosen language.
const STATUS_KEYS = {
  completed: 'home.status.completed',
  ongoing: 'home.status.ongoing',
  announced: 'home.status.announced',
  delayed: 'home.status.delayed',
}
const STATUS_COLORS = { completed: '#137333', ongoing: '#0b57d0', announced: '#9a9890', delayed: '#a50e0e' }

/** One stat card. Click → drill-down dialog with the real breakdown. */
function StatCard({ icon, title, value, sub, onClick }) {
  const { t } = useT()
  return (
    <button
      onClick={onClick}
      className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-lg flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300 text-start cursor-pointer focus:ring-2 focus:ring-primary outline-none"
    >
      <h4 className="text-label-md font-label-md text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-container text-xl">{icon}</span>
        <span className="min-w-0">{title}</span>
      </h4>
      <p className="text-display-lg-mobile font-display-lg-mobile text-on-surface font-bold">{value}</p>
      <p className="text-label-sm font-label-sm text-on-surface-variant">{sub}</p>
      <p className="text-label-sm text-primary inline-flex items-center gap-1 mt-auto">
        {t('home.stats.seeBreakdown')} <span className="material-symbols-outlined text-[14px]">insights</span>
      </p>
    </button>
  )
}

function Drill({ open, onClose, title, sub, children }) {
  const { t } = useT()
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose}
      className="rounded-2xl p-0 w-[min(780px,calc(100vw-24px))] max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain bg-surface backdrop:bg-black/45">
      <div className="sticky top-0 bg-surface z-10 flex justify-between items-center px-6 pt-5 pb-3 border-b border-surface-variant">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{title}</h2>
          {sub && <p className="text-label-sm text-on-surface-variant mt-0.5">{sub}</p>}
        </div>
        <button onClick={onClose} aria-label={t('common.close')}
          className="w-9 h-9 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">✕</button>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
    </dialog>
  )
}

/**
 * The district map, remembered between visits.
 *
 * The map cannot be drawn in colour until the district counts arrive, and that
 * round trip is currently the slowest thing on the page — the CDN in front of
 * the API is not caching responses, so every visitor pays a full trip to
 * Mumbai. Until that is fixed at the CDN, a returning reader should not have to
 * watch the state redraw itself every single time.
 *
 * So the last answer this browser received is kept, and the map is painted from
 * it on the next visit while the fresh one is fetched. Nothing here is invented
 * or averaged: it is the government-sourced response this same browser was
 * given earlier, it is discarded after a day, and it is replaced the moment the
 * live answer lands. A first-time visitor still waits for the real thing.
 */
const INSIGHTS_CACHE_KEY = 'apfc.insights.v1'
const INSIGHTS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

function readCachedInsights() {
  try {
    const raw = localStorage.getItem(INSIGHTS_CACHE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw)
    return at && Date.now() - at < INSIGHTS_CACHE_MAX_AGE_MS ? data : null
  } catch {
    // Private mode, blocked storage, corrupted entry — all mean "no snapshot",
    // which is simply the first-visit path. Never let this break the page.
    return null
  }
}

function writeCachedInsights(data) {
  try {
    localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch { /* storage full or unavailable; the page does not depend on it */ }
}

export default function Home() {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [pStats, setPStats] = useState(null)
  const [mStats, setMStats] = useState(null)
  const [tenderTotal, setTenderTotal] = useState(null)
  const [closingSoon, setClosingSoon] = useState(null)
  const [featured, setFeatured] = useState(null)
  const [latestNews, setLatestNews] = useState(null)
  const [insights, setInsights] = useState(readCachedInsights)
  const [mous, setMous] = useState(null)          // loaded lazily for the drill
  const [drill, setDrill] = useState(null)        // 'projects' | 'tenders' | 'investments' | 'mous'
  const [apiDown, setApiDown] = useState(false)
  const navigate = useNavigate()
  const tip = useChartTip()

  // Needs the catalogue for its unit words, so it lives inside the component.
  const fmtCr = v =>
    v == null
      ? '—'
      : v >= 100000
        ? `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
        : `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`

  useEffect(() => {
    let cancelled = false
    apiGet('/projects/stats').then(s => !cancelled && setPStats(s)).catch(() => !cancelled && setApiDown(true))
    apiGet('/mous/stats').then(s => !cancelled && setMStats(s)).catch(() => {})
    apiGet('/tenders/', { page: 1, page_size: 1 }).then(r => !cancelled && setTenderTotal(r.total)).catch(() => {})
    apiGet('/tenders/closing-soon').then(r => !cancelled && setClosingSoon(r.length)).catch(() => !cancelled && setClosingSoon(0))
    apiGet('/projects/', { sort: 'cost', order: 'desc', page_size: 3 }).then(r => !cancelled && setFeatured(r.items)).catch(() => {})
    apiGet('/news/latest').then(r => !cancelled && setLatestNews(r.slice(0, 3))).catch(() => !cancelled && setLatestNews([]))
    apiGet('/projects/insights')
      .then(i => { if (!cancelled) { setInsights(i); writeCachedInsights(i) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Load the MoU list once, first time an investment drill opens.
  useEffect(() => {
    if ((drill === 'investments' || drill === 'mous') && mous == null) {
      apiGet('/mous/', { page: 1, page_size: 100, sort: 'investment', order: 'desc' })
        .then(r => setMous(r.items)).catch(() => setMous([]))
    }
  }, [drill, mous])

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const statusSlices = pStats
    ? Object.keys(STATUS_KEYS)
      .map(k => ({ label: t(STATUS_KEYS[k]), value: pStats[k] || 0, color: STATUS_COLORS[k] }))
      .filter(s => s.value > 0)
    : []

  const sectorSlices = (() => {
    if (!mous?.length) return []
    const by = {}
    mous.forEach(m => {
      if (m.investment_crore == null) return
      const k = (m.sector || 'other').replaceAll('_', ' ')
      by[k] = (by[k] || 0) + m.investment_crore
    })
    const entries = Object.entries(by).sort((a, b) => b[1] - a[1])
    const top = entries.slice(0, 6).map(([label, value]) => ({ label, value }))
    const rest = entries.slice(6).reduce((s, [, v]) => s + v, 0)
    if (rest > 0) top.push({ label: t('home.drill.mous.otherSectors'), value: rest, color: '#c3c2b7' })
    return top
  })()

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* The state first — the map, then everything else.
          The boundaries are in the bundle, so the map is drawn the instant the
          page renders and shades itself when the counts land. It used to wait
          for the API before appearing at all, which left a blank space at the
          very top of the page and then shoved everything down when it arrived —
          the single most visible piece of "still loading" on the site. Every
          district starts grey, which is also what a district with nothing on
          record looks like, so nothing is implied that we have not measured. */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-6">
        <APMap
          byDistrict={insights?.by_district}
          statewideCount={insights?.statewide_count || 0}
          districtUnstatedCount={insights?.district_unstated_count || 0}
        />
      </div>

      {/* Hero */}
      <section data-flex-h className="relative w-full h-[520px] flex items-center justify-center text-center px-4 md:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center w-full h-full opacity-60 z-0" style={{ backgroundImage: `url('${heroImg}')` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/70 to-background/90 z-0" />
        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col gap-4 items-center mt-10">
          <div className="flex flex-col items-center gap-2 mb-2">
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-primary text-balance drop-shadow-md">
              {t('home.hero.titleLine1')}<br />{t('home.hero.titleLine2')}
            </h1>
            <h3 className="text-headline-sm font-headline-sm text-secondary-fixed-dim text-balance font-medium">
              {t('home.hero.titleTe')}
            </h3>
          </div>
          <p className="text-body-lg font-body-lg text-on-primary/90 max-w-2xl text-balance mb-2">
            {t('home.hero.lede')}
          </p>
          <form onSubmit={handleSearch} className="w-full max-w-3xl mt-2 relative shadow-2xl rounded-full group">
            <span className="material-symbols-outlined absolute start-6 top-1/2 -translate-y-1/2 text-primary text-2xl z-10">search</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full h-16 ps-16 pe-6 rounded-full bg-surface text-on-surface text-body-lg font-body-lg border-2 border-surface focus:border-secondary-container focus:ring-4 focus:ring-secondary-container/20 transition-all shadow-inner placeholder:text-on-surface-variant/70"
              placeholder={t('home.hero.searchPlaceholder')}
              aria-label={t('home.hero.searchPlaceholder')}
              type="text"
            />
          </form>
        </div>
      </section>

      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 flex flex-col gap-8">
        {apiDown && (
          <section className="border border-error/40 bg-error/5 rounded-xl p-5 -mt-20 relative z-20">
            <p className="text-body-md text-on-surface">
              {t('home.apiDown.message')}
            </p>
          </section>
        )}

        {/* Stats Row — all live, all clickable */}
        {!apiDown && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 -mt-24 relative z-20">
            <StatCard icon="construction" title={t('home.stats.projects.title')}
              value={pStats ? fmtIN(pStats.total_projects) : '…'}
              sub={pStats
                ? t('home.stats.projects.sub', { ongoing: fmtIN(pStats.ongoing), completed: fmtIN(pStats.completed) })
                : t('home.stats.projects.loading')}
              onClick={() => setDrill('projects')} />
            <StatCard icon="gavel" title={t('home.stats.tenders.title')}
              value={tenderTotal ? fmtIN(tenderTotal) : t('home.stats.tenders.comingSoon')}
              sub={tenderTotal
                ? (closingSoon != null ? t('home.stats.tenders.sub', { n: closingSoon }) : ' ')
                : t('home.stats.tenders.comingSoonSub')}
              onClick={() => setDrill('tenders')} />
            <StatCard icon="currency_rupee" title={t('home.stats.investment.title')}
              value={pStats ? fmtCr(pStats.total_investment_crore) : '…'}
              sub={t('home.stats.investment.sub')}
              onClick={() => setDrill('investments')} />
            <StatCard icon="handshake" title={t('home.stats.mous.title')}
              value={mStats ? fmtIN(mStats.total_mous) : '…'}
              sub={mStats
                ? t('home.stats.mous.sub', { amount: fmtCr(mStats.total_investment_crore), jobs: fmtIN(mStats.total_expected_jobs) })
                : ' '}
              onClick={() => setDrill('mous')} />
          </section>
        )}

        {/* Featured: the biggest projects on record, live */}
        {featured?.length > 0 && (
          <section className="flex flex-col gap-6 mt-4">
            <div className="flex justify-between items-end mb-2 border-b border-surface-variant pb-4">
              <h3 className="text-headline-md font-headline-md text-on-background font-bold flex items-center gap-2 min-w-0">
                {t('home.featured.title')} <span className="text-body-md font-normal opacity-60">| {t('home.featured.titleTe')}</span>
              </h3>
              <Link to="/projects" className="text-secondary-container hover:text-secondary font-medium text-label-md flex items-center gap-1">
                {t('home.featured.viewAll')} <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featured.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="bg-surface rounded-2xl overflow-hidden border border-surface-variant shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                  {p.cover_image && (
                    <div className="h-44 bg-surface-container-highest relative overflow-hidden">
                      <img src={p.cover_image.thumbnail_url || p.cover_image.url} alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      {p.cover_image.credit && (
                        <span className="absolute bottom-2 start-2 bg-black/60 text-white/90 text-[10px] px-1.5 py-0.5 rounded">© {p.cover_image.credit}</span>
                      )}
                    </div>
                  )}
                  <div className="p-6 flex flex-col gap-3 flex-grow">
                    <h4 className="text-headline-sm font-headline-sm text-on-surface line-clamp-2">{p.title}</h4>
                    <p className="text-label-sm text-on-surface-variant">{p.district || t('home.statewide')} · {String(p.status).replaceAll('_', ' ')}</p>
                    <div className="mt-auto pt-3 border-t border-surface-variant flex justify-between items-center text-label-sm text-on-surface-variant">
                      <span className="font-bold text-primary-container">{fmtCr(p.estimated_cost_crore)}</span>
                      {p.completion_percentage != null && <span>{t('home.featured.percentBuilt', { pct: p.completion_percentage })}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Latest cited news */}
        {latestNews?.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex justify-between items-end border-b border-surface-variant pb-3">
              <h3 className="text-headline-md font-headline-md text-on-background font-bold min-w-0">{t('home.news.title')}</h3>
              <Link to="/news" className="text-secondary-container hover:text-secondary font-medium text-label-md">{t('home.news.all')}</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {latestNews.map(n => (
                <a key={n.id} href={n.source_url} target="_blank" rel="noreferrer"
                  className="bg-surface rounded-xl border border-surface-variant p-4 hover:shadow-md transition-shadow flex flex-col gap-1">
                  <p className="text-body-md text-on-surface font-medium line-clamp-2">{n.headline}</p>
                  <p className="text-label-sm text-on-surface-variant mt-auto">{n.source_name}</p>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ---------- drill-down dialogs ---------- */}
      <Drill open={drill === 'projects'} onClose={() => setDrill(null)}
        title={t('home.drill.projects.title')} sub={t('home.drill.projects.sub')}>
        {pStats && (
          <>
            <DonutChart tip={tip} unit={t('home.unit.projects')} centerLabel={fmtIN(pStats.total_projects)} slices={statusSlices} />
            <p className="text-label-sm text-on-surface-variant max-w-xl">
              {t('home.drill.projects.body', {
                count: fmtIN(pStats.total_projects),
                cost: fmtCr(pStats.total_investment_crore),
              })}
            </p>
            <Link to="/projects" className="text-primary text-label-md font-bold">{t('home.drill.projects.link')}</Link>
          </>
        )}
      </Drill>

      <Drill open={drill === 'tenders'} onClose={() => setDrill(null)}
        title={t('home.drill.tenders.title')} sub={t('home.drill.tenders.sub')}>
        <p className="text-body-md text-on-surface">
          {tenderTotal
            ? (closingSoon != null
                ? t('home.drill.tenders.bodyClosing', { count: fmtIN(tenderTotal), closing: closingSoon })
                : t('home.drill.tenders.body', { count: fmtIN(tenderTotal) }))
            : t('home.drill.tenders.comingSoonBody')}
        </p>
        <p className="text-label-sm text-on-surface-variant max-w-xl">
          {t('home.drill.tenders.note')}
        </p>
        <Link to="/tenders" className="text-primary text-label-md font-bold">{t('home.drill.tenders.link')}</Link>
      </Drill>

      <Drill open={drill === 'investments'} onClose={() => setDrill(null)}
        title={t('home.drill.investments.title')} sub={t('home.drill.investments.sub')}>
        {featured && (
          <HBarChart tip={tip} unit={t('unit.crore')}
            rows={(featured || []).map(p => ({ label: p.title, value: p.estimated_cost_crore || 0, tipDetail: p.district || t('home.statewide') }))}
            maxValue={Math.max(...(featured || []).map(p => p.estimated_cost_crore || 0), 1)}
            valueFmt={v => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : fmtIN(Math.round(v)))} />
        )}
        <p className="text-label-sm text-on-surface-variant max-w-xl">
          {t('home.drill.investments.note')}
        </p>
        <Link to="/projects" className="text-primary text-label-md font-bold">{t('home.drill.investments.link')}</Link>
      </Drill>

      <Drill open={drill === 'mous'} onClose={() => setDrill(null)}
        title={t('home.drill.mous.title')} sub={t('home.drill.mous.sub')}>
        {mous == null ? (
          <p className="text-body-md text-on-surface-variant">{t('home.drill.mous.loading')}</p>
        ) : sectorSlices.length ? (
          <>
            <DonutChart tip={tip} unit={t('unit.crore')} centerLabel={mStats ? fmtCr(mStats.total_investment_crore).replace('₹', '') : ''} slices={sectorSlices} />
            <p className="text-label-sm text-on-surface-variant max-w-xl">
              {mStats
                ? t('home.drill.mous.stats', {
                  mous: fmtIN(mStats.total_mous),
                  jobs: fmtIN(mStats.total_expected_jobs),
                  foreign: fmtIN(mStats.foreign_investments),
                })
                : ''}
              {' '}{t('home.drill.mous.body')}
            </p>
          </>
        ) : (
          <p className="text-body-md text-on-surface-variant">{t('home.drill.mous.empty')}</p>
        )}
        <Link to="/investments" className="text-primary text-label-md font-bold">{t('home.drill.mous.link')}</Link>
      </Drill>

      {tip.node}
    </div>
  )
}
