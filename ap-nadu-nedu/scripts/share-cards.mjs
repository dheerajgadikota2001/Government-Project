/**
 * Draw the share cards: the 1200x630 image a link previews with on WhatsApp,
 * Facebook, X and LinkedIn.
 *
 * WHY A BROWSER
 *
 * The cards carry Telugu. Telugu is a complex script: vowel signs attach to
 * consonants and conjuncts stack, and a renderer without full shaping draws
 * "ప్రాజెక్టు" as a row of broken pieces. The small image libraries that
 * draw text (satori, canvas without HarfBuzz) do exactly that, and a broken
 * word on a card from a site whose argument is accuracy is worse than no
 * card. Chromium shapes Telugu correctly, lays out wrapping text the way the
 * site itself does, and Playwright is already a dev dependency here for the
 * layout audit. The fonts are vendored (share-cards/fonts, SIL OFL), so the
 * output does not depend on what the build machine has installed.
 *
 * WHY THE FILE NAME CARRIES A HASH
 *
 * WhatsApp and Facebook cache a preview image by its URL, for days. A card
 * named 613-en.png would keep showing last month's figure after the page had
 * moved on. The name is the hash of the card's content, so a changed figure
 * is a new URL and the platforms fetch it; an unchanged one is the same URL
 * and they do not. The same hash keys a cache between builds, so a rebuild
 * redraws only the cards whose figures changed.
 *
 * WHAT HAPPENS WHEN IT CANNOT RUN
 *
 * The build must not depend on it. If Chromium is missing or will not start,
 * this says so, loudly and with the command that fixes it, and returns what
 * it could. prerender.mjs then points every page without a card at the site
 * card committed in public/og, which is a correct if generic preview. A
 * broken card renderer costs pictures, never pages.
 *
 * Usage:
 *   imported by scripts/prerender.mjs (renderCards)
 *   node scripts/share-cards.mjs --site     redraw public/og/site-en.jpg and site-te.jpg
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const FONTS = join(here, 'share-cards', 'fonts')
const TEMPLATE_FILE = join(here, 'share-cards', 'card.html')

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
/** WhatsApp drops a preview image over roughly 300 KB, silently. */
export const CARD_MAX_BYTES = 300 * 1024
const DEFAULT_CACHE = join(ROOT, 'node_modules', '.cache', 'share-cards')

/**
 * The four faces a card is drawn in. Two carry the body text in each script;
 * two are display faces for the headline and the figures. Each is an OFL font
 * with its licence beside it in share-cards/fonts.
 */
export const CARD_FONTS = [
  { family: 'Card Latin', file: 'PublicSans-Variable.ttf', weight: '100 900', probe: ['700 40px "Card Latin"', 'A'] },
  { family: 'Card Telugu', file: 'NotoSansTelugu-Subset.ttf', weight: '100 900', probe: ['700 40px "Card Telugu"', 'తె'] },
  { family: 'Card Serif', file: 'FrauncesCard-Subset.ttf', weight: '500 900', probe: ['800 40px "Card Serif"', 'A₹'] },
  { family: 'Card Telugu Display', file: 'RamabhadraCard-Subset.ttf', weight: '400', probe: ['400 40px "Card Telugu Display"', 'తె'] },
]

/** The template with the fonts inlined, and a fingerprint of all of it. */
function template() {
  const face = (family, file, weight) => {
    const data = readFileSync(join(FONTS, file)).toString('base64')
    return `@font-face { font-family: '${family}'; src: url(data:font/ttf;base64,${data}) format('truetype');` +
      ` font-weight: ${weight}; font-style: normal; font-display: block; }`
  }
  const fonts = CARD_FONTS.map(f => face(f.family, f.file, f.weight)).join('\n')
  const html = readFileSync(TEMPLATE_FILE, 'utf8').replace('/* __FONTS__ */', fonts)
  return { html, fingerprint: createHash('sha256').update(html).digest('hex').slice(0, 12) }
}

