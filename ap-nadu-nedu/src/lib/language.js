/**
 * Choosing a language, and remembering the choice.
 *
 * WHY THIS FILE EXISTS
 *
 * The first version of this lived inline in App.jsx and had a bug that no
 * amount of reading the code would have found. Switching language navigated
 * to the new address, but the "remember my choice" write happened in an
 * effect keyed on a prop that is fixed at page load, so it never ran for the
 * new language. Pick English from a Telugu page and you land on "/", storage
 * still says "te", the bounce below fires, and you are back on Telugu.
 *
 * English was the only language that could not be selected. Every other
 * switch worked, because their target path carries the prefix and the bounce
 * only ever fires from a bare one.
 *
 * So the decision and the write are one function now, in one place, with the
 * order fixed: persist first, navigate second. A bounce that reads stale
 * storage is not a rendering glitch, it is a language the reader cannot
 * leave.
 */
import { localizedPath, splitLangPath } from './routes.js'

/**
 * Where a returning reader should be sent, or null to leave them where they
 * are.
 *
 * Only ever fires from an English (bare) path, so a crawler, which has no
 * stored preference, always sees English at an English address. Returns null
 * the moment the stored language is English or missing, which is what stops
 * the loop the bug above created.
 */
export function bounceTarget({ urlLang, storedLang, path, search = '', hash = '' }) {
  if (urlLang !== 'en') return null
  if (!storedLang || storedLang === 'en') return null
  const { path: bare } = splitLangPath(path)
  return localizedPath(storedLang, bare) + search + hash
}

/** The address a language switch should go to, same page, new language. */
export function switchTarget({ code, path, search = '', hash = '' }) {
  const { path: bare } = splitLangPath(path)
  return localizedPath(code, bare) + search + hash
}
