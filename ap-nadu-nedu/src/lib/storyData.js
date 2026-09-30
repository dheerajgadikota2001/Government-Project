/**
 * Hand-written project stories: their format, the checks every one must
 * pass, and how a page turns one into chapters.
 *
 * WHY SOME STORIES ARE WRITTEN BY HAND
 *
 * The automatic story (projectStory.js) can only say what a project's own
 * register row says. For the twenty or so projects that people in Andhra
 * Pradesh actually argue about, the real story is in documents the register
 * does not hold as rows: Government Orders, audit reports, Cabinet approvals,
 * lenders' papers. Those stories are written by hand, one file per project,
 * in src/data/stories.
 *
 * WHY THE CHECKS ARE THIS STRICT
 *
 * A hand-written story is the one place on this site where a person, not a
 * parser, puts a number into a sentence. So every number has to be declared:
 * each file carries a list of facts, each fact is an exact piece of the
 * English text ("₹4,592 crore", "3 May 2023") with the source it comes from,
 * and validateStory() refuses a story that has a digit in its English text
 * which no fact covers. The Telugu text is then held to the English one: it
 * must contain exactly the same numbers, so a translation can never change a
 * figure. Every paragraph and every answer must name at least one source.
 *
 * WHY THERE ARE DRAFTS
 *
 * A story is written in src/data/stories/drafts and shows only on a
 * developer's machine. It moves to src/data/stories, with the reviewer's name
 * and the date, when the editor has read every line against its documents.
 * The production build does not even bundle a draft.
 */

import { chartModel } from './projectStory.js'
import { flagshipSteps } from './projectSteps.js'

/** The two languages a hand-written story is written in. */
export const STORY_LANGS = ['en', 'te']

/**
 * What kind of document a source is. gov: any government, central or state,
 * including the CAG and Prasar Bharati. company: a company about its own
 * project. lender: the World Bank, the ADB and their like. other: the press
 * and everything else.
 */
export const STORY_TIERS = ['gov', 'company', 'lender', 'other']

/**
 * The icons a step may carry: Material Symbols names that are already in the
 * shipped icon subset (src/fonts/icons.generated.json). A story file is JSON,
 * which the icon guard does not read, so an icon outside this list would
 * reach the page as its bare name. A test holds this list to the subset.
 */
export const STEP_ICONS = ['description', 'verified', 'handshake', 'construction', 'task_alt', 'monitoring', 'event']