/**
 * The file name for a card: its key and a hash of everything that decides
 * its pixels (the words, the numbers, the template, the fonts).
 */
export function cardFileName(key, card, fingerprint) {
  const hash = createHash('sha256').update(fingerprint).update(JSON.stringify(card)).digest('hex').slice(0, 10)
  return `${key}-${hash}.jpg`
}

/**
 * A JPEG's width and height from its frame header, so a test can check a card
 * without an image library. Walks the markers to the first SOF segment.
 */
export function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null
  let i = 2
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xFF) return null
    const marker = buffer[i + 1]
    const length = buffer.readUInt16BE(i + 2)
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) }
    }
    i += 2 + length
  }
  return null
}

async function launch(log) {
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch (err) {
    log(`share cards: Playwright is not installed (${err.message.split('\n')[0]}). Run "npm install".`)
    return null
  }
  try {
    // SHARE_CARDS_CHROMIUM points at a Chromium already on the machine, for a
    // build box whose browser is not the exact build this Playwright expects.
    return await chromium.launch({ executablePath: process.env.SHARE_CARDS_CHROMIUM || undefined })
  } catch (err) {
    log('share cards: Chromium would not start, so no page gets its own card this build.')
    log(`share cards: ${err.message.split('\n')[0]}`)
    log('share cards: run "npx playwright install chromium" once on this machine, then build again.')
    return null
  }
}

/**
 * A browser page with the template loaded and every face ready.
 *
 * A card drawn before the fonts decode is drawn in a fallback face, and a
 * fallback face for Telugu is the broken-glyph problem this whole approach
 * exists to avoid. document.fonts.check alone answers true for a face nobody
 * has asked for yet, so each face is loaded by name first and then checked.
 */
async function openCardPage(browser, html) {
  const page = await browser.newPage({ viewport: { width: CARD_WIDTH, height: CARD_HEIGHT }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  const ok = await page.evaluate(async list => {
    await Promise.all(list.map(([font, text]) => document.fonts.load(font, text)))
    await document.fonts.ready
    return list.every(([font, text]) => document.fonts.check(font, text))
  }, CARD_FONTS.map(f => f.probe))
  if (!ok) throw new Error('the vendored card fonts did not load')
  return page
}

/**
 * Draw cards without saving them and report the template's layout check for
 * each, for the tests. Returns null when no browser can start, so a test can
 * skip rather than fail on a machine without Chromium.
 *
 * @returns [{ overlaps, outside, figuresOverflow, titleClamped, titleSize, bytes }] or null
 */
export async function inspectCards(cards, { log = () => {} } = {}) {
  const browser = await launch(log)
  if (!browser) return null
  try {
    const page = await openCardPage(browser, template().html)
    const out = []
    for (const card of cards) {
      await page.evaluate(c => window.drawCard(c), card)
      const audit = await page.evaluate(() => window.auditCard())
      const img = await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } })
      out.push({ ...audit, bytes: img.length, size: jpegSize(img) })
    }
    return out
  } finally {
    await browser.close()
  }
}

/**
 * Draw every card that is not already cached, and put each into
 * `outDir/og/<key>-<hash>.jpg`.
 *
 * @param jobs      [{ key: 'p/613-en', card }], card from src/lib/shareCard.js
 * @returns         { urls: Map(key -> '/og/p/613-en-1a2b3c4d5e.jpg'), drawn, cached, failed, reason }
 */
