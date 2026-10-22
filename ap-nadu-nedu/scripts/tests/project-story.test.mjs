import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

import {
  GOVERNMENT_CHANGES, readingsOf, storyFacts, storyTools, keyDates, automaticStory, automaticChart,
  chartModel, projectQuestions, sourceTier, documentOf, eraOf,
} from '../../src/lib/projectStory.js'
import { sourceCode, projectSummary } from '../../src/lib/projectSummary.js'
import { summarySource, whenPrinted } from '../../src/lib/sourceDocs.js'
import { validateStory, resolveStory, keptQuestions, STORY_LANGS } from '../../src/lib/storyData.js'
import { canonicalIdFor } from '../../src/lib/sameWork.js'
import { croreAmount } from '../../src/lib/money.js'
import { localiseVars } from '../../src/lib/placeNames.js'

/**
 * WHY THIS TEST EXISTS
 *
 * Every project page now tells a story, and a story is where a site like this
 * can go wrong in the most damaging way: a sentence can say a project was
 * "delayed" when the record cannot tell, draw a progress line through the day
 * a government changed as though somebody measured it, credit a figure to the
 * wrong document, or print in Telugu a number the English does not carry.
 *
 * So this checks the rules rather than the wording. The findings are tested
 * on their own (storyFacts returns data, not sentences), and then the
 * sentences are built from ten real register rows, in all six languages, and
 * held to three things: every number in them comes from the record, every
 * language carries the same numbers, and no placeholder, code word or long
 * dash ever reaches a reader.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const LANGS = ['en', 'te', 'hi', 'ur', 'ta', 'or']
const TODAY = '2026-09-24'
const CATS = Object.fromEntries(LANGS.map(c => [c, JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${c}.json`), 'utf8'))]))
const FIXTURES = JSON.parse(readFileSync(join(here, 'fixtures/story-records.json'), 'utf8')).records
const byId = id => FIXTURES.find(r => r.project.id === id)

const MONTHS = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The same lookup, fallback and place-name rule the app and the prerenderer use. */
function translator(code) {
  const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
  return (key, vars) => {
    const s = look(CATS[code], key) ?? look(CATS.en, key)
    if (typeof s !== 'string') return key.split('.').pop()
    const v = localiseVars(vars, code)
    return v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s
  }
}

function toolsFor(code) {
  const t = translator(code)
  const fmtMonth = iso => {
    if (!iso) return null
    const [y, m] = String(iso).split('-')
    return m ? t('date.monthYear', { month: t(`month.${MONTHS[Number(m)]}`), year: y }) : y
  }
  const fmtDay = iso => {
    if (!iso) return null
    const [y, m, d] = String(iso).slice(0, 10).split('-')
    return t('date.full', { day: Number(d), month: t(`month.${MONTHS[Number(m)]}`), year: y })
  }
  const fmtNum = n => Number(n).toLocaleString('en-IN')
  return { t, fmtMonth, fmtDay, tools: storyTools({ t, fmtNum, fmtMonth, fmtDay, lang: code }) }
}

function tell(record, code = 'en', today = TODAY) {
  const { t, fmtMonth, tools } = toolsFor(code)
  const project = record.project
  const facts = storyFacts({ project, readings: readingsOf(record.observations), today })
  const observation = record.observations.length ? record.observations[record.observations.length - 1] : null
  return {
    facts,
    keys: keyDates({ facts, project, t, fmtMonth, today }),
    chapters: automaticStory({ project, facts, tools }),
    questions: projectQuestions({ project, observation, facts, tools }),
    chart: automaticChart(facts),
  }
}

