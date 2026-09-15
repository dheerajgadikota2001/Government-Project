import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, useT, preloadLanguage } from '../../i18n'

/**
 * Language picker.
 *
 * Each language is written in its own script, because a reader who needs
 * Telugu should not have to read the word "Telugu" in English to find it.
 * The English name sits beside it for anyone navigating from outside.
 */
export default function LanguageSwitcher() {
  const { lang, setLang, meta, t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.choose')}
        className="hover:bg-primary-container/20 py-2 px-2.5 rounded-full transition-colors text-label-md font-bold flex items-center gap-1.5 min-w-0"
      >
        <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
          translate
        </span>
        <span className="hidden sm:inline text-[13px] leading-none whitespace-nowrap">
          {meta.endonym}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('lang.choose')}
          className="absolute end-0 top-full mt-2 z-50 min-w-[13rem] bg-surface-container-lowest border border-surface-variant rounded-xl shadow-lg py-1.5 overflow-hidden"
        >
          <li className="px-3 pb-1.5 pt-0.5 text-label-sm text-on-surface-variant border-b border-surface-variant mb-1">
            {t('lang.choose')}
          </li>
          {/*
            Each option warms its own catalogue on hover, focus or the first
            touch of a tap. The catalogue is a 41-57 KB chunk the browser
            cannot know to fetch until after the switch has already happened,
            so without this the reader clicks, sees a white screen, and waits
            for a file nothing had asked for. Starting it on approach spends
            the few hundred milliseconds between reaching for a language and
            selecting it, which is time that was being thrown away.
          */}
          {LANGUAGES.map(l => {
            const active = l.code === lang
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button
                  onClick={() => {
                    setLang(l.code)
                    setOpen(false)
                  }}
                  onMouseEnter={() => preloadLanguage(l.code)}
                  onPointerEnter={() => preloadLanguage(l.code)}
                  onFocus={() => preloadLanguage(l.code)}
                  lang={l.code}
                  dir={l.dir}
                  className={`w-full text-start px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                    active
                      ? 'bg-primary-container/40 text-on-surface'
                      : 'text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="text-body-md font-bold min-w-0 break-words">{l.endonym}</span>
                  <span className="text-label-sm text-on-surface-variant shrink-0" dir="ltr">
                    {active ? '✓ ' : ''}
                    {l.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
