import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import en from './locales/en.json'
import { EVENTS, track } from '../lib/analytics'

// English ships in the main bundle (it is also the fallback for every other
// language). The five other catalogues — 1.3 MB of JSON between them — load
// on demand, so a phone downloads one language, not six. Vite turns these
// into separate chunks; a language switch fetches ~150-300 KB once and it
// is then cached.
const LOADERS = {
  te: () => import('./locales/te.json'),
  hi: () => import('./locales/hi.json'),
  ur: () => import('./locales/ur.json'),
  ta: () => import('./locales/ta.json'),
  or: () => import('./locales/or.json'),
}
const loaded = { en }
const inflight = {}

/**
 * Fetch a catalogue before it is needed.
 *
 * Switching language is a full page load, and the catalogue is a separate
 * chunk of 41-57 KB gzipped that the browser cannot discover until the main
 * bundle has run. So the reader clicks, gets a white screen, waits for a file
 * nobody knew to ask for, and then sees the page.
 *
 * The switcher calls this when a reader hovers or focuses a language, which
 * buys the download the few hundred milliseconds between "moving towards it"
 * and "clicking it". By the time the new page asks for the catalogue it is
 * already in the browser cache, and the wait is gone rather than hidden.
 *
 * Safe to call repeatedly: already-loaded languages return at once, and a
 * second call while one is in flight joins the first rather than starting
 * another request.
 */
export function preloadLanguage(code) {
  if (!LOADERS[code] || loaded[code]) return Promise.resolve()
  if (!inflight[code]) {
    inflight[code] = LOADERS[code]()
      .then(mod => { loaded[code] = mod.default || mod })
      .catch(() => { delete inflight[code] })  // offline: let a later attempt retry
  }
  return inflight[code]
}

/**
 * Translation layer.
 *
 * Rules this file enforces, because they are the ones that break a
 * multilingual site quietly:
 *
 *  - A missing key never renders as a key. It falls back to English, which is
 *    always complete, so a half-translated page is still a readable page.
 *  - Numbers stay in Latin digits with Indian grouping in every language.
 *    Telugu, Tamil and Odia newspapers all set data this way; switching to
 *    script digits would make every chart axis unreadable to its own audience.
 *  - Direction and language are pushed onto <html> so the browser hyphenates,
 *    selects and reads out the page correctly.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English', dir: 'ltr', short: 'EN' },
  { code: 'te', label: 'Telugu', endonym: 'తెలుగు', dir: 'ltr', short: 'తె' },
  { code: 'hi', label: 'Hindi', endonym: 'हिन्दी', dir: 'ltr', short: 'हि' },
  { code: 'ur', label: 'Urdu', endonym: 'اردو', dir: 'rtl', short: 'اردو' },
  { code: 'ta', label: 'Tamil', endonym: 'தமிழ்', dir: 'ltr', short: 'த' },
  { code: 'or', label: 'Odia', endonym: 'ଓଡ଼ିଆ', dir: 'ltr', short: 'ଓ' },
]

const CATALOGUES = { en: true, te: true, hi: true, ur: true, ta: true, or: true }
const STORAGE_KEY = 'apnn.lang'
const DEFAULT = 'en'

export const langMeta = code => LANGUAGES.find(l => l.code === code) || LANGUAGES[0]

/**
 * The last language this reader chose, or null.
 *
 * This is a memory, not an authority. The URL decides which language a page
 * is in, because a stored preference cannot be seen by a crawler and cannot
 * be shared in a link, which is exactly how six translated languages ended up
 * invisible to search. App.jsx uses this only to send a returning reader from
 * a bare path to their language, once.
 */
export function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && CATALOGUES[v]) return v
  } catch {
    /* private mode, blocked storage — nothing remembered, which is fine */
  }
  return null
}

/**
 * Remember the choice, now, rather than in an effect.
 *
 * The effect that used to do this is keyed on the language prop, which the
 * router fixes at page load, so it never ran for the language just chosen.
 * A switch has to persist before it navigates or the bounce on the next page
 * load reads the old value and undoes the switch.
 */
export function writeStoredLang(code) {
  if (!CATALOGUES[code]) return
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* private mode: the choice just will not survive a reload */
  }
}

function readStored() {
  return readStoredLang() || DEFAULT
}

