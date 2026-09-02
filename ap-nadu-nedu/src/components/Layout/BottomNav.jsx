import { NavLink } from 'react-router-dom'
import { useT } from '../../i18n'

/**
 * Phone-only bottom bar (hidden from `lg` up — the desktop header is unchanged).
 *
 * Five destinations, one thumb-tap away; everything else stays in the
 * hamburger menu. Labels reuse the header's own nav keys so the six languages
 * stay in step without new strings. Safe-area padding keeps it above the home
 * indicator on notched phones.
 */
// `preload` warms the page's chunk on touch-start / hover, so by the time the
// tap registers the code is usually already here — no spinner on navigation.
const ITEMS = [
  { to: '/', key: 'nav.home', icon: 'home', end: true },
  { to: '/projects', key: 'nav.projects', icon: 'construction', preload: () => import('../../pages/Projects') },
  { to: '/finances', key: 'nav.finances', icon: 'currency_rupee', preload: () => import('../../pages/Finances') },
  { to: '/governments', key: 'nav.governments', icon: 'account_balance', preload: () => import('../../pages/Governments') },
  { to: '/search', key: 'common.search', icon: 'search', preload: () => import('../../pages/Search') },
]

export default function BottomNav() {
  const { t } = useT()
  return (
    <nav
      aria-label={t('nav.toggleMenu')}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-container-lowest border-t border-surface-variant"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5 h-14">
        {ITEMS.map(({ to, key, icon, end, preload }) => (
          <li key={to} className="min-w-0">
            <NavLink
              to={to}
              end={end}
              onTouchStart={preload}
              onPointerEnter={preload}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center justify-center gap-0.5 h-full text-[10px] leading-none px-1',
                  isActive ? 'text-primary font-bold' : 'text-on-surface-variant',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <span className="truncate max-w-full">{t(key)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
