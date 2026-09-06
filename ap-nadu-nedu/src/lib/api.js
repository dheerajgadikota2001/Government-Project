/**
 * API client: the single place the frontend talks to the backend.
 *
 * Base URL comes from VITE_API_URL (set it in ap-nadu-nedu/.env for a
 * deployed backend); the default matches local dev with
 * `uvicorn app.main:app --reload --port 8001`.
 *
 * Design rule: this client never invents data. If the backend is down it
 * throws, and pages show an honest "backend unreachable" state, never a
 * fabricated fallback.
 */

import { EVENTS, track } from './analytics'

export const API_BASE =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/v1'
// API_BASE may be RELATIVE in production ("/api/v1": Firebase Hosting forwards
// /api/** to Cloud Run, so site and API share one origin). `new URL()` needs a
// base for that case; passing the page's origin is a no-op for absolute bases.

/**
 * Data-version stamp: how a corrected figure reaches every reader at once.
 *
 * Responses are cached at the CDN edge for a few minutes, and Firebase Hosting
 * offers no way to purge dynamic content early. That is a problem for a platform
 * whose purpose is correcting the public record: without this, a fixed number
 * would keep being served from the edge until its timer ran out.
 *
 * Caches key on the whole URL including the query string. So we fetch a short
 * stamp derived from the backend's seed files and append it to every data
 * request. Reload the seeds and the stamp changes, which changes every cache key
 * at once, the stale responses are simply never asked for again.
 *
 * Fetched once per page load. If it fails we carry on without it: pages must
 * work even when this endpoint does not, and the only cost is falling back to
 * the normal expiry timers.
 *
 * TIMING MATTERS MORE THAN IT LOOKS. Every data request waits for this stamp,
 * so if the fetch only starts when the first page asks for data, that page
 * waits a whole extra round trip before its own request even leaves, measured
 * at 361 ms on the live site, on every single page load. The request is
 * therefore fired the moment this module is parsed, which is well before React
 * has mounted a page and asked for anything: by the time the first apiGet runs,
 * the stamp has normally already arrived and the await below costs nothing.
 */
let dataVersion = null
let versionRequest = null

function fetchDataVersion() {
  if (versionRequest) return versionRequest
  versionRequest = fetch(`${API_BASE}/meta/version`, {
    headers: { Accept: 'application/json' },
  })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      dataVersion = body?.version ?? ''
      return dataVersion
    })
    .catch(() => {
      // Never let cache-busting break page loads. An empty stamp means requests
      // go out unversioned and are subject to the normal cache timers.
      dataVersion = ''
      return dataVersion
    })
  return versionRequest
}

// Fired at import time, not on first use: see the note above. Nothing awaits
// it here; the promise is picked up by whichever request needs it first.
fetchDataVersion()

/**
 * A small in-memory cache, for the length of one visit.
 *
 * This is not a substitute for the CDN: it is what makes *moving around*
 * feel instant. Switching between sections remounts components, and each one
 * re-asked for data it had already been given seconds earlier. The browser's
 * own HTTP cache helps, but only after a round trip to check; this skips the
 * trip entirely.
 *
 * Five minutes, deliberately short. Anything longer and a reader who leaves a
 * tab open all afternoon is reading yesterday's page. Community threads are
 * excluded outright: someone who posts a comment must see it appear, and a
 * cached list would tell them their post vanished.
 */
// A request slower than this is worth knowing about. Three seconds is the
// point at which a reader on a phone assumes the page is broken.
const SLOW_REQUEST_MS = 3000

const CACHE_TTL_MS = 5 * 60 * 1000
const responseCache = new Map()
const inFlight = new Map()

const isCacheable = path => !path.startsWith('/community')

/** Drop everything cached: call after a write that changes what reads return. */
export function clearApiCache() {
  responseCache.clear()
}

export class ApiError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cause = cause
  }
}

/**
 * GET a JSON endpoint. `params` object becomes the query string; null/empty
 * values are dropped so filters compose cleanly.
 */
