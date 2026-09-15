import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  FACT_CHECKS, STATUSES, STATUS_RATING, validateFactCheck, partiesCovered,
  findFactCheck, factCheckPath, factChecksNewestFirst,
} from '../../src/lib/factcheck.js'
import { schemaFor } from '../../src/lib/schema.js'

/**
 * WHY THIS FILE EXISTS
 *
 * The site is named Fact Check. These pages are the first that live up to the
 * name, and they are the pages most likely to be attacked, quoted out of
 * context, and screenshotted by whichever side a given check does not suit.
 *
 * So the tests are about the things that would let an attack land: a claim
 * with no document behind it, a status that is not in the vocabulary, a figure
 * that is not a number, an explanation that was never written, and above all
 * a file that only ever checks one party. Each of those fails the build. None
 * of them can reach production by being overlooked.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(resolve(here, '../../', f), 'utf8')
const LOCALES = ['en', 'te', 'hi', 'ur', 'ta', 'or']

test('every fact check on file is complete and publishable', () => {
  assert.ok(FACT_CHECKS.length >= 3, 'the file is nearly empty')
  for (const check of FACT_CHECKS) {
    const problems = validateFactCheck(check)
    assert.deepEqual(problems, [], `${check.slug}:\n  ${problems.join('\n  ')}`)
  }
})

test('both governments are checked, or the section is not unbiased', () => {
  // The single rule that decides whether the word "unbiased" survives. A file
  // that only ever checks one side is a campaign page with a schema.
  const parties = partiesCovered()
  assert.ok(parties.includes('TDP') && parties.includes('YSRCP'),
    `only ${parties.join(', ')} are checked; both major parties must appear`)
})

test('a status is a fact about two numbers, never a verdict on a person', () => {
  assert.deepEqual(STATUSES, ['matches', 'differs', 'definition', 'unverifiable'])
  for (const bad of ['true', 'false', 'misleading', 'lie', 'correct']) {
    assert.ok(!STATUSES.includes(bad), `"${bad}" is a verdict, not a comparison`)
  }
  // Cannot-be-checked must never be scored as though it were false.
  assert.ok(STATUS_RATING.unverifiable > STATUS_RATING.differs,
    'an unverifiable claim is being rated as badly as a wrong one')
  assert.equal(STATUS_RATING.matches, 5)
})

test('no slug collides and every one resolves', () => {
  const slugs = FACT_CHECKS.map(c => c.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slug')
  for (const slug of slugs) {
    assert.equal(findFactCheck(slug)?.slug, slug)
    assert.equal(factCheckPath(slug), `/factcheck/${slug}`)
  }
  assert.equal(findFactCheck('nope'), null)
})

test('the index leads with the newest claim', () => {
  const order = factChecksNewestFirst()
  for (let i = 1; i < order.length; i++) {
    const newest = c => Math.max(...c.claims.map(x => Date.parse(x.date)))
    assert.ok(newest(order[i - 1]) >= newest(order[i]), 'index is not newest first')
  }
})

test('every figure and every quote on the flagship page is the one in the record', () => {
  // The four-number page is the one that will be screenshotted. Pin it.
  const c = findFactCheck('ap-debt-31-march-2019')
  assert.ok(c)
  const figures = [...c.claims.map(x => x.figure), ...c.record.map(x => x.figure)].sort((a, b) => a - b)
  assert.deepEqual(figures, [257510, 258928, 264451, 375295])
  assert.equal(c.claims.find(x => x.party === 'YSRCP').status, 'matches')
  assert.equal(c.claims.find(x => x.party === 'TDP').status, 'definition')
})

test('a claim nobody can check is marked so, not marked wrong', () => {
  const c = findFactCheck('ap-debt-june-2014')
  assert.equal(c.claims[0].status, 'unverifiable')
  assert.match(c.explanation, /cannot be checked/i)
  assert.ok(!/false|wrong|lie/i.test(c.claims[0].note), 'the note passes a verdict it has no basis for')
})

test('the page emits ClaimReview, one per claim, with the right rating', () => {
  const c = findFactCheck('ap-debt-31-march-2019')
  const labels = Object.fromEntries(STATUSES.map(s => [s, s]))
  const graph = schemaFor('/factcheck/ap-debt-31-march-2019', {
    title: c.question, description: c.summary,
    factCheck: { check: c, ratings: STATUS_RATING, labels },
  })['@graph']
  const reviews = graph.filter(n => n['@type'] === 'ClaimReview')
  assert.equal(reviews.length, c.claims.length)
  for (const [i, r] of reviews.entries()) {
    assert.equal(r.claimReviewed, c.claims[i].quote)
    assert.equal(r.itemReviewed.author.name, c.claims[i].made_by)
    assert.equal(r.reviewRating.ratingValue, STATUS_RATING[c.claims[i].status])
    assert.match(r.itemReviewed.appearance.url, /^https?:\/\//)
  }
  // No ClaimReview leaks onto an ordinary page.
  const plain = schemaFor('/finances', { title: 'x', description: 'y' })['@graph']
  assert.equal(plain.filter(n => n['@type'] === 'ClaimReview').length, 0)
})

test('the status vocabulary is translated everywhere and never left in English', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json')).factcheck
  for (const code of LOCALES) {
    const fc = JSON.parse(read(`src/i18n/locales/${code}.json`)).factcheck
    assert.ok(fc, `${code} has no factcheck strings`)
    for (const st of STATUSES) {
      assert.ok(fc.status[st], `${code} is missing status ${st}`)
      assert.ok(fc.statusHelp[st], `${code} is missing statusHelp ${st}`)
      if (code !== 'en') {
        assert.notEqual(fc.status[st], en.status[st], `${code}.status.${st} is still English`)
      }
    }
    assert.equal(fc.rules.length, 4, `${code} has ${fc.rules.length} rules, expected 4`)
  }
})

test('the section is wired: routes, prerender, sitemap', () => {
  assert.match(read('src/App.jsx'), /path="\/factcheck\/:slug"/)
  assert.match(read('src/lib/routes.js'), /'\/factcheck\/:slug'/)
  assert.match(read('scripts/prerender.mjs'), /factCheckBody/, 'fact checks are not prerendered')
  assert.match(read('scripts/generate-sitemap.mjs'), /factCheckPath\(check\.slug\)/, 'fact checks are not in the sitemap')
  assert.match(read('src/pages/FactCheckDetail.jsx'), /factcheck\.rules\./, 'the rules are not shown on the page')
})

test('the readme in the data file states the rules the tests enforce', () => {
  const raw = JSON.parse(read('src/data/factchecks.json'))
  const readme = (raw._readme || []).join(' ')
  assert.match(readme, /never a verdict/i)
  assert.match(readme, /reviewed by a person/i)
  assert.match(readme, /Both governments/i)
})
