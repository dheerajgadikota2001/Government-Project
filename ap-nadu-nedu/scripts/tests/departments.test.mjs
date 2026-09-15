import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  departmentSlug, departmentPath, departmentFacts, departmentSummary,
} from '../../src/lib/departmentSummary.js'

/**
 * WHY THIS FILE EXISTS
 *
 * These pages exist to say one thing nobody else in Andhra Pradesh says: what
 * a department was budgeted, and what the audited accounts recorded as spent,
 * for the same year. That sentence is only worth anything if it cannot be
 * produced by accident.
 *
 * Every dangerous version of it is a subtraction between two numbers that do
 * not belong together: one year's plan against another year's outcome, a
 * revised estimate treated as an actual, a Revenue figure carried back past
 * 2017-18 when the books published Plan and Non-Plan instead. Each of those
 * produces a confident, wrong, quotable number on a page whose entire claim is
 * that its figures can be checked against the government's own books.
 *
 * So most of this file is about the subtractions the page must refuse to do.
 */

const here = dirname(fileURLToPath(import.meta.url))
const LOCALES = ['en', 'te', 'hi', 'ur', 'ta', 'or']
const load = c => JSON.parse(readFileSync(resolve(here, `../../src/i18n/locales/${c}.json`), 'utf8'))

const translator = cat => (key, vars) => {
  const s = key.split('.').reduce((n, k) => (n == null ? n : n[k]), cat)
  if (typeof s !== 'string') return key.split('.').pop()
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}
const fmtNum = n => Number(n).toLocaleString('en-IN')
const run = (department, code = 'en') =>
  departmentSummary({ department, t: translator(load(code)), fmtNum })

/** Real rows, copied from the live register rather than invented. */
const SCHOOL = {
  department: 'School Education',
  demand_no: 'XII',
  rows: [
    { year: '2014-15', tenure: 'tdp1', stage: 'BE', total_crore: 12594.64, source_url: 'https://x/2014.pdf' },
    { year: '2018-19', tenure: 'tdp1', stage: 'BE', total_crore: 21612.30 },
    { year: '2018-19', tenure: 'tdp1', stage: 'RE', total_crore: 17196.59 },
    { year: '2018-19', tenure: 'tdp1', stage: 'Actual', total_crore: 17543.38 },
    { year: '2019-20', tenure: 'ysrcp', stage: 'BE', total_crore: 29772.79 },
    { year: '2019-20', tenure: 'ysrcp', stage: 'Actual', total_crore: 24819.73 },
    { year: '2023-24', tenure: 'ysrcp', stage: 'BE', total_crore: 29690.71 },
    { year: '2026-27', tenure: 'tdp2', stage: 'BE', total_crore: 32308.32 },
  ],
}

test('slugs are stable and readable', () => {
  assert.equal(departmentSlug('School Education'), 'school-education')
  assert.equal(departmentSlug('Women, Child And Disabled Welfare'), 'women-child-and-disabled-welfare')
  assert.equal(departmentSlug('Forest, Science, Technology And Environment'),
    'forest-science-technology-and-environment')
  assert.equal(departmentPath('School Education'), '/finances/departments/school-education')
  assert.equal(departmentPath(''), '/finances')
})

test('the page leads with this year, not with 2014', () => {
  const text = run(SCHOOL).join(' ')
  assert.match(text, /₹32,308 crore for School Education in 2026-27/)
})

test('budgeted against spent is only ever the same year', () => {
  // The whole point of the page, and the one number it could get badly wrong.
  const f = departmentFacts(SCHOOL)
  for (const g of f.gaps) {
    const budget = SCHOOL.rows.find(r => r.stage === 'BE' && r.year === g.year)
    const actual = SCHOOL.rows.find(r => r.stage === 'Actual' && r.year === g.year)
    assert.ok(budget && actual, `a gap was computed for ${g.year} without both figures`)
    assert.equal(g.budgeted, budget.total_crore)
    assert.equal(g.spent, actual.total_crore)
    assert.equal(g.gap, budget.total_crore - actual.total_crore)
  }
  assert.equal(f.gaps.length, 2, 'expected gaps only for the two years that have both')

  const text = run(SCHOOL).join(' ')
  assert.match(text, /In 2019-20 the state budgeted ₹29,773 crore/)
  assert.match(text, /₹24,820 crore spent/)
  assert.match(text, /₹4,953 crore less than the Assembly authorised/)
})

