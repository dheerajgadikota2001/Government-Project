import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import {
  FINANCE_GROUPS, FINANCE_QUESTIONS, financeQuestionPath, financeNeighbours,
} from '../lib/financeQuestions'

/**
 * Pick a question, see only that answer.
 *
 * The finances page used to run nine long sections one after another under
 * the charts. This puts them behind a menu instead: on a wide screen a sticky
 * list on the left and the one open answer on the right; on a phone a row of
 * group chips, the questions of that group as a list, and the open answer
 * beneath the list.
 *
 * The answer is rendered exactly once, whatever the screen size. Rendering it
 * twice (once per layout, hidden by CSS) would mount every chart twice, fire
 * every deferred loader twice and double the DOM the crawler reads. So the
 * two layouts share one child and only the navigation differs.
 *
 * Every item is a real link to a real address. The menu does not hold the
 * open question in state; the URL does. That is what makes a search result
 * land on the right answer, the back button work, and a shared link open
 * where the sender was looking.
 */
export default function FinanceQuestionMenu({ active, children }) {
  const { t } = useT()
  const [mobileGroup, setMobileGroup] = useState(active.group)
  const top = useRef(null)
  const mounted = useRef(false)

  // Follow the open question's group on the phone, but let the reader browse
  // another group without the page snapping back.
  useEffect(() => { setMobileGroup(active.group) }, [active.group])

  // Changing question changes the URL, and the router keeps the scroll
  // position. On a desktop the answer is already in view. On a phone the new
  // answer renders under a list the reader has scrolled past, so bring the
  // menu back into view. Not on first paint: a reader arriving from search
  // should land at the top of the page, hero and all.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (typeof window === 'undefined') return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [active.slug])

  const { prev, next } = financeNeighbours(active.slug)
  const inGroup = key => FINANCE_QUESTIONS.filter(q => q.group === key)

  const item = (q, extra = '') => (
    <Link
      key={q.slug}
      to={financeQuestionPath(q.slug)}
      aria-current={q.slug === active.slug ? 'page' : undefined}
      className={`block rounded-lg px-3 py-2 text-label-lg leading-snug transition-colors ${
        q.slug === active.slug
          ? 'bg-primary text-on-primary font-semibold'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      } ${extra}`}
    >
      {t(q.questionKey)}
    </Link>
  )

  return (
    <section ref={top} id="questions" aria-labelledby="finance-questions-heading" className="scroll-mt-20 flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-label-sm uppercase tracking-wide text-tertiary font-semibold">{t('finances.menu.eyebrow')}</p>
        <h2 id="finance-questions-heading" className="text-headline-sm font-headline-sm text-on-surface font-bold">
          {t('finances.menu.title')}
        </h2>
        <p className="text-label-md text-on-surface-variant">{t('finances.menu.hint')}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start flex flex-col gap-4">
        {/* Wide screens: every group, every question, sticky beside the answer. */}
        <nav aria-label={t('finances.menu.navAria')} className="hidden lg:block lg:sticky lg:top-20 bg-surface-container-lowest border border-outline-variant rounded-xl p-2">
          {FINANCE_GROUPS.map(g => (
            <div key={g.key} className="flex flex-col gap-0.5 pb-1">
              <p className="text-label-sm uppercase tracking-wide text-on-surface-variant font-semibold px-3 pt-3 pb-1">{t(g.labelKey)}</p>
              {inGroup(g.key).map(q => item(q))}
            </div>
          ))}
          <a href="#all-sources" className="block text-label-md text-primary font-semibold px-3 py-2 mt-1 border-t border-surface-variant hover:underline">
            {t('finances.menu.allSources')}
          </a>
        </nav>

        {/* Phones: one group at a time as chips, then that group's questions. */}
        <nav aria-label={t('finances.menu.navAria')} className="lg:hidden flex flex-col gap-2">
          <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {FINANCE_GROUPS.map(g => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={g.key === mobileGroup}
                onClick={() => setMobileGroup(g.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-label-md font-semibold ${
                  g.key === mobileGroup ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {t(g.labelKey)}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {inGroup(mobileGroup).map(q => item(q, 'border border-outline-variant bg-surface-container-lowest aria-[current=page]:border-primary'))}
          </div>
        </nav>

        {/* The one open answer. Rendered once; both layouts point at it. */}
        <div className="min-w-0 flex flex-col gap-6">
          {children}
          <div className="flex flex-wrap justify-between gap-3 border-t border-surface-variant pt-4 text-label-md">
            {prev ? (
              <Link className="text-primary font-semibold hover:underline" to={financeQuestionPath(prev.slug)} rel="prev">
                ← {t(prev.questionKey)}
              </Link>
            ) : <span />}
            {next ? (
              <Link className="text-primary font-semibold hover:underline text-end" to={financeQuestionPath(next.slug)} rel="next">
                {t(next.questionKey)} →
              </Link>
            ) : <span />}
          </div>
        </div>
      </div>
    </section>
  )
}
