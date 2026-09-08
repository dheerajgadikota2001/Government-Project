import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { projectSummary } from '../../src/lib/projectSummary.js'

/**
 * WHY THIS TEST EXISTS
 *
 * This paragraph is the only prose on a project page, which makes it the only
 * thing a search for "how much has been spent on polavaram" can match. It is
 * also the one place on the site where a number is assembled into a claim
 * rather than displayed in a labelled box. A tile that says "—" is obviously
 * missing. A sentence that says "₹0 crore had been spent" is a lie, and on a
 * platform whose entire argument is that it does not invent figures, that is
 * not a display bug, it is the end of the argument.
 *
 * So most of what follows is about absence: what the paragraph must refuse to
 * say when the record does not support it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const LOCALES = ['en', 'te', 'hi', 'ur', 'ta', 'or']

const load = code =>
  JSON.parse(readFileSync(resolve(here, `../../src/i18n/locales/${code}.json`), 'utf8'))

/** The real interpolation, so a missing placeholder shows up as a failure. */
function translator(cat) {
  const lookup = key => key.split('.').reduce((n, k) => (n == null ? n : n[k]), cat)
  return (key, vars) => {
    const s = lookup(key)
    if (typeof s !== 'string') return key.split('.').pop()
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
  }
}

const fmtNum = n => Number(n).toLocaleString('en-IN')
const fmtMonth = iso => (iso ? `MONTH ${String(iso).slice(0, 4)}` : null)

const run = (project, observation, code = 'en') =>
  projectSummary({ project, observation, t: translator(load(code)), fmtNum, fmtMonth })

const POLAVARAM = {
  title: 'POLAVARAM IRRIGATION PROJECT',
  estimated_cost_crore: 55548.87,
  completion_percentage: 76,
  expected_completion: '2027-12-01T00:00:00Z',
  announced_date: '2009-02-01T00:00:00Z',
  source_portal: 'MOSPI_IPMD',
}
const OBSERVATION = {
  cumulative_expenditure_crore: 23775.68,
  observed_date: '2025-06-30',
  source_label: 'MoSPI flash report, June 2025',
}

test('a full record produces the answer someone would search for', () => {
  const text = run(POLAVARAM, OBSERVATION).join(' ')
  // The first version of this test asserted /₹23,776 crore/, which happily
  // matched inside "₹₹23,776 crore" and let a doubled rupee sign through onto
  // every project page in every language. Anchor on the sign itself.
  assert.ok(!/₹₹/.test(text), `doubled rupee sign: ${text}`)
  assert.match(text, /(^|[^₹])₹23,776 crore/)
  assert.match(text, /₹55,549 crore/)
  assert.match(text, /POLAVARAM IRRIGATION PROJECT/)
  assert.match(text, /76%/)
  assert.match(text, /MoSPI flash report, June 2025/)
})

test('a missing figure removes its clause and invents nothing', () => {
  const noCost = run({ ...POLAVARAM, estimated_cost_crore: null }, OBSERVATION).join(' ')
  assert.ok(!/estimated cost/.test(noCost), 'kept a cost clause with no cost on record')
  assert.match(noCost, /₹23,776 crore/, 'dropped the spend along with the cost')

  const noProgress = run({ ...POLAVARAM, completion_percentage: null }, OBSERVATION).join(' ')
  assert.ok(!/Physical progress/.test(noProgress))

  for (const text of [noCost, noProgress]) {
    assert.ok(!/undefined|null|NaN|\{|\}/.test(text), `placeholder leaked: ${text}`)
  }
})

test('a spend figure is never printed without the date it was published', () => {
  // "₹23,776 crore has been spent" with no as-of date is a number nobody can
  // check against a document, which is the one thing this site must not do.
  const text = run(POLAVARAM, { cumulative_expenditure_crore: 23775.68 }).join(' ')
  assert.ok(!/23,776/.test(text), 'printed a spend figure with no date behind it')
  assert.match(text, /₹55,549 crore/, 'should still fall back to the cost sentence')
})

test('a bare record says nothing rather than something empty', () => {
  assert.deepEqual(run({ title: 'A road' }, null), [])
  assert.deepEqual(run({}, null), [])
  assert.deepEqual(run(null, null), [])
})

test('the source line only appears when there are figures to attribute', () => {
  const orphan = run({ title: 'A road', source_portal: 'MOSPI_IPMD' }, null)
  assert.deepEqual(orphan, [], 'attributed a paragraph that has no figures in it')
})

test('a completed project is not described as still expected', () => {
  const done = run({ ...POLAVARAM, actual_completion: '2024-03-01T00:00:00Z' }, OBSERVATION).join(' ')
  assert.match(done, /completed in MONTH 2024/)
  assert.ok(!/Expected completion/.test(done))
})

