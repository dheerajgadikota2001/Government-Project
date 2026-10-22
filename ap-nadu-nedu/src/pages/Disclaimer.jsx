import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { GRIEVANCE, grievanceReady } from '../lib/legal'

/**
 * The legal backbone of the platform, written to be read by humans.
 * Structure: who we are → where data comes from → accuracy → copyright →
 * corrections & takedown → branding → contact.
 *
 * `id` is the anchor in the URL and never changes; `key` is the catalogue
 * path and `paras` says how many paragraphs that section has, so the prose
 * lives entirely under `disclaimer.sections.*`.
 */

const SECTIONS = [
  { id: 'who-we-are', key: 'whoWeAre', icon: 'group', paras: 2 },
  { id: 'data-sources', key: 'dataSources', icon: 'database', paras: 3 },
  { id: 'accuracy', key: 'accuracy', icon: 'fact_check', paras: 3 },
  { id: 'copyright', key: 'copyright', icon: 'copyright', paras: 3 },
  { id: 'ai', key: 'ai', icon: 'auto_awesome', paras: 1 },
  { id: 'corrections', key: 'corrections', icon: 'published_with_changes', paras: 2 },
  // Shown only once src/lib/legal.js names a person and an address: a
  // grievance officer with a blank name is worse than no section.
  { id: 'grievance', key: 'grievance', icon: 'mail', paras: 2, when: grievanceReady },
  { id: 'branding', key: 'branding', icon: 'verified', paras: 1 },
  { id: 'liability', key: 'liability', icon: 'gavel', paras: 1 },
]

/** The grievance officer's address as a link, inside the sentence that names it. */
function withEmail(text, email) {
  const at = text.indexOf(email)
  if (!email || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <a href={`mailto:${email}`} className="text-primary font-semibold hover:underline">{email}</a>
      {text.slice(at + email.length)}
    </>
  )
}

export default function Disclaimer() {
  const { t } = useT()
  const sections = SECTIONS.filter(s => !s.when || s.when())
  const vars = { name: GRIEVANCE.name.trim(), email: GRIEVANCE.email.trim() }

  return (
    <div className="w-full px-4 md:px-8 max-w-[860px] mx-auto py-12 flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-outline-variant pb-8">
        <span className="text-label-md font-label-md text-secondary-container uppercase tracking-widest font-bold">{t('disclaimer.eyebrow')}</span>
        <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-primary">{t('disclaimer.title')}</h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant max-w-[65ch]">
          {t('disclaimer.lead')}
        </p>
        <p className="text-label-md text-outline">{t('disclaimer.lastUpdated', { month: t('month.sep'), year: '2026' })}</p>
      </header>

      {/* Table of contents */}
      <nav aria-label={t('disclaimer.tocAria')} className="flex flex-wrap gap-2">
        {sections.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-label-md font-label-md px-3 py-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            {t(`disclaimer.sections.${s.key}.title`)}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        {sections.map(s => (
          <section key={s.id} id={s.id} className="flex flex-col gap-3 scroll-mt-24">
            <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-container">{s.icon}</span>
              {t(`disclaimer.sections.${s.key}.title`)}
            </h2>
            {Array.from({ length: s.paras }, (_, i) => (
              <p key={i} className="text-body-md font-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
                {withEmail(t(`disclaimer.sections.${s.key}.p${i + 1}`, vars), vars.email)}
              </p>
            ))}
          </section>
        ))}
      </div>

      {/* Contact */}
      <section className="bg-surface-container border border-surface-variant rounded-xl p-6 md:p-8 flex flex-col gap-3">
        <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary-container">mail</span>
          {t('disclaimer.contact.title')}
        </h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed">
          {t('disclaimer.contact.lead')}{' '}
          <Link to="/community?correct=1" className="text-primary font-semibold hover:underline">
            {t('disclaimer.contact.formLink')}
          </Link>
          {'. '}{t('disclaimer.contact.after')}
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link
            to="/about"
            className="px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface text-label-md font-label-md hover:bg-surface-container-high transition-colors"
          >
            {t('disclaimer.contact.aboutLink')}
          </Link>
        </div>
      </section>

      {/* Telugu summary — always Telugu, in every language, like the brand mark */}
      <section className="border-t border-outline-variant pt-8 flex flex-col gap-2" lang="te">
        <h2 className="text-headline-sm font-headline-sm text-on-surface-variant font-bold">{t('disclaimer.summary.titleTe')}</h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
          {t('disclaimer.summary.bodyTe')}
        </p>
      </section>
    </div>
  )
}
