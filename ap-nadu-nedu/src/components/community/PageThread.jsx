/**
 * PageThread — the discussion block that sits at the bottom of a data page.
 * Same engine as the community boards; the thread is keyed to the page so
 * readers' points stay attached to the exact data they are about.
 */

import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import Thread from './Thread'

export default function PageThread({ pageKey }) {
  const { t } = useT()
  return (
    <section className="w-full bg-surface-container rounded-2xl p-5 md:p-7 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">forum</span>
          {t('community.pageThread.title')}
        </h2>
        <Link to="/community" className="text-label-md font-bold text-primary hover:underline">
          {t('community.pageThread.allBoards')} →
        </Link>
      </div>
      <p className="text-body-md text-on-surface-variant max-w-2xl">{t('community.pageThread.sub')}</p>
      <Thread pageKey={pageKey} compact />
    </section>
  )
}