export async function renderCards(jobs, { outDir, cacheDir = DEFAULT_CACHE, concurrency = 4, log = console.log } = {}) {
  const { html, fingerprint } = template()
  mkdirSync(cacheDir, { recursive: true })
  const urls = new Map()
  const todo = []
  let cached = 0

  const place = (key, name) => {
    const target = join(outDir, 'og', name)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(cacheDir, name.replaceAll('/', '__')), target)
    urls.set(key, `/og/${name}`)
  }

  const seen = new Set()
  for (const { key, card } of jobs) {
    if (!card || seen.has(key)) continue
    seen.add(key)
    const name = cardFileName(key, card, fingerprint)
    if (existsSync(join(cacheDir, name.replaceAll('/', '__')))) { place(key, name); cached++ } else todo.push({ key, card, name })
  }

  let drawn = 0
  let failed = 0
  let reason = null
  if (todo.length) {
    const browser = await launch(log)
    if (!browser) {
      reason = 'chromium unavailable'
      failed = todo.length
    } else {
      try {
        let next = 0
        await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
          const page = await openCardPage(browser, html)
          while (true) {
            const i = next++
            if (i >= todo.length) break
            const { key, card, name } = todo[i]
            try {
              await page.evaluate(c => window.drawCard(c), card)
              // A card with words over the motif or figures off the edge is
              // worse than the plain site card, so it is refused and the page
              // falls back. A long name cut to three lines with an ellipsis is
              // allowed: that is the template's own last resort.
              const audit = await page.evaluate(() => window.auditCard())
              const faults = [
                ...audit.overlaps.map(o => `${o} overlap`),
                ...audit.outside.map(o => `${o} outside the card`),
                ...(audit.figuresOverflow ? ['figures do not fit on one line'] : []),
              ]
              if (faults.length) throw new Error(`layout check failed: ${faults.join(', ')}`)
              // JPEG, not PNG. The dotted cotton ground and the border pattern
              // are the kind of detail PNG compresses badly; the first design
              // was 250 to 290 KB as PNG, a hair under the size WhatsApp
              // silently drops, and about a fifth of that as JPEG at a quality
              // where the text edges are clean.
              const img = await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } })
              if (img.length > CARD_MAX_BYTES) throw new Error(`${img.length} bytes is over the ${CARD_MAX_BYTES} WhatsApp accepts`)
              writeFileSync(join(cacheDir, name.replaceAll('/', '__')), img)
              place(key, name)
              drawn++
            } catch (err) {
              failed++
              log(`share cards: ${key} was not drawn: ${err.message.split('\n')[0]}`)
            }
          }
          await page.close()
        }))
      } catch (err) {
        reason = err.message.split('\n')[0]
        failed = todo.length - drawn
        log(`share cards: stopped: ${reason}`)
      } finally {
        await browser.close()
      }
    }
  }
  prune(cacheDir, new Set([...urls.values()].map(u => u.slice('/og/'.length).replaceAll('/', '__'))))
  return { urls, drawn, cached, failed, reason }
}

/**
 * Keep the cache from growing a month's worth of cards per data refresh.
 * A card not used by this build and untouched for 30 days is gone.
 */
function prune(cacheDir, used) {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000
  for (const f of readdirSync(cacheDir)) {
    if (used.has(f)) continue
    const p = join(cacheDir, f)
    try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p) } catch { /* another build got there first */ }
  }
}

// ------------------------------------------------------------- CLI: --site

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--site')) {
  const { siteCard } = await import('../src/lib/shareCard.js')
  const cat = code => JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${code}.json`), 'utf8'))
  const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
  const translator = code => (key, vars) => {
    const s = look(cat(code), key) ?? look(cat('en'), key)
    if (typeof s !== 'string') return key.split('.').pop()
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
  }
  const tmp = join(ROOT, 'node_modules', '.cache', 'share-cards-site')
  const jobs = ['en', 'te'].map(lang => ({ key: `site-${lang}`, card: siteCard({ t: translator(lang), lang }) }))
  const r = await renderCards(jobs, { outDir: tmp })
  if (r.failed) process.exit(1)
  for (const lang of ['en', 'te']) {
    const src = join(tmp, r.urls.get(`site-${lang}`))
    const dest = join(ROOT, 'public', 'og', `site-${lang}.jpg`)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    console.log(`wrote public/og/site-${lang}.jpg`)
  }
}
