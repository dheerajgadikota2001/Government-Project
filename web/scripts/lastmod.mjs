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

/** Returns the pages with their dates settled, and the state to save for the next build. */
export function applyLastmod(pages, state, asOf) {
  const next = {}
  const out = pages.map((p) => {
    const h = pageHash(p)
    const prev = state[p.path]
    const d = prev && prev.h === h ? prev.d : prev ? asOf : (p.lastmod <= asOf ? p.lastmod : asOf)
    next[p.path] = { h, d }
    return { ...p, lastmod: d }
  })
  return { pages: out, next }
}

/** One line per page, sorted, so a change shows in git as the pages that changed and nothing else. */
export const serialise = (state) =>
  '{\n' + Object.keys(state).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(state[k])}`).join(',\n') + '\n}\n'
