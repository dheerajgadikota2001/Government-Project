import { useState, useEffect, useRef } from 'react'
import { useT } from '../../i18n'

export default function MitraFAB() {
  const { t } = useT()
  const [showToast, setShowToast] = useState(false)

  /**
   * Step aside when the footer arrives.
   *
   * A fixed button covers whatever occupies its corner of the screen, at every
   * scroll position — padding the page cannot fix that, because the button is
   * pinned to the viewport rather than the document. Measured on a 390px phone,
   * it sits at y 708-764 while the footer's heading runs to y 710 and its text
   * reaches the button's own column. The footer is where a reader goes for the
   * source links and the correction notice, so that is the worst possible thing
   * to sit on top of.
   *
   * So the button fades out while the footer is in view and returns when the
   * reader scrolls back to the content it belongs to. `pointer-events` follows
   * the opacity, otherwise an invisible button would still swallow taps on the
   * links underneath.
   */
  const [nearFooter, setNearFooter] = useState(false)
  const observed = useRef(null)

  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    observed.current = footer
    const io = new IntersectionObserver(
      ([entry]) => setNearFooter(entry.isIntersecting),
      // A small negative margin means it gets out of the way just before the
      // footer touches it, rather than after an overlap is already visible.
      { rootMargin: '0px 0px -64px 0px' },
    )
    io.observe(footer)
    return () => io.disconnect()
  }, [])

  function handleClick() {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <>
      <button
        aria-label={t('mitra.ariaLabel')}
        onClick={handleClick}
        className={[
          'fixed bottom-20 end-4 lg:bottom-8 lg:end-8 z-50 rounded-full w-14 h-14 lg:w-16 lg:h-16',
          'shadow-xl bg-secondary-container text-on-secondary-container flex items-center justify-center',
          'hover:scale-110 hover:shadow-2xl transition-all duration-200 group',
          nearFooter ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100',
        ].join(' ')}
        aria-hidden={nearFooter || undefined}
        tabIndex={nearFooter ? -1 : undefined}
      >
        <span
          className="material-symbols-outlined text-3xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          graphic_eq
        </span>
        <div
          data-nowrap-en
          className="absolute -top-12 end-0 bg-inverse-surface text-inverse-on-surface px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-label-sm font-label-sm pointer-events-none"
        >
          {t('mitra.tooltip')}
        </div>
      </button>

      {showToast && (
        <div className="fixed bottom-36 end-4 lg:bottom-28 lg:end-8 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-xl shadow-lg text-label-md font-label-md animate-fade-in">
          🎙️ {t('mitra.comingSoon')}
        </div>
      )}
    </>
  )
}
