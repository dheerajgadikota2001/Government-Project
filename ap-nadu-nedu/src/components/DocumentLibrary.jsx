import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'

/**
 * The document library proper: every official series the platform draws on,
 * and the portals where the rest of the record lives.
 *
 * This is different from the scraped-documents table below it. That table is
 * what our collectors have fetched; this library is the map of the record
 * itself — including the parts we could not fetch, marked as such. A library
 * that listed only what we could reach would quietly misrepresent how much of
 * the record exists.
 *
 * Titles, publishers and URLs are the record and are never translated.
 */

const TYPE_ICON = {
  'Budget speech': 'record_voice_over',
  'Demands for Grants': 'account_balance',
  'Budget statement': 'description',
  'Socio-Economic Survey': 'query_stats',
  'CAG audit report': 'fact_check',
  'RBI publication': 'account_balance_wallet',
  'Central statistics': 'monitoring',
  'Central document': 'description',
  'Government Orders': 'gavel',
  Gazette: 'menu_book',
  'RTI disclosure': 'visibility',
  Tenders: 'construction',
  'Open data': 'dataset',
  Dashboard: 'space_dashboard',
  'Assembly record': 'forum',
  Portal: 'language',
}

export default function DocumentLibrary() {
  const { t } = useT()
  const [lib, setLib] = useState(null)
  const [err, setErr] = useState(false)
  const [q, setQ] = useState('')
  const [dtype, setDtype] = useState('')
  const [sector, setSector] = useState('')
  const [reach, setReach] = useState('') // '', 'verified', 'unverified'

  useEffect(() => {
    let alive = true
    apiGet('/documents/library')
      .then(d => alive && setLib(d))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!lib) return []
    const needle = q.trim().toLowerCase()
    return lib.documents.filter(d => {
      if (dtype && d.doc_type !== dtype) return false
      if (sector && !d.sectors.includes(sector)) return false
      if (reach === 'verified' && !d.verified) return false
      if (reach === 'unverified' && d.verified) return false
      if (needle) {
        const hay = `${d.title} ${d.publisher} ${d.what_it_holds} ${d.sectors.join(' ')} ${(d.years || []).join(' ')}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [lib, q, dtype, sector, reach])

  const grouped = useMemo(() => {
    const m = new Map()
    for (const d of rows) {
      if (!m.has(d.doc_type)) m.set(d.doc_type, [])
      m.get(d.doc_type).push(d)
    }
    return [...m.entries()]
  }, [rows])

  if (err) return null
  if (!lib) return null

  const active = [q.trim(), dtype, sector, reach].filter(Boolean).length

  return (
    <section id="library" className="scroll-mt-20 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">{t('library.title')}</h2>
        <p className="text-body-md text-on-surface-variant max-w-[75ch]">{t('library.intro')}</p>
      </header>

      {/* Filters */}
      <div className="bg-surface-container border border-surface-variant rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative lg:col-span-1">
          <label htmlFor="lib-q" className="sr-only">{t('common.search')}</label>
          <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
            search
          </span>
          <input
            id="lib-q"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-2.5 ps-10 pe-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-md"
            placeholder={t('library.searchPlaceholder')}
            type="search"
          />
        </div>

        <select
          aria-label={t('library.filterType')}
          value={dtype}
          onChange={e => setDtype(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
        >
          <option value="">{t('library.allTypes')}</option>
          {lib.doc_types.map(x => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>

        <select
          aria-label={t('library.filterSector')}
          value={sector}
          onChange={e => setSector(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
        >
          <option value="">{t('library.allSectors')}</option>
          {lib.sectors.map(x => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>

        <select
          aria-label={t('library.filterReach')}
          value={reach}
          onChange={e => setReach(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant text-on-surface text-label-md font-label-md rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
        >
          <option value="">{t('library.anyReach')}</option>
          <option value="verified">{t('library.weOpened')}</option>
          <option value="unverified">{t('library.notOpened')}</option>
        </select>
      </div>

      <p className="text-label-md text-on-surface-variant">
        {t('library.count', { shown: rows.length, total: lib.documents.length })}
        {active > 0 && (
          <>
            {' · '}
            <button
              onClick={() => { setQ(''); setDtype(''); setSector(''); setReach('') }}
              className="text-primary underline"
            >
              {t('common.clearFilters')}
            </button>
          </>
        )}
      </p>

      {/* Grouped results */}
      {grouped.length === 0 ? (
        <div className="border border-surface-variant rounded-xl p-8 text-center">
          <p className="text-body-md text-on-surface-variant">{t('library.empty')}</p>
        </div>
      ) : (
        grouped.map(([type, docs]) => (
          <div key={type} className="flex flex-col gap-2">
            <h3 className="text-body-lg font-bold text-on-surface inline-flex items-center gap-2 mt-2">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">
                {TYPE_ICON[type] || 'description'}
              </span>
              {type}
              <span className="text-label-sm text-outline font-normal">({docs.length})</span>
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {docs.map(d => (
                <div
                  key={d.id}
                  className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 flex flex-col gap-2 min-w-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body-md font-bold text-primary hover:underline min-w-0 break-words"
                    >
                      {d.title}
                    </a>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight ${
                        d.verified
                          ? 'bg-[#E6F4EA] text-[#137333]'
                          : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                      title={d.verified ? t('library.weOpenedTip', { date: d.verified_date || '' }) : t('library.notOpenedTip')}
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden="true">
                        {d.verified ? 'task_alt' : 'travel_explore'}
                      </span>
                      {d.verified ? t('library.weOpened') : t('library.notOpened')}
                    </span>
                  </div>
                  <p className="text-label-sm text-on-surface-variant">
                    {d.publisher}
                    {d.years?.length > 0 && <> · <span className="tabular-nums">{d.years.join(', ')}</span></>}
                    {' · '}
                    {d.sectors.join(' · ')}
                  </p>
                  <p className="text-body-md text-on-surface-variant leading-snug">{d.what_it_holds}</p>
                  {d.access_note && (
                    <p className="text-label-sm text-outline border-s-2 border-surface-variant ps-2">{d.access_note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <p className="text-label-sm text-on-surface-variant max-w-[80ch] border-t border-dashed border-surface-variant pt-3">
        {lib.honesty_note}
      </p>
    </section>
  )
}