/** Every sentence a story shows, flattened, each tagged with where it sits. */
function* sentences(told) {
  for (const k of told.keys) yield [`key ${k.key}`, [k.label, k.value, k.detail].filter(Boolean).join(' ')]
  for (const c of told.chapters) {
    yield [`${c.id} title`, c.title]
    if (c.line) yield [`${c.id} line`, c.line]
    for (const [i, b] of c.blocks.entries()) {
      if (b.type === 'p') yield [`${c.id} p${i}`, b.text]
      else {
        if (b.intro) yield [`${c.id} list${i} intro`, b.intro]
        for (const [j, it] of b.items.entries()) yield [`${c.id} list${i}.${j}`, it.text]
      }
    }
  }
  for (const q of told.questions) yield [`q ${q.key}`, `${q.q} ${q.a}`]
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g
const numbers = s => (String(s).match(NUMBER) || []).map(n => n.replace(/,$/, ''))

function* strings(node, path) {
  if (typeof node === 'string') yield [path, node]
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) yield* strings(v, `${path}.${k}`)
}

// ---------------------------------------------------------------- catalogues

test('every story string exists in all six languages, with the same slots', () => {
  const en = Object.fromEntries(strings(CATS.en.projectDetail.story, 'story'))
  const extra = {
    'q.late': CATS.en.projectDetail.q.late,
    'q.handover': CATS.en.projectDetail.q.handover,
    'a.codeNumber': CATS.en.projectDetail.a.codeNumber,
    'facts.projectCodeHintNumber': CATS.en.projectDetail.facts.projectCodeHintNumber,
  }
  const keys = { ...en, ...extra }
  assert.ok(Object.keys(en).length > 90, 'the story catalogue is missing')
  const slots = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  // Strings that are only punctuation around a slot are the same in every
  // language on purpose.
  const universal = new Set(['story.listSep', 'story.years.entry', 'story.now.lineStatus'])
  for (const code of LANGS.filter(c => c !== 'en')) {
    const mine = {
      ...Object.fromEntries(strings(CATS[code].projectDetail.story, 'story')),
      'q.late': CATS[code].projectDetail.q.late,
      'q.handover': CATS[code].projectDetail.q.handover,
      'a.codeNumber': CATS[code].projectDetail.a.codeNumber,
      'facts.projectCodeHintNumber': CATS[code].projectDetail.facts.projectCodeHintNumber,
    }
    for (const [key, text] of Object.entries(keys)) {
      const theirs = mine[key]
      assert.equal(typeof theirs, 'string', `${code}: ${key} is missing`)
      assert.ok(theirs.trim(), `${code}: ${key} is empty`)
      assert.equal(slots(theirs), slots(text), `${code}: ${key} has different slots from the English`)
      if (!universal.has(key) && !/^story\.(listSep|years\.entry|now\.lineStatus)$/.test(key)) {
        assert.notEqual(theirs, text, `${code}: ${key} was left in English`)
      }
    }
  }
})

test('the project page carries no long dash or double hyphen, in any language', () => {
  const found = []
  for (const code of LANGS) {
    for (const [path, s] of strings(CATS[code].projectDetail, `${code}:projectDetail`)) {
      if (/[—–]|--/.test(s)) found.push(path)
    }
  }
  assert.deepEqual(found, [], `long dashes in: ${found.join(', ')}`)
})

test('the old timeline and tenure-bar strings are gone, not left to drift', () => {
  for (const code of LANGS) {
    for (const k of ['tenures', 'band', 'datedRecord', 'span', 'milestone', 'timeline']) {
      assert.ok(!(k in CATS[code].projectDetail), `${code}: projectDetail.${k} is still in the catalogue`)
    }
  }
})

// ---------------------------------------------------------------- the findings

test('a change of government is a break in the line, never a point on it', () => {
  for (const record of FIXTURES) {
    const { chart } = tell(record)
    if (!chart) continue
    for (const seg of chart.segments) {
      const eras = new Set(seg.dots.map(d => eraOf(d.date)))
      assert.equal(eras.size, 1, `${record.project.id}: one line runs across a change of government`)
    }
    for (const c of chart.changes) {
      assert.ok(chart.dots.some(d => d.date < c) && chart.dots.some(d => d.date >= c),
        `${record.project.id}: a change of government is marked outside the readings`)
    }
  }
  // Veligonda's five survey readings sit either side of both changes.
  const { chart } = tell(byId(622))
  assert.deepEqual(chart.changes, ['2019-05-30', '2024-06-12'])
  assert.equal(chart.segments.length, 3)
})