const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const LONG_DASH = /[—–]|--/
const END = /[.?!।۔"”')\]]$/u
const NUMBER = /\d[\d,]*(?:\.\d+)?/g

const numbersIn = s => (String(s).match(NUMBER) || []).map(n => n.replace(/,$/, ''))
const sameBag = (a, b) => {
  const x = [...a].sort(), y = [...b].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Every localised string in a story, with where it is, for the checks. */
function* texts(story) {
  const at = (path, obj, needsEnd) => ({ path, obj, needsEnd })
  for (const [i, k] of (story.keyDates || []).entries()) {
    yield at(`keyDates[${i}].label`, k.label, false)
    if (k.detail) yield at(`keyDates[${i}].detail`, k.detail, false)
  }
  for (const [i, m] of (story.chart?.marks || []).entries()) yield at(`chart.marks[${i}].label`, m.label, false)
  if (story.stepsTitle) yield at('stepsTitle', story.stepsTitle, false)
  for (const [i, s] of (story.steps || []).entries()) {
    yield at(`steps[${i}].text`, s.text, true)
    yield at(`steps[${i}].short`, s.short, false)
  }
  for (const [i, c] of (story.chapters || []).entries()) {
    yield at(`chapters[${i}].title`, c.title, false)
    yield at(`chapters[${i}].line`, c.line, true)
    for (const [j, p] of (c.paras || []).entries()) yield at(`chapters[${i}].paras[${j}]`, p, true)
  }
  for (const [i, q] of (story.questions || []).entries()) {
    yield at(`questions[${i}].q`, q.q, true)
    yield at(`questions[${i}].a`, q.a, true)
  }
}

/**
 * Every problem with a story, as sentences. An empty list means it may be
 * shown. The test suite runs this over every file in src/data/stories.
 */
export function validateStory(story) {
  const problems = []
  const fail = msg => problems.push(msg)
  if (!story || typeof story !== 'object') return ['the story is not an object']

  if (!Number.isInteger(story.id)) fail('id must be the project id, a whole number')
  if (!['draft', 'reviewed'].includes(story.status)) fail('status must be "draft" or "reviewed"')
  if (story.status === 'reviewed') {
    if (!story.reviewed?.by) fail('a reviewed story must name its reviewer (reviewed.by)')
    if (!ISO_DAY.test(story.reviewed?.on || '')) fail('a reviewed story must carry the review date (reviewed.on, YYYY-MM-DD)')
  }

  // Sources
  const ids = new Set()
  for (const [i, s] of (story.sources || []).entries()) {
    const where = `sources[${i}]`
    if (!s.id) { fail(`${where} has no id`); continue }
    if (ids.has(s.id)) fail(`${where}: the id "${s.id}" is used twice`)
    ids.add(s.id)
    for (const f of ['short', 'title', 'publisher']) if (!String(s[f] || '').trim()) fail(`${where} (${s.id}) has no ${f}`)
    if (!ISO_DAY.test(s.date || '') && !ISO_MONTH.test(s.date || '')) fail(`${where} (${s.id}) needs a date, YYYY-MM-DD or YYYY-MM`)
    if (!/^https:\/\/\S+$/.test(s.url || '')) fail(`${where} (${s.id}) needs an https link to the document`)
    if (!STORY_TIERS.includes(s.tier)) fail(`${where} (${s.id}) has tier "${s.tier}", not one of ${STORY_TIERS.join(', ')}`)
    for (const f of ['short', 'title', 'publisher']) if (LONG_DASH.test(s[f] || '')) fail(`${where} (${s.id}).${f} has a long dash`)
  }
  if (!ids.size) fail('a story needs at least one source')
  const known = id => ids.has(id)
  const needSources = (where, list) => {
    if (!Array.isArray(list) || !list.length) fail(`${where} names no source`)
    else for (const id of list) if (!known(id)) fail(`${where} names the source "${id}", which is not in sources`)
  }

  // Facts: every number in the English text is one of these, with a source.
  const facts = story.facts || []
  for (const [i, f] of facts.entries()) {
    if (!String(f.text || '').trim()) fail(`facts[${i}] has no text`)
    if (!known(f.source)) fail(`facts[${i}] ("${f.text}") names the source "${f.source}", which is not in sources`)
  }
  const factTexts = facts.map(f => String(f.text || '')).filter(Boolean).sort((a, b) => b.length - a.length)
  const used = new Set()

  for (const { path, obj, needsEnd } of texts(story)) {
    for (const lang of STORY_LANGS) {
      const s = obj?.[lang]
      if (typeof s !== 'string' || !s.trim()) { fail(`${path}.${lang} is missing`); continue }
      if (s !== s.trim()) fail(`${path}.${lang} starts or ends with a space`)
      if (/\s{2,}/.test(s)) fail(`${path}.${lang} has a double space`)
      if (LONG_DASH.test(s)) fail(`${path}.${lang} has a long dash or a double hyphen`)
      if (/undefined|null|NaN|[{}]/.test(s)) fail(`${path}.${lang} carries a code word or a brace`)
      if (needsEnd && !END.test(s)) fail(`${path}.${lang} does not end like a sentence`)
    }
    const en = obj?.en || ''
    let rest = en
    for (const f of factTexts) {
      if (rest.includes(f)) { used.add(f); rest = rest.split(f).join(' ') }
    }
    const loose = rest.match(NUMBER)
    if (loose) fail(`${path}.en has ${loose.map(n => `"${n}"`).join(', ')} that no fact declares`)
    if (obj?.te && !sameBag(numbersIn(obj.te), numbersIn(en))) {
      fail(`${path}.te does not carry the same numbers as the English (${numbersIn(obj.te).join(' ')} against ${numbersIn(en).join(' ')})`)
    }
  }
  for (const f of factTexts) if (!used.has(f)) fail(`the fact "${f}" appears nowhere in the English text`)

  // Structure
  const chapters = story.chapters || []
  if (!chapters.length) fail('a story needs at least one chapter')
  const chapterIds = new Set()
  for (const [i, c] of chapters.entries()) {
    if (!c.id) fail(`chapters[${i}] has no id`)
    else if (chapterIds.has(c.id)) fail(`chapters[${i}]: the id "${c.id}" is used twice`)
    chapterIds.add(c.id)
    if (!(c.paras || []).length) fail(`chapters[${i}] has no paragraphs`)
    for (const [j, p] of (c.paras || []).entries()) needSources(`chapters[${i}].paras[${j}]`, p.sources)
  }
  for (const [i, q] of (story.questions || []).entries()) needSources(`questions[${i}]`, q.sources)

  const keyDates = story.keyDates || []
  if (keyDates.length > 3) fail('at most three key dates')
  for (const [i, k] of keyDates.entries()) {
    const okDate = k.precision === 'year' ? /^\d{4}$/.test(k.date || '')
      : k.precision === 'month' ? ISO_MONTH.test(k.date || '')
        : k.precision === 'day' ? ISO_DAY.test(k.date || '') : false
    if (!okDate) fail(`keyDates[${i}] needs a precision of day, month or year and a date written that way`)
    needSources(`keyDates[${i}]`, [k.source].filter(Boolean))
  }
  // The story in steps (projectSteps.js): three to five, oldest first, each
  // from one source, with a short label for the square picture that ends
  // without a full stop, because it sits beside a date like a caption.
  const steps = story.steps || []
  if (steps.length) {
    if (steps.length < 3 || steps.length > 5) fail('a story in steps has three to five steps')
    if (!story.stepsTitle) fail('a story in steps needs stepsTitle, the heading above the road')
  }
  for (const [i, s] of steps.entries()) {
    const okDate = s.precision === 'year' ? /^\d{4}$/.test(s.date || '')
      : s.precision === 'month' ? ISO_MONTH.test(s.date || '')
        : s.precision === 'day' ? ISO_DAY.test(s.date || '') : false
    if (!okDate) fail(`steps[${i}] needs a precision of day, month or year and a date written that way`)
    if (i > 0 && String(s.date) < String(steps[i - 1].date)) fail(`steps[${i}] is older than the step before it`)
    if (!STEP_ICONS.includes(s.icon)) fail(`steps[${i}] has icon "${s.icon}", not one of ${STEP_ICONS.join(', ')}`)
    needSources(`steps[${i}]`, [s.source].filter(Boolean))
    for (const lang of STORY_LANGS) if (/[.。।]$/.test(s.short?.[lang] || '')) fail(`steps[${i}].short.${lang} ends with a full stop`)
  }
  for (const [i, r] of (story.chart?.readings || []).entries()) {
    if (!ISO_DAY.test(r.date || '')) fail(`chart.readings[${i}] needs a date, YYYY-MM-DD`)
    if (!(typeof r.pct === 'number' && r.pct >= 0 && r.pct <= 100)) fail(`chart.readings[${i}] needs a percentage between 0 and 100`)
    needSources(`chart.readings[${i}]`, [r.source].filter(Boolean))
  }
  for (const [i, m] of (story.chart?.marks || []).entries()) {
    if (!ISO_DAY.test(m.date || '')) fail(`chart.marks[${i}] needs a date, YYYY-MM-DD`)
    needSources(`chart.marks[${i}]`, [m.source].filter(Boolean))
  }
  return problems
}

/** A source as the page names it under a paragraph. */
const chipOf = s => ({ name: s.short, title: `${s.title}. ${s.publisher}`, url: s.url, tier: s.tier })

/**
 * A story in one language, shaped exactly like the automatic one so the
 * page draws both with the same components. null in a language the story is
 * not written in; the page then falls back to the automatic story, which is
 * translated into all six.
 *
 * @returns { chapters, keyDates, chart, questions, steps, stepsTitle, replaces, reviewedOn, draft }
 */
export function resolveStory(story, lang, { fmtMonth, fmtDay }) {
  if (!story || !STORY_LANGS.includes(lang)) return null
  const byId = new Map((story.sources || []).map(s => [s.id, s]))
  const chips = ids => (ids || []).map(id => byId.get(id)).filter(Boolean).map(chipOf)
  const when = k => (k.precision === 'year' ? k.date : k.precision === 'month' ? fmtMonth(k.date) : fmtDay(k.date))

  const chapters = (story.chapters || []).map(c => ({
    id: c.id,
    title: c.title[lang],
    line: c.line[lang],
    blocks: c.paras.map(p => ({ type: 'p', text: p[lang], sources: chips(p.sources) })),
  }))
  const keyDates = (story.keyDates || []).map((k, i) => ({
    key: `k${i}`, label: k.label[lang], value: when(k), detail: k.detail ? k.detail[lang] : null,
  }))
  const chart = chartModel({
    points: (story.chart?.readings || []).map(r => {
      const s = byId.get(r.source)
      return { date: r.date, pct: r.pct, tier: s?.tier || 'other', name: s?.short || '' }
    }),
    marks: (story.chart?.marks || []).map(m => ({ date: m.date, kind: m.kind, label: m.label[lang] })),
  })
  const questions = (story.questions || []).map((q, i) => ({
    key: `s${i}`, q: q.q[lang], a: q.a[lang], sources: chips(q.sources),
  }))
  return {
    chapters, keyDates, chart, questions,
    steps: flagshipSteps(story, lang, { fmtMonth, fmtDay }),
    stepsTitle: story.stepsTitle ? story.stepsTitle[lang] : null,
    replaces: story.replaces || [],
    reviewedOn: story.status === 'reviewed' ? story.reviewed.on : null,
    draft: story.status !== 'reviewed',
  }
}

/**
 * The automatic questions a story keeps. A story names the ones it answers
 * better itself; "handover" stands for every change of government at once.
 */
export function keptQuestions(questions, replaces = []) {
  return questions.filter(q => !replaces.some(r => q.key === r || q.key.startsWith(`${r}-`)))
}
