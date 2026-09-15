import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { districtSummary } from '../../src/lib/districtSummary.js'

/**
 * WHY THIS FILE EXISTS
 *
 * Two absences, both invisible.
 *
 * A project page carried exactly one internal link: "All projects". So 673
 * pages were dead ends, reachable only by paging a list whose page two has no
 * address. A search engine reads that as 673 orphans and treats an orphan as
 * unimportant however good it is. Nothing was broken; the pages simply had no
 * reason to be considered.
 *
 * And a district page said "Projects" in its heading and repeated the same
 * intro sentence as the other twenty five. "Government projects in Guntur
 * district" is a search people type, and the word Guntur appeared on that page
 * only inside a dropdown, which is not text anything can match.
 *
 * The tests below are mostly about a third thing, though: two endpoints that
 * accept a filter and quietly ignore it. /projects/stats takes a district and
 * returns the statewide totals; /projects/ takes `type` and returns all 673.
 * Both answer 200. Both look right in a spot check, because the first few rows
 * of an unfiltered register happen to match. That is the failure mode worth
 * spending tests on: not an error, a confident wrong number.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(resolve(here, '../../', f), 'utf8')

const EN = JSON.parse(read('src/i18n/locales/en.json'))
const LOCALES = ['en', 'te', 'hi', 'ur', 'ta', 'or']

const translator = cat => (key, vars) => {
  const s = key.split('.').reduce((n, k) => (n == null ? n : n[k]), cat)
  if (typeof s !== 'string') return key.split('.').pop()
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}
const fmtNum = n => Number(n).toLocaleString('en-IN')
const run = (args, code = 'en') =>
  districtSummary({ ...args, t: translator(JSON.parse(read(`src/i18n/locales/${code}.json`))), fmtNum })

// ---------------------------------------------------------------- district

test('a district page states its own count and cost', () => {
  const text = run({
    district: 'Guntur',
    total: 32,
    row: { district: 'Guntur', count: 32, cost_crore: 38554.01 },
  }).join(' ')
  assert.match(text, /32 tracked government projects in Guntur district/)
  assert.match(text, /₹38,554 crore/)
  assert.match(text, /counted in each district it touches/)
})

test('the cost is dropped when the two sources stop agreeing', () => {
  // The count comes from the register query that drew the list; the cost comes
  // from a separate aggregate. If they describe different sets of projects,
  // printing the pair states something neither source supports.
  const text = run({
    district: 'Guntur',
    total: 32,
    row: { district: 'Guntur', count: 31, cost_crore: 38554.01 },
  }).join(' ')
  assert.match(text, /32 tracked government projects/)
  assert.ok(!/38,554/.test(text), 'printed a cost for a set the count no longer matches')
})

test('a missing aggregate costs the sentence, not the page', () => {
  const text = run({ district: 'Guntur', total: 32, row: undefined }).join(' ')
  assert.match(text, /32 tracked government projects in Guntur district/)
  assert.ok(!/₹/.test(text))
})

test('nothing is claimed before the register has answered', () => {
  assert.deepEqual(run({ district: 'Guntur', total: null, row: { count: 32, cost_crore: 1 } }), [])
  assert.deepEqual(run({ district: null, total: 32 }), [])
})

test('the caveat travels with the cost, never without it', () => {
  // "26 districts × their totals" adds up to more than the register holds,
  // because a border project is in both. A reader will do that sum.
  const withCost = run({ district: 'Guntur', total: 32, row: { district: 'Guntur', count: 32, cost_crore: 100 } })
  const noCost = run({ district: 'Guntur', total: 32, row: undefined })
  assert.equal(withCost.length, 3)
  assert.equal(noCost.length, 1, 'a caveat with no figure to qualify is just noise')
})

test('every language can say it, with nothing falling through to English', () => {
  for (const code of LOCALES) {
    const parts = run({ district: 'Guntur', total: 32, row: { district: 'Guntur', count: 32, cost_crore: 38554.01 } }, code)
    assert.equal(parts.length, 3, `${code} produced ${parts.length} sentences`)
    for (const part of parts) {
      assert.ok(!/\{|\}/.test(part), `${code} left a placeholder: ${part}`)
      assert.ok(!/^(count|cost|method|heading)$/.test(part), `${code} is missing a translation`)
    }
    assert.ok(parts.join(' ').includes('38,554'), `${code} lost the figure`)
  }
})

test('the six catalogues agree on the district and related keys', () => {
  for (const block of [['projects', 'district'], ['projectDetail', 'related']]) {
    const shape = code => {
      const cat = JSON.parse(read(`src/i18n/locales/${code}.json`))
      return Object.keys(block.reduce((n, k) => n[k], cat)).sort()
    }
    const english = shape('en')
    assert.ok(english.length >= 4)
    for (const code of LOCALES) {
      assert.deepEqual(shape(code), english, `${code} differs on ${block.join('.')}`)
    }
  }
})

test('no language quietly kept the English string', () => {
  for (const [a, b] of [['projects', 'district'], ['projectDetail', 'related']]) {
    const en = EN[a][b]
    for (const code of LOCALES.filter(c => c !== 'en')) {
      const other = JSON.parse(read(`src/i18n/locales/${code}.json`))[a][b]
      for (const key of Object.keys(en)) {
        assert.notEqual(other[key], en[key], `${code}.${a}.${b}.${key} is still English`)
      }
    }
  }
})

// ------------------------------------------------------------ the wiring

test('the district page names the district in its h1', () => {
  // The single change that makes 26 pages distinct rather than 26 views of one.
  const src = read('src/pages/Projects.jsx')
  assert.match(src, /projects\.district\.heading/,
    'the heading no longer names the district, so the page is unrankable for it')
  assert.match(src, /districtSummary\(/, 'the district lead sentence is gone')
})

test('the district cost is never taken from the endpoint that ignores the filter', () => {
  // /projects/stats?district=Guntur returns 673 projects and ₹3.78 lakh crore.
  // It answers 200 and looks entirely plausible.
  const src = read('src/pages/Projects.jsx')

  // The rule, stated directly: the cost row comes from insights, and no
  // request anywhere asks /projects/stats to filter by anything. A proximity
  // regex around districtSummary() was the first version of this and it
  // matched an unrelated `stats` a few lines below, which made the test fail
  // on correct code. A test that cries wolf gets deleted, and then the real
  // rule is unguarded.
  assert.match(src, /row: \(insights\?\.by_district \|\| \[\]\)/,
    'the per-district row is no longer coming from insights')

  for (const file of ['src/pages/Projects.jsx', 'src/lib/districtSummary.js']) {
    const text = read(file)
    assert.ok(!/projects\/stats\?/.test(text),
      `${file} calls /projects/stats with a query; that endpoint ignores its ` +
      'filters and answers with the statewide totals')
  }

  // districtSummary must not be able to reach an endpoint at all. Its numbers
  // are handed to it, which is what makes the cross-check meaningful.
  assert.ok(!/fetch|apiGet/.test(read('src/lib/districtSummary.js')),
    'districtSummary fetches its own data now, so the count and the cost no ' +
    'longer come from two sources that get compared')
})

test('project pages link to their neighbours and to their district', () => {
  const detail = read('src/pages/ProjectDetail.jsx')
  assert.match(detail, /<RelatedProjects/, 'project pages are dead ends again')

  const related = read('src/components/RelatedProjects.jsx')
  assert.match(related, /to=\{`\/projects\/\$\{p\.id\}`\}/, 'no links to other project pages')
  assert.match(related, /districtPath\(district\)/,
    'nothing links to the district page, so it cannot rank for its own name')
})

test('the related list uses the parameter the API actually reads', () => {
  // `type` is accepted and ignored: it returns all 673, and the first seven of
  // an unfiltered register happen to be irrigation, so a spot check passes
  // while every non-irrigation project shows the wrong neighbours.
  const src = read('src/components/RelatedProjects.jsx')
  assert.match(src, /project_type=/, 'back to a parameter the API silently drops')
  assert.ok(!/[?&]type=\$\{/.test(src), 'the ignored `type` parameter is back')
})

test('an empty result renders nothing at all', () => {
  // A heading over an empty box reads as a broken page, and on a project with
  // no district and no type there is genuinely nothing to show.
  const src = read('src/components/RelatedProjects.jsx')
  assert.match(src, /if \(!items \|\| items\.length === 0\) return null/)
})

test('a project never lists itself as its own neighbour', () => {
  const src = read('src/components/RelatedProjects.jsx')
  assert.match(src, /filter\(p => p\.id !== id\)/,
    'the current project can appear in its own related list')
})
