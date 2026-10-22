import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

import { readingsOf, storyFacts, storyTools } from '../../src/lib/projectStory.js'
import { automaticSteps, flagshipSteps, stepsPicture, MAX_STEPS, MIN_STEPS } from '../../src/lib/projectSteps.js'
import { validateStory, resolveStory, STEP_ICONS } from '../../src/lib/storyData.js'
import { localiseVars } from '../../src/lib/placeNames.js'
import { inspectPictures, STEPS_MAX_BYTES, STEPS_SIZE } from '../share-cards.mjs'

/**
 * WHY THIS TEST EXISTS
 *
 * The story in steps is the part of a project page most likely to be read,
 * read aloud and forwarded as a picture, so it is the part where a wrong
 * figure travels furthest. The rules it must keep are the story's rules:
 * nothing picked, nothing smoothed, nothing invented, every step naming its
 * paper. The records here are the story tests' own, copied from the live
 * API (fixtures/story-records.json), so the rules are held against real
 * data, not a record made to pass.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const TODAY = '2026-09-24'
const RECORDS = JSON.parse(readFileSync(join(here, 'fixtures/story-records.json'), 'utf8')).records
const record = id => RECORDS.find(r => r.project.id === id)

const catalogue = code => JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${code}.json`), 'utf8'))
const CATS = { en: catalogue('en'), te: catalogue('te') }
const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
const MONTHS = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
function toolsFor(code) {
  const t = (key, vars) => {
    const s = look(CATS[code], key) ?? look(CATS.en, key)
    if (typeof s !== 'string') return key.split('.').pop()
    const v = localiseVars(vars, code)
    return v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s
  }
  const fmtMonth = iso => {
    if (!iso) return null
    const [y, m] = String(iso).split('-')
    return m ? t('date.monthYear', { month: t(`month.${MONTHS[Number(m)]}`), year: y }) : y
  }
  const fmtDay = iso => {
    const [y, m, d] = String(iso).slice(0, 10).split('-')
    return t('date.full', { day: Number(d), month: t(`month.${MONTHS[Number(m)]}`), year: y })
  }
  const fmtNum = n => Number(n).toLocaleString('en-IN')
  return { t, fmtMonth, fmtDay, tools: storyTools({ t, fmtNum, fmtMonth, fmtDay, lang: code }) }
}
function road(id, code = 'en') {
  const r = record(id)
  const { tools } = toolsFor(code)
  const facts = storyFacts({ project: r.project, readings: readingsOf(r.observations), today: TODAY })
  return automaticSteps({ project: r.project, facts, tools, today: TODAY })
}
const BHOGAPURAM = JSON.parse(readFileSync(join(ROOT, 'src/data/stories/drafts/2-bhogapuram-airport.json'), 'utf8'))

// ------------------------------------------------------------- the rule

test('a road is the approval, then the readings, then the due date, oldest first', () => {
  // 546: a MoSPI project with three readings, approved in 2016 and past its date.
  const steps = road(546)
  assert.deepEqual(steps.map(s => s.icon), ['verified', 'monitoring', 'monitoring', 'monitoring', 'event'])
  const dates = steps.map(s => s.date)
  assert.deepEqual(dates, [...dates].sort(), 'the road is not oldest first')
  assert.ok(steps.length >= MIN_STEPS && steps.length <= MAX_STEPS)
})

test('every step names the paper it comes from, with a link when the record has one', () => {
  for (const r of RECORDS) {
    const steps = road(r.project.id)
    if (!steps) continue
    for (const s of steps) {
      assert.ok(s.paper?.name, `${r.project.id}: "${s.text}" names no paper`)
      assert.ok(!/MOSPI_IPMD|AMRUT_MoHUA/.test(s.paper.name), `${r.project.id}: a step names our import key "${s.paper.name}"`)
    }
  }
})

test('when every reading does not fit in five steps, only the first and the latest are shown', () => {
  // Record 1 has five survey readings and a due date: six steps would not
  // fit, so no reading from the middle is picked. The chart shows them all.
  const steps = road(1)
  const readings = steps.filter(s => s.icon === 'monitoring')
  assert.equal(readings.length, 2)
  const all = readingsOf(record(1).observations)
  assert.equal(readings[0].date, all[0].date, 'the first reading is not the first on record')
  assert.equal(readings[1].date, all[all.length - 1].date, 'the latest reading is not the latest on record')
  assert.ok(!steps.some(s => s.note), 'with the middle left out, no step may be called lower than its neighbour')
})

test('a figure lower than the one before it is marked, never smoothed away', () => {
  // 622: a survey project whose printed progress goes down twice.
  const steps = road(622)
  const lower = steps.filter(s => s.note)
  assert.equal(lower.length, 2)
  for (const s of lower) assert.equal(s.note, 'Lower than the report before')
})

test('a due date that has passed is called passed, and nothing is called late', () => {
  const steps = road(613)
  const due = steps.find(s => s.icon === 'event')
  assert.equal(due.note, look(CATS.en, 'projectDetail.story.keyDates.passed'))
  for (const r of RECORDS) {
    for (const s of road(r.project.id) || []) assert.doesNotMatch(`${s.text} ${s.note || ''}`, /\blate\b|delay/i)
  }
})

test('a record that cannot make three steps has no road, and keeps its key dates', () => {
  assert.equal(road(311), null, 'an AMRUT scheme with no readings was given a road')
  assert.equal(road(2), null, 'a curated record with no readings was given a road')
})

test('money spent is a step only when it is above zero', () => {
  const r = record(546)
  const zero = { ...r, observations: r.observations.map(o => ({ ...o, completion_percentage: null, estimated_cost_crore: null, cumulative_expenditure_crore: 0 })) }
  const { tools } = toolsFor('en')
  const facts = storyFacts({ project: zero.project, readings: readingsOf(zero.observations), today: TODAY })
  const steps = automaticSteps({ project: zero.project, facts, tools, today: TODAY }) || []
  assert.ok(!steps.some(s => /₹0 crore/.test(s.text)), 'a report that printed nothing was told as "₹0 crore spent"')
})

test('the Telugu road carries exactly the English numbers', () => {
  const digits = s => (s.match(/\d[\d,.]*/g) || []).join(' ')
  for (const r of RECORDS) {
    const en = road(r.project.id, 'en'), te = road(r.project.id, 'te')
    if (!en) { assert.equal(te, null); continue }
    assert.equal(te.length, en.length)
    en.forEach((s, i) => assert.equal(digits(te[i].text), digits(s.text), `${r.project.id} step ${i + 1}`))
  }
})

