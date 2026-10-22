import * as React from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { Kbd } from '@/components/ui/kbd'

// The search box is on every page, but the works register and papers list it searches are
// about 500 KB. So the shell carries only this light part: the box, the keyboard shortcut and
// a wrapper. The dialog and its data load the first time a reader shows intent: a touch, hover
// or focus on the box, the shortcut, or a few idle seconds on a fast connection that is not
// saving data. A second open is instant; the files are cached like every other.

const loadBody = () => import('./search-dialog')
const Body = React.lazy(loadBody)
let warmed = false
/** Start downloading the dialog without opening it. Safe to call many times. */
export function warmSearch() {
  if (warmed) return
  warmed = true
  loadBody().catch(() => { warmed = false })
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // Once opened, the dialog stays mounted so its close animation and typed text behave as before.
  const [ever, setEver] = React.useState(false)
  if (open && !ever) setEver(true)
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))) {
        e.preventDefault(); onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [open, onOpenChange])
  React.useEffect(() => {
    // Warm the dialog on a good connection once the page has settled. Phones on 2G or 3G, or
    // with Data Saver on, wait for the reader to touch the box instead.
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    if (nav.connection?.saveData || /(^|-)2g|3g/.test(nav.connection?.effectiveType ?? '')) return
    const t = window.setTimeout(() => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      if (idle) idle(warmSearch); else warmSearch()
    }, 6000)
    return () => window.clearTimeout(t)
  }, [])
  if (!ever) return null
  return (
    <React.Suspense fallback={<SearchLoading onClose={() => onOpenChange(false)} />}>
      <Body open={open} onOpenChange={onOpenChange} />
    </React.Suspense>
  )
}

/** Shown for the moment the dialog's files take on a slow connection, so a tap never feels ignored. */
function SearchLoading({ onClose }: { onClose: () => void }) {
  const { tr } = useLang()
  return (
    <div role="dialog" aria-modal="true" aria-label={tr('Search', 'వెతకండి')} className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-background px-4 py-5 text-[15px] text-muted-foreground shadow-lg" aria-busy="true">
        {tr('Opening search…', 'వెతుకులాట తెరుచుకుంటోంది…')}
      </div>
    </div>
  )
}

/** The search box that opens the dialog. Looks like an input, works on every phone. */
export function SearchTrigger({ onOpen, big, className }: { onOpen: () => void; big?: boolean; className?: string }) {
  const { t } = useLang()
  return (
    <button type="button" onClick={onOpen} onPointerEnter={warmSearch} onTouchStart={warmSearch} onFocus={warmSearch}
      className={'group flex w-full items-center gap-3 rounded-xl border border-border bg-card text-left text-muted-foreground shadow-xs transition-colors hover:border-foreground/25 ' + (big ? 'h-14 px-4 text-[16px] md:h-16 md:text-[17px]' : 'h-10 px-3 text-sm') + ' ' + (className ?? '')}>
      <SearchIcon className={big ? 'size-5' : 'size-4'} />
      <span className="flex-1 truncate">{t('search')}</span>
      <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
    </button>
  )
}
