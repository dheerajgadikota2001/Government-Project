import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { isOptedOut, isOptedOutByBrowser, setOptedOut } from '../lib/analytics'

/**
 * What this site measures, in the same plain register as the disclaimer, and
 * the switch to stop it.
 *
 * WHY THIS PAGE IS NOT A TEMPLATE
 * A privacy notice copied from a generator describes software the site does
 * not run. Every claim below was written against src/lib/analytics.js and
 * src/components/Analytics.jsx and is checkable by reading them. If either
 * file changes what leaves the browser, this page is part of that change. A
 * transparency platform that misstates its own data handling has forfeited the
 * only thing it sells.
 *
 * Structure mirrors Disclaimer.jsx on purpose: same shell, same table of
 * contents, same Telugu summary, so the two legal pages read as one voice.
 */

// Icons are drawn from the subset font in src/fonts, not from the full
// Material Symbols set. scripts/icon-font.mjs fails the build's prebuild
// step for any glyph that is not in it. visibility_off, cookie, share, school,
// tune and update are all absent, and the right answer is to pick from the
// subset rather than grow a font every visitor downloads for the sake of one
// page. If you change an icon here, run `npm run build` and read the prebuild
// warning before assuming it rendered.
const SECTIONS = [
  { id: 'what-we-measure', key: 'measure', icon: 'visibility', paras: 3 },
  { id: 'what-we-never', key: 'never', icon: 'cloud_off', paras: 3 },
  { id: 'cookies', key: 'cookies', icon: 'database', paras: 3 },
  { id: 'google', key: 'google', icon: 'public', paras: 4 },
  { id: 'children', key: 'children', icon: 'menu_book', paras: 1 },
  { id: 'changes', key: 'changes', icon: 'published_with_changes', paras: 1 },
]

/**
 * The switch.
 *
 * Three states, because two would require lying in one of them:
 *   · the browser already asked for us (GPC). There is nothing to toggle,
 *     and offering a toggle that does nothing is worse than offering none;
 *   · the reader has asked. Offer the way back, since a choice you cannot
 *     reverse is a trap;
 *   · neither. Offer the switch.
 *
 * State is read once on mount rather than during render: reading storage in a
 * render body makes the component impure and, on a blocked-storage browser,
 * throws inside React's own call stack.
 */
function MeasurementChoice() {
  const { t } = useT()
  const [off, setOff] = useState(false)
  const [byBrowser, setByBrowser] = useState(false)
  const [couldNotStore, setCouldNotStore] = useState(false)

  useEffect(() => {
    setByBrowser(isOptedOutByBrowser())
    setOff(isOptedOut())
  }, [])

  const flip = next => {
    const stored = setOptedOut(next)
    setOff(next)
    // The measurement really is off either way, because applyOptOut ran. What failed
    // is remembering it past this page, and the reader is told exactly that.
    setCouldNotStore(!stored)
  }

  return (
    <section
      id="your-choice"
      className="bg-surface-container border border-surface-variant rounded-xl p-6 md:p-8 flex flex-col gap-4 scroll-mt-24"
    >
      <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary-container">policy</span>
        {t('privacy.choice.title')}
      </h2>

      <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
        {t('privacy.choice.lead')}
      </p>

      {byBrowser ? (
        <div
          className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-high px-4 py-3"
          role="status"
        >
          <span className="material-symbols-outlined text-primary shrink-0" aria-hidden="true">verified_user</span>
          <p className="text-body-md text-on-surface leading-relaxed">{t('privacy.choice.gpc')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body-md text-on-surface font-semibold" role="status" aria-live="polite">
            {off ? t('privacy.choice.statusOff') : t('privacy.choice.statusOn')}
          </p>
          <div>
            <button
              type="button"
              onClick={() => flip(!off)}
              aria-pressed={off}
              className={
                off
                  ? 'px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface text-label-md font-label-md hover:bg-surface-container-high transition-colors'
                  : 'px-5 py-2.5 rounded-lg bg-primary text-on-primary text-label-md font-label-md font-semibold hover:opacity-90 transition-opacity'
              }
            >
              {off ? t('privacy.choice.optInBtn') : t('privacy.choice.optOutBtn')}
            </button>
          </div>
          {couldNotStore && (
            <p className="text-body-sm font-body-sm text-error leading-relaxed max-w-[70ch]" role="alert">
              {t('privacy.choice.noStorage')}
            </p>
          )}
        </div>
      )}

      <p className="text-label-md font-label-md text-outline leading-relaxed max-w-[70ch]">
        {t('privacy.choice.scope')}
      </p>
    </section>
  )
}

export default function Privacy() {
  const { t } = useT()

  return (
    <div className="w-full px-4 md:px-8 max-w-[860px] mx-auto py-12 flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-outline-variant pb-8">
        <span className="text-label-md font-label-md text-secondary-container uppercase tracking-widest font-bold">
          {t('privacy.eyebrow')}
        </span>
        <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-primary">
          {t('privacy.title')}
        </h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant max-w-[65ch]">
          {t('privacy.lead')}
        </p>
        <p className="text-label-md text-outline">
          {t('privacy.lastUpdated', { month: t('month.sep'), year: '2026' })}
        </p>
      </header>

      <nav aria-label={t('privacy.tocAria')} className="flex flex-wrap gap-2">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-label-md font-label-md px-3 py-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            {t(`privacy.sections.${s.key}.title`)}
          </a>
        ))}
        <a
          href="#your-choice"
          className="text-label-md font-label-md px-3 py-1.5 rounded-full border border-primary text-primary hover:bg-surface-container-high transition-colors"
        >
          {t('privacy.choice.title')}
        </a>
      </nav>

      <div className="flex flex-col gap-8">
        {SECTIONS.map(s => (
          <section key={s.id} id={s.id} className="flex flex-col gap-3 scroll-mt-24">
            <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-container">{s.icon}</span>
              {t(`privacy.sections.${s.key}.title`)}
            </h2>
            {Array.from({ length: s.paras }, (_, i) => (
              <p key={i} className="text-body-md font-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
                {t(`privacy.sections.${s.key}.p${i + 1}`)}
              </p>
            ))}
          </section>
        ))}
      </div>

      <MeasurementChoice />

      <section className="flex flex-col gap-3">
        <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary-container">mail</span>
          {t('privacy.contact.title')}
        </h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
          {t('privacy.contact.lead')}{' '}
          <Link to="/community?correct=1" className="text-primary font-semibold hover:underline">
            {t('privacy.contact.formLink')}
          </Link>
          {'. '}
          {t('privacy.contact.after')}
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link
            to="/disclaimer"
            className="px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface text-label-md font-label-md hover:bg-surface-container-high transition-colors"
          >
            {t('privacy.contact.disclaimerLink')}
          </Link>
        </div>
      </section>

      {/* Telugu summary: always Telugu, in every language, like the disclaimer */}
      <section className="border-t border-outline-variant pt-8 flex flex-col gap-2" lang="te">
        <h2 className="text-headline-sm font-headline-sm text-on-surface-variant font-bold">
          {t('privacy.summary.titleTe')}
        </h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed max-w-[70ch]">
          {t('privacy.summary.bodyTe')}
        </p>
      </section>
    </div>
  )
}
