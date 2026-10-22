import * as React from 'react'
import { useThemeTick } from '@/lib/design'
import { isDark, posterSrc, WIDE_FROM } from './posters'

/** The baked picture of a model. It picks the file for the current theme and the box's shape, tells
 *  its owner whether it arrived (`onStatus`), and renders nothing until it is mounted so the server
 *  and the first client render agree. */
export function Poster({ base, className, eager, onStatus }: { base: string; className?: string; eager?: boolean; onStatus?: (s: 'ok' | 'fail') => void }) {
  const tick = useThemeTick()
  const ref = React.useRef<HTMLImageElement>(null)
  const [src, setSrc] = React.useState<string | null>(null)
  const cb = React.useRef(onStatus)
  cb.current = onStatus
  React.useLayoutEffect(() => {
    const box = ref.current?.parentElement
    const pick = () => {
      const r = box?.getBoundingClientRect()
      const wide = r && r.height > 0 ? r.width / r.height >= WIDE_FROM : window.innerWidth >= 768
      setSrc(posterSrc(base, isDark(), wide))
    }
    pick()
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(pick)
    ro.observe(box)
    return () => ro.disconnect()
  }, [base, tick])
  return (
    <img ref={ref} src={src ?? undefined} alt="" aria-hidden decoding="async" loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      draggable={false} className={className} style={src ? undefined : { visibility: 'hidden' }}
      onLoad={() => cb.current?.('ok')} onError={() => cb.current?.('fail')} />
  )
}