test('no chart is drawn from fewer than two readings', () => {
  assert.equal(chartModel({ points: [] }), null)
  assert.equal(chartModel({ points: [{ date: '2025-06-30', pct: 40, tier: 'gov' }] }), null)
  assert.equal(chartModel({ points: [{ date: '2025-06-30', pct: 40 }, { date: '2025-06-30', pct: 41 }] }), null,
    'two readings on one day are not a line')
  assert.equal(tell(byId(311)).chart, null, 'an AMRUT scheme with no readings got a chart')
  assert.equal(tell(byId(518)).chart, null, 'one progress reading got a chart')
})

test('what stood either side of a change is told only from real readings', () => {
  // Polavaram (MoSPI): spend before and after June 2024, but no progress
  // figure before it, so only the spend is bracketed.
  const polavaram = tell(byId(613)).facts.handovers
  assert.equal(polavaram.length, 1)
  assert.equal(polavaram[0].change, '2024-06-12')
  assert.equal(polavaram[0].pct, null, 'a progress bracket was made with nothing before the change')
  assert.equal(polavaram[0].spend.before.spent, 21095.31)
  assert.equal(polavaram[0].spend.after.spent, 23775.68)
  for (const record of FIXTURES) {
    for (const h of tell(record).facts.handovers) {
      for (const kind of ['pct', 'spend']) {
        if (!h[kind]) continue
        assert.ok(h[kind].before.date < h.change && h[kind].after.date >= h.change,
          `${record.project.id}: a bracket around ${h.change} is on the wrong side`)
      }
    }
  }
})

test('a passed date is called late only when a later report still shows the work unfinished', () => {
  // Polavaram: due March 2026, the July 2026 report still lists it.
  assert.equal(tell(byId(613)).facts.deadline.kind, 'beforeReport')
  // Due August 2026, latest report July 2026: the record cannot tell.
  assert.equal(tell(byId(546)).facts.deadline.kind, 'afterReport')
  // AMRUT: due September 2026 and it is September 2026, so not passed yet.
  assert.equal(tell(byId(311)).facts.deadline, null)
  // The same scheme a month later: passed, and the only report is from March.
  const later = tell(byId(311), 'en', '2026-10-02').facts.deadline
  assert.equal(later.kind, 'afterReport')
  assert.equal(later.sourceDate, '2026-03-05', 'the AMRUT status date was not read from the record')
  // A completed project is never late.
  assert.equal(tell(byId(2)).facts.deadline, null)
})

test('a figure that goes down is kept, and said to go down, never smoothed', () => {
  const veligonda = tell(byId(622)).facts
  assert.deepEqual(veligonda.pctDrops.map(d => [d.from.pct, d.to.pct]), [[81, 74], [78, 75]])
  const expressway = tell(byId(546)).facts
  assert.deepEqual(expressway.spendDrops.map(d => [d.from.spent, d.to.spent]), [[1256.44, 868.62]])
  const years = tell(byId(622)).chapters.find(c => c.id === 'years')
  const lowered = years.blocks[0].items.filter(i => /lower than the figure before it/.test(i.text))
  assert.equal(lowered.length, 2)
})

test('a cost change is a change in what was printed, not in rounding', () => {
  const expressway = tell(byId(546)).facts.costChanges
  assert.equal(expressway.length, 1)
  assert.equal(expressway[0].from.doc.name, 'MoSPI flash report, June 2025', 'the change is dated from the wrong report')
  assert.equal(expressway[0].to.cost, 1407.33)
  for (const record of FIXTURES) {
    for (const c of tell(record).facts.costChanges) {
      assert.notEqual(croreAmount(c.from.cost), croreAmount(c.to.cost), `${record.project.id}: a change that prints the same`)
    }
  }
})

test('a cost is credited only to a document that printed that figure', () => {
  // Polavaram Phase 1: the ₹30,437 crore comes from the Cabinet approval, not
  // from the surveys whose readings sit on the same page.
  const money = tell(byId(1)).chapters.find(c => c.id === 'money')
  const costPara = money.blocks[0]
  assert.match(costPara.text, /30,437/)
  assert.ok(!costPara.sources.some(s => /Socio-Economic Survey/.test(s.name)),
    'the Cabinet figure was credited to a survey')
})

