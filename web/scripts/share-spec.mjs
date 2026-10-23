// Which share picture each page gets, and what it is called.
//
// A page's picture is drawn from its card (src/lib/seo.ts, type Card) by scripts/make_cards.py. The file name carries a
// fingerprint of everything the picture is made from: the page's words in that language, the template and the drawing
// script. So:
//   - when a figure on a page changes, its picture gets a new name and is drawn again; the old picture can never be
//     shown beside a new figure (this is the rule posters follow too);
//   - when nothing changed, the file already exists and nothing is drawn;
//   - a page whose picture is not drawn yet falls back to the site's default picture, and the build says so.
// The pictures live in web/.cache/share (not in git: they are made, not written) and are copied into dist/share.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const sha = (s) => createHash('sha1').update(s).digest('hex')
const text = (f) => readFileSync(f, 'utf8').replace(/\r\n?/g, '\n')   // the same bytes on Windows and elsewhere

/** Changes whenever the template or the drawing script does, so a new design redraws every picture. */
export function templateRev(web) {
  return sha(text(join(web, 'scripts/share-card.html')) + '\0' + text(join(web, 'scripts/make_cards.py'))).slice(0, 8)
}

export const CARD_DIR = (web) => join(web, '.cache/share')

/** One entry per (page, language) that has a card: { path, lang, file, spec }. */
export function cardsFor(pages, web, langs = ['en', 'te']) {
  const rev = templateRev(web)
  const out = []
  for (const p of pages) {
    if (!p.card) continue
    for (const lang of langs) {
      const spec = { lang }
      for (const [k, v] of Object.entries(p.card)) spec[k] = v && typeof v === 'object' && 'en' in v && 'te' in v ? v[lang] : v
      const slug = p.path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')
      const hash = sha(rev + JSON.stringify(spec)).slice(0, 10)
      out.push({ path: p.path, lang, file: `${slug}-${lang}-${hash}.png`, spec })
    }
  }
  return out
}

export const haveCard = (web, file) => existsSync(join(CARD_DIR(web), file))
