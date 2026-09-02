import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'

/**
 * Search results.
 *
 * WHAT CHANGED AND WHY IT MATTERED
 * This page used to render a fixed sample: three invented results with invented
 * districts, departments and rupee figures, shown for every query because the
 * Elasticsearch index behind it was never deployed. On a platform whose whole
 * claim is that each figure traces to a government document, a fabricated result
 * card is the most damaging thing it could show. Every result here now comes from
 * the platform's own database and seed files, or the page says it found nothing.
 *
 * The scope line is deliberately visible rather than tucked into a footer. A box
 * with a magnifying glass reads as a web search to most people; saying plainly
 * what the index covers is what stops a reader concluding that an absence here
 * means an absence in the world.
 */

// The projects table's status enum, exactly — used to spot a status slug in a
// result's meta line so it can be shown translated instead of raw.
const STATUS_SLUGS = new Set([
  'announced', 'approved', 'tendered', 'under_construction',
  'completed', 'delayed', 'cancelled', 'suspended',
])

const TYPE_STYLE = {
  project: { key: 'search.type.project', tone: 'bg-primary/10 text-primary' },
  document: { key: 'search.type.document', tone: 'bg-secondary-container/25 text-on-surface' },
  mou: { key: 'search.type.mou', tone: 'bg-tertiary-container/25 text-on-surface' },
  news: { key: 'search.type.news', tone: 'bg-surface-container text-on-surface-variant' },
  section: { key: 'search.type.section', tone: 'bg-surface-container text-on-surface-variant' },
}

const TABS = ['all', 'project', 'document', 'mou', 'news', 'section']

export default function Search() {
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const kind = params.get('kind') || 'all'

  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (!q.trim()) { setData(null); setState('idle'); return }
    let alive = true
    setState('loading')
    apiGet(`/search/?q=${encodeURIComponent(q)}&kind=${kind}&page_size=40`)
      .then(d => { if (alive) { setData(d); setState('done') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [q, kind])

  function setKind(k) {
    const next = new URLSearchParams(params)
    if (k === 'all') next.delete('kind'); else next.set('kind', k)
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline-md font-bold text-on-surface">
          {q ? t('search.headingFor', { query: q }) : t('search.heading')}
        </h1>
        <p className="text-body-sm text-on-surface-variant max-w-[70ch]">
          {t('search.scopeNote')}
        </p>
      </header>

      {state === 'error' && (
        <p className="text-body-md text-error">{t('search.error')}</p>
      )}
      {state === 'loading' && (
        <p className="text-body-md text-on-surface-variant">{t('common.loading')}</p>
      )}

      {state === 'done' && data && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist">
            {TABS.map(k => {
              const n = k === 'all' ? data.total : (data.counts?.[k] || 0)
              if (k !== 'all' && n === 0) return null
              const on = kind === k
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setKind(k)}
                  className={`px-3 py-1.5 rounded-full text-label-md border transition-colors
                    ${on
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container'}`}
                >
                  {t(k === 'all' ? 'search.tab.all' : TYPE_STYLE[k].key)}
                  <span className="ms-1.5 tabular-nums opacity-70">{n}</span>
                </button>
              )
            })}
          </div>

          {data.total === 0 ? (
            <div className="rounded-xl border border-outline-variant p-6 flex flex-col gap-2">
              <p className="text-title-sm font-semibold text-on-surface">
                {t('search.emptyTitle', { query: q })}
              </p>
              <p className="text-body-md text-on-surface-variant max-w-[70ch]">
                {t('search.emptyBody')}
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {['Polavaram', 'Bhogapuram', 'School education', 'Housing', 'Panchayat Raj'].map(s => (
                  <Link
                    key={s}
                    to={`/search?q=${encodeURIComponent(s)}`}
                    className="text-label-md text-primary underline underline-offset-2"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.results.map((r, i) => {
                const style = TYPE_STYLE[r.type] || TYPE_STYLE.section
                return (
                  <li
                    key={`${r.type}-${i}`}
                    className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-label-sm px-2 py-0.5 rounded-full ${style.tone}`}>
                        {t(style.key)}
                      </span>
                      {r.subtitle && (
                        <span className="text-label-sm text-on-surface-variant">{r.subtitle}</span>
                      )}
                    </div>

                    <Link
                      to={r.route}
                      className="text-title-sm font-semibold text-on-surface hover:underline underline-offset-2"
                    >
                      {r.title}
                    </Link>

                    {r.snippet && (
                      <p className="text-body-md text-on-surface-variant max-w-[75ch]">{r.snippet}</p>
                    )}

                    {r.meta?.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {r.meta.map((m, j) => (
                          // Project status slugs arrive raw in meta (e.g.
                          // "under_construction"); render them with the same
                          // translated labels the Projects page uses. Figures
                          // and dates pass through untouched.
                          <span key={j} className="text-label-sm text-outline tabular-nums">
                            {STATUS_SLUGS.has(m) ? t(`projects.status.${m}`) : m}
                          </span>
                        ))}
                      </div>
                    )}

                    {r.source_url && (
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label-sm text-primary hover:underline underline-offset-2 break-words"
                      >
                        {t('search.openSource')}
                      </a>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {data.total > data.results.length && (
            <p className="text-label-sm text-on-surface-variant">
              {t('search.showingCount', { shown: data.results.length, total: data.total })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
