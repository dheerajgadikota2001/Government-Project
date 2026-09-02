/**
 * API client — the single place the frontend talks to the backend.
 *
 * Base URL comes from VITE_API_URL (set it in ap-nadu-nedu/.env for a
 * deployed backend); the default matches local dev with
 * `uvicorn app.main:app --reload --port 8001`.
 *
 * Design rule: this client never invents data. If the backend is down it
 * throws, and pages show an honest "backend unreachable" state — never a
 * fabricated fallback.
 */

export const API_BASE =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/v1'

/**
 * Data-version stamp — how a corrected figure reaches every reader at once.
 *
 * Responses are cached at the CDN edge for a few minutes, and Firebase Hosting
 * offers no way to purge dynamic content early. That is a problem for a platform
 * whose purpose is correcting the public record: without this, a fixed number
 * would keep being served from the edge until its timer ran out.
 *
 * Caches key on the whole URL including the query string. So we fetch a short
 * stamp derived from the backend's seed files and append it to every data
 * request. Reload the seeds and the stamp changes, which changes every cache key
 * at once — the stale responses are simply never asked for again.
 *
 * Fetched once per page load. If it fails we carry on without it: pages must
 * work even when this endpoint does not, and the only cost is falling back to
 * the normal expiry timers.
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
  const url = new URL(`${API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  // Append the data stamp so a seed reload invalidates every cached response.
  // The stamp endpoint is itself never cached, so this stays correct.
  if (dataVersion === null) await fetchDataVersion()
  if (dataVersion) url.searchParams.set('v', dataVersion)

  let response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (cause) {
    throw new ApiError(
      'Could not reach the backend API. Is the server running?',
      { cause },
    )
  }

  if (!response.ok) {
    throw new ApiError(`API request failed (HTTP ${response.status})`, {
      status: response.status,
    })
  }

  return response.json()
}

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
  return response.status === 204 ? null : response.json()
}

/** DELETE with query params (used for own-post removal with its secret token). */
export async function apiDelete(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`)
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
