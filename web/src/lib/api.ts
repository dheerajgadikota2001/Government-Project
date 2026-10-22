// The one place the site talks to the backend.
//
// Rules this file keeps, because the site is a public record and many readers are on weak networks:
//
// 1. It never invents data. If the server cannot be reached it throws, and the page says so in plain
//    words. There is no baked-in fallback for live data (tenders, the refresh log, the community board),
//    because an old copy shown as current would break the promise the site makes.
// 2. Every read carries a short data-version stamp, so when a figure is corrected on the server every
//    cached copy in the world stops being asked for at once. Firebase Hosting cannot purge dynamic
//    responses, so this is the correction path.
// 3. A read is tried twice before it fails, and gives up after 12 seconds. A village phone often drops
//    the first request; a second try a moment later usually works. Writes are tried once, because a
//    repeated post would be a duplicate post.
// 4. The same read asked twice at once costs one request. A read answered in the last five minutes is
//    handed back from memory, so moving between sections feels instant. Community pages are never kept:
//    someone who has just posted must see their post.
//
// In production the site and the API share one address (Firebase forwards /api/** to Cloud Run), so the
// base is relative and there is no cross-origin traffic at all.

const BASE: string = ((import.meta.env.VITE_API_URL as string | undefined) || '/api/v1').replace(/\/$/, '')

export const TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 700
const CACHE_TTL_MS = 5 * 60 * 1000

export class ApiError extends Error {
  status: number | null
  /** The server's short error code, for example "rate_limited" or "blocked_language". */
  detail: string | null
  /** True when the request never got an answer (offline, timed out, server down). */
  unreachable: boolean
  constructor(message: string, o: { status?: number | null; detail?: string | null; unreachable?: boolean } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = o.status ?? null
    this.detail = o.detail ?? null
    this.unreachable = o.unreachable ?? false
  }
}

/** The server said "no such thing". FastAPI answers 422 to a malformed id, which to a reader is the same fact. */
export const isNotFound = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 422)

type Params = Record<string, string | number | boolean | null | undefined>

function urlFor(path: string, params: Params = {}): URL {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = new URL(BASE + path, origin)
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v))
  return url
}

/* ------------------------------------------------------------------ data-version stamp */
let stamp: string | null = null
let stampRequest: Promise<string> | null = null

function fetchStamp(): Promise<string> {
  return (stampRequest ??= fetch(BASE + '/meta/version', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => (stamp = typeof b?.version === 'string' ? b.version : ''))
    .catch(() => (stamp = '')))   // never let cache-busting break a page: no stamp just means the normal timers apply
}
// Started the moment this module loads, so by the time a page asks for data the stamp has usually arrived.
if (typeof window !== 'undefined') void fetchStamp()

/* ------------------------------------------------------------------ one attempt, with a time limit */
async function attempt(url: URL, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } catch {
    throw new ApiError(ctl.signal.aborted ? 'The server took too long to answer.' : 'Could not reach the server.', { unreachable: true })
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ reads */
const cache = new Map<string, { at: number; body: unknown }>()
const flying = new Map<string, Promise<unknown>>()

/** Drop every kept answer. Called after a write, since a write can change what any read returns. */
export function clearApiCache() { cache.clear() }

export async function apiGet<T = unknown>(path: string, params: Params = {}): Promise<T> {
  const url = urlFor(path, params)
  if (stamp === null) await fetchStamp()
  if (stamp) url.searchParams.set('v', stamp)
  const key = url.toString()
  const keep = !path.startsWith('/community')

  const hit = keep ? cache.get(key) : undefined
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body as T
  const joined = flying.get(key)
  if (joined) return joined as Promise<T>

  const run = (async () => {
    let last: ApiError | null = null
    for (let i = 0; i < 2; i++) {
      if (i) await sleep(RETRY_DELAY_MS)
      try {
        const res = await attempt(url, { headers: { Accept: 'application/json' } })
        if (res.ok) {
          // A page of HTML where data was expected means a wrong address or a proxy in the way, not data.
          const body = await res.json().catch(() => { throw new ApiError('The server answered with something that is not data.', { status: res.status }) })
          if (keep) cache.set(key, { at: Date.now(), body })
          return body as T
        }
        // 502, 503 and 504 come from the gateway in front of the API: the API itself did not answer.
        last = new ApiError(`The server answered with an error (${res.status}).`, { status: res.status, unreachable: res.status >= 502 && res.status <= 504 })
        if (res.status < 500) break          // a 4xx will not change on a second try
      } catch (e) {
        last = e as ApiError
      }
    }
    throw last ?? new ApiError('Could not reach the server.', { unreachable: true })
  })()
  flying.set(key, run)
  try { return await run } finally { flying.delete(key) }
}

/* ------------------------------------------------------------------ writes: one attempt only */
async function detailOf(res: Response): Promise<string | null> {
  try { const d = (await res.json())?.detail; return typeof d === 'string' ? d : null } catch { return null }
}

export async function apiPost<T = unknown>(path: string, body: unknown = {}): Promise<T | null> {
  const res = await attempt(urlFor(path), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(`The server refused it (${res.status}).`, { status: res.status, detail: await detailOf(res) })
  clearApiCache()
  return res.status === 204 ? null : ((await res.json()) as T)
}

export async function apiDelete(path: string, params: Params = {}): Promise<void> {
  const res = await attempt(urlFor(path, params), { method: 'DELETE' })
  if (!res.ok) throw new ApiError(`The server refused it (${res.status}).`, { status: res.status, detail: await detailOf(res) })
  clearApiCache()
}

/** Every page of a list endpoint: the first page tells us how many there are, the rest load side by side. */
export async function apiGetAll<T>(path: string, params: Params = {}, pageSize = 100, maxPages = 20): Promise<{ items: T[]; total: number }> {
  const first = await apiGet<{ items: T[]; total: number; pages?: number }>(path, { ...params, page: 1, page_size: pageSize })
  const pages = Math.min(maxPages, Math.ceil(first.total / pageSize))
  if (pages <= 1) return { items: first.items, total: first.total }
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => apiGet<{ items: T[] }>(path, { ...params, page: i + 2, page_size: pageSize })))
  return { items: [...first.items, ...rest.flatMap((r) => r.items)], total: first.total }
}
