// Live data for pages: tenders, the refresh log and the community board.
//
// A page asks for what it needs and is told one of three things: still loading, here it is, or it could
// not be reached. There is no fourth state in which an old copy is passed off as today's answer.
import * as React from 'react'
import { ApiError, apiGet, apiGetAll } from '@/lib/api'
import { istDay } from '@/lib/format'

export type Live<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: ApiError; retry: () => void }

/**
 * Run a loader when the component mounts (and again when `key` changes). A late answer for an old key is dropped.
 * With `refresh`, a new key re-reads the same thing (fresh counts after a post), so the answer already on screen
 * stays there until the new one arrives instead of flashing back to the loading look.
 */
export function useLive<T>(load: () => Promise<T>, key: string, { refresh = false }: { refresh?: boolean } = {}): Live<T> {
  const [state, setState] = React.useState<Live<T>>({ status: 'loading' })
  const [attempt, setAttempt] = React.useState(0)
  const loadRef = React.useRef(load)
  loadRef.current = load
  React.useEffect(() => {
    let current = true
    setState((s) => (refresh && s.status === 'ok' ? s : { status: 'loading' }))
    loadRef.current().then(
      (data) => { if (current) setState({ status: 'ok', data }) },
      (e) => { if (current) setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError('Something went wrong.', { unreachable: true }), retry: () => setAttempt((n) => n + 1) }) },
    )
    return () => { current = false }
  }, [key, attempt, refresh])
  return state
}

/* ------------------------------------------------------------------ tenders */
export type Tender = {
  id: number
  tender_id: string | null
  title: string
  title_telugu: string | null
  tender_type: string | null
  status: string
  district: string | null
  department: string | null
  estimated_value: number | null
  bid_submission_end: string
  published_date: string
  nit_number?: string | null
  source_portal?: string | null
}
export type TenderSummary = {
  total: number
  by_status: Record<string, number>
  portals: { portal: string; total: number; active: number }[]
  earliest_published: string | null
  latest_published: string | null
  /** Added to the API on 22 Oct 2026. Optional so the page still works against an API deployed before that. */
  read_on?: string
  open_today?: number
  closing_next_7_days?: { day: string; count: number }[]
}
export type TenderRegister = {
  summary: TenderSummary
  /** Notices whose last day to bid has not passed, in India time, soonest first. */
  open: Tender[]
  /** Every notice the register holds, open or closed. */
  all: Tender[]
  /** The India-time date this answer was read, so the page can print it. */
  readOn: string
}

/** Today in India time, from the reader's clock. */
export const todayIST = () => istDay(new Date().toISOString())

/**
 * Open means the last day to bid has not passed. The portal's own "active" flag can lag behind the
 * date, so the date decides. Every page that counts open notices uses this one function.
 */
export function isOpen(t: Tender, today = todayIST()) {
  return istDay(t.bid_submission_end) >= today
}

async function loadRegister(): Promise<TenderRegister> {
  const summary = await apiGet<TenderSummary>('/tenders/register/summary')
  // One list per status the register actually holds, so "all notices" really is all of them.
  const statuses = Object.entries(summary.by_status).filter(([, n]) => n > 0).map(([s]) => s)
  const lists = await Promise.all(statuses.map((status) => apiGetAll<Tender>('/tenders/', { status })))
  const all = lists.flatMap((l) => l.items)
  const today = todayIST()
  const open = all.filter((t) => isOpen(t, today)).sort((a, b) => String(a.bid_submission_end).localeCompare(String(b.bid_submission_end)))
  return { summary, open, all, readOn: today }
}

export const useTenders = () => useLive(loadRegister, 'tenders')

/** Only the counts: what Home needs, one small answer instead of every notice. */
export const useTenderSummary = () => useLive(() => apiGet<TenderSummary>('/tenders/register/summary'), 'tender-summary')

/* ------------------------------------------------------------------ the refresh log */
export type UpdateSource = { source: string; last_run: string; last_success: string | null; status: string }
export type UpdateRun = {
  run_id: string; started_at: string; finished_at: string | null; records_new: number
  sources_ok: number; sources_failed: number; sources: { source: string; status: string; records_new: number }[]
}
export type Updates = { runs: UpdateRun[]; sources: UpdateSource[]; generated_at: string }

export const useUpdates = () => useLive(() => apiGet<Updates>('/meta/updates', { days: 60, limit: 40 }), 'updates')
