/**
 * Every measurement this platform takes, in one file.
 *
 * WHY ONE FILE
 * Analytics rots when event names are typed as strings at fifty call sites: two
 * spellings of the same event, nobody sure which is live, and a year of data
 * that cannot be compared with itself. Here the catalogue IS the code. If an
 * event is not in EVENTS below, it cannot be sent.
 *
 * WHY A PROVIDER ADAPTER
 * GA4 is behind `send()`. Everything else in the app calls `track(EVENTS.x, …)`
 * and knows nothing about Google. Moving to Plausible, Umami or a counter of
 * our own later is this file, not the fifty call sites.
 *
 * WHAT IT DOES WITH NO MEASUREMENT ID
 * Nothing at all. No script is loaded, no request is made, `track()` returns
 * immediately. That is deliberate: this ships completely inert and is switched
 * on by setting VITE_GA_MEASUREMENT_ID, so the code can be reviewed and
 * deployed without changing a single reader's experience.
 *
 * WHAT IS NEVER SENT. This list is the point, not a footnote.
 *   · Search terms. `search_performed` counts that someone searched, never for
 *     what. On a platform about Andhra Pradesh politics, a reader's search
 *     terms are the most sensitive thing they produce here, and shipping them
 *     to a third party is not a trade this site should make.
 *   · The `q` query parameter, stripped from every recorded path, because the
 *     search page carries the typed text in the URL and GA4 records full paths
 *     by default.
 *   · Anything identifying: no user ids, no emails, no free text from forms.
 *   · Correction and community text.
 *
 * WHAT IS SENT, AND WHY IT MATTERS
 * Item identity: which project, which district, which document, which portal.
 * Counting that "someone opened a project" is a vanity number; knowing WHICH
 * projects and districts people open is what should decide which portals get
 * scraped next. That is the difference between a dashboard and editorial
 * direction, and it is the main reason to do this at all.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || ''
const DEBUG = import.meta.env.VITE_ANALYTICS_DEBUG === 'true'

/**
 * The countries where the analytics cookie is refused outright.
 *
 * Google matches a visitor to one of these from their IP address, so this list
 * needs no geo detection of our own and no extra request. In these countries
 * the counting still happens, without a cookie and without a lasting
 * identifier, which is what the law there expects when nobody has been asked.
 * Everywhere else the cookie is written and the reports are actually usable.
 *
 * This is the EEA thirty, plus the United Kingdom and Switzerland. Kept as one
 * named list rather than inlined, so the consent block below reads as a
 * decision instead of a wall of country codes.
 */
const CONSENT_DENIED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT',
  'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS',
  'GB', 'CH',
]

/**
 * The catalogue. Adding an event means adding it here first.
 *
 * GA4 names must be snake_case, <= 40 chars, and must not start with a reserved
 * prefix (google_, ga_, firebase_). Kept short because GA4 truncates.
 */
export const EVENTS = {
  // ---- reader behaviour ------------------------------------------------
  PAGE_VIEW: 'page_view',
  LANGUAGE_CHANGED: 'language_changed',
  // The platform's core promise: every figure links to a government document.
  // If this number is low, the citations are decoration and we need to know.
  SOURCE_CLICK: 'source_click',
  DOCUMENT_OPEN: 'document_open',
  SEARCH_PERFORMED: 'search_performed',
  SEARCH_ZERO_RESULTS: 'search_zero_results',
  SEARCH_RESULT_CLICK: 'search_result_click',
  DISTRICT_OPENED: 'district_opened',
  PROJECT_OPENED: 'project_opened',
  FILTER_APPLIED: 'filter_applied',
  ADVANCED_VIEW_OPENED: 'advanced_view_opened',
  CHART_EXPANDED: 'chart_expanded',
  TENDERS_TAB: 'tenders_tab',
  TENURE_COMPARED: 'tenure_compared',
  CORRECTION_SUBMITTED: 'correction_submitted',
  // A project's story in steps sent on as a picture, and how: the share
  // sheet, a download, or the link copied. The picture exists so the record
  // can travel in WhatsApp groups; if this stays near zero, it is not.
  PICTURE_SHARED: 'picture_shared',

  // ---- health: this week's failures, made visible ------------------------
  SECTION_FAILED: 'section_failed',
  CHUNK_RELOAD: 'chunk_reload',
  API_ERROR: 'api_error',
  API_SLOW: 'api_slow',
  ROUTE_NOT_FOUND: 'route_not_found',

  // ---- performance and content quality -----------------------------------
  WEB_VITAL: 'web_vital',
  // A page told a reader there is nothing here. News says "No articles
  // collected yet" to every visitor today and nothing counts how many saw it.
  DATA_GAP_SEEN: 'data_gap_seen',
}

const KNOWN_EVENTS = new Set(Object.values(EVENTS))

// --------------------------------------------------------------------------
// Bots
// --------------------------------------------------------------------------

