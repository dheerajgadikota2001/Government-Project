import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'

/**
 * Tenders on record — the live register, presented with its coverage stated.
 *
 * Rules this page must never break:
 *  - It shows only what the tracked portals publish, and SAYS which portals
 *    those are. Thousands of tenders run across Andhra Pradesh at any time;
 *    a count here is a count of what we track, never of the state.
 *  - A value renders only when the portal published one. CRDA's board prints
 *    none, so the value column says so in words — a dash could read as zero.
 *  - Closed tenders stay on record (history), behind their own tab.
 */

const PAGE_SIZE = 20

const fmtDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const daysLeft = iso => {
  if (!iso) return null
  const d = Math.ceil((new Date(iso) - Date.now()) / 86400000)
  return d
}

const label = v => (v ? v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : v)

export default function Tenders() {
  const { t, tn } = useT()
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet('/tenders/', { status, page, page_size: PAGE_SIZE })
      .then(res => { if (!cancelled) { setData(res); setError(null) } })
      .catch(err => { if (!cancelled) { setError(err); setData(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, page])

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="w-full px-4 md:px-8 max-w-[1080px] mx-auto py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">{t('tenders.title')}</h1>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{t('tenders.sub')}</p>
        {/* Coverage, stated before any number */}
        <p className="text-label-md text-on-surface-variant bg-surface-container rounded-lg px-4 py-3 max-w-3xl leading-relaxed">
          {t('tenders.coverage')}
        </p>
      </header>

      <div className="flex gap-2">
        {[['active', t('tenders.tabActive')], ['closed', t('tenders.tabClosed')]].map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => { setStatus(k); setPage(1) }}
            aria-pressed={status === k}
            className={[
              'text-label-md px-4 py-2 rounded-full border transition-colors',
              status === k
                ? 'bg-primary text-on-primary border-primary font-bold'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
            ].join(' ')}>
            {lbl}
          </button>
        ))}
        {!loading && !error && (
          <span className="ms-auto self-center text-label-md text-on-surface-variant">
            {tn('tenders.count', total)}
          </span>
        )}
      </div>

      {error && (
        <p className="text-body-md text-on-surface border border-error/40 bg-error/5 rounded-xl p-5">
          {t('tenders.error', { message: error.message })}
        </p>
      )}

      {loading && (
        <p className="text-body-md text-on-surface-variant border border-surface-variant rounded-xl px-5 py-10 text-center">
          {t('tenders.loading')}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-xl px-5 py-10 text-center">
          {t('tenders.none')}
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map(td => {
            const dl = status === 'active' ? daysLeft(td.bid_submission_end) : null
            return (
              <article key={td.id} className="border border-surface-variant rounded-xl bg-surface-container-lowest p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-title-sm font-title-sm text-on-surface leading-snug">{td.title}</h3>
                  {dl != null && dl >= 0 && (
                    <span className={`text-label-sm px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${dl <= 7 ? 'border-error/50 text-error bg-error/5 font-bold' : 'border-outline-variant text-on-surface-variant'}`}>
                      {tn('tenders.daysLeft', dl)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">category</span>{label(td.tender_type)}
                  </span>
                  {td.department && (
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">account_balance</span>{td.department}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                    {t('tenders.dates', { from: fmtDate(td.published_date), to: fmtDate(td.bid_submission_end) })}
                  </span>
                </div>
                <p className="text-label-sm text-outline">
                  {td.estimated_value != null
                    ? t('tenders.value', { value: `₹${Number(td.estimated_value).toLocaleString('en-IN')}` })
                    : t('tenders.noValue')}
                  {' · '}
                  <span className="text-on-surface-variant">{td.source_portal}</span>
                  {td.nit_number ? <span> · {td.nit_number}</span> : null}
                </p>
              </article>
            )
          })}
        </div>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!data?.has_prev}
            className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors">
            {t('common.previous')}
          </button>
          <span className="text-label-md text-on-surface-variant">{t('tenders.pageN', { page })}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!data?.has_next}
            className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors">
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  )
}
