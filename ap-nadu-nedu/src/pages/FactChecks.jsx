import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { applySeo } from '../lib/seo'
import { useT } from '../i18n'
import { factChecksNewestFirst, factCheckPath } from '../lib/factcheck'

/** The index. Every check, newest first, as a question. */
export default function FactChecks() {
  const { t } = useT()
  useEffect(() => { applySeo('/factcheck') }, [])
  const checks = factChecksNewestFirst()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">{t('factcheck.indexTitle')}</h1>
        <p className="text-body-lg text-on-surface-variant mt-2 max-w-3xl">{t('factcheck.indexIntro')}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {checks.map(c => (
          <li key={c.slug} className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
            <Link className="text-title-md font-bold text-primary hover:underline" to={factCheckPath(c.slug)}>{c.question}</Link>
            <p className="text-body-md text-on-surface mt-2">{c.summary}</p>
            <p className="text-label-sm text-on-surface-variant mt-2">
              {c.claims.map(x => t(`factcheck.status.${x.status}`)).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
