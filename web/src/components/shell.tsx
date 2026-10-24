import * as React from 'react'
import { PREVIEW } from '@/lib/preview'
import {
  Building2, ChevronDown, FileText, HandCoins, Home, Landmark, Languages, Layers, MapPin, Menu, Phone, Scale, Search, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, type StringKey } from '@/lib/i18n'
import { useDesign } from '@/lib/design'
import { href, type Route } from '@/lib/route'
import { meta } from '@/lib/data'
import { dateLong, dateTe } from '@/lib/format'
import { SearchDialog, SearchTrigger } from './search'
import { AnimatedThemeToggler } from '@/vendor/magicui/animated-theme-toggler'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

type NavItem = { token: string; key: StringKey; icon: React.ComponentType<{ className?: string }>; match: readonly string[] }

// The menu of the new design. Periods and Papers are new in the menu; the rest
// sits under More. Home is the wordmark as well, but it stays a word here for
// readers who do not know that.
export const NAV: NavItem[] = [
  { token: '', key: 'navHome', icon: Home, match: ['home'] },
  { token: 'cards', key: 'navCards', icon: Layers, match: ['cards'] },
  { token: 'projects', key: 'navProjects', icon: Building2, match: ['projects', 'project'] },
  { token: 'districts', key: 'navDistrict', icon: MapPin, match: ['districts', 'district'] },
  { token: 'money', key: 'navMoney', icon: Landmark, match: ['money', 'money-departments', 'money-states'] },
  { token: 'investments', key: 'navInvest', icon: HandCoins, match: ['investments'] },
  { token: 'governments', key: 'navPeriods', icon: CalendarRange, match: ['governments'] },
  { token: 'claims', key: 'navClaims', icon: Scale, match: ['claims', 'claim'] },
  { token: 'papers', key: 'navPapers', icon: FileText, match: ['papers'] },
]

export const MORE: { token: string; key: StringKey }[] = [
  { token: 'tenders', key: 'navTenders' },
  { token: 'state-facts', key: 'navFacts' },
  { token: 'money-states', key: 'navStates' },
  { token: 'helplines', key: 'navHelp' },
  { token: 'updates', key: 'navUpdates' },
  { token: 'words', key: 'navWords' },
  { token: 'community', key: 'navCommunity' },
  { token: 'sources', key: 'navSources' },
  { token: 'about', key: 'navAbout' },
  { token: 'disclaimer', key: 'navDisclaimer' },
  { token: 'privacy', key: 'navPrivacy' },
]
const MORE_MATCH = MORE.map((m) => m.token)

const gutter = { paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }

export function Wordmark({ className }: { className?: string }) {
  // A neutral wordmark: two words and a small square, no symbol that could read as a party's or the state's.
  return (
    <a href={href('')} className={cn('inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-heading text-[17px] font-semibold tracking-tight', className)} aria-label="AP Fact Check by Dheeco, home">
      <span className="grid size-7 place-items-center rounded-md bg-foreground text-[11px] font-bold tracking-tight text-background">AP</span>
      {/* the maker's name sits under the site's name, small, so the site's name stays the first thing read */}
      <span className="flex flex-col leading-none">
        <span>Fact Check</span>
        <span className="mt-[3px] font-sans text-[11px] font-medium tracking-normal text-muted-foreground">by Dheeco</span>
      </span>
    </a>
  )
}

function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <div className={cn('inline-flex h-9 items-center rounded-full border border-border bg-card p-0.5 text-[13px] font-medium', className)} role="group" aria-label="Language">
      <button type="button" onClick={() => setLang('en')} aria-pressed={lang === 'en'} className={cn('h-8 rounded-full px-3', lang === 'en' ? 'bg-foreground text-background' : 'text-muted-foreground')}>EN</button>
      <button type="button" onClick={() => setLang('te')} aria-pressed={lang === 'te'} lang="te" className={cn('h-8 rounded-full px-3', lang === 'te' ? 'bg-foreground text-background' : 'text-muted-foreground')}>తెలుగు</button>
    </div>
  )
}

function ThemeSwitch() {
  const { dark, set } = useDesign()
  return (
    <AnimatedThemeToggler theme={dark ? 'dark' : 'light'} onThemeChange={(t) => set('mode', t)}
      className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground/80 hover:text-foreground [&_svg]:size-4" aria-label="Switch light and dark" />
  )
}

const isActive = (route: Route, match: readonly string[]) => match.includes(route.page)

