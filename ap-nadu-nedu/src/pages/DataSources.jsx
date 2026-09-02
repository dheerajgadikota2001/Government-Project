import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'

/**
 * Data Sources — the full catalogue behind every figure on this platform.
 * Pages link here instead of printing long source lists inline; this page
 * shows each document in detail: what it is, who published it, when, and a
 * direct link (plus the direct PDF where one exists). Everything is loaded
 * from the same seed the API serves — this list can never drift from what
 * the pages actually cite.
 *
 * Document titles, publishers, dates and notes are the record itself and are
 * printed exactly as served; only the interface around them is translated.
 */

function SourceGroup({ titleKey, subKey, entries, q }) {
  const { t, tn } = useT()
  const [open, setOpen] = useState(true)
  const filtered = entries.filter(([, s]) =>
    !q || `${s.title} ${s.publisher} ${s.short || ''}`.toLowerCase().includes(q.toLowerCase()))
  if (q && !filtered.length) return null
  return (
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)}
      className="group bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden">
      <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-surface-container transition-colors">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-body-lg font-bold text-on-surface">{t(titleKey)}</span>
          <span className="text-label-sm text-on-surface-variant">{t(subKey)} · {tn('sources.nDocuments', filtered.length)}</span>
        </span>
        <span aria-hidden="true" className="ms-auto text-on-surface-variant transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="px-5 pb-5 pt-1 border-t border-surface-variant/60 flex flex-col divide-y divide-surface-variant/50">
        {filtered.map(([k, s]) => (
          <li key={k} className="py-3 flex flex-col gap-0.5">
            <a className="text-body-md text-primary hover:underline font-medium" href={s.url} target="_blank" rel="noreferrer">
              {s.title} ↗
            </a>
            <p className="text-label-sm text-on-surface-variant">
              {s.publisher}{s.date ? ` · ${s.date}` : ''}
              {s.pdf && (
                <>
                  {' · '}
                  <a className="text-primary font-bold" href={s.pdf} target="_blank" rel="noreferrer">{t('sources.directPdf')}</a>
                </>
              )}
            </p>
            {s.note && <p className="text-label-sm text-outline max-w-3xl">{s.note}</p>}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function DataSources() {
  const { t } = useT()
  const [gov, setGov] = useState(null)
  const [fin, setFin] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    apiGet('/governments/').then(setGov).catch(setError)
    apiGet('/finances/').then(setFin).catch(() => {})
  }, [])

  const groups = useMemo(() => {
    const g = []
    if (fin?.sources) {
      g.push({
        titleKey: 'sources.group.finances.title',
        subKey: 'sources.group.finances.sub',
        entries: Object.entries(fin.sources),
      })
    }
    if (gov?.sources) {
      g.push({
        titleKey: 'sources.group.governments.title',
        subKey: 'sources.group.governments.sub',
        entries: Object.entries(gov.sources),
      })
    }
    return g
  }, [gov, fin])

  const total = groups.reduce((s, g) => s + g.entries.length, 0)

  if (error) return <div className="max-w-4xl mx-auto px-4 py-10"><p className="text-body-md text-on-surface">{t('sources.error', { message: error.message })}</p></div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
          {t('sources.title')} <span className="text-on-surface-variant font-normal text-headline-sm" lang="te">{t('sources.titleTe')}</span>
        </h1>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">
          {total > 0 ? t('sources.intro', { count: total }) : t('sources.introNoCount')}
        </p>
        <div className="bg-surface-container rounded-xl px-4 py-3 max-w-3xl text-label-md text-on-surface flex flex-col gap-1.5">
          <p className="font-bold">{t('sources.verify.title')}</p>
          <p className="text-on-surface-variant">
            {t('sources.verify.body')}
          </p>
          {/* When each of these was last re-checked lives on its own page —
              this catalogue says what we cite, that log says when we last looked. */}
          <p>
            <Link to="/updates" className="text-primary font-medium hover:underline">
              {t('footer.links.updates')} →
            </Link>
          </p>
        </div>
      </header>

      <div className="relative max-w-md">
        <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">search</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('sources.searchPlaceholder')}
          aria-label={t('sources.searchPlaceholder')}
          type="search"
          className="w-full ps-10 rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-2 pe-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      {!gov && !fin && <p className="text-body-md text-on-surface-variant">{t('sources.loading')}</p>}
      {groups.map(g => <SourceGroup key={g.titleKey} {...g} q={q} />)}

      <p className="text-label-sm text-on-surface-variant border-t border-surface-variant pt-3 max-w-3xl">
        {t('sources.correction')}
      </p>
    </div>
  )
}
