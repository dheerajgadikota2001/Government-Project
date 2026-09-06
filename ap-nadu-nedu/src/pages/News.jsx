import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import useDataGap from '../lib/useDataGap'

/**
 * News — collected articles about AP government work, grouped into topics a
 * reader actually looks for. A topic is OUR grouping of what outlets
 * published (by the article's recorded category and the words in its own
 * headline); it is never a claim about the article. Every card carries the
 * outlet's name and its date, and opens the full record with a link to the
 * original. If nothing has been collected yet, this page says so — it never
 * invents a headline.
 *
 * Headlines, summaries, outlet names and topic labels come from the API and
 * are content, not interface: they are never translated here.
 */

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null)

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

function ArticleCard({ a, compact }) {
  return (
    <Link
      to={`/news/${a.id}`}
      className="group bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      {a.image_url && !compact && (
        <div className="h-36 bg-surface-container-highest overflow-hidden">
          <img src={a.image_url} alt="" loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-grow min-w-0">
        <h3 className={`${compact ? 'text-body-md' : 'text-title-md'} font-bold text-on-surface leading-snug line-clamp-3 group-hover:text-primary transition-colors`}>
          {a.headline}
        </h3>
        {a.summary && !compact && (
          <p className="text-label-md text-on-surface-variant line-clamp-3">{a.summary}</p>
        )}
        <p className="text-label-sm text-on-surface-variant mt-auto pt-2">
          {a.source_name}{a.published_at ? ` · ${fmtDate(a.published_at)}` : ''}
        </p>
      </div>
    </Link>
  )
}

/** One topic's own block: heading, blurb, its latest articles. */
function TopicBlock({ topic, articles, onOpenAll }) {
  const { t } = useT()
  if (!articles?.length) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="border-b border-surface-variant pb-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-headline-md font-headline-md font-bold text-on-surface">
            {topic.label}{' '}
            <span className="text-body-md font-normal text-on-surface-variant">| {topic.label_telugu}</span>
          </h2>
          <p className="text-label-sm text-on-surface-variant mt-0.5">{topic.blurb}</p>
        </div>
        <button
          onClick={() => onOpenAll(topic.key)}
          data-nowrap-en
          className="text-label-md text-primary font-semibold whitespace-nowrap"
        >
          {t('news.allInTopic', { count: topic.count, topic: topic.label })}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {articles.slice(0, 4).map(a => <ArticleCard key={a.id} a={a} />)}
      </div>
    </section>
  )
}

