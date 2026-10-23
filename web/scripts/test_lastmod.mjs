// The sitemap dates only move when a page's content moves. Run: npm run test:lastmod
import { applyLastmod, serialise, pageHash } from './lastmod.mjs'

let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }
const page = (path, text, lastmod = '2026-10-01') => ({ path, title: { en: path, te: path }, description: { en: text, te: text }, lines: [{ text: { en: text, te: text } }], lastmod })

// First build: no state. Each page keeps the date its own record gives, never a date after the as-of date.
const a = [page('/a', 'one'), page('/b', 'two', '2026-09-01'), page('/c', 'three', '2027-01-01')]
const first = applyLastmod(a, {}, '2026-10-22')
expect('first build: a page keeps its own record date', first.pages[1].lastmod === '2026-09-01')
expect('first build: a date after the as-of date is not used', first.pages[2].lastmod === '2026-10-22')

// Second build, nothing changed: every date is the same, and so is the saved state.
const again = applyLastmod(a, first.next, '2026-10-30')
expect('nothing changed: no date moves', again.pages.every((p, i) => p.lastmod === first.pages[i].lastmod))
expect('nothing changed: the saved state is identical', serialise(again.next) === serialise(first.next))

// One page changes: only its date moves, to the as-of date of the new data.
const b = [page('/a', 'one'), page('/b', 'two CHANGED', '2026-09-01'), page('/c', 'three', '2027-01-01')]
const third = applyLastmod(b, first.next, '2026-10-30')
expect('one page changed: only that page moves', third.pages[0].lastmod === first.pages[0].lastmod && third.pages[2].lastmod === first.pages[2].lastmod && third.pages[1].lastmod === '2026-10-30')

// A page that is gone leaves the state; a new page arrives with its own date.
const fourth = applyLastmod([page('/a', 'one'), page('/d', 'new', '2026-10-05')], third.next, '2026-11-02')
expect('a removed page leaves the saved state', !('/b' in fourth.next) && !('/c' in fourth.next))
expect('a new page takes its own record date', fourth.pages[1].lastmod === '2026-10-05')

// The fingerprint sees a change in any shown part.
expect('the fingerprint changes with the title, the description and the lines', new Set([pageHash(page('/x', 'a')), pageHash({ ...page('/x', 'a'), title: { en: 'other', te: 'x' } }), pageHash({ ...page('/x', 'a'), description: { en: 'z', te: 'z' } }), pageHash({ ...page('/x', 'a'), lines: [] })]).size === 4)
if (!ok) { console.log('\nSome checks failed.'); process.exit(1) }
console.log('\nAll lastmod checks passed.')
