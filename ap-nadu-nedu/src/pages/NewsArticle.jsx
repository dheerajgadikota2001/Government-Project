import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, isNotFound, isRecordId } from '../lib/api'
import { applySeo, seoForNews } from '../lib/seo'
import { useT } from '../i18n'

/**
 * One article's record. We show what we collected, headline, our summary,
 * outlet, date, districts, and send the reader to the outlet for the full
 * story. We never reproduce an article's body: the outlet wrote it, and the
 * link is the honest way to read it.
 *
 * Headline, summary, outlet name, category and districts are content from the
 * API; only the interface around them is translated.
 */

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'long', year: 'numeric',
}) : null)

/**
 * A sentence is one translation unit, so emphasis and the one in-sentence link
 * travel inside the string: **bold**, *italic* and [label](/route) become
 * elements here. A translation that drops the markers still renders as plain
 * text, just unstyled and unlinked.
 */
function rich(str) {
  return String(str)
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
    .map((part, i) => {
      if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
      if (part.startsWith('[')) {
        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
        return <Link key={i} className="text-primary" to={m[2]}>{m[1]}</Link>
      }
      if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
      return part
    })
}

export default function NewsArticle() {
  const { t } = useT()
  const { id } = useParams()
  const [a, setA] = useState(null)
  const [related, setRelated] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setA(null); setError(null); setRelated([])
    if (!isRecordId(id)) {
      setError(Object.assign(new Error('not a record id'), { status: 404 }))
      return
    }
    apiGet(`/news/${id}`)
      .then(x => {
        if (cancelled) return
        setA(x)
        applySeo(`/news/${id}`, seoForNews(x))
      })
      .catch(e => { if (!cancelled) setError(e) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!a) return
    let cancelled = false
    apiGet('/news/', { category: a.category, page: 1, page_size: 5 })
      .then(r => { if (!cancelled) setRelated((r.items || []).filter(x => x.id !== a.id).slice(0, 4)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [a])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">
          {isNotFound(error)
            ? t('newsArticle.notFound')
            : t('newsArticle.error', { message: error.message })}
        </p>
        <Link className="text-primary text-label-md" to="/news">{t('newsArticle.allNews')}</Link>
      </div>
    )
  }
  if (!a) return <div className="max-w-3xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('newsArticle.loading')}</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      <Link className="text-primary text-label-md" to="/news">{t('newsArticle.allNews')}</Link>

      <header className="flex flex-col gap-3">
        <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">
          {String(a.category).replaceAll('_', ' ')}
        </p>
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface leading-tight">{a.headline}</h1>
        {a.headline_telugu && (
          <h2 className="text-title-md text-on-surface-variant">{a.headline_telugu}</h2>
        )}
        <p className="text-label-md text-on-surface-variant">
          <span className="font-bold text-on-surface">{a.source_name}</span>
          {a.published_at ? ` · ${fmtDate(a.published_at)}` : ''}
          {a.districts?.length ? ` · ${a.districts.join(', ')}` : ''}
        </p>
      </header>

      {a.image_url && (
        <img src={a.image_url} alt="" className="w-full rounded-xl border border-surface-variant" />
      )}

      {a.summary && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-2">
          <h3 className="text-title-md font-bold text-on-surface">{t('newsArticle.inShort')}</h3>
          <p className="text-body-lg text-on-surface leading-relaxed whitespace-pre-line">{a.summary}</p>
          {a.summary_telugu && (
            <p className="text-body-md text-on-surface-variant leading-relaxed whitespace-pre-line pt-2 border-t border-dashed border-surface-variant">
              {a.summary_telugu}
            </p>
          )}
        </section>
      )}

      <section className="border border-surface-variant rounded-xl p-5 flex flex-col gap-3">
        <p className="text-body-md text-on-surface">
          {rich(t('newsArticle.ownership', { outlet: a.source_name }))}
        </p>
        <a href={a.source_url} target="_blank" rel="noreferrer"
          className="text-label-md text-primary font-bold">
          {t('newsArticle.readAtOutlet', { outlet: a.source_name })}
        </a>
        <p className="text-label-sm text-on-surface-variant border-t border-dashed border-surface-variant pt-3">
          {rich(t('newsArticle.provenance', { date: fmtDate(a.created_at) }))}
        </p>
      </section>

      {related.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-title-md font-bold text-on-surface border-b border-surface-variant pb-2">
            {t('newsArticle.related')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {related.map(r => (
              <Link key={r.id} to={`/news/${r.id}`}
                className="border border-surface-variant rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-1 min-w-0">
                <p className="text-body-md text-on-surface font-medium line-clamp-3">{r.headline}</p>
                <p className="text-label-sm text-on-surface-variant mt-auto pt-1">
                  {r.source_name}{r.published_at ? ` · ${fmtDate(r.published_at)}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
