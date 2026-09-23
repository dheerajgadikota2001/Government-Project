import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

import { projectCard, districtCard, sectionCard, siteCard, homeCard, cardAlt, CTA_KINDS } from '../../src/lib/shareCard.js'
import { localiseVars } from '../../src/lib/placeNames.js'
import { CARD_FONTS, CARD_MAX_BYTES, CARD_WIDTH, CARD_HEIGHT, inspectCards, jpegSize } from '../share-cards.mjs'

/**
 * WHY THIS TEST EXISTS
 *
 * A share card is the picture a link arrives with in a WhatsApp group. It is
 * drawn at build time and nobody looks at most of them: 728 projects, 26
 * districts, two languages. So the ways it goes wrong are all silent. A
 * figure the page does not print. "0%" for a project with no progress on
 * record. A Telugu word drawn as broken pieces because a font lost a glyph.
 * The button words sitting on top of the third figure, which is what the
 * first Kalamkari draft did in Telugu. And a colour that makes a neutral
 * record look like a party's poster, which is what the yellow draft did.
 *
 * The first half needs no browser. The second half draws real cards and
 * measures them, and skips (saying so) on a machine without Chromium.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const catalogue = code => JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${code}.json`), 'utf8'))
const CATS = { en: catalogue('en'), te: catalogue('te') }
const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
// The prerenderer's translator, place names included, so a Telugu card says
// ఏలూరు where the Telugu page does.
const translator = code => (key, vars) => {
  const s = look(CATS[code], key) ?? look(CATS.en, key)
  if (typeof s !== 'string') return key.split('.').pop()
  const v = localiseVars(vars, code)
  return v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s
}
const T = { en: translator('en'), te: translator('te') }

const POLAVARAM = {
  id: 613, title: 'POLAVARAM IRRIGATION PROJECT', project_type: 'irrigation', status: 'under_construction',
  estimated_cost_crore: 55548.87, completion_percentage: 86.15,
}
const JULY = { cumulative_expenditure_crore: 27962, source_label: 'MoSPI flash report, July 2026' }
// The live record with no progress figure: the card must say its status, not 0%.
const NUZVID = {
  id: 164, title: 'Rejuvenation of peddha cheruvu in Nuzvid municipality, Nuzivid', project_type: 'urban_development',
  status: 'under_construction', estimated_cost_crore: 3.1, completion_percentage: null,
}

// ------------------------------------------------------------- the words

test('a project card carries the page\'s own figures and names its source', () => {
  const card = projectCard({ project: POLAVARAM, observation: JULY, district: 'Eluru', t: T.en, lang: 'en' })
  assert.equal(card.title, 'Polavaram Irrigation Project', 'the card shouts the title the PDF was typeset in')
  assert.deepEqual(card.stats.map(s => s.value), ['86.15%', '₹55,549 crore', '₹27,962 crore'])
  assert.equal(card.progress, 86.15)
  assert.equal(card.source, 'Source: MoSPI flash report, July 2026')
  assert.equal(card.cta, 'See the documents')
  assert.match(card.eyebrow, /Eluru district/)
})

test('a project with no progress on record says its status, never 0%', () => {
  const card = projectCard({ project: NUZVID, district: 'Eluru', t: T.en, lang: 'en' })
  assert.equal(card.progress, null, 'a progress bar was drawn for a project with no figure')
  assert.ok(!card.stats.some(s => /^0%$/.test(s.value)), 'the card invented 0%')
  assert.equal(card.stats[0].value, 'Under construction')
  // No observation means no named report, so the card claims only what is true.
  assert.equal(card.source, 'Every figure from a government document')
})

test('a Telugu card is in Telugu, place names included', () => {
  const card = projectCard({ project: POLAVARAM, observation: JULY, district: 'Eluru', t: T.te, lang: 'te' })
  assert.match(card.eyebrow, /ఏలూరు జిల్లా/, 'the Telugu card prints the district in English')
  assert.equal(card.cta, 'పత్రాలు చూడండి')
  assert.match(card.source, /^మూలం: /)
  const district = districtCard({ district: 'Eluru', count: 21, costCrore: 30837, t: T.te, lang: 'te' })
  assert.match(district.title, /ఏలూరు/)
  assert.equal(district.cta, 'మొత్తం 21 చూడండి')
})

test('a district with nothing tracked is not promised a list', () => {
  const empty = districtCard({ district: 'Eluru', count: 0, costCrore: 0, t: T.en, lang: 'en' })
  assert.ok(!/See all 0/.test(empty.cta), '"See all 0" is a promise the page cannot keep')
  assert.ok(!empty.stats.some(s => /crore/.test(s.value)), 'a combined cost of nothing was printed')
})

test('every kind of card has its button words in English and Telugu', () => {
  for (const code of ['en', 'te']) {
    for (const kind of CTA_KINDS) {
      const s = look(CATS[code], `share.cta.${kind}`)
      assert.equal(typeof s, 'string', `share.cta.${kind} is missing from ${code}.json`)
      assert.ok(s.length <= 24, `share.cta.${kind} in ${code} is ${s.length} characters; the button is sized for 24`)
    }
    const t = T[code]
    const cards = [
      projectCard({ project: POLAVARAM, observation: JULY, district: 'Eluru', t, lang: code }),
      districtCard({ district: 'Eluru', count: 21, costCrore: 30837, t, lang: code }),
      sectionCard({ title: 'x', subtitle: 'y', kind: 'factcheck', t, lang: code }),
      sectionCard({ title: 'x', subtitle: 'y', kind: 'finances', t, lang: code }),
      sectionCard({ title: 'x', subtitle: 'y', kind: 'department', t, lang: code }),
      sectionCard({ title: 'x', subtitle: 'y', t, lang: code }),
      siteCard({ t, lang: code }),
      homeCard({ projects: 728, districts: 26, departments: 40, t, lang: code }),
    ]
    for (const c of cards) assert.ok(c.cta && !/\{|\}|^cta$/.test(c.cta), `a ${c.kind} card in ${code} has button words "${c.cta}"`)
  }
})

test('the alt text says what the picture says', () => {
  const card = projectCard({ project: POLAVARAM, observation: JULY, district: 'Eluru', t: T.en, lang: 'en' })
  const alt = cardAlt(card)
  for (const part of ['Polavaram Irrigation Project', '86.15% built', '₹55,549 crore estimated cost', 'MoSPI flash report, July 2026']) {
    assert.ok(alt.includes(part), `the alt text is missing "${part}"`)
  }
})

// ------------------------------------------------------------- the fonts

test('every card face is vendored and ships with its licence', () => {
  for (const f of CARD_FONTS) {
    const file = join(ROOT, 'scripts/share-cards/fonts', f.file)
    assert.ok(existsSync(file), `${f.file} is not in scripts/share-cards/fonts`)
    const stem = f.file.replace(/(Card)?-(Subset|Variable)\.ttf$/, '')
    assert.ok(existsSync(join(ROOT, 'scripts/share-cards/fonts', `OFL-${stem}.txt`)),
      `${f.file} ships without its licence (expected OFL-${stem}.txt)`)
  }
})

test('the display faces hold every character the Telugu and English cards use', () => {
  // A subset font that lost a glyph draws a box, or a fallback face whose
  // Telugu does not join. Read each font's character map directly.
  const cmap = file => {
    const buf = readFileSync(join(ROOT, 'scripts/share-cards/fonts', file))
    const tables = buf.readUInt16BE(4)
    let off = null
    for (let i = 0; i < tables; i++) {
      const rec = 12 + i * 16
      if (buf.toString('ascii', rec, rec + 4) === 'cmap') off = buf.readUInt32BE(rec + 8)
    }
    assert.ok(off != null, `${file} has no cmap`)
    const codes = new Set()
    const n = buf.readUInt16BE(off + 2)
    for (let i = 0; i < n; i++) {
      const sub = off + buf.readUInt32BE(off + 4 + i * 8 + 4)
      if (buf.readUInt16BE(sub) !== 4) continue
      const segs = buf.readUInt16BE(sub + 6) / 2
      for (let s = 0; s < segs; s++) {
        const end = buf.readUInt16BE(sub + 14 + s * 2)
        const start = buf.readUInt16BE(sub + 16 + segs * 2 + s * 2)
        for (let c = start; c <= end && c !== 0xFFFF; c++) codes.add(c)
      }
    }
    return codes
  }
  const serif = cmap('FrauncesCard-Subset.ttf')
  for (const ch of '0123456789.,%₹?\'’AZaz') assert.ok(serif.has(ch.codePointAt(0)), `Card Serif has no "${ch}"`)
  const teDisplay = cmap('RamabhadraCard-Subset.ttf')
  // Every Telugu character in the card strings, plus the joiners Telugu needs.
  const strings = JSON.stringify([CATS.te.share, CATS.te.projects?.district?.heading, CATS.te.seo])
  const needed = new Set([...strings].filter(ch => /[ఀ-౿‌‍]/.test(ch)).map(ch => ch.codePointAt(0)))
  const missing = [...needed].filter(c => !teDisplay.has(c)).map(c => c.toString(16))
  assert.deepEqual(missing, [], 'Card Telugu Display lost Telugu characters the cards print')
})

// ------------------------------------------------------------- neutrality

test('no colour on the card belongs to a party', () => {
  // The first yellow draft was read as TDP. The rule since is written into
  // card.html: no yellow (TDP), red (Janasena, the Left), blue or green
  // (YSRCP, BJP, Congress) or saffron. This reads every colour in the
  // template and refuses any strong one in those hues. Muted earth tones
  // (the tan beads), cream and plum pass; a bright one of any of those does not.
  const html = readFileSync(join(ROOT, 'scripts/share-cards/card.html'), 'utf8')
  const hexes = [...new Set([...html.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => m[1].toLowerCase()))]
  assert.ok(hexes.length >= 5, 'the template has no colours left to check')
  const hsl = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l, c: 0 }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: h * 60, s, l, c: d }
  }
  // Chroma, not saturation: a pale cream has high saturation on paper and no
  // colour to the eye. Every party colour is loud (chroma 0.7 to 1).
  const party = ({ h, c }) => {
    if (c < 0.35) return null                                   // ink, cream, muted earth, plum
    if (h < 15 || h >= 345) return 'red (Janasena, the Left)'
    if (h < 40) return 'saffron (BJP)'
    if (h < 70) return 'yellow (TDP)'
    if (h < 170) return 'green (YSRCP, BJP, Congress)'
    if (h < 255) return 'blue (YSRCP)'
    return null                                                 // violet, plum, magenta
  }
  const leaning = hexes.map(h => [h, party(hsl(h))]).filter(([, p]) => p)
  assert.deepEqual(leaning, [], `these colours read as a party: ${leaning.map(([h, p]) => `#${h} ${p}`).join(', ')}`)
})

// ------------------------------------------------------------- the drawing

const STRESS = {
  id: 1, title: 'Four laning of the Rajahmundry to Kakinada section of NH-216 including construction of a major bridge across the Godavari river and approach roads on either side, with service roads, underpasses and toll plaza',
  project_type: 'road', status: 'under_construction', estimated_cost_crore: 1234567, completion_percentage: 3.5,
}
const STRESS_OBS = { cumulative_expenditure_crore: 987654, source_label: 'Ministry of Road Transport and Highways, project monitoring report for the quarter ending June 2026, annexure four' }

function allCards() {
  const out = []
  for (const lang of ['en', 'te']) {
    const t = T[lang]
    out.push(
      { name: `project ${lang}`, card: projectCard({ project: POLAVARAM, observation: JULY, district: 'Eluru', t, lang }) },
      { name: `project without progress ${lang}`, card: projectCard({ project: NUZVID, district: 'Eluru', t, lang }) },
      { name: `district ${lang}`, card: districtCard({ district: 'Dr. B.R. Ambedkar Konaseema', count: 21, costCrore: 30837, t, lang }) },
      { name: `home ${lang}`, card: homeCard({ projects: 728, districts: 26, departments: 40, t, lang }) },
      { name: `site ${lang}`, card: siteCard({ t, lang }) },
      { name: `finance question ${lang}`, card: sectionCard({ title: t('finances.q.threeSources'), subtitle: t('seo.route.home.description'), eyebrow: t('share.kind.finances'), kind: 'finances', t, lang }) },
      { name: `longest name ${lang}`, card: projectCard({ project: STRESS, observation: STRESS_OBS, district: 'Dr. B.R. Ambedkar Konaseema', t, lang }), stress: true },
    )
  }
  out.push({ name: 'fact check en', card: sectionCard({
    title: "Was Andhra Pradesh's debt about ₹97,000 crore when the TDP government took office in June 2014?",
    subtitle: 'No auditor publishes a debt figure for June 2014: the state had just been bifurcated. The nearest published figures are nine months later, and both are higher.',
    eyebrow: T.en('share.kind.factcheck'), kind: 'factcheck', t: T.en, lang: 'en' }) })
  return out
}

test('every kind of card draws cleanly: nothing overlaps, nothing spills, nothing too big to send', async t => {
  const cards = allCards()
  const audits = await inspectCards(cards.map(c => c.card))
  if (!audits) {
    t.skip('Chromium is not installed here. Run "npx playwright install chromium" once to test the drawing.')
    return
  }
  cards.forEach(({ name, stress }, i) => {
    const a = audits[i]
    assert.deepEqual(a.overlaps, [], `${name}: ${a.overlaps.join(', ')} overlap`)
    assert.deepEqual(a.outside, [], `${name}: ${a.outside.join(', ')} spill outside the card`)
    assert.equal(a.figuresOverflow, false, `${name}: the figures do not fit on one line`)
    assert.deepEqual(a.size, { width: CARD_WIDTH, height: CARD_HEIGHT }, `${name}: the image is the wrong size`)
    assert.ok(a.bytes <= CARD_MAX_BYTES, `${name}: ${a.bytes} bytes; WhatsApp drops a preview over ${CARD_MAX_BYTES}`)
    assert.ok(a.titleSize >= 40, `${name}: the title shrank to ${a.titleSize}px, too small to read in a chat`)
    // Only a pathological name may be cut. A real one is shrunk, never cut.
    if (!stress) assert.equal(a.titleClamped, false, `${name}: the title was cut with an ellipsis`)
  })
})

test('the committed site cards are real JPEGs of the right size', () => {
  for (const lang of ['en', 'te']) {
    const buf = readFileSync(join(ROOT, 'public/og', `site-${lang}.jpg`))
    assert.deepEqual(jpegSize(buf), { width: CARD_WIDTH, height: CARD_HEIGHT }, `public/og/site-${lang}.jpg`)
    assert.ok(buf.length <= CARD_MAX_BYTES, `public/og/site-${lang}.jpg is ${buf.length} bytes`)
  }
})