test('the survey that printed no date is never given a month', () => {
  const doc = documentOf({ source_label: 'Socio-Economic Survey 2018-19, ch.7 Tables 7.3-7.5 (no as-on date printed; survey year end used)' })
  assert.equal(doc.dated, 'none')
  assert.equal(doc.edition, '2018-19')
  assert.equal(doc.name, 'Socio-Economic Survey 2018-19')
  const keys = tell(byId(622)).keys
  assert.equal(keys.find(k => k.key === 'first').value, '2017-18')
})

test('the state\'s own survey is a government document, wherever it is hosted', () => {
  assert.equal(sourceTier('https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/AP_Socio_Economic_Survey_2024_25.pdf'), 'gov')
  assert.equal(sourceTier('https://www.mospi.gov.in/x.pdf'), 'gov')
  assert.equal(sourceTier('https://investor.gmraero.com/pdf/x.pdf'), 'company')
  assert.equal(sourceTier('https://www.thehansindia.com/news/x'), 'other')
  assert.equal(sourceTier('https://s3.ap-south-1.amazonaws.com/someone-else/x.pdf'), 'other')
  assert.equal(sourceTier(null), 'other')
})

test('a code is offered for searching only where the document prints it', () => {
  assert.equal(sourceCode({ external_id: 'SES-IRR-VELIGONDA', source_portal: 'AP Socio-Economic Survey (Planning Dept)' }), null,
    'our own key was presented as the survey\'s code')
  assert.deepEqual(sourceCode({ external_id: 'AP-PONNUR-8747', source_portal: 'AMRUT_MoHUA' }), { code: 'AP-PONNUR-8747', search: '8747' })
  assert.deepEqual(sourceCode({ external_id: '701415', source_portal: 'MOSPI_IPMD' }), { code: '701415', search: '701415' })
  for (const code of LANGS) {
    for (const [where, text] of sentences(tell(byId(622), code))) {
      assert.doesNotMatch(text, /SES-IRR/, `${code} ${where}: the page tells readers to search the survey for our own key`)
    }
  }
})

test('the page names the document its figures came from, not merely the latest one', () => {
  const latest = id => { const r = byId(id); return r.observations[r.observations.length - 1] }
  // A newspaper note about an opening is Veligonda's latest reading; the
  // cost and the progress on the page are the survey's.
  assert.equal(summarySource({ project: byId(622).project, observation: latest(622) }).label, 'AP Socio-Economic Survey (Planning Dept)')
  // Polavaram Phase 1's cost is the Cabinet's; its latest reading is a survey's.
  assert.match(summarySource({ project: byId(1).project, observation: latest(1) }).label, /^PIB/)
  // A MoSPI row points at the flash report its own figures are from.
  assert.equal(summarySource({ project: byId(613).project, observation: latest(613) }).label, 'MoSPI flash report, July 2026')
  // An AMRUT row, by the name and date of its own status report.
  assert.equal(summarySource({ project: byId(311).project, observation: null }).label, 'AMRUT 2.0 status report, as on 05.03.2026')

  const { t, fmtMonth } = toolsFor('en')
  const text = projectSummary({ project: byId(622).project, observation: latest(622), t, fmtNum: n => Number(n).toLocaleString('en-IN'), fmtMonth }).join(' ')
  assert.doesNotMatch(text, /Hans India/, 'the summary credits a newspaper with the survey\'s figures')
})