// The design picker is a review tool for the owner; readers almost never open it, so its code
// arrives only on the first open.
const DesignPicker = React.lazy(() => import('./picker').then((m) => ({ default: m.DesignPicker })))

export const ShellContext = React.createContext<{ openSearch: () => void; openDesign: () => void }>({ openSearch: () => {}, openDesign: () => {} })

export function AppShell({ route, children }: { route: Route; children: React.ReactNode }) {
  const { d } = useDesign()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerEver, setPickerEver] = React.useState(false)
  if (pickerOpen && !pickerEver) setPickerEver(true)
  const ctx = React.useMemo(() => ({ openSearch: () => setSearchOpen(true), openDesign: () => setPickerOpen(true) }), [])
  const feed = route.page === 'cards'
  return (
    <ShellContext.Provider value={ctx}>
      {d.shell === 'sidebar'
        ? <SideShell route={route} onSearch={() => setSearchOpen(true)} feed={feed}>{children}</SideShell>
        : <TopShell route={route} onSearch={() => setSearchOpen(true)} feed={feed}>{children}</TopShell>}
      <BottomBar route={route} onSearch={() => setSearchOpen(true)} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      {pickerEver ? <React.Suspense fallback={null}><DesignPicker open={pickerOpen} onOpenChange={setPickerOpen} /></React.Suspense> : null}
    </ShellContext.Provider>
  )
}

function NavLabel({ k }: { k: StringKey }) {
  const { t, lang } = useLang()
  return lang === 'te' ? <span lang="te">{t(k)}</span> : <>{t(k)}</>
}

