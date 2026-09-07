import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { EVENTS, initAnalytics, safePath, setContext, track } from '../lib/analytics'
import { ROUTE_PATTERNS } from '../lib/routes'
import { useT } from '../i18n'

/**
 * Mounted once, inside the router. Everything measured from a single place
 * rather than sprinkled through the app.
 *
 * Four jobs:
 *   1. page_view on every route change. This is a SPA, so GA4's automatic
 *      page view fires once on load and never again. send_page_view is off in
 *      analytics.js precisely so this can do it correctly.
 *   2. Outbound clicks, by delegation. Every figure on this site links back to
 *      a government document; instrumenting each of those links individually
 *      would mean touching fifty components and missing the fifty-first. One
 *      listener on the document catches all of them, including links added
 *      later by someone who never reads this file.
 *   3. Real performance from real devices. We have spent this week guessing
 *      whether pages are fast on a phone in a district; these are the actual
 *      numbers.
 *   4. Routes that match nothing.
 *
 * It renders nothing and, with no measurement id configured, does nothing.
 */

// The route list used to live here, hand-copied from App.jsx, and its own
// comment recorded the cost: it had drifted before a single event was sent,
// naming four routes that did not exist and missing five that did, so five
// working pages would have reported themselves as route_not_found. A report
// meant to reveal broken links, arriving full of false ones, gets ignored.
//
// It now comes from src/lib/routes.js, which App.jsx is tested against. The
// copy is gone rather than corrected, because a second copy drifts again by
// construction.
function matchesKnownRoute(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  return ROUTE_PATTERNS.some(pattern => {
    const want = pattern.replace(/\/+$/, '').split('/').filter(Boolean)
    if (want.length !== parts.length) return false
    return want.every((seg, i) => seg.startsWith(':') || seg === parts[i])
  })
}

/** A document a reader would open and read, as opposed to another web page. */
const DOC_EXT = /\.(pdf|xlsx?|docx?|csv|pptx?)(\?|#|$)/i
/** Anything published by a government, wherever it is hosted. */
const GOV_HOST = /(^|\.)(gov\.in|nic\.in|rbi\.org\.in|cag\.gov\.in|niti\.gov\.in)$/i

export default function Analytics() {
  const location = useLocation()
  const { lang } = useT()
  const started = useRef(false)
  const lastPath = useRef(null)

  // Start once. Language is a dimension on every event from the beginning,
  // because "which of the six languages is actually used" is the question this
  // whole exercise most needs to answer.
  useEffect(() => {
    if (started.current) return
    started.current = true
    initAnalytics({ language: lang })
  }, [lang])

  useEffect(() => { setContext({ language: lang }) }, [lang])

  // ---- 1. page views ----------------------------------------------------
  useEffect(() => {
    const path = safePath(location.pathname, location.search)
    // React can run an effect twice in development; a duplicated page view is
    // a permanently doubled number, so the same path is never sent twice in a
    // row.
    if (lastPath.current === path) return
    lastPath.current = path

    track(EVENTS.PAGE_VIEW, { page_path: path, page_location: window.location.origin + path })

    if (!matchesKnownRoute(location.pathname)) {
      track(EVENTS.ROUTE_NOT_FOUND, { page_path: path })
    }
  }, [location.pathname, location.search])

  // ---- 2. outbound and document clicks ----------------------------------
  useEffect(() => {
    const onClick = event => {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor) return
      let url
      try {
        url = new URL(anchor.getAttribute('href'), window.location.href)
      } catch {
        return
      }
      if (url.host === window.location.host) return          // internal navigation

      const isDoc = DOC_EXT.test(url.pathname)
      const isGov = GOV_HOST.test(url.hostname)

      // The portal, not the full URL: enough to learn which sources readers
      // actually follow, without recording a per-reader trail of documents.
      track(EVENTS.SOURCE_CLICK, {
        portal: url.hostname,
        is_government: isGov,
        is_document: isDoc,
        from_path: safePath(location.pathname, location.search),
      })
      if (isDoc) {
        track(EVENTS.DOCUMENT_OPEN, { portal: url.hostname, file_type: (url.pathname.match(DOC_EXT) || [, ''])[1].toLowerCase() })
      }
    }
    // Capture phase, and auxclick too, so a middle-click into a new tab counts
    // the same as a left click, which is how people open sources to compare.
    document.addEventListener('click', onClick, true)
    document.addEventListener('auxclick', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('auxclick', onClick, true)
    }
  }, [location.pathname, location.search])

  // ---- 3. web vitals, measured natively ---------------------------------
  //
  // No library. The project has three dependencies and keeping it that way is
  // worth more than the few conveniences web-vitals adds; PerformanceObserver
  // gives the same numbers in about forty lines.
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return
    let lcp = 0
    let cls = 0
    let slowestInteraction = 0
    const observers = []

    const observe = (type, handler, options) => {
      try {
        const po = new PerformanceObserver(list => list.getEntries().forEach(handler))
        po.observe({ type, buffered: true, ...options })
        observers.push(po)
      } catch {
        /* the browser does not support this metric; the others still report */
      }
    }

    observe('largest-contentful-paint', e => { lcp = e.startTime })
    observe('layout-shift', e => { if (!e.hadRecentInput) cls += e.value })
    // A fair proxy for INP: the worst interaction the reader had. True INP is a
    // high percentile of all interactions, so this is named honestly rather
    // than reported as INP.
    observe('event', e => { if (e.duration > slowestInteraction) slowestInteraction = e.duration },
            { durationThreshold: 40 })

    // Reported once, when the page goes away. That is the only moment these
    // numbers are final.
    let sent = false
    const report = () => {
      if (sent || document.visibilityState !== 'hidden') return
      sent = true
      const nav = performance.getEntriesByType('navigation')[0]
      track(EVENTS.WEB_VITAL, {
        lcp_ms: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000,
        interaction_worst_ms: Math.round(slowestInteraction),
        ttfb_ms: nav ? Math.round(nav.responseStart) : undefined,
        page_path: safePath(window.location.pathname, window.location.search),
      })
    }
    document.addEventListener('visibilitychange', report)
    window.addEventListener('pagehide', report)
    return () => {
      observers.forEach(o => { try { o.disconnect() } catch { /* already gone */ } })
      document.removeEventListener('visibilitychange', report)
      window.removeEventListener('pagehide', report)
    }
  }, [])

  return null
}
