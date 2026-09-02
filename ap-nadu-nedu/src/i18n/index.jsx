import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import en from './locales/en.json'

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

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && CATALOGUES[v]) return v
  } catch {
    /* private mode, blocked storage — fall through to the default */
  }
  return DEFAULT
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

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStored)
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
  }, [lang, meta.dir])

  const setLang = useCallback(code => {
    if (CATALOGUES[code]) setLangState(code)
  }, [])

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

  if (!cat) return null  // first paint waits for the stored language (see above)
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
