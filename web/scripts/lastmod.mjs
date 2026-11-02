// The "last changed" date of every page, for the sitemaps and the pages' own markup.
//
// Why: search engines use a page's last-changed date to decide what to fetch again, and they stop trusting
// a site that says "changed today" on every page at every build. So a page's date moves only when what the
// page shows has changed. The build keeps a small file (seo-lastmod.json, committed with the code) with a
// fingerprint of each page and the date that fingerprint was first seen. Same content, same date. New
// content, the data's as-of date. A page seen for the first time gets the date its own record gives
// (a project's newest paper), or the as-of date when it has none.
import { createHash } from 'node:crypto'

/** A short fingerprint of everything a reader can see on a page that comes from the data. */
export const pageHash = (p) =>
  createHash('sha256').update(JSON.stringify([p.title, p.tabTitle ?? null, p.description, p.lines, p.ld ?? null])).digest('hex').slice(0, 12)

/** The calendar day in India, as YYYY-MM-DD. The day a build ran is the day its changes reached readers. */
export const buildDay = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

/** Returns the pages with their dates settled, and the state to save for the next build.
 *
 *  A page that changed gets the later of the data's as-of date and the day of the build. It used to get the
 *  as-of date alone, so a change made after the data was gathered (new titles on 1 Nov 2026 for data as of
 *  22 Oct) was dated before the last time a search engine had read the page, and was never fetched again
 *  for it. A page seen for the first time keeps the date its own record gives. */
export function applyLastmod(pages, state, asOf, today = buildDay()) {
  const changedOn = today > asOf ? today : asOf
  const next = {}
  const out = pages.map((p) => {
    const h = pageHash(p)
    const prev = state[p.path]
    const d = prev && prev.h === h ? prev.d : prev ? changedOn : (p.lastmod <= asOf ? p.lastmod : asOf)
    next[p.path] = { h, d }
    return { ...p, lastmod: d }
  })
  return { pages: out, next }
}

/** One line per page, sorted, so a change shows in git as the pages that changed and nothing else. */
export const serialise = (state) =>
  '{\n' + Object.keys(state).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(state[k])}`).join(',\n') + '\n}\n'
