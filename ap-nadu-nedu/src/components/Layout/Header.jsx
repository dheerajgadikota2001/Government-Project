import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher'

// Labels are keys, resolved at render so they follow the chosen language.
const navLinks = [
  { to: '/', key: 'nav.home' },
  { to: '/projects', key: 'nav.projects' },
  { to: '/investments', key: 'nav.investments' },
  { to: '/news', key: 'nav.news' },
  { to: '/finances', key: 'nav.finances' },
  { to: '/contacts', key: 'nav.contacts' },
]

// Two grouped menus keep the bar short. Each holds pages that belong together.
const MENUS = [
  {
    key: 'nav.governments',
    links: [
      { to: '/governments', key: 'nav.apTenureRecord' },
      { to: '/state-facts', key: 'nav.stateFacts' },
      { to: '/school-education', key: 'nav.schoolEducation' },
      { to: '/states', key: 'nav.allStates' },
    ],
  },
  {
    key: 'nav.records',
    links: [
      { to: '/documents', key: 'nav.govDocuments' },
      { to: '/tenders', key: 'nav.tenders' },
      { to: '/sources', key: 'nav.dataSources' },
      { to: '/community', key: 'nav.community' },
    ],
  },
]

export default function Header() {
  const { t } = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  // Desktop dropdowns: ONE controlled state for both menus. The old pure-CSS
  // hover/focus-within approach let a clicked (still-focused) menu stay open
  // while hovering the other opened a second panel on top of it.
  const [openMenu, setOpenMenu] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isActive = m => m.links.some(l => pathname.startsWith(l.to))

  function handleSearch(e) {
    e.preventDefault()
    if (searchVal.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchVal.trim())}`)
      setSearchVal('')
      setSearchOpen(false)
    }
  }

  return (
    <header className="bg-primary shadow-md sticky top-0 z-50 w-full">
      <div className="flex justify-between items-center w-full px-4 md:px-8 max-w-[1280px] mx-auto h-16">
        {/* Brand */}
        <div className="flex items-center gap-4 min-w-0 shrink me-6">
          {/* Brand lockup: name, then the byline hanging off its left edge.
              `items-start` rather than the default stretch is what keeps the
              byline aligned to the start of the name instead of drifting with
              the link's box, and it holds when the name swaps between its long
              and short form at xl. */}
          {/* `overflow-hidden` with truncating children is the safety net.
              Without it this block is nowrap AND unclipped, so when the header
              runs short the name does not shorten — it simply draws over the
              first nav item. That is how "Andhra Pradesh Fact Check" ended up
              on top of "Home". Widths here depend on the real Public Sans
              metrics, which differ from any fallback, so the layout must not
              rely on a measured fit: it has to degrade safely at any width. */}
          <NavLink
            to="/"
            className="flex flex-col items-start justify-center leading-tight text-on-primary min-w-0 overflow-hidden whitespace-nowrap"
          >
            {/* The full name is what a citation or a news story should carry,
                but it does not fit a 390px header beside the language and menu
                buttons. The short form is the same brand, not a different one —
                the way readers already abbreviate the state. */}
            <span className="text-headline-md font-headline-md font-bold tracking-tight truncate 2xl:hidden">
              {t('nav.brandNameShort')}
            </span>
            <span className="text-title-lg font-title-lg font-bold tracking-tight truncate hidden 2xl:inline">
              {t('nav.brandName')}
            </span>
            <span className="text-label-sm font-normal opacity-70 mt-0.5 tracking-wide truncate">by dhethi</span>
          </NavLink>
        </div>

        {/* Desktop Nav */}
        {/* `shrink-0`, not `min-w-0`. Every nav item is whitespace-nowrap, so a
            nav allowed to shrink below its own content does not compress —
            its last item simply overflows the nav's right edge and lands on
            top of the search box. Measured at 1280/1440/1920: a constant
            -7px gap, i.e. a real overlap, not a tight fit. The brand block
            beside it carries `shrink` and a short-name fallback, so that is
            what gives way when the header runs out of room. */}
        <nav className="hidden lg:flex items-center gap-0.5 h-full shrink-0 me-4">
          {navLinks.map(({ to, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive
                  ? 'text-secondary-container font-bold border-b-2 border-secondary-container pb-1 text-label-md font-label-md px-2.5 py-2 whitespace-nowrap'
                  : 'text-on-primary/80 font-medium hover:text-on-primary hover:bg-primary-container/20 transition-colors text-label-md font-label-md px-2.5 py-2 rounded whitespace-nowrap'
              }
            >
              {t(key)}
            </NavLink>
          ))}

          {MENUS.map(menu => (
            <div
              key={menu.key}
              className="relative h-full flex items-center"
              onMouseEnter={() => setOpenMenu(menu.key)}
              onMouseLeave={() => setOpenMenu(m => (m === menu.key ? null : m))}
              onBlur={e => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setOpenMenu(m => (m === menu.key ? null : m))
                }
              }}
              onKeyDown={e => { if (e.key === 'Escape') setOpenMenu(null) }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === menu.key}
                onClick={() => setOpenMenu(menu.key)}
                className={
                  isActive(menu)
                    ? 'text-secondary-container font-bold border-b-2 border-secondary-container pb-1 text-label-md font-label-md px-2.5 py-2 inline-flex items-center gap-1 whitespace-nowrap'
                    : 'text-on-primary/80 font-medium hover:text-on-primary hover:bg-primary-container/20 transition-colors text-label-md font-label-md px-2.5 py-2 rounded inline-flex items-center gap-1 whitespace-nowrap'
                }
              >
                {t(menu.key)}
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">expand_more</span>
              </button>
              <div className={`absolute end-0 top-full pt-1 z-50 ${openMenu === menu.key ? 'block' : 'hidden'}`}>
                <div className="bg-surface border border-outline-variant rounded-xl shadow-lg py-1.5 min-w-[250px] flex flex-col">
                  {menu.links.map(({ to, key }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setOpenMenu(null)}
                      className={({ isActive: act }) =>
                        act
                          ? 'text-primary font-bold text-label-md px-4 py-2 bg-primary/10'
                          : 'text-on-surface text-label-md px-4 py-2 hover:bg-surface-container'
                      }
                    >
                      {t(key)}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>

        {/* Actions. `shrink-0` and the leading margin keep the search pill off
            the last nav item — the two were sitting flush, so the Records
            dropdown button and the search box read as one collided control. */}
        <div className="flex items-center gap-2 text-on-primary shrink-0 ms-2">
          {/* Desktop search */}
          <form onSubmit={handleSearch} className="hidden xl:flex items-center gap-2 bg-primary-container/30 rounded-full px-3 py-1.5 border border-outline-variant/20">
            <span className="material-symbols-outlined text-[18px] text-on-primary/60">search</span>
            <input
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              className="bg-transparent border-none outline-none text-label-md placeholder-on-primary/50 text-on-primary w-28 focus:ring-0 p-0"
            />
          </form>

          {/* Language */}
          <LanguageSwitcher />

          {/* Mobile menu button */}
          <button
            aria-label={t('nav.toggleMenu')}
            className="lg:hidden hover:bg-primary-container/20 p-2 rounded-full transition-colors"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="lg:hidden bg-primary border-t border-primary-container/30 px-4 py-3 flex flex-col gap-1">
          {[
            ...navLinks.map(l => ({ ...l, label: t(l.key) })),
            ...MENUS.flatMap(m => m.links.map(l => ({ ...l, label: `${t(m.key)} · ${t(l.key)}` }))),
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                isActive
                  ? 'text-secondary-container font-bold text-label-md px-3 py-2 rounded bg-primary-container/20'
                  : 'text-on-primary/80 text-label-md px-3 py-2 rounded hover:bg-primary-container/20'
              }
            >
              {label}
            </NavLink>
          ))}
          <form onSubmit={handleSearch} className="flex items-center gap-2 bg-primary-container/30 rounded-full px-3 py-2 mt-2">
            <span className="material-symbols-outlined text-[18px] text-on-primary/60">search</span>
            <input
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder={t('nav.searchMobilePlaceholder')}
              aria-label={t('nav.searchMobilePlaceholder')}
              className="bg-transparent border-none outline-none text-label-md placeholder-on-primary/50 text-on-primary flex-1 focus:ring-0 p-0"
            />
          </form>
        </div>
      )}
    </header>
  )
}