test('every language can build the paragraph, with no key falling through', () => {
  for (const code of LOCALES) {
    const parts = run(POLAVARAM, OBSERVATION, code)
    assert.equal(parts.length, 5, `${code} produced ${parts.length} sentences`)
    for (const part of parts) {
      assert.ok(!/\{|\}/.test(part), `${code} left a placeholder: ${part}`)
      assert.ok(!/₹₹/.test(part), `${code} doubled the rupee sign: ${part}`)
      // A missing key falls back to the last segment of its own name, which
      // renders as a stray English word in the middle of Telugu prose.
      assert.ok(!/^(spendVsCost|spendOnly|costOnly|progress|expected|completed|approved|source|croreWord)$/.test(part),
        `${code} is missing a translation for ${part}`)
    }
    assert.ok(parts.join(' ').includes('₹23,776'), `${code} lost the spend figure`)
  }
})

test('the six catalogues agree on which summary keys exist', () => {
  const shape = code => Object.keys(load(code).projectDetail.summary).sort()
  const english = shape('en')
  assert.ok(english.length >= 8)
  for (const code of LOCALES) {
    assert.deepEqual(shape(code), english, `${code} has a different set of summary keys`)
  }
})

test('no language left the summary in English by accident', () => {
  // A copied English string is the silent failure mode of a translation pass:
  // nothing breaks, and a Telugu reader gets an English sentence.
  const en = load('en').projectDetail.summary
  for (const code of LOCALES.filter(c => c !== 'en')) {
    const other = load(code).projectDetail.summary
    for (const key of Object.keys(en)) {
      assert.notEqual(other[key], en[key], `${code}.${key} is still the English string`)
    }
  }
})

test('the approval date is never called an announcement', () => {
  // announced_date is fed by one thing: the MoSPI flash report's approval
  // column. Polavaram reads February 2009 there and was proposed decades
  // earlier. Saying "announced" would put a claim on 673 pages that the
  // record does not support, and on this site that is not a wording problem,
  // it is the argument the whole platform rests on.
  const en = load('en').projectDetail.summary
  assert.ok(en.approved, 'the approval sentence is missing')
  assert.ok(!('announced' in en), 'the old announced key is still there')
  assert.ok(!/announce/i.test(en.approved),
    `the approval sentence still calls it an announcement: ${en.approved}`)

  const text = run(POLAVARAM, OBSERVATION).join(' ')
  assert.ok(!/announced/i.test(text), `summary still says announced: ${text}`)
  assert.match(text, /approval in MONTH 2009/)
})

test('a small project is not rounded into a different number', () => {
  // Rounding everything to whole crore turned a real ₹2.82 crore sewerage
  // scheme into "₹3 crore". Six per cent, on the page that exists to say the
  // figure has not been moved. Most of the register is small projects like
  // this one, so this is the common case, not the edge case.
  const small = run({ title: 'A sewerage network', estimated_cost_crore: 2.82 }, null).join(' ')
  assert.match(small, /₹2\.82 crore/)
  assert.ok(!/₹3 crore/.test(small))

  // A whole number must not gain false precision on the way through.
  const round = run({ title: 'A road', estimated_cost_crore: 12 }, null).join(' ')
  assert.match(round, /₹12 crore/)
  assert.ok(!/12\.00/.test(round))

  // Large figures stay readable: nobody wants ₹55,548.87 crore in a sentence.
  const big = run(POLAVARAM, OBSERVATION).join(' ')
  assert.match(big, /₹55,549 crore/)
  assert.ok(!/55,548\.87/.test(big))
})

test('the rounding rule is shared, not copied', async () => {
  // The paragraph and the tile beneath it read the same field. Two copies of
  // this rule is how a page ends up saying ₹2.82 crore in the sentence and
  // ₹3 Cr in the box, six inches apart, about the same number.
  const { croreAmount } = await import('../../src/lib/money.js')
  const detail = readFileSync(resolve(here, '../../src/pages/ProjectDetail.jsx'), 'utf8')
  const summarySrc = readFileSync(resolve(here, '../../src/lib/projectSummary.js'), 'utf8')

  assert.equal(croreAmount(2.82, fmtNum), '2.82')
  assert.equal(croreAmount(12, fmtNum), '12')
  assert.equal(croreAmount(55548.87, fmtNum), '55,549')
  // Number(null) is 0. A formatter that answers "0" to "no figure on record"
  // prints ₹0 crore, which is the one sentence this platform cannot afford.
  for (const empty of [null, undefined, '', 'nonsense', NaN]) {
    assert.equal(croreAmount(empty, fmtNum), null, `croreAmount(${String(empty)}) invented a number`)
  }
  assert.equal(croreAmount(0, fmtNum), '0', 'a real recorded zero is still a zero')

  assert.match(summarySrc, /croreAmount/, 'the summary stopped using the shared rule')
  assert.ok(!/Math\.round\((?:project|latestObs)\.[a-z_]*(?:cost|expenditure)[a-z_]*\)/.test(detail),
    'a cost tile went back to rounding on its own')
})
