import { useEffect, useRef, useState } from 'react'

/**
 * Renders its children only once they are close to the viewport.
 *
 * WHY: several sections sit far below the fold but were mounting — and
 * fetching — the moment the page did. The Finances page was the worst case:
 * the department table pulls 367 KB of JSON and the comment thread makes an
 * uncached round trip to Mumbai, and both were competing with the charts the
 * reader was actually looking at. Clicking "Finances" took two seconds to show
 * anything real.
 *
 * Nothing is removed — scroll down and the section loads exactly as before,
 * usually well before it is reached, because the observer fires 600px early.
 * On a browser without IntersectionObserver, children render immediately: the
 * old behaviour is the fallback, so nothing can go missing.
 *
 * `minHeight` reserves space so the page does not jump when the section
 * arrives; pass a rough height for whatever is being deferred.
 */
export default function Deferred({ children, minHeight = 240, rootMargin = '600px' }) {
  const ref = useRef(null)
  const [show, setShow] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (show || !ref.current) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [show, rootMargin])

  if (show) return children
  // aria-hidden: this is a placeholder for content that has not loaded, not
  // content in its own right — a screen reader should not announce an empty box.
  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />
}
