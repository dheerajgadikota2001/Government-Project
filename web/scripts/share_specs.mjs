// Writes web/.cache/share/specs.json: every share picture the site needs, for scripts/make_cards.py to draw.
//   node scripts/share_specs.mjs        (npm run cards does this, then draws the missing pictures)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSeo } from './load-seo.mjs'
import { CARD_DIR, cardsFor, haveCard } from './share-spec.mjs'

const WEB = fileURLToPath(new URL('..', import.meta.url))
const seo = await loadSeo(WEB)
const cards = cardsFor(seo.allPages(), WEB)
if (cards.length < 100) { console.error(`Only ${cards.length} pictures to draw: the register looks empty. Nothing written.`); process.exit(1) }
mkdirSync(CARD_DIR(WEB), { recursive: true })
writeFileSync(join(CARD_DIR(WEB), 'specs.json'), JSON.stringify(cards))
const missing = cards.filter((c) => !haveCard(WEB, c.file)).length
console.log(`${cards.length} share pictures needed, ${cards.length - missing} already drawn, ${missing} to draw.`)