/** Resolve "a.b.c" against a nested object. */
function lookup(cat, key) {
  let node = cat
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Replace {name} placeholders. Values are inserted as-is, never parsed. */
function interpolate(str, vars) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

const I18nContext = createContext(null)

/**
 * `lang` and `onChangeLang` come from the router (see App.jsx). When they are
 * given, the URL owns the language and this component follows it. The prop
 * free form is kept for tests and for any tree mounted outside a router.
 */
export function LanguageProvider({ children, lang: langProp, onChangeLang }) {
  const controlled = Boolean(langProp && CATALOGUES[langProp])
  const [langState, setLangState] = useState(readStored)
  const lang = controlled ? langProp : langState
  // The catalogue actually in use. For a stored non-English choice this starts
  // null and the page holds (blank, ~100 ms) until the language arrives — a
  // flash of English on a Telugu reader's first paint would be worse.
  const [cat, setCat] = useState(() => loaded[lang] || null)

  const meta = langMeta(lang)

  useEffect(() => {
    let cancelled = false
    if (loaded[lang]) { setCat(loaded[lang]); return }
    LOADERS[lang]().then(mod => {
      loaded[lang] = mod.default || mod
      if (!cancelled) setCat(loaded[lang])
    }).catch(() => { if (!cancelled) setCat(en) })  // offline mid-switch: stay readable
    return () => { cancelled = true }
  }, [lang])

  /**
   * The Noto family for each script. index.html picks one of these before first
   * paint from the stored language; this keeps it in step when the reader
   * switches language without reloading. Kept identical to the map there — if
   * a language is added, both need it.
   */
  const SCRIPT_FONT = {
    te: 'Noto+Sans+Telugu',
    hi: 'Noto+Sans+Devanagari',
    ta: 'Noto+Sans+Tamil',
    or: 'Noto+Sans+Oriya',
    ur: 'Noto+Nastaliq+Urdu',
  }

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', meta.dir)
    root.setAttribute('data-lang', lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* nothing to do; the choice just will not survive a reload */
    }

    // Swap in the script's font. Only one is ever loaded: switching from Telugu
    // to Tamil replaces the sheet rather than accumulating families, and
    // switching back to English removes it entirely.
    const existing = document.getElementById('script-font')
    const family = SCRIPT_FONT[lang]
    if (!family) {
      existing?.remove()
      return
    }
    const href =
      `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`
    if (existing) {
      if (existing.href !== href) existing.href = href
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.id = 'script-font'
    link.href = href
    document.head.appendChild(link)
  }, [lang, meta.dir])

  const setLang = useCallback(code => {
    if (!CATALOGUES[code]) return
    // Under the router a language change is a navigation. The tracking below
    // still fires, because "readers arriving in English switch to Telugu" is
    // the number that justifies maintaining six catalogues.
    // Six catalogues are maintained here at real cost — 1,754 keys each — and
    // until now nothing recorded whether any of them is read. Both sides of the
    // switch are sent because the interesting number is not "Telugu was
    // chosen", it is "readers arriving in English switch to Telugu", which is
    // a different fact and the one that would justify the work.
    setLangState(prev => {
      if (prev !== code) track(EVENTS.LANGUAGE_CHANGED, { from: prev, to: code })
      return code
    })
    if (onChangeLang) onChangeLang(code)
  }, [onChangeLang])

  const value = useMemo(() => {
    const active = cat || en

    /** t('a.b', {count: 3}) — falls back to English, then to the key's tail. */
    const t = (key, vars) => {
      const hit = lookup(active, key) ?? lookup(en, key)
      if (hit === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
        return key.split('.').pop()
      }
      return interpolate(hit, vars)
    }

    /** Plural helper: t('x.one') / t('x.other') chosen by n. */
    const tn = (baseKey, n, vars) =>
      t(`${baseKey}.${n === 1 ? 'one' : 'other'}`, { count: n, ...vars })

    /** Does this language have its own string for the key, or is it English? */
    const has = key => lookup(active, key) !== undefined

    return { lang, setLang, dir: meta.dir, isRTL: meta.dir === 'rtl', meta, t, tn, has }
  }, [lang, meta, setLang, cat])

  // First paint waits for the catalogue rather than flashing English at a
  // Telugu reader. Returning null painted plain white for as long as that
  // took; this is the same wait with something on the screen, and it carries
  // the right lang and dir so the browser is not laying out backwards for a
  // moment when the real page arrives.
  if (!cat) {
    return (
      <div
        lang={lang}
        dir={meta.dir}
        aria-busy="true"
        className="min-h-screen bg-background flex items-start justify-center pt-24"
      >
        <div className="w-full max-w-4xl px-4 animate-pulse" aria-hidden="true">
          <div className="h-8 w-1/2 rounded-lg bg-surface-container-high mb-4" />
          <div className="h-4 w-full rounded bg-surface-container mb-2" />
          <div className="h-4 w-4/6 rounded bg-surface-container mb-8" />
          <div className="h-40 rounded-xl bg-surface-container" />
        </div>
      </div>
    )
  }
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used inside <LanguageProvider>')
  return ctx
}

// ---------------------------------------------------------------- formatting

/** Indian digit grouping, Latin numerals, in every language. */
export const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString('en-IN'))

/** ₹ amounts in crore, rolled up to lakh crore once they get large. */
export function fmtCrore(v, { lakhCrLabel = 'lakh Cr', crLabel = 'Cr' } = {}) {
  if (v == null || v === 0) return null
  return v >= 100000
    ? `₹${(v / 100000).toFixed(2)} ${lakhCrLabel}`
    : `₹${fmtNum(Math.round(v))} ${crLabel}`
}

const MONTH_KEYS = [
  '', 'month.jan', 'month.feb', 'month.mar', 'month.apr', 'month.may', 'month.jun',
  'month.jul', 'month.aug', 'month.sep', 'month.oct', 'month.nov', 'month.dec',
]

/** "2024-06-12" -> localized "12 June 2024"; accepts "YYYY", "YYYY-MM" too. */
export function makeDateFmt(t) {
  return function fmtDate(s) {
    if (!s) return ''
    const [y, m, d] = String(s).split('-')
    if (!m) return y
    const month = t(MONTH_KEYS[Number(m)])
    if (!d) return t('date.monthYear', { month, year: y })
    return t('date.full', { day: Number(d), month, year: y })
  }
}

/**
 * Charts and numeric tables stay left-to-right even in Urdu: a bar chart
 * mirrored into RTL reads as though the data reversed. Wrap those subtrees.
 */
export const LTR = { dir: 'ltr' }
