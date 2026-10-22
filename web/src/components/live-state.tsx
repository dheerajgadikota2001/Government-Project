import * as React from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import type { Live } from '@/lib/live'
import { Button } from '@/components/ui/button'

// What a page shows while live data is on its way, and when it cannot arrive. The words are plain on
// purpose: a reader on a weak connection must be able to tell "still loading" from "the server is down"
// from "there is nothing here", and must never be shown an old copy as if it were today's answer.

export function LiveSkeleton({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  const { tr } = useLang()
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{tr('Loading', 'లోడ్ అవుతోంది')}</span>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-2 px-4 py-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LiveError({ retry, what, unreachable = true }: { retry: () => void; what: { en: string; te: string }; unreachable?: boolean }) {
  const { lang, tr } = useLang()
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-foreground/30 bg-card px-5 py-5">
      <div className="flex items-center gap-2 text-[16px] font-semibold"><WifiOff className="size-4" aria-hidden />{tr('Could not reach the data server', 'డేటా సర్వర్‌ను చేరలేకపోయాం')}</div>
      <p className="max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
        {unreachable
          ? tr(`${what.en} comes live from our server, and it did not answer just now. We show nothing here rather than an old copy. Check your connection and try again.`,
              `${what.te} మా సర్వర్ నుంచి నేరుగా వస్తుంది, ఇప్పుడు అది స్పందించలేదు. పాత కాపీని చూపకుండా ఇక్కడ ఏమీ చూపడం లేదు. మీ కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి.`)
          : tr(`The server answered with an error while loading ${what.en.toLowerCase()}. Please try again in a moment.`,
              `${what.te} లోడ్ చేస్తుండగా సర్వర్ లోపం చూపింది. కాసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.`)}
      </p>
      <Button type="button" variant="outline" className="gap-1.5" onClick={retry} lang={lang === 'te' ? 'te' : undefined}><RefreshCw className="size-4" aria-hidden />{tr('Try again', 'మళ్లీ ప్రయత్నించండి')}</Button>
    </div>
  )
}

/** Shows the loading look, the honest error, or the page's content once the data is in. */
export function LiveGate<T>({ state, what, rows, children }: { state: Live<T>; what: { en: string; te: string }; rows?: number; children: (data: T) => React.ReactNode }) {
  if (state.status === 'loading') return <LiveSkeleton rows={rows} />
  if (state.status === 'error') return <LiveError retry={state.retry} what={what} unreachable={state.error.unreachable} />
  return <>{children(state.data)}</>
}