export default function News() {
  const { t, tn } = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const active = searchParams.get('topic') || ''
  const [topics, setTopics] = useState(null)
  const [byTopic, setByTopic] = useState({})
  const [list, setList] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // The News page has been showing "No articles collected yet" to every
  // visitor. That is the honest thing to show, and it is also a hole nobody is
  // counting — this puts a number on how many people meet it.
  useDataGap('news', { empty: !loading && !error && (list?.length ?? 0) === 0, loading })

  useEffect(() => {
    apiGet('/news/topics')
      .then(res => { setTopics(res); setError(null) })
      .catch(setError)
  }, [])

  // Browse mode: a few articles per topic. Focus mode: one topic, paginated.
  useEffect(() => {
    if (!topics?.topics?.length) return
    let cancelled = false
    setLoading(true)
    if (!active) {
      Promise.all(topics.topics.map(tp =>
        apiGet('/news/', { topic: tp.key, page: 1, page_size: 4 })
          .then(r => [tp.key, r.items]).catch(() => [tp.key, []])
      )).then(pairs => {
        if (cancelled) return
        setByTopic(Object.fromEntries(pairs))
        setList(null)
        setLoading(false)
      })
    } else {
      apiGet('/news/', { topic: active, page, page_size: 24 })
        .then(r => { if (cancelled) return; setList(r.items); setTotal(r.total); setLoading(false) })
        .catch(e => { if (cancelled) return; setError(e); setLoading(false) })
    }
    return () => { cancelled = true }
  }, [topics, active, page])

  const pick = key => {
    setPage(1)
    setSearchParams(key ? { topic: key } : {})
  }

  const activeTopic = topics?.topics?.find(tp => tp.key === active)
  const anyArticles = (topics?.total_articles || 0) > 0

  return (
    <div className="w-full max-w-[1280px] mx-auto px-4 md:px-8 py-8 flex flex-col gap-8">
      <header className="border-b border-outline-variant pb-4">
        <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-primary">{t('news.title')}</h1>
        <h2 className="text-headline-sm md:text-headline-md font-headline-md text-on-surface-variant mt-1" lang="te">
          {t('news.titleTe')}
        </h2>
        <p className="text-body-md text-on-surface-variant mt-3 max-w-3xl">
          {t('news.intro')}
        </p>
      </header>

      {error && (
        <div className="border border-error/40 bg-error/5 rounded-xl p-6">
          <p className="text-body-md text-on-surface">{t('news.error', { message: error.message })}</p>
        </div>
      )}

      {/* Topic chips — labels come from the API, so they stay as served */}
      {topics?.topics?.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => pick('')}
              aria-pressed={!active}
              className={`text-label-md md:text-title-md font-bold px-4 py-2 rounded-lg border-2 transition-colors ${
                !active ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface hover:bg-surface-container'
              }`}
            >
              {t('news.allTopics')}
            </button>
            {topics.topics.map(tp => (
              <button
                key={tp.key}
                onClick={() => pick(tp.key)}
                aria-pressed={active === tp.key}
                title={tp.blurb}
                className={`text-label-md md:text-title-md font-bold px-4 py-2 rounded-lg border-2 transition-colors ${
                  active === tp.key ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              >
                {tp.label}
                <span className={`ms-2 text-label-sm font-normal ${active === tp.key ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                  {tp.count}
                </span>
              </button>
            ))}
          </div>
          <p className="text-label-sm text-on-surface-variant text-center max-w-3xl mx-auto">
            {topics.method_note}
          </p>
        </div>
      )}

      {/* Nothing collected yet */}
      {topics && !anyArticles && (
        <div className="border border-dashed border-outline-variant rounded-xl py-16 px-6 text-center flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-outline text-4xl">newspaper</span>
          <h3 className="text-headline-sm font-headline-sm text-on-surface">{t('news.empty.title')}</h3>
          <p className="text-body-md text-on-surface-variant max-w-xl">
            {t('news.empty.body')}
          </p>
          <Link to="/about" className="text-primary text-label-md font-semibold">{t('news.empty.why')}</Link>
        </div>
      )}

      {loading && anyArticles && (
        <p className="text-body-md text-on-surface-variant py-8 text-center">{t('news.loading')}</p>
      )}

      {/* Focus mode — one topic */}
      {!loading && active && list && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-variant pb-2">
            <div className="min-w-0">
              <h2 className="text-headline-md font-headline-md font-bold text-on-surface">
                {activeTopic?.label} <span className="text-body-md font-normal text-on-surface-variant">| {activeTopic?.label_telugu}</span>
              </h2>
              <p className="text-label-sm text-on-surface-variant mt-0.5">{activeTopic?.blurb}</p>
            </div>
            <p className="text-body-md text-on-surface-variant">{rich(tn('news.nArticles', total))}</p>
          </div>
          {list.length === 0 ? (
            <p className="text-body-md text-on-surface-variant py-10 text-center">
              {t('news.emptyTopic', { topic: activeTopic?.label ?? '' })}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {list.map(a => <ArticleCard key={a.id} a={a} />)}
            </div>
          )}
          {total > 24 && (
            <div className="flex items-center justify-center gap-3 mt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40">
                {t('common.previous')}
              </button>
              <span className="text-label-md text-on-surface-variant">{t('news.pageN', { page })}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 24 >= total}
                className="px-4 py-2 rounded-lg border border-outline-variant text-label-md text-on-surface disabled:opacity-40">
                {t('common.next')}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Browse mode — a block per topic */}
      {!loading && !active && anyArticles && (
        <div className="flex flex-col gap-10">
          {topics.topics.map(tp => (
            <TopicBlock key={tp.key} topic={tp} articles={byTopic[tp.key]} onOpenAll={pick} />
          ))}
        </div>
      )}
    </div>
  )
}
