import * as React from 'react'

// Every link in the app is written as a token: 'projects', 'project-613', 'district-eluru',
// 'money-departments'. One file turns a token into an address and an address back into a page.
//
// Two address styles, chosen at build time:
//  - paths, for the live site: /projects/613, /districts/eluru. The old site's addresses are kept
//    wherever a page of the same meaning exists, so nobody's bookmark or search result breaks,
//    and the server pre-renders and sitemaps them (web/scripts).
//  - hashes, for the single-file preview artifact: #project-613. A single file has no server to
//    answer /projects/613, so it keeps the hash style.
export const HASH = import.meta.env.VITE_ROUTES === 'hash'

export type Route = { page: string; arg?: string }

/* ------------------------------------------------------------------ the language part of an address */
// English pages live at /projects/613, Telugu pages at /te/projects/613: the old site's addresses, kept so
// every Telugu link already shared keeps working, and so search engines can list each language on its own.
// The language is the reader's setting. The address follows it: when a reader switches, the address in the
// bar is rewritten in place, and every link on the page is written with the same prefix.
export type UrlLang = 'en' | 'te'
let prefix: '' | '/te' = ''

/** The language an address names, or null when it names none (an English address). */
export function urlLang(path: string): UrlLang | null {
  return /^\/te(\/|$)/.test(path) ? 'te' : null
}
/** The address without its language part. */
export function stripLang(path: string): string {
  return path.replace(/^\/te(?=\/|$)/, '') || '/'
}
/** The same address in a given language. */
export function inLang(path: string, lang: UrlLang): string {
  const p = stripLang(path)
  return lang === 'te' ? (p === '/' ? '/te' : '/te' + p) : p
}
/** Set the language every link is written in, and rewrite the address in the bar to match. */
export function setLinkLang(lang: UrlLang) {
  prefix = lang === 'te' ? '/te' : ''
  if (HASH || typeof location === 'undefined') return
  const to = inLang(location.pathname, lang)
  if (to !== location.pathname) history.replaceState(history.state, '', to + location.search + location.hash)
}

// token -> path, for the pages without an argument. The old site's names are kept where they
// existed (finances, documents, contacts, factcheck, states); the rest are new.
const PATHS: Record<string, string> = {
  home: '/', cards: '/cards', projects: '/projects', districts: '/districts', money: '/finances',
  'money-departments': '/finances/departments', 'money-states': '/states', 'state-facts': '/state-facts',
  investments: '/investments', governments: '/governments', claims: '/factcheck', papers: '/documents',
  updates: '/updates', tenders: '/tenders', helplines: '/contacts', words: '/words', community: '/community',
  sources: '/sources', about: '/about', disclaimer: '/disclaimer', privacy: '/privacy',
}
const PAGES: Record<string, string> = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [v, k]))
// pages with an argument: token prefix -> path prefix
const ARG: Record<string, string> = { project: '/projects/', district: '/districts/', claim: '/factcheck/', paper: '/paper/' }

export function parseToken(s: string): Route {
  if (!s) return { page: 'home' }
  const m = s.match(/^(project|district|claim|paper)-(.+)$/)
  if (m) return { page: m[1], arg: m[2] }
  return { page: s }
}

/** The address of a token, in whichever style this build uses. */
export function href(token: string): string {
  if (HASH) return '#' + token
  const r = parseToken(token)
  const p = r.arg ? ARG[r.page] + encodeURIComponent(r.arg) : PATHS[r.page] ?? '/' + r.page
  return prefix ? (p === '/' ? prefix : prefix + p) : p
}

/** Every page token family the router knows, for the pre-renderer and its tests. */
export const STATIC_PATHS = PATHS
export const ARG_PATHS = ARG

/** The page an address names, or the home page. Trailing slashes and the old site's `/index.html` are tolerated. */
export function parsePath(path: string): Route {
  let p = stripLang(path.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/')
  try { p = decodeURIComponent(p) } catch { /* keep as is */ }
  if (PAGES[p]) return { page: PAGES[p] }
  for (const [page, pre] of Object.entries(ARG)) {
    if (p.startsWith(pre) && p.length > pre.length && !p.slice(pre.length).includes('/')) return { page, arg: p.slice(pre.length) }
  }
  // An address the site does not have. It used to quietly show the home page, which told search engines
  // that every mistyped address was a real page. Now it says plainly that the page is not here.
  return { page: 'notfound' }
}

function current(): Route {
  return HASH ? parseToken(location.hash.replace(/^#/, '')) : parsePath(location.pathname)
}

export function useRoute(): Route {
  const [r, setR] = React.useState(current)
  React.useEffect(() => {
    const on = () => {
      // Going back can land on an address written before the reader switched language: bring it in line.
      if (!HASH && (urlLang(location.pathname) ?? 'en') !== (prefix ? 'te' : 'en')) setLinkLang(prefix ? 'te' : 'en')
      setR(current())
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
    if (HASH) {
      window.addEventListener('hashchange', on)
      return () => window.removeEventListener('hashchange', on)
    }
    window.addEventListener('popstate', on)
    // In-app links are plain <a href="/projects/613">: the click becomes a pushState, so the page
    // changes without a reload. Links with a modifier key, another origin, a target, or a download
    // are left to the browser.
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return
      if (a.getAttribute('href')?.startsWith('#')) return
      e.preventDefault()
      go(a.pathname + a.search + a.hash)
    }
    document.addEventListener('click', click)
    return () => { window.removeEventListener('popstate', on); document.removeEventListener('click', click) }
  }, [])
  return r
}

/** Go to a token (or, in the path style, to an address). */
export const go = (tokenOrPath: string) => {
  if (HASH) { location.hash = tokenOrPath; return }
  const to = tokenOrPath.startsWith('/') ? tokenOrPath : href(tokenOrPath)
  if (to === location.pathname + location.search + location.hash) return
  history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
