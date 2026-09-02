import { useState } from 'react'
import { useT } from '../../i18n'

export default function MitraFAB() {
  const { t } = useT()
  const [showToast, setShowToast] = useState(false)

  function handleClick() {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <>
      <button
        aria-label={t('mitra.ariaLabel')}
        onClick={handleClick}
        className="fixed bottom-20 end-4 lg:bottom-8 lg:end-8 z-50 rounded-full w-14 h-14 lg:w-16 lg:h-16 shadow-xl bg-secondary-container text-on-secondary-container flex items-center justify-center hover:scale-110 hover:shadow-2xl transition-transform group"
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