export async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  // Append the data stamp so a seed reload invalidates every cached response.
  // The stamp endpoint is itself never cached, so this stays correct.
  if (dataVersion === null) await fetchDataVersion()
  if (dataVersion) url.searchParams.set('v', dataVersion)

  const key = url.toString()

  // Already answered this exact URL a moment ago, hand back the same object.
  // Moving between sections used to re-request identical data every time, so a
  // reader flipping between two tabs paid a round trip for something they had
  // just been shown. The stamp is part of the key, so a corrected figure still
  // invalidates this along with every other cache.
  const hit = responseCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body

  // Two components asking for the same endpoint at the same moment, the
  // Finances page and its charts both want /governments/, should cost one
  // request, not two. Whoever asks second joins the first request in flight.
  const flying = inFlight.get(key)
  if (flying) return flying

  const request = (async () => {
    let response
    // Measured here and nowhere else. Every read in the app comes through this
    // function, so one place records what readers actually experience, which
    // endpoints fail for them and how slow the API really is from a phone in a
    // district, rather than from a synthetic test on a fast connection.
    //
    // `path` only: never the full URL. The query string can carry a district or
    // a page number, and grouping by endpoint is what makes the numbers useful
    // anyway.
    const startedAt = Date.now()
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch (cause) {
      track(EVENTS.API_ERROR, { endpoint: path, status: 0, reason: 'unreachable' })
      throw new ApiError(
        'Could not reach the backend API. Is the server running?',
        { cause },
      )
    }

    if (!response.ok) {
      track(EVENTS.API_ERROR, { endpoint: path, status: response.status, reason: 'http' })
      throw new ApiError(`API request failed (HTTP ${response.status})`, {
        status: response.status,
      })
    }

    const body = await response.json()
    // Only the slow ones. Recording every successful call would be a lot of
    // traffic to say "it was fine"; the tail is where the problem lives.
    const elapsed = Date.now() - startedAt
    if (elapsed > SLOW_REQUEST_MS) {
      track(EVENTS.API_SLOW, { endpoint: path, duration_ms: elapsed })
    }
    if (isCacheable(path)) responseCache.set(key, { at: Date.now(), body })
    return body
  })()

  inFlight.set(key, request)
  try {
    return await request
  } finally {
    // Failures are never cached: the next attempt must really try again.
    inFlight.delete(key)
  }
}

/**
 * Did the server say "no such thing"? True for 404, and for 422 when the id in
 * the URL could never have matched: FastAPI answers 422 to /projects/abc
 * because "abc" is not an integer, and to a reader that is the same fact as
 * 404. Pages use this to show "not found" instead of "cannot reach the server",
 * which was the message /projects/abc produced on the live site on 6 Sep 2026.
 */
export function isNotFound(error) {
  return error?.status === 404 || error?.status === 422
}

/** Route ids for projects and news are database integers. Anything else is not
 *  a lookup worth making; the page can say "not found" without a round trip. */
export const isRecordId = value => /^\d{1,12}$/.test(String(value ?? ''))

/** POST JSON. Throws ApiError with `.detail` (backend's error code) on 4xx/5xx. */
export async function apiPost(path, body = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiError('Could not reach the backend API. Is the server running?', { cause })
  }
  if (!response.ok) {
    let detail = null
    try { detail = (await response.json()).detail } catch { /* not json */ }
    const err = new ApiError(`API request failed (HTTP ${response.status})`, { status: response.status })
    err.detail = detail
    throw err
  }
  // A write can change what any read returns, so the session cache is dropped
  // rather than guessed at. Writes are rare here, and a few extra requests
  // afterwards cost less than showing someone a list their own post is
  // missing from.
  clearApiCache()
  return response.status === 204 ? null : response.json()
}

/** DELETE with query params (used for own-post removal with its secret token). */
export async function apiDelete(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v)
  }
  const response = await fetch(url, { method: 'DELETE' })
  if (!response.ok) throw new ApiError(`API request failed (HTTP ${response.status})`, { status: response.status })
  return null
}

// ---- Documents ----

export const fetchDocuments = params => apiGet('/documents/', params)
export const fetchDocumentStats = () => apiGet('/documents/stats')
export const fetchDocumentFilters = () => apiGet('/documents/filters')

// ---- Projects (wired the same way once project data lands) ----

export const fetchProjects = params => apiGet('/projects/', params)
export const fetchProjectFilters = () => apiGet('/projects/filters')

// ---- School education (Government Orders Issue Register) ----

export const fetchSchoolEducation = () => apiGet('/school-education/')
export const fetchSchoolEducationConflicts = () => apiGet('/school-education/conflicts')
export const fetchSchoolEducationLargest = () => apiGet('/school-education/largest')
export const fetchSchoolEducationSchemeNames = () => apiGet('/school-education/scheme-names')