/**
 * A public data site is crawled constantly. Counting crawlers as readers
 * inflates every number here, and decisions made on inflated numbers are worse
 * than decisions made on none. So this runs before anything else and, when it
 * says bot, the whole module stays asleep.
 *
 * Deliberately conservative: it is better to count a headless browser as a
 * person than to silently drop a real reader on a device we guessed wrong
 * about. GA4 also filters known bots server-side; this is the first pass.
 */
const BOT_UA = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|pingdom|monitor|scrapy|curl|wget|python-requests|axios|facebookexternalhit|whatsapp|telegram|preview/i

function looksAutomated() {
  if (typeof navigator === 'undefined') return true
  if (navigator.webdriver) return true
  if (BOT_UA.test(navigator.userAgent || '')) return true
  // A real browser reports at least one language and a screen with size.
  if (!navigator.languages || navigator.languages.length === 0) return true
  if (typeof screen !== 'undefined' && (screen.width === 0 || screen.height === 0)) return true
  return false
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

let ready = false
let disabled = true
let queue = []          // events raised before gtag finished loading
let context = {}        // dimensions attached to every event

const canSend = () => !disabled && Boolean(MEASUREMENT_ID)

// --------------------------------------------------------------------------
// The reader's own switch
// --------------------------------------------------------------------------

const OPTOUT_KEY = 'apnn.analytics.optout'

/**
 * Global Privacy Control is honoured. Do Not Track is not, and the difference
 * is deliberate rather than lazy.
 *
 * GPC is a signal a person turns on for themselves, and several jurisdictions
 * treat it as a binding request. DNT ended up switched on by default in whole
 * browsers and browsing modes, which made it a statement about a vendor rather
 * than about the person at the screen; honouring it would quietly delete a
 * slice of real readers from the numbers for a reason nobody could see, which
 * is the failure mode this platform can least afford. If DNT ever regains a
 * meaning its default does not contradict, this is the one line to change.
 */
function browserAsksNot() {
  try {
    return navigator.globalPrivacyControl === true
  } catch {
    return false
  }
}

function storedOptOut() {
  try {
    return localStorage.getItem(OPTOUT_KEY) === '1'
  } catch {
    // Storage blocked (private mode, hardened settings). Reading this as "not
    // opted out" is the honest answer. Nobody has asked us to stop, and it
    // is the only reading that does not silently empty the reports for every
    // reader browsing privately. Nothing is written to their device either
    // way: a browser that blocks storage blocks the analytics cookie too.
    return false
  }
}

/** True when nothing should be measured for this reader, for any reason. */
export function isOptedOut() {
  return browserAsksNot() || storedOptOut()
}

/** True when the browser decided it, so the page can say so instead of
 *  showing a switch the reader does not actually control. */
export function isOptedOutByBrowser() {
  return browserAsksNot()
}

/**
 * Flip the switch, effective now rather than on the next page load.
 *
 * Returns false when the choice could not be persisted, so the page can tell
 * the reader the truth instead of showing a control that quietly forgets.
 */
export function setOptedOut(next) {
  let stored = true
  try {
    if (next) localStorage.setItem(OPTOUT_KEY, '1')
    else localStorage.removeItem(OPTOUT_KEY)
  } catch {
    stored = false
  }
  applyOptOut(next)
  return stored
}

function applyOptOut(next) {
  if (typeof window === 'undefined' || !MEASUREMENT_ID) return
  // gtag's own documented kill switch. Set before the script loads, the script
  // is never fetched; set afterwards, the loaded library stops sending.
  window[`ga-disable-${MEASUREMENT_ID}`] = next === true
  if (next) {
    disabled = true
    queue = []
    return
  }
  // Turning it back on. `ready` means initAnalytics has run, so the reader is
  // on a page where measuring is otherwise appropriate; loadGtag is a no-op if
  // the script is already present.
  if (ready && !looksAutomated()) {
    disabled = false
    loadGtag(MEASUREMENT_ID)
  }
}

// Runs at import, before anything can load gtag, so an opted-out reader makes
// no request to Google at all. Not a blocked one, not a cancelled one, none.
if (typeof window !== 'undefined' && MEASUREMENT_ID && isOptedOut()) {
  window[`ga-disable-${MEASUREMENT_ID}`] = true
}

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

/**
 * The recorded path, with the reader's own words removed.
 *
 * /search?q=<whatever they typed> is a real URL on this site, and GA4 records
 * path AND query by default. `q` is dropped; the remaining parameters are the
 * app's own vocabulary (district, view, tenure) and are worth keeping because
 * they say how people navigate.
 */
export function safePath(pathname, search = '') {
  const params = new URLSearchParams(search)
  params.delete('q')
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}

// --------------------------------------------------------------------------
// Device context, attached to everything
// --------------------------------------------------------------------------

/**
 * Readers in the districts are not on the developer's wifi. Effective
 * connection type is what should decide the performance budget, and without it
 * every judgement about "is this fast enough" is made from a laptop.
 */
function deviceContext() {
  const out = {}
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (c) {
      if (c.effectiveType) out.connection = c.effectiveType      // '4g' | '3g' | '2g' | 'slow-2g'
      if (typeof c.saveData === 'boolean') out.save_data = c.saveData
    }
    if (typeof navigator.deviceMemory === 'number') out.device_memory = navigator.deviceMemory
    if (typeof screen !== 'undefined') out.viewport_w = window.innerWidth
  } catch {
    /* context is a nicety; never let it stop an event */
  }
  return out
}

