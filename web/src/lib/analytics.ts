// Every measurement this site takes, in one file.
//
// WHY THIS FILE EXISTS AGAIN
// The old site (ap-nadu-nedu/src/lib/analytics.js) counted readers with Google Analytics 4. When the
// new site replaced it in web/, nothing carried the counting across: no tag, no measurement id, and a
// security policy (firebase.web.json) that would have blocked the tag anyway. Visits went uncounted
// from the redesign until this file came back (found 28 Oct 2026). So two guards now stand around it:
// the measurement id lives here in code, not in an env file that a new folder can forget, and
// scripts/check_dist.mjs refuses a deploy whose build does not carry it.
//
// WHAT IS NEVER SENT. This list is the point, not a footnote, and the privacy page promises it.
//  - Search words. The search box sends that a search happened and whether anything matched, never what
//    was typed. On a site about Andhra Pradesh politics, a reader's words are the most sensitive thing
//    they produce here.
//  - The `q` parameter, removed from every recorded address, so a search typed into the address bar
//    cannot leak through the page's location either.
//  - Anything identifying: no user id, no email, no phone, no text from the correction form or the board.
//  - Advertising signals. Ad storage and personalisation stay denied everywhere, for good.
//
// WHAT IS SENT, AND WHY
// Which kind of page (project, district, paper) and which one (613, eluru). A count of "someone opened a
// project" is a vanity number; knowing which works and districts people open is what should decide which
// portal we read next, and whether the site reaches beyond the cities. The site's language goes on every
// event as `site_language`, because how much Telugu is used is the question this site most needs answered.
// (Not `language`: GA4 keeps that name for the browser's own language and drops the parameter, which the
// browser check of 28 Oct 2026 caught. The old site lost its language numbers the same way.)
//
// WHERE IT COUNTS
// Only the public site. Previews (*.web.app), local runs, the one-file preview build, crawlers, readers
// who switched counting off and browsers sending Global Privacy Control send nothing at all.
import { PREVIEW } from '@/lib/preview'

/** The site's GA4 web stream. Public by nature: it is printed in the page source of every site that uses GA.
 *  VITE_GA_MEASUREMENT_ID overrides it; setting that to an empty string switches counting off in a build. */
export const MEASUREMENT_ID: string = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? 'G-T80VZ3SMED').trim()
const DEBUG = import.meta.env.VITE_ANALYTICS_DEBUG === 'true'

/** Countries where the analytics cookie is refused outright: the EEA thirty, the UK and Switzerland.
 *  Google matches the visitor to one of them from the IP address, so this needs no location lookup of our
 *  own. There the counting still happens, cookieless, which is what the law there expects when nobody has
 *  been asked, and why no cookie banner stands between a citizen and a public record. */
export const CONSENT_DENIED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT',
  'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS',
  'GB', 'CH',
]

/** The catalogue. An event that is not here cannot be sent: a typo that reaches GA becomes a second event
 *  that quietly splits a year of numbers in two. GA4 names: snake_case, 40 characters at most. */
export const EVENTS = {
  PAGE_VIEW: 'page_view',
  LANGUAGE_CHANGED: 'language_changed',
  // The site's core promise: every figure links to a government paper. If this stays low, the citations
  // are decoration and we need to know.
  SOURCE_CLICK: 'source_click',
  DOCUMENT_OPEN: 'document_open',
  SEARCH_PERFORMED: 'search_performed',
  SEARCH_RESULT_CLICK: 'search_result_click',
  SHARE_OPENED: 'share_opened',
  SHARE_TEXT_COPIED: 'share_text_copied',
  ROUTE_NOT_FOUND: 'route_not_found',
  WEB_VITAL: 'web_vital',
  // Reserved for the voice and news modules, so their numbers start in the same catalogue.
  VOICE_STARTED: 'voice_started',
  NEWS_OPENED: 'news_opened',
} as const
export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
const KNOWN = new Set<string>(Object.values(EVENTS))

type Params = Record<string, string | number | boolean | undefined>
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean | undefined }
  interface Navigator { globalPrivacyControl?: boolean; deviceMemory?: number; connection?: { effectiveType?: string; saveData?: boolean } }
}

/* ------------------------------------------------------------ bots */
// Crawlers read this site constantly; counting them as readers inflates every number, and decisions made
// on inflated numbers are worse than none. Conservative on purpose: a headless browser counted as a person
// is a smaller error than a real reader dropped on a device we guessed wrong about. GA4 filters known bots
// on its side too; this is the first pass.
const BOT_UA = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|pingdom|monitor|scrapy|curl|wget|python-requests|axios|facebookexternalhit|whatsapp|telegram/i

