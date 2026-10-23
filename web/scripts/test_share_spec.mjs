// Checks the rule that keeps share pictures honest: a picture's name changes whenever anything on it changes, in its
// own language only, and never when nothing changed. Run: node scripts/test_share_spec.mjs
import { fileURLToPath } from 'node:url'
import { cardsFor, templateRev } from './share-spec.mjs'

const WEB = fileURLToPath(new URL('..', import.meta.url))
let failures = 0
const expect = (name, ok, why = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  [${why}]`}`); if (!ok) failures++ }

const card = (over = {}) => ({
  kind: 'project', tag: { en: 'Is it finished?', te: 'పూర్తయిందా?' }, title: { en: 'Is Dam finished?', te: 'Dam: పూర్తయిందా?' },
  status: { en: 'Work going on', te: 'పనులు జరుగుతున్నాయి' }, progress: '86.2', cost: { en: '₹10 crore', te: '₹10 కోట్లు' },
  due: null, place: { en: 'Eluru', te: 'ఏలూరు' }, source: { en: 'MoSPI report', te: 'MoSPI report' }, poster: null, ...over,
})
const pages = (c) => [{ path: '/projects/9', card: c }, { path: '/about' }]
const names = (c) => Object.fromEntries(cardsFor(pages(c), WEB).map((x) => [x.lang, x.file]))

const base = names(card())
expect('only pages with a card get a picture (one per language)', Object.keys(base).length === 2 && base.en.startsWith('projects-9-en-') && base.te.startsWith('projects-9-te-') && base.en.endsWith('.png'))
expect('the same data gives the same names', JSON.stringify(base) === JSON.stringify(names(card())))
const moved = names(card({ progress: '87.0' }))
expect('a new progress figure renames both pictures', moved.en !== base.en && moved.te !== base.te)
const en = names(card({ title: { en: 'Is Dam open?', te: 'Dam: పూర్తయిందా?' } }))
expect('changing only the English words renames only the English picture', en.en !== base.en && en.te === base.te)
const te = names(card({ place: { en: 'Eluru', te: 'విజయవాడ' } }))
expect('changing only the Telugu words renames only the Telugu picture', te.te !== base.te && te.en === base.en)
expect('a new 3D picture renames them', names(card({ poster: '/3d/r1/w9-50' })).en !== base.en)
expect('the template fingerprint is 8 characters', /^[0-9a-f]{8}$/.test(templateRev(WEB)))
const many = cardsFor(Array.from({ length: 50 }, (_, i) => ({ path: `/projects/${i}`, card: card() })), WEB)
expect('no two pages share a file name, even with identical words', new Set(many.map((x) => x.file)).size === many.length)
process.exit(failures ? 1 : 0)
