/**
 * Loads a project's hand-written story in the browser, when it has one.
 *
 * Each story is its own small chunk, fetched only by the page that needs
 * it, so the other seven hundred project pages carry none of them.
 *
 * Drafts are loaded only on a developer's machine (npm run dev), or in a
 * build made with VITE_SHOW_DRAFT_STORIES=1 for review. In a normal
 * production build the drafts branch is dead code and Vite leaves every
 * draft out of the bundle, so an unreviewed story cannot reach a reader even
 * by guessing a file name.
 *
 * Stories are kept under the canonical project id, so the second record of
 * a merged work (sameWork.js) tells the same story as the first.
 */
import { canonicalIdFor } from './sameWork.js'

const REVIEWED = import.meta.glob('../data/stories/*.json')
const DRAFTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DRAFT_STORIES === '1'
  ? import.meta.glob('../data/stories/drafts/*.json')
  : {}

/** "../data/stories/2-bhogapuram-airport.json" to 2. */
const idOf = path => Number((path.split('/').pop().match(/^(\d+)-/) || [])[1])
const byId = globs => new Map(Object.entries(globs).map(([path, load]) => [idOf(path), load]))

const REVIEWED_BY_ID = byId(REVIEWED)
const DRAFTS_BY_ID = byId(DRAFTS)

/** The story for this project, or null. Never throws: a page without its story is still a page. */
export async function loadStory(id) {
  const key = canonicalIdFor(id)
  const load = REVIEWED_BY_ID.get(key) || DRAFTS_BY_ID.get(key)
  if (!load) return null
  try {
    const mod = await load()
    return mod.default || mod
  } catch {
    return null
  }
}