export function looksAutomated(nav: Partial<Navigator> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  scr: { width: number; height: number } | undefined = typeof screen === 'undefined' ? undefined : screen): boolean {
  if (!nav) return true
  if (nav.webdriver) return true
  if (BOT_UA.test(nav.userAgent || '')) return true
  // A real browser reports at least one language and a screen with a size.
  if (!nav.languages || nav.languages.length === 0) return true
  if (scr && (scr.width === 0 || scr.height === 0)) return true
  return false
}

/* ------------------------------------------------------------ where counting is allowed */
/** True only on the public site: a production build with real addresses, served over https, not a preview. */
export function isPublicSite(): boolean {
  if (!import.meta.env.PROD || import.meta.env.VITE_ROUTES !== 'path') return false
  if (typeof location === 'undefined' || location.protocol !== 'https:') return false
  return !PREVIEW
}

/* ------------------------------------------------------------ the reader's own switch */
const OPTOUT_KEY = 'apfc-analytics-optout'

/** Global Privacy Control is honoured: a person turns it on for themselves. Do Not Track is not: browsers
 *  switched it on by default, so it says more about a vendor than about the reader, and honouring it would
 *  quietly remove a slice of real readers from the numbers for a reason nobody could see. */
export function isOptedOutByBrowser(): boolean {
  try { return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true } catch { return false }
}
function storedOptOut(): boolean {
  // Storage blocked (private mode, hardened settings) reads as "not opted out": nobody asked us to stop,
  // and a browser that blocks storage blocks the analytics cookie too.
  try { return localStorage.getItem(OPTOUT_KEY) === '1' } catch { return false }
}
export function isOptedOut(): boolean { return isOptedOutByBrowser() || storedOptOut() }

/* ------------------------------------------------------------ addresses */
/** The address as recorded: the reader's own words (`q`) removed, the app's own parameters kept. */
export function safeUrl(href: string): string {
  try {
    const u = new URL(href)
    u.searchParams.delete('q')
    u.hash = ''
    return u.toString()
  } catch { return '' }
}