function MoreMenu({ route }: { route: Route }) {
  const { t, lang } = useLang()
  const on = MORE_MATCH.includes(route.page)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'bg-foreground text-background' : 'text-foreground/75 hover:bg-accent hover:text-foreground')}>
        <NavLabel k="navMore" /><ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {MORE.map((m, i) => (
          <React.Fragment key={m.token}>
            {i === 6 || i === 8 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem asChild className={cn('h-9 text-[14px]', route.page === m.token && 'bg-accent font-semibold')}>
              <a href={href(m.token)} lang={lang === 'te' ? 'te' : undefined}>{t(m.key)}</a>
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TopShell({ route, children, onSearch, feed }: { route: Route; children: React.ReactNode; onSearch: () => void; feed: boolean }) {
  return (
    <div className="min-h-screen">
      <header className="sticky z-40 border-b border-border/80 bg-background/90 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 sm:gap-4" style={gutter}>
          <Wordmark />
          {/* The search box is the second thing a reader sees, on every screen wide enough for it */}
          <SearchTrigger onOpen={onSearch} className="ml-2 hidden max-w-[480px] flex-1 md:flex" />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={onSearch} className="grid size-9 place-items-center rounded-full border border-border bg-card md:hidden" aria-label="Search"><Search className="size-4" /></button>
            <LangSwitch className="hidden sm:inline-flex" />
            <ThemeSwitch />
            <MobileMenu route={route} />
          </div>
        </div>
        {/* The menu row: ten places, in one line that scrolls sideways if a language needs more room */}
        <div className="hidden border-t border-border/60 lg:block">
          <nav className="mx-auto flex h-12 max-w-[1240px] items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={gutter} aria-label="Main">
            {NAV.map((n) => (
              <a key={n.token} href={href(n.token)} aria-current={isActive(route, n.match) ? 'page' : undefined}
                className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors', isActive(route, n.match) ? 'bg-foreground text-background' : 'text-foreground/75 hover:bg-accent hover:text-foreground')}>
                <NavLabel k={n.key} />
              </a>
            ))}
            <MoreMenu route={route} />
          </nav>
        </div>
      </header>
      <main className={cn(feed ? 'pb-16 md:pb-0' : 'pb-24 md:pb-0')}>{children}</main>
      {feed ? <div className="hidden md:block"><Footer /></div> : <Footer />}
    </div>
  )
}

function MobileMenu({ route }: { route: Route }) {
  const { t, lang } = useLang()
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="grid size-9 place-items-center rounded-full border border-border bg-card lg:hidden" aria-label="Open the menu"><Menu className="size-4" /></button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[86vw] max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle><Wordmark /></SheetTitle>
          <SheetDescription>{lang === 'te' ? <span lang="te">ప్రభుత్వం ఏం నిర్మిస్తోందో సరిచూడండి</span> : 'Check what the government is building'}</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.token} href={href(n.token)} onClick={() => setOpen(false)}
              className={cn('flex h-12 items-center gap-3 rounded-lg px-3 text-[16px] font-medium', isActive(route, n.match) ? 'bg-foreground text-background' : 'hover:bg-accent')}>
              <n.icon className="size-5" /><NavLabel k={n.key} />
            </a>
          ))}
        </nav>
        <div className="mx-4 mt-4 border-t border-border pt-3">
          <div className="px-3 pb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><NavLabel k="navMore" /></div>
          <div className="grid grid-cols-2 gap-x-2">
            {MORE.map((m) => (
              <a key={m.token} href={href(m.token)} onClick={() => setOpen(false)} lang={lang === 'te' ? 'te' : undefined}
                className={cn('flex min-h-11 items-center rounded-lg px-3 text-[14.5px]', route.page === m.token ? 'bg-accent font-semibold' : 'text-foreground/85 hover:bg-accent')}>{t(m.key)}</a>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 px-4 pb-6"><Languages className="size-4 text-muted-foreground" /><LangSwitch /></div>
      </SheetContent>
    </Sheet>
  )
}

function SideShell({ route, children, onSearch, feed }: { route: Route; children: React.ReactNode; onSearch: () => void; feed: boolean }) {
  const { t, lang } = useLang()
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <div className="flex h-10 items-center px-1 group-data-[collapsible=icon]:justify-center"><Wordmark className="group-data-[collapsible=icon]:[&>span:last-child]:hidden" /></div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Questions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((n) => (
                  <SidebarMenuItem key={n.token}>
                    <SidebarMenuButton asChild isActive={isActive(route, n.match)} tooltip={t(n.key)}>
                      <a href={href(n.token)}><n.icon /><span lang={lang === 'te' ? 'te' : undefined}>{t(n.key)}</span></a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>{t('navMore')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {MORE.map((m) => (
                  <SidebarMenuItem key={m.token}><SidebarMenuButton asChild isActive={route.page === m.token} tooltip={t(m.key)}><a href={href(m.token)}><Phone className="opacity-0" /><span lang={lang === 'te' ? 'te' : undefined}>{t(m.key)}</span></a></SidebarMenuButton></SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-1 text-[11.5px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">Record updated {dateLong(meta.register_updated)}. Independent, not a government site.</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:rounded-t-xl">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <SearchTrigger onOpen={onSearch} className="min-w-0 max-w-[420px] flex-1" />
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch className="hidden sm:inline-flex" />
            <ThemeSwitch />
          </div>
        </header>
        <main className={cn('min-w-0', feed ? 'pb-16 md:pb-0' : 'pb-24 md:pb-0')}>{children}</main>
        {feed ? <div className="hidden md:block"><Footer /></div> : <Footer />}
      </SidebarInset>
    </SidebarProvider>
  )
}

function BottomBar({ route, onSearch }: { route: Route; onSearch: () => void }) {
  const { t, lang } = useLang()
  // Phones: the four places people open most, and search. Money stays in the menu.
  const items = [NAV[0], { ...NAV[1], key: 'navCardsShort' as StringKey }, NAV[2], NAV[3]]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }} aria-label="Quick">
      <div className="grid grid-cols-5">
        {items.map((n) => (
          <a key={n.token} href={href(n.token)} aria-current={isActive(route, n.match) ? 'page' : undefined}
            className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive(route, n.match) ? 'text-foreground' : 'text-muted-foreground')}>
            <n.icon className={cn('size-5', isActive(route, n.match) && 'stroke-[2.4]')} />
            <span lang={lang === 'te' ? 'te' : undefined} className="max-w-full truncate px-1">{t(n.key)}</span>
          </a>
        ))}
        <button type="button" onClick={onSearch} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Search className="size-5" /><span lang={lang === 'te' ? 'te' : undefined}>{t('navSearch')}</span>
        </button>
      </div>
    </nav>
  )
}

function Footer() {
  const { t, lang, tr } = useLang()
  const { openDesign } = React.useContext(ShellContext)
  const groups: { title: string; items: { token: string; key: StringKey }[] }[] = [
    { title: tr('Look up', 'చూడండి'), items: [{ token: 'projects', key: 'navProjects' }, { token: 'districts', key: 'navDistrict' }, { token: 'money', key: 'navMoney' }, { token: 'investments', key: 'navInvest' }, { token: 'governments', key: 'navPeriods' }, { token: 'claims', key: 'navClaims' }] },
    { title: tr('The record', 'రికార్డు'), items: [{ token: 'papers', key: 'navPapers' }, { token: 'tenders', key: 'navTenders' }, { token: 'state-facts', key: 'navFacts' }, { token: 'money-states', key: 'navStates' }, { token: 'updates', key: 'navUpdates' }, { token: 'words', key: 'navWords' }] },
    { title: tr('Help and us', 'సహాయం, మేము'), items: [{ token: 'helplines', key: 'navHelp' }, { token: 'community', key: 'navCommunity' }, { token: 'sources', key: 'navSources' }, { token: 'about', key: 'navAbout' }, { token: 'disclaimer', key: 'navDisclaimer' }, { token: 'privacy', key: 'navPrivacy' }] },
  ]
  return (
    <footer className="mt-24 border-t border-border bg-paper">
      <div className="mx-auto grid max-w-[1240px] gap-10 py-12 lg:grid-cols-[1.1fr_2fr]" style={gutter}>
        <div className="max-w-md space-y-3">
          <Wordmark />
          <p className="text-[14px] leading-relaxed text-muted-foreground">{tr('An independent, free site. We collect what the government’s own papers say and show them so anyone can check a claim. We are not a government site and we take no side.',
            'స్వతంత్ర, ఉచిత సైట్. ప్రభుత్వ పత్రాలు ఏం చెబుతున్నాయో సేకరించి, ఎవరైనా ఒక మాటను సరిచూసుకునేలా చూపిస్తాం. ఇది ప్రభుత్వ సైట్ కాదు; మేము ఏ పక్షమూ వహించం.')}</p>
          <p className="text-[12.5px] text-muted-foreground">{lang === 'te'
            ? <span lang="te">ప్రాజెక్టు రికార్డు {dateTe(meta.register_updated)}న నవీకరించాం.{PREVIEW ? ` ఇది డిజైన్ సమీక్ష కోసం ప్రివ్యూ, ${dateTe(meta.asof)} నాటి లైవ్ రికార్డుపై నిర్మించాం.` : ''}</span>
            : <>Project record updated {dateLong(meta.register_updated)}.{PREVIEW ? ` A preview for design review, built on the live record of ${dateLong(meta.asof)}.` : ''}</>}</p>
          {PREVIEW ? <button type="button" onClick={openDesign} className="text-[12.5px] font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">{tr('For review: the design options', 'సమీక్ష కోసం: డిజైన్ ఎంపికలు')}</button> : null}
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {groups.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{g.title}</div>
              <ul className="space-y-1.5 text-[14px]">
                {g.items.map((it) => <li key={it.token}><a href={href(it.token)} lang={lang === 'te' ? 'te' : undefined} className="text-foreground/80 hover:text-foreground hover:underline">{t(it.key)}</a></li>)}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-4 text-[13px] text-muted-foreground" style={gutter}>
          <span>{tr('AP Fact Check by Dheeco', 'AP Fact Check, Dheeco రూపొందించింది')}</span>
          <a href="https://dheeco.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/80 underline underline-offset-4 hover:text-foreground">{tr('Visit dheeco.com', 'dheeco.com చూడండి')}</a>
        </div>
      </div>
    </footer>
  )
}

/** Page container with the side gutter the brief asks for. */
export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('mx-auto w-full', wide ? 'max-w-[1240px]' : 'max-w-[1120px]', className)} style={gutter}>
      {children}
    </div>
  )
}

/** The head of a page: what it is, its question in the reader's language with the other beneath, and a lede. */
export function PageHead({ eyebrow, q, lede, className, children }: {
  eyebrow: React.ReactNode; q: { en: React.ReactNode; te: React.ReactNode }; lede?: React.ReactNode; className?: string; children?: React.ReactNode
}) {
  const { lang } = useLang()
  return (
    <div className={cn('max-w-4xl', className)}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{eyebrow}</div>
      <h1 lang={lang === 'te' ? 'te' : undefined} className="mt-1 text-[34px] font-semibold leading-[1.08] tracking-tight [text-wrap:balance] md:text-[48px]">{lang === 'te' ? q.te : q.en}</h1>
      <p lang={lang === 'te' ? 'en' : 'te'} className="mt-2 text-[17px] text-muted-foreground">{lang === 'te' ? q.en : q.te}</p>
      {lede ? <div className="mt-4 max-w-3xl text-[16.5px] leading-relaxed text-foreground/85">{lede}</div> : null}
      {children}
    </div>
  )
}
