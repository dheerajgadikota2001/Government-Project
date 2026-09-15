import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  FINANCE_GROUPS, FINANCE_QUESTIONS, financeQuestionPath, findFinanceQuestion,
  financeNeighbours, validateFinanceQuestions,
} from '../../src/lib/financeQuestions.js'
import { matchRoute, ROUTES } from '../../src/lib/routes.js'

/**
 * WHY THIS FILE EXISTS
 *
 * The finances page went from one 13,762px scroll to a menu of questions,
 * each with its own address. Three things can now go quietly wrong: a
 * question that the menu lists but the page never renders (a click that opens
 * nothing), an address that the router serves but the prerenderer and sitemap
 * never heard of (a page search cannot find), and a menu label that exists in
 * English only (a Telugu reader sees English chips on a Telugu page). Each is
 * a failing test here rather than a page somebody notices in a month.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(resolve(here, '../../', f), 'utf8')
const LOCALES = ['en', 'te', 'hi', 'ur', 'ta', 'or']
const look = (obj, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), obj)

test('the question list is complete and every entry is publishable', () => {
  assert.equal(FINANCE_QUESTIONS.length, 9, 'nine sections moved under the menu; the list should say nine')
  assert.deepEqual(validateFinanceQuestions(), [])
  // The validator is only worth having if it catches things.
  assert.ok(validateFinanceQuestions([{ ...FINANCE_QUESTIONS[0], slug: 'Not A Slug' }]).length > 0)
  assert.ok(validateFinanceQuestions([FINANCE_QUESTIONS[0], FINANCE_QUESTIONS[0]]).length > 0)
  assert.ok(validateFinanceQuestions([{ ...FINANCE_QUESTIONS[0], group: 'nowhere' }]).length > 0)
})

test('every question the menu lists is rendered by the page, and nothing else is', () => {
  // The menu and the page agree through the section id. A question with no
  // matching `active.id === '...'` branch would open an empty answer.
  const page = read('src/pages/Finances.jsx')
  const rendered = [...page.matchAll(/active\.id === '([a-z-]+)'/g)].map(m => m[1])
  const listed = FINANCE_QUESTIONS.map(q => q.id)
  assert.deepEqual([...rendered].sort(), [...listed].sort())
  assert.match(page, /<FinanceQuestionMenu active=\{active\}>/)
  assert.match(page, /<DebtClock data=\{data\} \/>/, 'the debt card above the menu must stay')
  assert.match(page, /id="per-government"/, 'the per-government tiles and chart cards above the menu must stay')
  const menuAt = page.indexOf('<FinanceQuestionMenu')
  assert.ok(page.indexOf('id="per-government"') < menuAt, 'the kept sections come before the menu, not inside it')
})

test('every question has an address the router, prerenderer and sitemap all know', () => {
  assert.match(read('src/App.jsx'), /path="\/finances\/:question"/)
  assert.ok(ROUTES.some(r => r.pattern === '/finances/:question'))
  assert.match(read('scripts/prerender.mjs'), /financeQuestionBody/, 'question pages are not prerendered')
  assert.match(read('scripts/generate-sitemap.mjs'), /financeQuestionPath\(question\.slug\)/, 'question pages are not in the sitemap')
  for (const q of FINANCE_QUESTIONS) {
    const path = financeQuestionPath(q.slug)
    assert.equal(matchRoute(path)?.pattern, '/finances/:question', `${path} does not match the question route`)
    assert.equal(matchRoute(`/te${path}`)?.pattern, '/finances/:question')
  }
  // The department pages live one level deeper and must not be swallowed.
  assert.equal(matchRoute('/finances/departments/school-education')?.pattern, '/finances/departments/:slug')
  assert.equal(matchRoute('/finances')?.pattern, '/finances')
})

test('lookup and neighbours behave at the edges', () => {
  assert.equal(findFinanceQuestion('no-such-question'), null)
  assert.equal(findFinanceQuestion(undefined), null)
  assert.equal(findFinanceQuestion(FINANCE_QUESTIONS[3].slug), FINANCE_QUESTIONS[3])
  const first = financeNeighbours(FINANCE_QUESTIONS[0].slug)
  assert.equal(first.prev, null)
  assert.equal(first.next, FINANCE_QUESTIONS[1])
  const last = financeNeighbours(FINANCE_QUESTIONS.at(-1).slug)
  assert.equal(last.next, null)
  assert.equal(last.prev, FINANCE_QUESTIONS.at(-2))
  assert.deepEqual(financeNeighbours('nope'), { prev: null, next: null })
})

test('the menu speaks every language, and every question has its words', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json'))
  for (const code of LOCALES) {
    const cat = JSON.parse(read(`src/i18n/locales/${code}.json`))
    const menu = look(cat, 'finances.menu')
    assert.ok(menu, `${code} has no finances.menu strings`)
    for (const key of ['eyebrow', 'title', 'hint', 'navAria', 'allSources']) {
      assert.ok(menu[key], `${code} is missing finances.menu.${key}`)
      if (code !== 'en') assert.notEqual(menu[key], look(en, `finances.menu.${key}`), `${code}.finances.menu.${key} is still English`)
    }
    for (const g of FINANCE_GROUPS) {
      const label = look(cat, g.labelKey)
      assert.ok(label, `${code} is missing ${g.labelKey}`)
      if (code !== 'en') assert.notEqual(label, look(en, g.labelKey), `${code}.${g.labelKey} is still English`)
    }
    for (const q of FINANCE_QUESTIONS) {
      assert.ok(look(cat, q.questionKey), `${code} is missing ${q.questionKey}`)
      if (q.answerKey) assert.ok(look(cat, q.answerKey), `${code} is missing ${q.answerKey}`)
    }
  }
})
