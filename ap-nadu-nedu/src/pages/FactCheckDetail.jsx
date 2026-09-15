import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { applySeo } from '../lib/seo'
import { useT, makeDateFmt } from '../i18n'
import { croreAmount } from '../lib/money'
import { findFactCheck, factCheckPath, factChecksNewestFirst, STATUS_RATING, STATUSES } from '../lib/factcheck'

/**
 * One question, every official answer to it, and why they differ.
 *
 * The layout is the argument. The claim is quoted, dated and linked. The
 * record is each independent figure with its own document. The status is a
 * fact about the two numbers. The explanation says why they differ, which is
 * nearly always a definition, and stops there. A reader who wants a verdict on
 * the politician does not get one from this page and was never going to be
 * given one.
 */
const fmtNum = n => Number(n).toLocaleString('en-IN')
const RULE_COUNT = 4

export default function FactCheckDetail() {
  const { t } = useT()
  const fmtDate = makeDateFmt(t)
  const { slug } = useParams()
  const check = findFactCheck(slug)

  useEffect(() => {
    if (!check) return
    applySeo(factCheckPath(check.slug), {
      title: check.question.slice(0, 70),
      description: check.summary.slice(0, 200),
      factCheck: {
        check,
        ratings: STATUS_RATING,
        labels: Object.fromEntries(STATUSES.map(st => [st, t(`factcheck.status.${st}`)])),
      },
    })
  }, [check?.slug])

  if (!check) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-body-lg text-on-surface-variant">{t('projectDetail.notFound')}</p>
        <Link className="text-primary" to="/factcheck">{t('factcheck.allChecks')}</Link>
      </div>
    )
  }

  const money = v => `₹${croreAmount(v, fmtNum)} ${t('unit.croreWord')}`
  const others = factChecksNewestFirst().filter(c => c.slug !== check.slug).slice(0, 6)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/factcheck">{t('factcheck.allChecks')}</Link>
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface mt-2">{check.question}</h1>
        <p className="text-body-lg text-on-surface mt-3 max-w-3xl">{check.summary}</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-md font-bold text-on-surface">
          {t(check.claims.length > 1 ? 'factcheck.claimsHeading' : 'factcheck.claimHeading')}
        </h2>
        {check.claims.map((c, i) => (
          <article key={i} className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
            <p className="text-label-md text-on-surface-variant">
              {t('factcheck.saidBy', { who: c.made_by, about: c.about })} · {t('factcheck.onDate', { date: fmtDate(c.date) })}
            </p>
            <blockquote className="text-body-lg text-on-surface font-medium mt-2 border-s-4 border-primary ps-4">
              {c.quote}
            </blockquote>
            <p className="text-body-md text-on-surface mt-3">
              <span className="text-label-sm uppercase tracking-wide text-on-surface-variant me-2">{t('factcheck.figure')}</span>
              {money(c.figure)}
            </p>
            <p className="text-body-md mt-3">
              <span className="inline-block px-3 py-1 rounded-full bg-primary-container/40 text-on-surface font-semibold">
                {t(`factcheck.status.${c.status}`)}
              </span>
            </p>
            <p className="text-body-sm text-on-surface-variant mt-2">{t(`factcheck.statusHelp.${c.status}`)}</p>
            <p className="text-body-md text-on-surface mt-3">{c.note}</p>
            <p className="text-label-sm text-on-surface-variant mt-3">
              {t('factcheck.inDocument', { document: '' })}
              <a className="text-primary hover:underline" href={c.document_url} rel="nofollow">{c.document}</a>
            </p>
            {c.document_note && (
              <p className="text-label-sm text-on-surface-variant mt-1">
                {t('factcheck.documentNote')}: {c.document_note}
              </p>
            )}
          </article>
        ))}
      </section>

      <section>
        <h2 className="text-title-md font-bold text-on-surface mb-3">{t('factcheck.recordHeading')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-body-md border-collapse">
            <thead>
              <tr className="text-label-sm text-on-surface-variant uppercase tracking-wide">
                <th className="text-start py-2 pe-4">{t('finances.dept.colSource')}</th>
                <th className="text-start py-2 pe-4">{t('factcheck.measure')}</th>
                <th className="text-end py-2">{t('factcheck.figure')}</th>
              </tr>
            </thead>
            <tbody>
              {check.record.map((r, i) => (
                <tr key={i} className="border-t border-surface-variant align-top">
                  <td className="py-2 pe-4">
                    <span className="block text-on-surface">{r.source}</span>
                    <a className="text-primary text-label-sm hover:underline" href={r.document_url} rel="nofollow">{r.document}</a>
                  </td>
                  <td className="py-2 pe-4 text-on-surface-variant">{r.measure}</td>
                  <td className="py-2 text-end whitespace-nowrap">{money(r.figure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-title-md font-bold text-on-surface mb-2">{t('factcheck.differenceHeading')}</h2>
        <p className="text-body-md text-on-surface max-w-3xl">{check.explanation}</p>
      </section>

      <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
        <h2 className="text-title-md font-bold text-on-surface mb-2">{t('factcheck.rulesHeading')}</h2>
        <ol className="list-decimal ps-5 flex flex-col gap-1 text-body-md text-on-surface">
          {Array.from({ length: RULE_COUNT }, (_, i) => (
            <li key={i}>{t(`factcheck.rules.${i}`)}</li>
          ))}
        </ol>
      </section>

      {others.length > 0 && (
        <section>
          <h2 className="text-title-md font-bold text-on-surface mb-2">{t('factcheck.allChecks')}</h2>
          <ul className="flex flex-col gap-1">
            {others.map(c => (
              <li key={c.slug}>
                <Link className="text-primary text-body-md hover:underline" to={factCheckPath(c.slug)}>{c.question}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