test('a survey that printed no date is quoted by its edition, never by our filing day', () => {
  const { t, fmtMonth } = toolsFor('en')
  const undated = {
    observed_date: '2019-03-31T00:00:00+00:00', cumulative_expenditure_crore: 627.85,
    source_label: 'Socio-Economic Survey 2018-19, ch.7 Tables 7.3-7.5 (no as-on date printed; survey year end used)',
  }
  assert.equal(whenPrinted(undated, fmtMonth), '2018-19')
  assert.equal(whenPrinted({ ...undated, source_label: 'MoSPI flash report, June 2025', observed_date: '2025-06-30' }, fmtMonth), 'June 2025')
  const text = projectSummary({
    project: { title: 'GUNDLAKAMMA RESERVOIR', estimated_cost_crore: 753.83 },
    observation: undated, t, fmtNum: n => Number(n).toLocaleString('en-IN'), fmtMonth,
  }).join(' ')
  assert.match(text, /As of 2018-19/)
  assert.doesNotMatch(text, /March 2019/, 'the register\'s filing day was printed as the survey\'s date')
})

// ---------------------------------------------------------------- the sentences

test('every number in a story comes from the record', () => {
  for (const record of FIXTURES) {
    const p = record.project
    const obs = record.observations
    const allowed = new Set()
    const add = v => { for (const n of numbers(v)) allowed.add(n) }
    // Figures, as the page rounds them, and as printed.
    for (const v of [p.estimated_cost_crore, p.actual_cost_crore, ...obs.flatMap(o => [o.cumulative_expenditure_crore, o.estimated_cost_crore])]) {
      if (v != null) { add(croreAmount(v)); add(String(v)) }
    }
    for (const v of [p.completion_percentage, ...obs.map(o => o.completion_percentage)]) if (v != null) add(String(v))
    // Dates, as days, months and years.
    for (const d of [p.announced_date, p.start_date, p.expected_completion, p.actual_completion, ...obs.map(o => o.observed_date), ...GOVERNMENT_CHANGES]) {
      if (!d) continue
      const [y, m, day] = String(d).slice(0, 10).split('-')
      add(y); add(String(Number(day)))
    }
    add('2 June 2014')
    // Text the record carries: names, labels, codes, notes.
    for (const v of [p.title, p.department, p.implementing_agency, p.external_id, p.source_portal, p.description,
      ...obs.flatMap(o => [o.source_label, o.status_note])]) if (v) add(v)
    // Counts of reports, which the "year by year" line states.
    for (let n = 1; n <= obs.length; n++) allowed.add(String(n))
    add('05.03.2026')

    for (const code of LANGS) {
      for (const [where, text] of sentences(tell(record, code))) {
        for (const n of numbers(text)) {
          assert.ok(allowed.has(n), `${p.id} ${code} ${where}: "${n}" is not in the record: ${text}`)
        }
      }
    }
  }
})

test('every language tells the same numbers as the English', () => {
  // Compared chapter by chapter and question by question. English leaves out
  // one sentence the others keep ("filed under Roads" beside "listed under
  // Roads & Highways"), and that sentence carries no number, so a chapter's
  // numbers must still match exactly.
  const bags = told => {
    const out = new Map()
    for (const [where, text] of sentences(told)) {
      const key = where.split(' ')[0] === 'q' ? where : where.split(' ')[0]
      out.set(key, [...(out.get(key) || []), ...numbers(text)])
    }
    return new Map([...out].map(([k, v]) => [k, v.sort().join(' ')]))
  }
  for (const record of FIXTURES) {
    const en = bags(tell(record, 'en'))
    for (const code of LANGS.filter(c => c !== 'en')) {
      const theirs = bags(tell(record, code))
      assert.deepEqual([...theirs.keys()], [...en.keys()], `${record.project.id} ${code}: different chapters or questions`)
      for (const [k, v] of en) assert.equal(theirs.get(k), v, `${record.project.id} ${code} ${k}: different numbers`)
    }
  }
})

test('no placeholder, code word or empty sentence reaches a reader', () => {
  for (const record of FIXTURES) {
    for (const code of LANGS) {
      const told = tell(record, code)
      for (const [where, text] of sentences(told)) {
        assert.ok(text && text.trim(), `${record.project.id} ${code} ${where} is empty`)
        assert.doesNotMatch(text, /\{\w+\}|undefined|NaN|\bnull\b|projectDetail\./, `${record.project.id} ${code} ${where}: ${text}`)
        assert.doesNotMatch(text, / {2,}/, `${record.project.id} ${code} ${where} has a double space: ${text}`)
        assert.doesNotMatch(text, /₹₹/, `${record.project.id} ${code} ${where} doubles the rupee sign`)
      }
      for (const c of told.chapters) {
        for (const b of c.blocks) {
          if (b.type !== 'p') continue
          assert.match(b.text, /[.?!।۔”]$/u, `${record.project.id} ${code} ${c.id}: a paragraph does not end: ${b.text}`)
        }
      }
    }
  }
})

