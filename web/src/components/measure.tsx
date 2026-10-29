import * as React from 'react'
import type { Route } from '@/lib/route'
import type { Lang } from '@/lib/i18n'
import { EVENTS, describeOutbound, safeUrl, setContext, start, track } from '@/lib/analytics'

// Mounted once, inside the router. Everything that is measured on every page is measured here, in one
// place, rather than sprinkled through fifty components where the fifty-first gets missed.
//
//  1. A page view on every route change. The site changes pages with pushState, so GA's own automatic
//     page view would fire once on load and never again; it is switched off in lib/analytics.ts and sent
//     here instead, with the kind of page and which record it is.
//  2. Outbound clicks, by delegation: one listener catches every source link, including links added
//     later by someone who never reads this file.
//  3. Real page speed from real phones, reported once when the page is put away.
//  4. Addresses the site does not have.
//
// It renders nothing, and outside the public site it sends nothing (lib/analytics.ts decides).
export function Measure({ route, lang }: { route: Route; lang: Lang }) {
  const lastSent = React.useRef<string | null>(null)
  const lastLang = React.useRef<Lang | null>(null)

  React.useEffect(() => { start({ site_language: lang }) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setContext({ site_language: lang })
    if (lastLang.current && lastLang.current !== lang) track(EVENTS.LANGUAGE_CHANGED, { site_language: lang, from_language: lastLang.current })
    lastLang.current = lang
  }, [lang])

  // ---- 1. page views
  // A record's page (a project, a district) sets its own title only once its data is in, a moment after
  // the address changes. Sent at once, the page view would carry the previous page's title (seen in the
  // browser check of 28 Oct 2026). So it waits until the title has settled: 300 ms after its last change,
  // two seconds at most. If the reader moves on or puts the phone away first, it is sent right then, so
  // a quick visit is never lost.
  const pending = React.useRef<(() => void) | null>(null)
  React.useEffect(() => {
    const url = safeUrl(location.href)
    // StrictMode runs effects twice in development, and a language switch rewrites the address in place.
    // A duplicated page view is a permanently doubled number, so one address is never sent twice in a row.
    if (!url || lastSent.current === url) return
    lastSent.current = url
    pending.current?.()
    const kind = route.page, id = route.arg
    let settle = 0, cap = 0, done = false
    const titleEl = document.querySelector('title')
    const watch = new MutationObserver(() => { clearTimeout(settle); settle = window.setTimeout(send, 300) })
    function send() {
      if (done) return
      done = true
      clearTimeout(settle); clearTimeout(cap); watch.disconnect()
      if (pending.current === send) pending.current = null
      track(EVENTS.PAGE_VIEW, {
        page_location: url,
        page_title: document.title,
        page_kind: kind,          // 'project', 'district', 'paper', 'money' ...
        content_id: id,           // '613', 'eluru' ... (no reader input ever lands here)
      })
      if (kind === 'notfound') track(EVENTS.ROUTE_NOT_FOUND, { page_location: url })
    }
    // Watched before the page's own effects run (this component renders first), so no change is missed.
    // A page whose title does not change (the first page, already titled by the server) waits for the cap.
    if (titleEl) watch.observe(titleEl, { childList: true, characterData: true, subtree: true })
    cap = window.setTimeout(send, 2000)
    pending.current = send
  }, [route.page, route.arg, lang])
  React.useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') pending.current?.() }
    const leave = () => pending.current?.()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', leave)
    return () => { leave(); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', leave) }
  }, [])

  // ---- 2. outbound and document clicks
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const out = describeOutbound(a.getAttribute('href') ?? '', location.href)
      if (!out) return
      const from = { from_kind: route.page, from_id: route.arg }
      track(EVENTS.SOURCE_CLICK, { ...out, ...from })
      if (out.is_document) track(EVENTS.DOCUMENT_OPEN, { portal: out.portal, file_type: out.file_type, is_government: out.is_government, ...from })
    }
    // Capture phase, and auxclick too: a middle-click into a new tab is how people open sources to compare.
    document.addEventListener('click', onClick, true)
    document.addEventListener('auxclick', onClick, true)
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('auxclick', onClick, true) }
  }, [route.page, route.arg])

  // ---- 3. page speed, measured natively (no library: PerformanceObserver gives the same numbers)
  React.useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return
    let lcp = 0, cls = 0, worst = 0
    const obs: PerformanceObserver[] = []
    // The fields read here differ by entry type (LCP, layout shift, event timing); none is in every DOM typing.
    type Entry = PerformanceEntry & { hadRecentInput?: boolean; value?: number }
    const observe = (type: string, fn: (e: Entry) => void, extra: Record<string, unknown> = {}) => {
      try {
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => fn(e as Entry)))
        po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
        obs.push(po)
      } catch { /* this browser lacks the metric; the others still report */ }
    }
    observe('largest-contentful-paint', (e) => { lcp = e.startTime })
    observe('layout-shift', (e) => { if (!e.hadRecentInput) cls += e.value ?? 0 })
    // The worst interaction the reader had: a fair stand-in for INP, named honestly rather than called INP.
    observe('event', (e) => { if (e.duration > worst) worst = e.duration }, { durationThreshold: 40 })
    let sent = false
    const report = () => {
      if (sent || document.visibilityState !== 'hidden') return
      sent = true
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      track(EVENTS.WEB_VITAL, {
        lcp_ms: Math.round(lcp), cls: Math.round(cls * 1000) / 1000, interaction_worst_ms: Math.round(worst),
        ttfb_ms: nav ? Math.round(nav.responseStart) : undefined,
        page_location: safeUrl(location.href),
      })
    }
    document.addEventListener('visibilitychange', report)
    window.addEventListener('pagehide', report)
    return () => {
      obs.forEach((o) => { try { o.disconnect() } catch { /* gone */ } })
      document.removeEventListener('visibilitychange', report)
      window.removeEventListener('pagehide', report)
    }
  }, [])

  return null
}