// --------------------------------------------------------------------------
// Provider: GA4. The only part that knows what Google is.
// --------------------------------------------------------------------------

function loadGtag(id) {
  if (document.getElementById('ga4')) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }

  // Consent Mode v2, set before the script is even requested.
  //
  // Two defaults. A default carrying a region applies in those countries; the
  // one without a region applies to everybody else. Order does not matter to
  // Google, only to whoever reads this next.
  //
  // Advertising stays denied everywhere, permanently. This site sells nothing
  // and there is no future version of it that should be feeding an ad profile.
  //
  // Analytics storage is granted outside the listed regions. An earlier build
  // denied it everywhere. That sounded principled and in practice meant Google
  // accepted every hit and counted none of them: the property reported no data
  // collection at all, and an empty dashboard looks exactly like having no
  // readers. Counting people honestly, saying so plainly on the privacy page,
  // and giving them a switch that works is the better trade.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    region: CONSENT_DENIED_REGIONS,
    wait_for_update: 500,
  })
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
    wait_for_update: 500,
  })
  window.gtag('js', new Date())
  window.gtag('config', id, {
    send_page_view: false,        // fired by hand: this is a SPA, see Analytics.jsx
    anonymize_ip: true,
    transport_type: 'beacon',
    // Ninety days, not Google's two year default. Long enough to tell a
    // returning reader from a new one across a season, short enough that a
    // browser left alone forgets this site on its own. Two years of memory is
    // not something this site needs in order to answer its own questions.
    cookie_expires: 60 * 60 * 24 * 90,
    cookie_flags: 'SameSite=Lax;Secure',
  })

  const s = document.createElement('script')
  s.id = 'ga4'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  // A blocked or failed analytics script must never be a page problem.
  s.onerror = () => { disabled = true; queue = [] }
  document.head.appendChild(s)
}

function send(name, params) {
  try {
    window.gtag('event', name, params)
  } catch (err) {
    // Analytics failing is not a reason for anything else to fail.
    if (DEBUG) console.warn('[analytics] send failed', name, err)
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export function initAnalytics(extraContext = {}) {
  if (ready) return
  ready = true
  context = { ...deviceContext(), ...extraContext }

  if (!MEASUREMENT_ID) {
    if (DEBUG) console.info('[analytics] no VITE_GA_MEASUREMENT_ID, inert')
    return
  }
  if (looksAutomated()) {
    if (DEBUG) console.info('[analytics] automated client, not measuring')
    return
  }
  if (isOptedOut()) {
    if (DEBUG) console.info('[analytics] reader opted out, not measuring')
    return
  }

  disabled = false
  loadGtag(MEASUREMENT_ID)

  const pending = queue
  queue = []
  pending.forEach(([name, params]) => send(name, params))
}

/** Dimensions added to every subsequent event (language, for instance). */
export function setContext(patch) {
  context = { ...context, ...patch }
}

/**
 * Upgrade Consent Mode once a reader agrees. Safe to call when inert.
 *
 * Nothing calls this today, and that is correct rather than an oversight.
 * Outside the denied regions consent already starts granted, so there is
 * nothing to upgrade. This is the hook a European consent prompt would use if
 * this site ever needs one, and it is one line of dead code against having to
 * rediscover how the upgrade works under time pressure.
 */
export function grantConsent() {
  if (!canSend()) return
  try {
    window.gtag('consent', 'update', { analytics_storage: 'granted' })
  } catch { /* nothing to do */ }
}

/**
 * The single way anything in this app records anything.
 *
 * Unknown names are refused rather than sent, because a typo that reaches GA4
 * becomes a permanent second event that quietly splits a year of data in two.
 */
export function track(name, params = {}) {
  if (!KNOWN_EVENTS.has(name)) {
    if (DEBUG) console.warn(`[analytics] unknown event "${name}", not sent`)
    return
  }
  const payload = { ...context, ...params }
  if (!canSend()) {
    if (DEBUG) console.info('[analytics:inert]', name, payload)
    // Hold a short queue only while the script is still loading. Unbounded
    // queueing in an inert build would be a slow memory leak for no purpose.
    if (MEASUREMENT_ID && ready === false && queue.length < 50) queue.push([name, payload])
    return
  }
  send(name, payload)
}

/** Exposed for tests and for the debug flag; not used by the app. */
export const __internals = { looksAutomated, safePath, KNOWN_EVENTS }