test('every paragraph that states a figure names its document', () => {
  // "What the record does not say" states no figure. In "How it started"
  // the row's document is named once, under the first paragraph, and the
  // department's name (which can hold a number, "AMRUT 2.0") is a label.
  for (const record of FIXTURES) {
    const told = tell(record)
    for (const c of told.chapters) {
      if (c.id === 'gaps' || c.id === 'start') continue
      for (const b of c.blocks) {
        if (b.type === 'p' && /\d/.test(b.text) && !/2 June 2014/.test(b.text)) {
          assert.ok(b.sources.length, `${record.project.id} ${c.id}: "${b.text}" names no document`)
        }
        if (b.type === 'list') {
          for (const it of b.items) {
            if (!it.marker && c.id !== 'gaps') assert.ok(it.doc, `${record.project.id} ${c.id}: "${it.text}" has no document`)
          }
        }
      }
    }
  }
})

test('no party is named in any automatic story', () => {
  const parties = /\b(TDP|YSRCP|YSR Congress|Telugu Desam|Janasena|Jana Sena|BJP|Congress|NDA)\b|తెలుగుదేశం|వైఎస్సార్|జనసేన/
  for (const record of FIXTURES) {
    for (const code of LANGS) {
      for (const [where, text] of sentences(tell(record, code))) {
        if (where.startsWith('q ') || where.startsWith('what')) continue   // the record's own words
        assert.doesNotMatch(text, parties, `${record.project.id} ${code} ${where}: ${text}`)
      }
    }
  }
})

test('a chapter with nothing to say is left out, not padded', () => {
  const amrut = tell(byId(311)).chapters.map(c => c.id)
  assert.deepEqual(amrut, ['money', 'now', 'gaps'])
  const polavaram = tell(byId(613)).chapters.map(c => c.id)
  assert.deepEqual(polavaram, ['start', 'years', 'money', 'delays', 'now', 'gaps'])
})

test('"is it late" is asked only about a date or a status, never about a changed figure', () => {
  const veligonda = tell(byId(622)).questions.map(q => q.key)
  assert.ok(!veligonda.includes('late'), 'a fall in progress was offered as the answer to "is it late"')
  assert.ok(tell(byId(613)).questions.some(q => q.key === 'late'))
  assert.ok(tell(byId(632)).questions.some(q => q.key === 'late'), 'a suspended scheme is not asked about')
})

// ---------------------------------------------------------------- hand-written stories

const STORIES = resolve(ROOT, 'src/data/stories')
const storyFiles = dir => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [])

test('every hand-written story passes every check', () => {
  for (const [dir, status] of [[STORIES, 'reviewed'], [join(STORIES, 'drafts'), 'draft']]) {
    for (const file of storyFiles(dir)) {
      const story = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      assert.deepEqual(validateStory(story), [], `${file} fails its checks`)
      assert.equal(story.status, status, `${file} is in the ${status === 'draft' ? 'drafts' : 'reviewed'} folder but is marked ${story.status}`)
      assert.match(file, new RegExp(`^${story.id}-[a-z0-9-]+\\.json$`), `${file} is not named after project ${story.id}`)
      assert.equal(canonicalIdFor(story.id), story.id, `${file} is filed under a merged record, not the page that ranks`)
    }
  }
})

