import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

import { GRIEVANCE, grievanceReady } from '../../src/lib/legal.js'

/**
 * WHY THIS TEST EXISTS
 *
 * The disclaimer, the privacy page and the about page are what a lawyer, a
 * complainant or a judge reads first. Each claim there is a promise the site
 * can be held to, so each one has to be true, in all six languages, and has
 * to stay true as the pages are edited.
 *
 * Four things went wrong before this test existed. The copyright paragraph
 * said Section 52 allowed reproducing "government works" in general, which
 * is wider than the law: only 52(1)(q)'s four kinds are covered. The Telugu
 * summary, shown on every language's disclaimer, still carried the old name
 * of the site. The about page said "we add nothing" on a site that writes
 * fact checks. And the pages were full of long dashes, which the house style
 * does not use.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const LANGS = ['en', 'te', 'hi', 'ur', 'ta', 'or']
const CATS = Object.fromEntries(LANGS.map(c => [c, JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${c}.json`), 'utf8'))]))
const LEGAL = ['disclaimer', 'privacy', 'about']

function* strings(node, path) {
  if (typeof node === 'string') yield [path, node]
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) yield* strings(v, `${path}.${k}`)
}

/** The sections a page renders, read from the page itself: { key, paras }. */
const sectionsOf = file => [...readFileSync(join(ROOT, file), 'utf8')
  .matchAll(/\{\s*id:\s*'[^']+',\s*key:\s*'([^']+)',\s*icon:\s*'[^']+',\s*paras:\s*(\d+)/g)]
  .map(m => ({ key: m[1], paras: Number(m[2]) }))

test('the legal pages carry no long dash, in any language', () => {
  const found = []
  for (const code of LANGS) {
    for (const page of LEGAL) {
      for (const [path, s] of strings(CATS[code][page], `${code}:${page}`)) {
        if (/[—–]| -- /.test(s)) found.push(path)
      }
    }
  }
  assert.deepEqual(found, [], `long dashes are back in: ${found.join(', ')}`)
})

test('every section the pages list has its words in all six languages', () => {
  for (const [file, ns] of [['src/pages/Disclaimer.jsx', 'disclaimer'], ['src/pages/Privacy.jsx', 'privacy']]) {
    const sections = sectionsOf(file)
    assert.ok(sections.length >= 6, `could not read the section list from ${file}`)
    for (const code of LANGS) {
      for (const { key, paras } of sections) {
        const sec = CATS[code][ns].sections[key]
        assert.ok(sec && sec.title, `${code}: ${ns}.sections.${key}.title is missing`)
        for (let i = 1; i <= paras; i++) {
          assert.equal(typeof sec[`p${i}`], 'string', `${code}: ${ns}.sections.${key}.p${i} is missing`)
        }
        if (code !== 'en') {
          assert.notEqual(sec.p1, CATS.en[ns].sections[key].p1, `${code}: ${ns}.sections.${key} was left in English`)
        }
      }
    }
  }
})

test('the copyright paragraph claims only what Section 52(1)(q) allows', () => {
  for (const code of LANGS) {
    const p1 = CATS[code].disclaimer.sections.copyright.p1
    assert.match(p1, /52\(1\)\(q\)/, `${code}: the copyright paragraph does not name the clause it relies on`)
  }
  assert.doesNotMatch(CATS.en.disclaimer.sections.copyright.p1, /government works/i,
    'the English paragraph is back to claiming every government work')
})

test('the Telugu summary names the site as it is called now, the same on every page', () => {
  const brand = CATS.te.seo.brand
  for (const code of LANGS) {
    const body = CATS[code].disclaimer.summary.bodyTe
    assert.ok(body.startsWith(brand), `${code}: the Telugu summary does not start with "${brand}"`)
    assert.doesNotMatch(body, /నాడు|నేడు/, `${code}: the Telugu summary still uses the old name`)
    assert.equal(body, CATS.te.disclaimer.summary.bodyTe, `${code}: the Telugu summary differs from the Telugu page`)
  }
})

test('the footer on every page uses the site\'s name and the clause it relies on', () => {
  // The footer is on every page, so an old name or an over-wide claim there
  // is repeated thousands of times. It still said "ఏపీ నాడు–నేడు" after the
  // legal pages had moved on, and claimed all of Section 52.
  const brand = CATS.te.seo.brand
  for (const code of LANGS) {
    const line = CATS[code].footer.disclaimerTe
    assert.ok(line.startsWith(brand), `${code}: the footer's Telugu line does not start with "${brand}"`)
    assert.doesNotMatch(line, /నాడు|నేడు|[\u2014\u2013]/, `${code}: the footer's Telugu line still carries the old name or a long dash`)
    assert.match(CATS[code].footer.copyrightAct, /52\(1\)\(q\)/, `${code}: the footer claims more than Section 52(1)(q)`)
  }
})

test('the about page does not claim the site adds nothing', () => {
  // The site writes fact checks and labelled AI summaries. "We add nothing"
  // is a promise it cannot keep, and a complainant would quote it.
  assert.doesNotMatch(CATS.en.about.why.p3, /add nothing|create nothing/i)
})

test('the grievance officer sentence can be filled in every language', () => {
  for (const code of LANGS) {
    const p1 = CATS[code].disclaimer.sections.grievance.p1
    assert.ok(p1.includes('{name}') && p1.includes('{email}'), `${code}: the grievance sentence has no slot for the name or the address`)
  }
})

test('the site names its grievance officer', {
  todo: grievanceReady() ? false : 'fill in GRIEVANCE.name and GRIEVANCE.email in src/lib/legal.js',
}, () => {
  assert.ok(grievanceReady(), 'no grievance officer is named, so the disclaimer leaves the section out')
  assert.ok(!/example|test|todo/i.test(GRIEVANCE.email), `"${GRIEVANCE.email}" looks like a placeholder`)
})