/** A document a reader would open and read, as opposed to another web page. */
export const DOC_EXT = /\.(pdf|xlsx?|docx?|csv|pptx?|zip)(?:[?#]|$)/i
/** Anything published by a government, wherever it is hosted (CAG's files sit on a CloudFront address). */
export const GOV_HOST = /(^|\.)(gov\.in|nic\.in|rbi\.org\.in|d1jmc0u14z2tmp\.cloudfront\.net)$/i
const S3_GOV = /^s3\.[a-z0-9-]+\.amazonaws\.com$/i   // AP Finance serves its books from S3, path apfinance.gov.in/...

/** What a click on an outbound link says, or null for a link that stays on this site. Only the portal is
 *  kept, never the file's address: enough to learn which sources readers follow, without a per-reader trail
 *  of documents. */
export function describeOutbound(rawHref: string, here: string): { portal: string; is_government: boolean; is_document: boolean; file_type?: string } | null {
  let url: URL
  try { url = new URL(rawHref, here) } catch { return null }
  if (!/^https?:$/.test(url.protocol)) return null
  if (url.host === new URL(here).host) return null
  const s3gov = S3_GOV.test(url.hostname) && url.pathname.startsWith('/apfinance.gov.in/')
  const doc = DOC_EXT.exec(url.pathname)
  return {
    portal: s3gov ? 'apfinance.gov.in' : url.hostname.replace(/^www\./, ''),
    is_government: s3gov || GOV_HOST.test(url.hostname),
    is_document: Boolean(doc),
    ...(doc ? { file_type: doc[1].toLowerCase() } : {}),
  }
}

/* ------------------------------------------------------------ state */
let started = false     // start() has run
let live = false        // events may be sent
let context: Params = {}

function deviceContext(): Params {
  // Readers in the districts are not on the developer's wifi. Connection type is what should set the
  // performance budget; without it every "is this fast enough" is judged from a laptop.
  const out: Params = {}
  try {
    const c = navigator.connection
    if (c?.effectiveType) out.connection = c.effectiveType
    if (typeof c?.saveData === 'boolean') out.save_data = c.saveData
    if (typeof navigator.deviceMemory === 'number') out.device_memory = navigator.deviceMemory
    out.viewport_w = window.innerWidth
  } catch { /* context is a nicety; it never stops an event */ }
  return out
}

/* ------------------------------------------------------------ provider: GA4, the only part that knows Google */
function setUpGtag(id: string) {
  window.dataLayer = window.dataLayer || []
  // gtag reads the `arguments` object itself, not an array copy: this is Google's own snippet, typed.
  window.gtag = function gtag() { window.dataLayer!.push(arguments) }  // eslint-disable-line prefer-rest-params
  // Consent Mode v2, set before anything is sent. The default with a region applies in those countries,
  // the one without applies everywhere else. Analytics storage is granted outside the listed regions: an
  // earlier build of the old site denied it everywhere, and Google then accepted every hit and counted
  // none, an empty report that looks exactly like having no readers.
  const ads = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }
  window.gtag('consent', 'default', { ...ads, analytics_storage: 'denied', region: CONSENT_DENIED_REGIONS, wait_for_update: 500 })
  window.gtag('consent', 'default', { ...ads, analytics_storage: 'granted', wait_for_update: 500 })
  window.gtag('set', 'allow_google_signals', false)
  window.gtag('set', 'allow_ad_personalization_signals', false)
  window.gtag('js', new Date())
  window.gtag('config', id, {
    send_page_view: false,          // sent by hand on every route change (components/measure.tsx)
    transport_type: 'beacon',
    // Ninety days, not Google's two years, as the privacy page says: long enough to tell a returning
    // reader across a season, short enough that a browser left alone forgets this site.
    cookie_expires: 60 * 60 * 24 * 90,
    cookie_flags: 'SameSite=Lax;Secure',
  })
}

/** The tag itself is fetched only after the page has loaded and gone idle, so it never competes with the
 *  first paint on a slow phone. Events raised before then wait in dataLayer, which gtag reads on arrival. */
function loadTagWhenIdle(id: string) {
  const insert = () => {
    if (document.getElementById('ga4') || !live) return
    const s = document.createElement('script')
    s.id = 'ga4'
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    // A blocked or failed tag must never be a page problem. Events keep going into dataLayer, which is
    // harmless, and nothing retries.
    s.onerror = () => { if (DEBUG) console.info('[analytics] tag blocked or failed to load') }
    document.head.appendChild(s)
  }
  const idle = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (ric) ric(insert, { timeout: 4000 })
    else setTimeout(insert, 1500)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

function send(name: string, params: Params) {
  try { window.gtag?.('event', name, params) } catch (err) { if (DEBUG) console.warn('[analytics] send failed', name, err) }
}

/* ------------------------------------------------------------ public API */
/** Starts counting if, and only if, this is the public site and the reader has not asked us not to. */
export function start(extra: Params = {}) {
  if (started) return
  started = true
  context = { ...deviceContext(), ...extra }
  if (!MEASUREMENT_ID) { if (DEBUG) console.info('[analytics] no measurement id, inert'); return }
  if (!isPublicSite()) { if (DEBUG) console.info('[analytics] not the public site, inert'); return }
  if (looksAutomated()) { if (DEBUG) console.info('[analytics] automated client, inert'); return }
  if (isOptedOut()) {
    // gtag's own kill switch, set before the tag could load: an opted-out reader makes no request at all.
    window[`ga-disable-${MEASUREMENT_ID}`] = true
    if (DEBUG) console.info('[analytics] reader opted out, inert')
    return
  }
  live = true
  setUpGtag(MEASUREMENT_ID)
  loadTagWhenIdle(MEASUREMENT_ID)
}

/** Flip the reader's switch, effective now. Returns false when the choice could not be saved, so the page
 *  can tell the reader the truth instead of showing a switch that quietly forgets. */
export function setOptedOut(off: boolean): boolean {
  let saved = true
  try { if (off) localStorage.setItem(OPTOUT_KEY, '1'); else localStorage.removeItem(OPTOUT_KEY) } catch { saved = false }
  if (MEASUREMENT_ID && typeof window !== 'undefined') window[`ga-disable-${MEASUREMENT_ID}`] = off
  if (off) { live = false; return saved }
  // Back on: only where counting would otherwise happen.
  if (started && MEASUREMENT_ID && isPublicSite() && !looksAutomated() && !isOptedOutByBrowser()) {
    live = true
    if (!window.gtag) setUpGtag(MEASUREMENT_ID)
    loadTagWhenIdle(MEASUREMENT_ID)
  }
  return saved
}

/** True while events are being sent. The privacy page shows this, so the reader sees the real state. */
export const isCounting = () => live

/** Dimensions added to every later event (the language, for instance). */
export function setContext(patch: Params) { context = { ...context, ...patch } }

/** The single way anything in this app records anything. Unknown names are refused, not sent. */
export function track(name: EventName, params: Params = {}) {
  if (!KNOWN.has(name)) { if (DEBUG) console.warn(`[analytics] unknown event "${name}", not sent`); return }
  const payload = { ...context, ...params }
  if (!live) { if (DEBUG) console.info('[analytics:inert]', name, payload); return }
  send(name, payload)
}
