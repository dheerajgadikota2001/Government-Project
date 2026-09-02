import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * Why this platform exists. Written in first person plural because the
 * founder's honest voice IS the trust strategy: we show what the government
 * has already published, we create nothing, and every claim links home.
 *
 * All prose lives in the catalogue under `about.*`; the arrays below carry
 * only the key and the things that never translate (icon name, portal URL).
 */

const SOURCES = [
  { key: 'eProcurement', url: 'https://www.apeprocurement.gov.in' },
  { key: 'goir', url: 'https://goir.ap.gov.in' },
  { key: 'finance', url: 'https://apfinance.gov.in' },
  { key: 'cag', url: 'https://cag.gov.in/ag/andhra-pradesh/en/audit-report' },
  { key: 'openData', url: 'https://ap.data.gov.in' },
  { key: 'edb', url: 'https://apedb.ap.gov.in' },
  { key: 'pib', url: 'https://pib.gov.in' },
  { key: 'press', url: null },
]

const PRINCIPLES = [
  { icon: 'link', key: 'linksHome' },
  { icon: 'edit_off', key: 'createNothing' },
  { icon: 'schedule', key: 'dated' },
  { icon: 'balance', key: 'noSide' },
]

export default function About() {
  const { t } = useT()

  return (
    <div className="w-full px-4 md:px-8 max-w-[900px] mx-auto py-12 flex flex-col gap-12">
      {/* Why */}
      <section className="flex flex-col gap-5">
        <span className="text-label-md font-label-md text-secondary-container uppercase tracking-widest font-bold">{t('about.eyebrow')}</span>
        <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-primary text-balance">
          {t('about.hero.line1')}<br />{t('about.hero.line2')}
        </h1>
        <div className="text-body-lg font-body-lg text-on-surface-variant flex flex-col gap-4 leading-relaxed">
          <p>{t('about.why.p1')}</p>
          <p>{t('about.why.p2')}</p>
          <p className="text-on-surface font-semibold">{t('about.why.p3')}</p>
        </div>
      </section>

      {/* Principles */}
      <section className="flex flex-col gap-6">
        <h2 className="text-headline-md font-headline-md text-on-surface font-bold">{t('about.principles.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PRINCIPLES.map(p => (
            <div key={p.key} className="bg-surface-container-lowest border border-surface-variant rounded-xl p-6 flex flex-col gap-3">
              <span className="material-symbols-outlined text-secondary-container text-2xl">{p.icon}</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface font-bold">{t(`about.principles.${p.key}.title`)}</h3>
              <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed">{t(`about.principles.${p.key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Where the data comes from */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-headline-md font-headline-md text-on-surface font-bold">{t('about.sources.title')}</h2>
          <p className="text-body-md text-on-surface-variant">{t('about.sources.intro')}</p>
        </div>
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl divide-y divide-surface-variant overflow-hidden">
          {SOURCES.map(s => (
            <div key={s.key} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <div className="flex-grow min-w-0">
                <span className="text-body-md font-body-md text-on-surface font-semibold block">{t(`about.sources.list.${s.key}.name`)}</span>
                <span className="text-label-md font-label-md text-on-surface-variant">{t(`about.sources.list.${s.key}.what`)}</span>
              </div>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-nowrap-en
                  className="text-label-md font-label-md text-primary hover:underline flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                >
                  {t('about.sources.visit')} <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Independence + corrections */}
      <section className="bg-surface-container border border-surface-variant rounded-xl p-6 md:p-8 flex flex-col gap-4">
        <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary-container">verified_user</span>
          {t('about.independence.title')}
        </h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed">
          {t('about.independence.bodyBefore')}{' '}
          <Link to="/disclaimer" className="text-primary font-semibold hover:underline">{t('about.independence.tellUs')}</Link>{' '}
          {t('about.independence.bodyAfter')}
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link
            to="/disclaimer"
            className="px-5 py-2.5 rounded-lg bg-primary text-on-primary text-label-md font-label-md font-semibold hover:bg-primary-container transition-colors"
          >
            {t('about.cta.disclaimer')}
          </Link>
          <Link
            to="/projects"
            className="px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface text-label-md font-label-md hover:bg-surface-container-high transition-colors"
          >
            {t('about.cta.explore')}
          </Link>
        </div>
      </section>
    </div>
  )
}