// ------------------------------------------------------------- hand-written

test('a hand-written road passes the story checks and resolves in both languages', () => {
  assert.deepEqual(validateStory(BHOGAPURAM), [])
  for (const code of ['en', 'te']) {
    const { fmtMonth, fmtDay } = toolsFor(code)
    const told = resolveStory(BHOGAPURAM, code, { fmtMonth, fmtDay })
    assert.equal(told.steps.length, 5)
    assert.ok(told.stepsTitle)
    for (const s of told.steps) assert.ok(s.paper?.name && s.text && s.short, `${code}: ${JSON.stringify(s)}`)
  }
})

test('the story checks refuse a road that breaks the rules', () => {
  const broken = mutate => { const s = structuredClone(BHOGAPURAM); mutate(s); return validateStory(s).join(' | ') }
  assert.match(broken(s => { s.steps[1].text.en = 'The ministry gave approval on 9 October 2016.'; s.steps[1].text.te = s.steps[1].text.te.replace('.', ' 9 2016.') }),
    /no fact declares/, 'an undeclared number got through')
  assert.match(broken(s => { [s.steps[0], s.steps[1]] = [s.steps[1], s.steps[0]] }), /older than the step before/)
  assert.match(broken(s => { s.steps[0].short.en = 'Company set up.' }), /ends with a full stop/)
  assert.match(broken(s => { s.steps[0].icon = 'flight_takeoff' }), /not one of/)
  assert.match(broken(s => { s.steps.splice(2) }), /three to five steps/)
  assert.match(broken(s => { delete s.stepsTitle }), /stepsTitle/)
})

test('every icon a step may carry is in the shipped icon font', () => {
  // A story file is JSON, which the icon guard does not read; a missing icon
  // would show on the page as its bare name.
  const shipped = new Set(JSON.parse(readFileSync(join(ROOT, 'src/fonts/icons.generated.json'), 'utf8')).icons)
  for (const icon of [...STEP_ICONS, 'share', 'download', 'link', 'menu_book', 'progress_activity']) {
    assert.ok(shipped.has(icon), `"${icon}" is not in src/fonts/icons.generated.json; run npm run icons`)
  }
})

// ------------------------------------------------------------- the picture

test('the picture has one line per step and the page\'s own address', () => {
  const { t } = toolsFor('te')
  const pic = stepsPicture({ steps: road(613, 'te'), title: 'Polavaram Irrigation Project', eyebrow: 'x', link: 'apfactcheck.dheeco.com/te/projects/613', t, lang: 'te' })
  assert.equal(pic.steps.length, road(613, 'te').length)
  assert.equal(pic.link, 'apfactcheck.dheeco.com/te/projects/613')
  assert.equal(pic.foot, look(CATS.te, 'projectDetail.story.steps.pictureFoot'))
  for (const s of pic.steps) assert.match(s.chip, /^\d{4}(-\d{2})?$/)
})

test('every steps picture draws cleanly: nothing hidden, nothing over the edge, small enough to send', async t => {
  const pictures = []
  for (const code of ['en', 'te']) {
    const { t: tr, fmtMonth, fmtDay } = toolsFor(code)
    const told = resolveStory(BHOGAPURAM, code, { fmtMonth, fmtDay })
    pictures.push({ name: `Bhogapuram ${code}`, card: stepsPicture({ steps: told.steps, title: told.stepsTitle, link: 'apfactcheck.dheeco.com/te/projects/2', t: tr, lang: code }) })
    for (const id of [613, 622, 546, 518]) {
      pictures.push({ name: `${id} ${code}`, card: stepsPicture({ steps: road(id, code), title: record(id).project.title, eyebrow: tr('projectDetail.story.steps.title'), link: `apfactcheck.dheeco.com/projects/${id}`, t: tr, lang: code }) })
    }
  }
  const audits = await inspectPictures(pictures.map(p => p.card))
  if (!audits) {
    t.skip('Chromium is not installed here. Run "npx playwright install chromium" once to test the drawing.')
    return
  }
  pictures.forEach(({ name }, i) => {
    const a = audits[i]
    assert.deepEqual(a.overlaps, [], `${name}: ${a.overlaps.join(', ')} overlap`)
    assert.deepEqual(a.outside, [], `${name}: ${a.outside.join(', ')} outside the picture`)
    assert.deepEqual(a.clipped, [], `${name}: ${a.clipped.join(', ')} hidden`)
    assert.deepEqual(a.size, { width: STEPS_SIZE, height: STEPS_SIZE })
    assert.ok(a.bytes <= STEPS_MAX_BYTES, `${name}: ${a.bytes} bytes`)
    assert.ok(a.labelSize >= 38, `${name}: steps drawn at ${a.labelSize}px, too small for a phone`)
  })
})