test('a revised estimate is never mistaken for an outcome', () => {
  // 2018-19 has BE, RE and Actual. Using RE would give a different, wrong gap.
  const f = departmentFacts(SCHOOL)
  const g = f.gaps.find(x => x.year === '2018-19')
  assert.equal(g.spent, 17543.38, 'the revised estimate was used instead of the audited actual')
  assert.notEqual(g.spent, 17196.59)
})

test('a department with no audited accounts says so, and claims nothing', () => {
  const plansOnly = {
    department: 'Tourism, Art And Culture',
    rows: [
      { year: '2025-26', tenure: 'tdp2', stage: 'BE', total_crore: 500 },
      { year: '2026-27', tenure: 'tdp2', stage: 'BE', total_crore: 600 },
    ],
  }
  const text = run(plansOnly).join(' ')
  assert.match(text, /not in the collection yet/)
  assert.ok(!/spent|audited accounts recorded/.test(text.replace(/not in the collection yet.*/s, '')),
    'a spending claim leaked onto a page with no audited accounts')
  assert.deepEqual(departmentFacts(plansOnly).gaps, [])
})

test('governments are compared per year, never by total', () => {
  // The 2014 and 2019 governments had five budgets, the present one has three.
  // A total would say the newest government spends least, which is arithmetic
  // rather than fact.
  const f = departmentFacts(SCHOOL)
  const tdp2 = f.perTenure.find(p => p.tenure === 'tdp2')
  assert.equal(tdp2.years, 1)
  assert.equal(tdp2.perYear, 32308.32)
  const ysrcp = f.perTenure.find(p => p.tenure === 'ysrcp')
  assert.equal(ysrcp.years, 2)
  assert.equal(Math.round(ysrcp.perYear), Math.round((29772.79 + 29690.71) / 2))

  assert.match(run(SCHOOL).join(' '), /Averaged per year/)
})

test('an empty or unusable record produces nothing', () => {
  assert.deepEqual(run({ department: 'Nothing', rows: [] }), [])
  assert.deepEqual(run({ rows: [{ year: '2020-21', stage: 'BE', total_crore: 5 }] }), [])
  assert.deepEqual(run(null), [])
  assert.deepEqual(departmentFacts(null).gaps, [])
})

test('no figure is ever invented, in any language', () => {
  for (const code of LOCALES) {
    const parts = run(SCHOOL, code)
    assert.ok(parts.length >= 3, `${code} produced only ${parts.length} sentences`)
    for (const part of parts) {
      assert.ok(!/\{|\}/.test(part), `${code} left a placeholder: ${part}`)
      assert.ok(!/undefined|null|NaN|₹₹/.test(part), `${code} leaked a value: ${part}`)
      assert.ok(!/^(latest|span|gap|noActuals|perTenure|heading)$/.test(part),
        `${code} is missing a translation for ${part}`)
    }
    assert.ok(parts.join(' ').includes('32,308'), `${code} lost the headline figure`)
  }
})

test('the six catalogues agree, and none quietly kept English', () => {
  const block = code => load(code).finances.dept
  const en = block('en')
  for (const code of LOCALES) {
    assert.deepEqual(Object.keys(block(code)).sort(), Object.keys(en).sort(),
      `${code} has a different set of department keys`)
  }
  for (const code of LOCALES.filter(c => c !== 'en')) {
    const other = block(code)
    for (const [key, value] of Object.entries(en)) {
      if (typeof value !== 'string') continue
      assert.notEqual(other[key], value, `${code}.finances.dept.${key} is still the English string`)
    }
  }
})

test('the page is wired up and reachable', () => {
  const read = f => readFileSync(resolve(here, '../../', f), 'utf8')
  assert.match(read('src/App.jsx'), /path="\/finances\/departments\/:slug"/,
    'the department route is gone, so forty pages 404')
  assert.match(read('src/lib/routes.js'), /'\/finances\/departments\/:slug'/,
    'the route table and the router have drifted')

  const page = read('src/pages/Department.jsx')
  assert.match(page, /all\.caveats/,
    'the caveats no longer come from the register, so the page can drift from ' +
    'the rules the data was collected under')
  assert.match(page, /departmentPath\(d\.department\)/,
    'the forty departments no longer link to each other')

  const pre = read('scripts/prerender.mjs')
  assert.match(pre, /departmentBody/, 'department pages are not prerendered')
  const sitemap = read('scripts/generate-sitemap.mjs')
  assert.match(sitemap, /departmentPath\(name\)/, 'department pages are not in the sitemap')
})