const TINY = () => ({
  id: 2,
  status: 'draft',
  reviewed: null,
  sources: [{ id: 'pib', short: 'PIB, 4 May 2023', title: 'A release', publisher: 'Press Information Bureau', date: '2023-05-04', url: 'https://pib.gov.in/x', tier: 'gov' }],
  facts: [{ text: '₹4,592 crore', source: 'pib' }, { text: '3 May 2023', source: 'pib' }],
  chapters: [{
    id: 'start',
    title: { en: 'How it started', te: 'ఎలా మొదలైంది' },
    line: { en: 'The foundation stone was laid on 3 May 2023.', te: '2023 మే 3న శంకుస్థాపన జరిగింది.' },
    paras: [{ en: 'The first phase was to cost ₹4,592 crore.', te: 'మొదటి దశ వ్యయం ₹4,592 కోట్లు.', sources: ['pib'] }],
  }],
  questions: [],
})

test('the story checks catch the mistakes they exist for', () => {
  assert.deepEqual(validateStory(TINY()), [])

  const undeclared = TINY()
  undeclared.chapters[0].paras[0].en = 'The first phase was to cost ₹4,592 crore, for 6 million passengers.'
  assert.ok(validateStory(undeclared).some(p => /"6" that no fact declares/.test(p)))

  const drifted = TINY()
  drifted.chapters[0].paras[0].te = 'మొదటి దశ వ్యయం ₹4,952 కోట్లు.'
  assert.ok(validateStory(drifted).some(p => /same numbers as the English/.test(p)))

  const unsourced = TINY()
  unsourced.chapters[0].paras[0].sources = []
  assert.ok(validateStory(unsourced).some(p => /names no source/.test(p)))

  const dashed = TINY()
  dashed.chapters[0].paras[0].en = 'The first phase \u2014 the part built first \u2014 was to cost ₹4,592 crore.'
  assert.ok(validateStory(dashed).some(p => /long dash/.test(p)))

  const halfTranslated = TINY()
  delete halfTranslated.chapters[0].paras[0].te
  assert.ok(validateStory(halfTranslated).some(p => /\.te is missing/.test(p)))

  const unreviewed = TINY()
  unreviewed.status = 'reviewed'
  assert.ok(validateStory(unreviewed).some(p => /reviewer/.test(p)))

  const orphan = TINY()
  orphan.facts.push({ text: '₹5,640 crore', source: 'pib' })
  assert.ok(validateStory(orphan).some(p => /appears nowhere/.test(p)))
})

test('a story is shown only in the languages it is written in', () => {
  const fmt = { fmtMonth: s => s, fmtDay: s => s }
  for (const code of STORY_LANGS) assert.ok(resolveStory(TINY(), code, fmt), `${code} did not resolve`)
  for (const code of LANGS.filter(c => !STORY_LANGS.includes(c))) {
    assert.equal(resolveStory(TINY(), code, fmt), null, `${code} got a story nobody wrote in it`)
  }
  const draft = resolveStory(TINY(), 'en', fmt)
  assert.equal(draft.draft, true)
  assert.equal(draft.chapters[0].blocks[0].sources[0].name, 'PIB, 4 May 2023')
})

test('a story replaces only the questions it says it answers', () => {
  const qs = [{ key: 'what' }, { key: 'cost' }, { key: 'handover-2019-05-30' }, { key: 'handover-2024-06-12' }, { key: 'source' }]
  assert.deepEqual(keptQuestions(qs, ['cost', 'handover']).map(q => q.key), ['what', 'source'])
  assert.deepEqual(keptQuestions(qs, []).map(q => q.key), qs.map(q => q.key))
})

test('a completed project is never given a due date, and a fall nobody could see is not reported', () => {
  const bhogapuram = tell(byId(2))
  assert.equal(bhogapuram.facts.due, null, 'a completed project still has a due date')
  assert.ok(!bhogapuram.keys.some(k => k.key === 'due'), 'a completed project shows "Due" at the top')
  const { t, fmtMonth } = toolsFor('en')
  const summary = projectSummary({ project: byId(2).project, observation: null, t, fmtNum: n => Number(n).toLocaleString('en-IN'), fmtMonth }).join(' ')
  assert.doesNotMatch(summary, /Expected completion/, 'a completed project is described as still expected')
  // IISER Tirupati: ₹631.07 crore then ₹630.55 crore, both printed as ₹631.
  assert.deepEqual(tell(byId(518)).facts.spendDrops, [])
})
