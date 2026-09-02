import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT, fmtNum, makeDateFmt } from '../i18n'

/**
 * What's new — the platform's own refresh log.
 *
 * Every other page here answers "where does this figure come from". This one
 * answers the question a reader asks next: when did it last change, and did
 * anything break on the way? A transparency platform that cannot account for
 * its own updates is asking for trust it hasn't earned, so the log is public,
 * includes the failures, and names the sources that still need a human.
 *
 * Source names, document titles and error text are the record itself and are
 * printed exactly as the API serves them; only the interface is translated.
 */

const STATUS_STYLES = {
  ok: 'bg-tertiary-container text-on-tertiary-container',
  failed: 'bg-error-container text-on-error-container',
  skipped: 'bg-surface-container-high text-on-surface-variant',
}

function timeOfDay(iso) {
  if (!iso) return ''
  // Asia/Kolkata explicitly: a reader in AP should see the time the refresh
  // actually ran there, not a time shifted into their device's timezone.
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

function SourceRow({ entry }) {
  const { t, tn } = useT()
  const [open, setOpen] = useState(false)
  const hasDetail = (entry.samples?.length || 0) > 0 || !!entry.error

  return (
    <li className="py-2.5 flex flex-col gap-1.5">
      {/* The count sits right-aligned beside the source on a wide screen, but a
          long source name wraps on a phone and used to leave the count stranded
          on a line of its own against the right edge. Wrapping the pair in one
          flex-wrap row and only pushing the count away from `sm` up keeps them
          reading as a sentence at every width. */}
      <div className="flex items-start gap-2">
        <span
          className={`px-2 py-0.5 rounded-full text-label-sm font-bold shrink-0 ${
            STATUS_STYLES[entry.status] || STATUS_STYLES.skipped
          }`}
        >
          {t(`updates.status.${entry.status}`)}
        </span>
        <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-body-md text-on-surface font-medium">{entry.source}</span>
          <span className="text-label-md text-on-surface-variant sm:ms-auto">
            {entry.status === 'failed'
              ? t('updates.noChange')
              : entry.records_new > 0
                ? tn('updates.nNew', entry.records_new)
                : t('updates.noChange')}
          </span>
        </span>
      </div>

      {hasDetail && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="self-start text-label-md text-primary hover:underline"
        >
          {open ? t('updates.hideDetail') : t('updates.showDetail')}
        </button>
      )}

      {open && (
        <div className="ps-1 flex flex-col gap-1.5">
          {entry.error && (
            <p className="text-label-md text-on-error-container bg-error-container/60 rounded-md px-3 py-2">
              {entry.error}
            </p>
          )}
          {(entry.samples || []).length > 0 && (
            <ul className="flex flex-col gap-1">
              {entry.samples.map((s, i) => (
                <li key={i} className="text-label-md text-on-surface-variant">
                  {s.url ? (
                    <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">
                      {s.title} ↗
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

export default function Updates() {
  const { t, tn } = useT()
  const fmtDate = makeDateFmt(t)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiGet('/meta/updates', { days: 60 }).then(setData).catch(setError)
  }, [])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-body-md text-on-surface">{t('updates.error', { message: error.message })}</p>
      </div>
    )
  }

  const runs = data?.runs || []
  const latest = runs[0]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
          {t('updates.title')}{' '}
          <span className="text-on-surface-variant font-normal text-headline-sm" lang="te">
            {t('updates.titleTe')}
          </span>
        </h1>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{t('updates.intro')}</p>
        {latest && (
          <div className="bg-surface-container rounded-xl px-4 py-3 max-w-3xl text-label-md flex flex-col gap-1">
            <p className="font-bold text-on-surface">
              {t('updates.lastRun', {
                date: fmtDate(String(latest.finished_at || latest.started_at).slice(0, 10)),
                time: timeOfDay(latest.finished_at || latest.started_at),
              })}
            </p>
            <p className="text-on-surface-variant">
              {tn('updates.summaryOk', latest.sources_ok)}
              {latest.sources_failed > 0 && ` · ${tn('updates.summaryFailed', latest.sources_failed)}`}
              {latest.records_new > 0 && ` · ${tn('updates.nNew', latest.records_new)}`}
            </p>
          </div>
        )}
      </header>

      {!data && <p className="text-body-md text-on-surface-variant">{t('updates.loading')}</p>}

      {data && runs.length === 0 && (
        <p className="text-body-md text-on-surface-variant bg-surface-container rounded-xl px-4 py-3">
          {t('updates.empty')}
        </p>
      )}

      {runs.map(run => (
        <section
          key={run.run_id}
          className="bg-surface-container-lowest border border-surface-variant rounded-xl px-5 py-4 flex flex-col gap-1"
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-body-lg font-bold text-on-surface">
              {fmtDate(String(run.started_at).slice(0, 10))}
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {timeOfDay(run.started_at)} IST · {t(`updates.trigger.${run.trigger}`)}
            </span>
            <span className="text-label-md text-on-surface-variant ms-auto">
              {run.records_new > 0 ? tn('updates.nNew', run.records_new) : t('updates.noChange')}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-surface-variant/50">
            {run.sources.map((entry, i) => (
              <SourceRow key={`${run.run_id}-${i}`} entry={entry} />
            ))}
          </ul>
        </section>
      ))}

      {data?.sources?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-title-md font-bold text-on-surface">{t('updates.health.title')}</h2>
          <p className="text-label-md text-on-surface-variant max-w-3xl">{t('updates.health.body')}</p>
          <ul className="bg-surface-container-lowest border border-surface-variant rounded-xl px-5 py-2 flex flex-col divide-y divide-surface-variant/50">
            {data.sources.map(s => (
              <li key={s.source} className="py-2.5 flex items-baseline gap-2 flex-wrap">
                <span className="text-body-md text-on-surface min-w-0">{s.source}</span>
                <span className="text-label-md text-on-surface-variant ms-auto shrink-0">
                  {s.last_success
                    ? t('updates.health.lastSuccess', {
                        date: fmtDate(String(s.last_success).slice(0, 10)),
                      })
                    : t('updates.health.neverSucceeded')}
                </span>
                {s.status === 'failed' && (
                  <span className="px-2 py-0.5 rounded-full text-label-sm font-bold bg-error-container text-on-error-container shrink-0">
                    {t('updates.health.failingNow')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.manual_sources?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-title-md font-bold text-on-surface">{t('updates.manual.title')}</h2>
          <p className="text-label-md text-on-surface-variant max-w-3xl">{t('updates.manual.body')}</p>
          <ul className="flex flex-col gap-2">
            {data.manual_sources.map(m => (
              <li
                key={m.source}
                className="bg-surface-container rounded-xl px-4 py-3 flex flex-col gap-0.5"
              >
                <span className="text-body-md font-medium text-on-surface">{m.source}</span>
                <span className="text-label-md text-on-surface-variant">{m.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-label-md text-on-surface-variant">
        {t('updates.seeSources')}{' '}
        <Link to="/sources" className="text-primary font-medium hover:underline">
          {t('footer.links.sources')}
        </Link>
      </p>
    </div>
  )
}
