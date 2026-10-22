/**
 * The story of one project, told from its own record.
 *
 * WHY THIS FILE EXISTS
 *
 * A project page listed facts: a cost in a tile, a status in a badge, a row
 * of dated readings with their documents. Every fact was right and the page
 * still did not answer the questions people in Andhra Pradesh actually ask
 * about a project: how did it start, how far along was it when the
 * government changed, is it late, why. A reader had to assemble that story
 * from the parts, and most readers will not. A politician on a stage will
 * assemble it for them.
 *
 * So the page now tells the story itself, in plain sentences, in chapters a
 * reader can open one at a time. For about twenty projects the story is
 * written by hand from their documents (src/data/stories). For every other
 * project it is built here, from the record alone.
 *
 * THE RULES THIS FILE KEEPS
 *
 *  1. Nothing is added. Every sentence is built from a field or a dated
 *     reading of this project, and names the document it came from. A
 *     chapter with nothing to say is left out, never padded.
 *  2. No number is made up. No sums, no differences, no shares, no averages,
 *     and no figure for a date nobody published. A figure is printed as the
 *     report printed it, including when it goes backwards.
 *  3. No government is credited or blamed. The record says when things
 *     happened; the three changes of government are dates like any other.
 *     The story says what the record held on each side of a change, and that
 *     no figure exists for the day itself. It never names a party.
 *  4. Uncertainty is said out loud. A deadline that has passed is not called
 *     a delay unless a report dated after the deadline still shows the work
 *     unfinished. Otherwise the story says the record cannot tell.
 *
 * Everything that decides WHAT is true lives in storyFacts(), which returns
 * plain data and is tested on its own. The functions below it only turn those
 * facts into sentences, so a wording change can never change a finding.
 */

import { croreAmount } from './money.js'
import { costsDisagree } from './sameWork.js'
import { displayTitle } from './projectTitle.js'
import { sourceTier, documentOf, asOnDate, portalName } from './sourceDocs.js'
import {
  statusLabel, codeSentence, moneySentence, stageSentence, progressSentence,
  timingSentence, approvalSentence, placeSentence, responsibleSentence, sourceSentence,
} from './projectSummary.js'

// Re-exported so the story's own tests reach them through one module.
export { sourceTier, documentOf, asOnDate }

// ---------------------------------------------------------------- constants

/**
 * The days a new government took office in Andhra Pradesh since the state was
 * divided. A reading dated on one of these days belongs to the government
 * that took office that day. Kept in step with TENURES in the backend's
 * project_register.py, which uses the same three boundaries.
 */
export const GOVERNMENT_CHANGES = ['2014-06-08', '2019-05-30', '2024-06-12']

/** The day Andhra Pradesh was divided. Anything older predates the state. */
export const STATE_DIVIDED = '2014-06-02'

// ---------------------------------------------------------------- small helpers

/** "2024-05-31T00:00:00+00:00" to "2024-05-31". Month-only values pass through. */
export const isoDay = v => (v ? String(v).slice(0, 10) : null)
const isoMonth = v => (v ? String(v).slice(0, 7) : null)
const year = v => (v ? String(v).slice(0, 4) : null)

const finite = v => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order)

/**
 * Every dated reading of a project, oldest first.
 *
 * A reading is one report's figures for this project: physical progress,
 * money spent, the cost that report printed, and any note. Readings without
 * a date are dropped, because a figure nobody can place in time cannot be
 * put in a story about time.
 */
export function readingsOf(observations = []) {
  return (observations || [])
    .map((o, order) => ({ o, order }))
    .filter(({ o }) => o && isoDay(o.observed_date))
    .map(({ o, order }) => ({
      order,
      date: isoDay(o.observed_date),
      pct: finite(o.completion_percentage),
      spent: finite(o.cumulative_expenditure_crore),
      cost: finite(o.estimated_cost_crore),
      note: o.status_note ? String(o.status_note).trim() : null,
      doc: documentOf(o),
    }))
    .sort(byDate)
}

/** How many of the three changes of government come on or before this date. */
export const eraOf = date => GOVERNMENT_CHANGES.filter(c => c <= date).length

// ---------------------------------------------------------------- the facts

const PROBLEM_STATUSES = new Set(['suspended', 'delayed', 'cancelled'])

/**
 * What the record establishes about this project, as plain data.
 *
 * No sentence is built here. This is the part that decides what is true, so
 * it is the part the tests read.
 *
 * @param project     the register row. Pass the district the page shows
 *                    (the merged sibling's, when this row has none).
 * @param readings    readingsOf(observations)
 * @param today       'YYYY-MM-DD'. Passed in, never read from the clock, so
 *                    the same record always tells the same story in a test.
 */
export function storyFacts({ project, readings = [], today }) {
  const p = project || {}
  const pctReadings = readings.filter(r => r.pct != null)
  const spendReadings = readings.filter(r => r.spent != null)
  const latest = readings.length ? readings[readings.length - 1] : null
  const latestPct = pctReadings.length ? pctReadings[pctReadings.length - 1] : null
  const latestSpend = spendReadings.length ? spendReadings[spendReadings.length - 1] : null

  const approved = isoDay(p.announced_date)
  const began = isoDay(p.start_date)
  const completedOn = isoDay(p.actual_completion)
  const isDone = p.status === 'completed'
  // A completed project has no due date any more, even when the record kept
  // the date it was scheduled for.
  const due = completedOn || isDone ? null : isoDay(p.expected_completion)

  // Each change in the cost a report printed: the last reading at the old
  // figure and the first at the new one. Compared as printed, after the same
  // rounding the page uses, so two figures that print the same are not a
  // change.
  const costChanges = []
  let lastCost = null
  for (const r of readings) {
    if (r.cost == null) continue
    if (lastCost && croreAmount(lastCost.cost) !== croreAmount(r.cost)) {
      costChanges.push({ from: lastCost, to: r, up: r.cost > lastCost.cost })
    }
    lastCost = r
  }

  // A figure lower than the one before it. Kept, printed and pointed out,
  // never smoothed away: a government record that goes backwards is itself a
  // fact about the project.
  //
  // Money is compared as the page prints it. ₹631.07 crore then ₹630.55 crore
  // is a real fall of half a crore, but both print as ₹631 crore, and "went
  // down from ₹631 crore to ₹631 crore" tells a reader nothing true.
  const drops = (list, key, shown = v => v) => {
    const out = []
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1][key], now = list[i][key]
      if (now < before && shown(now) !== shown(before)) out.push({ from: list[i - 1], to: list[i] })
    }
    return out
  }
  const pctDrops = drops(pctReadings, 'pct')
  const spendDrops = drops(spendReadings, 'spent', v => croreAmount(v))

  // What the record held on each side of a change of government. Both sides
  // must exist for a kind of figure to be bracketed: a figure after a change
  // with nothing before it says nothing about the change.
  const handovers = []
  for (const change of GOVERNMENT_CHANGES) {
    const before = list => [...list].reverse().find(r => r.date < change) || null
    const after = list => list.find(r => r.date >= change) || null
    const pb = before(pctReadings), pa = after(pctReadings)
    const sb = before(spendReadings), sa = after(spendReadings)
    const pct = pb && pa ? { before: pb, after: pa } : null
    const spend = sb && sa ? { before: sb, after: sa } : null
    if (!pct && !spend) continue
    const onTheDay = [pa, sa].some(r => r && r.date === change)
    handovers.push({ change, pct, spend, onTheDay })
  }

  // The completion date, read against the calendar and against the reports.
  // Month against month: "due July 2026" is not late on 5 July 2026, and a
  // report for July 2026 is not after a date of July 2026.
  let deadline = null
  if (due && !isDone && isoMonth(due) < isoMonth(today)) {
    const sourceDate = latest ? latest.date : asOnDate(p)
    if (sourceDate && isoMonth(sourceDate) > isoMonth(due)) {
      deadline = { kind: 'beforeReport', due, report: latest ? latest.doc : null, sourceDate }
    } else if (sourceDate) {
      deadline = { kind: 'afterReport', due, sourceDate }
    } else {
      deadline = { kind: 'passed', due }
    }
  }

  const problemStatus = PROBLEM_STATUSES.has(p.status) ? p.status : null

  const gaps = []
  if (!approved && !began) gaps.push('start')
  if (p.completion_percentage == null && !pctReadings.length) gaps.push('progress')
  if (!spendReadings.length && p.actual_cost_crore == null) gaps.push('spend')
  if (!due && !completedOn && !isDone) gaps.push('due')
  if (!p.district) gaps.push('district')

  return {
    approved, began, completedOn, isDone, due,
    readings, pctReadings, spendReadings, latest, latestPct, latestSpend,
    costChanges, pctDrops, spendDrops, handovers, deadline, problemStatus, gaps,
    beforeDivision: [approved, began].some(d => d && d < STATE_DIVIDED),
  }
}

// ---------------------------------------------------------------- key dates

/**
 * Up to three dates for the top of the page: how it started, the latest
 * report, and when it finished or is due.
 *
 * A survey that printed no date is shown by its edition ("2018-19"). Its
 * reading sits at the end of its survey year in our register, and that day
 * is ours, not the survey's.
 */
export function keyDates({ facts, project, t, fmtMonth, today }) {
  const out = []
  const when = r => (r.doc.dated === 'none' ? (r.doc.edition || year(r.date)) : fmtMonth(r.date))  // whenOf, before tools exist
  // A reading with a figure, not a note: a press note about an opening is in
  // the story, but "latest report" at the top of the page means the latest
  // figure anybody published.
  const figured = facts.readings.filter(r => r.pct != null || r.spent != null || r.cost != null)
  const first = figured[0] || null
  const last = figured.length ? figured[figured.length - 1] : null

  if (facts.approved) out.push({ key: 'approved', label: t('projectDetail.story.keyDates.approved'), value: fmtMonth(facts.approved) })
  else if (facts.began) out.push({ key: 'began', label: t('projectDetail.story.keyDates.began'), value: fmtMonth(facts.began) })
  else if (first && first !== last) out.push({ key: 'first', label: t('projectDetail.story.keyDates.firstReport'), value: when(first) })

  if (last) {
    out.push({
      key: 'latest',
      label: t('projectDetail.story.keyDates.latestReport'),
      value: when(last),
      detail: last.pct != null ? t('projectDetail.story.keyDates.pctDone', { pct: last.pct }) : null,
    })
  }

  if (facts.completedOn) {
    out.push({ key: 'completed', label: t('projectDetail.story.keyDates.completed'), value: fmtMonth(facts.completedOn) })
  } else if (facts.due) {
    const passed = !facts.isDone && isoMonth(facts.due) < isoMonth(today)
    out.push({
      key: 'due',
      label: t('projectDetail.story.keyDates.due'),
      value: fmtMonth(facts.due),
      detail: passed ? t('projectDetail.story.keyDates.passed') : null,
      passed,
    })
  }
  return out
}

// ---------------------------------------------------------------- the chart

/**
 * What the progress chart draws, or null when there is nothing to draw.
 *
 * Two dots at least. One dot is a figure, and the key dates already show it.
 *
 * The line is broken at every change of government. Joining the last reading
 * before a change to the first one after it would draw a figure for the
 * handover day that nobody published, and that day is exactly the one people
 * argue about.
 *
 * @param points  [{ date, pct, tier, name }]
 * @param marks   optional [{ date, kind, label }] vertical lines, such as an
 *                opening day, drawn only when they fall inside the chart
 */
export function chartModel({ points = [], marks = [] }) {
  const dots = points
    .filter(p => p && p.date && Number.isFinite(p.pct))
    .map((p, order) => ({ ...p, order }))
    .sort(byDate)
  if (dots.length < 2 || dots[0].date === dots[dots.length - 1].date) return null

  const first = dots[0].date
  const last = dots[dots.length - 1].date
  const inside = d => d > first && d < last
  const lastMarkDate = marks.reduce((m, k) => (k.date > m ? k.date : m), last)

  const segments = []
  for (const d of dots) {
    const era = eraOf(d.date)
    const seg = segments[segments.length - 1]
    if (seg && seg.era === era) seg.dots.push(d)
    else segments.push({ era, dots: [d] })
  }

  return {
    dots,
    segments,
    changes: GOVERNMENT_CHANGES.filter(inside),
    marks: marks.filter(k => k.date >= first),
    from: first,
    to: lastMarkDate,
    anyNotGovernment: dots.some(d => d.tier && d.tier !== 'gov'),
    anyUndated: dots.some(d => d.dated === 'none'),
  }
}

/** The automatic chart: this project's own readings with a progress figure. */
export function automaticChart(facts) {
  return chartModel({
    points: facts.pctReadings.map(r => ({
      date: r.date, pct: r.pct, tier: r.doc.tier, name: r.doc.name, dated: r.doc.dated,
    })),
  })
}

// ---------------------------------------------------------------- sentences

/**
 * The tools every sentence builder needs, bundled so a builder cannot use a
 * different rounding or a different date format from its neighbour.
 */
export function storyTools({ t, fmtNum, fmtMonth, fmtDay, lang }) {
  const k = key => `projectDetail.story.${key}`
  return {
    t,
    s: (key, vars) => t(k(key), vars),
    money: v => croreAmount(v, fmtNum),
    fmtNum,
    month: fmtMonth,
    day: fmtDay,
    sep: t(k('listSep')),
    lang,
  }
}

const para = (text, sources = []) => ({ type: 'p', text, sources: sources.filter(Boolean) })

/**
 * When a reading speaks, in words: "July 2026" for a dated report, the
 * edition ("2017-18") for a survey that printed no date.
 */
const whenOf = (r, tools) => (r.doc.dated === 'none' ? (r.doc.edition || year(r.date)) : tools.month(r.date))

/**
 * A status inside a running sentence. English capitalises its labels
 * ("Under construction") because they head badges and tiles; mid-sentence
 * that reads as a typo, so English alone is lowered. No other script here
 * has case.
 */
const statusWord = (project, tools) => {
  const label = statusLabel(project, tools.t)
  return label && tools.lang === 'en' ? label.toLowerCase() : label
}
const list = (intro, items) => ({ type: 'list', intro, items })

/** A document as a source chip: the name, its link and what kind it is. */
const chip = doc => (doc ? { name: doc.name, title: doc.label, url: doc.url, tier: doc.tier } : null)

/**
 * The project's own source, for the chapters that come from the row itself.
 *
 * When the row's document is also one of its readings (a MoSPI row points at
 * the latest flash report, a survey row at the latest survey) the reading's
 * name is used, so one document is never called two things on one page.
 */
export function rowSource(project, facts) {
  if (!project?.source_url && !project?.source_portal) return null
  const same = project.source_url && facts?.readings?.find(r => r.doc.url === project.source_url)
  if (same) return chip(same.doc)
  const name = portalName(project) || project.source_url
  return { name, title: name, url: project.source_url || null, tier: sourceTier(project.source_url) }
}

function startChapter({ project, facts, tools }) {
  const { s, month } = tools
  if (!facts.approved && !facts.began) return null
  const blocks = []
  if (facts.approved) blocks.push(para(s('start.approved', { date: month(facts.approved) })))
  if (facts.began) blocks.push(para(s('start.began', { date: month(facts.began) })))
  if (facts.beforeDivision) blocks.push(para(s('start.beforeDivision')))
  // Who the record holds responsible: the department, and the agency doing
  // the work. The record names bodies, never people or parties, and so does
  // this sentence.
  const who = responsibleSentence(project, tools.t)
  if (who) blocks.push(para(who))
  const src = rowSource(project, facts)
  if (src) blocks[0].sources.push(src)

  const line = facts.approved && facts.began
    ? s('start.lineBoth', { approved: month(facts.approved), began: month(facts.began) })
    : facts.approved
      ? s('start.lineApproved', { approved: month(facts.approved) })
      : s('start.lineBegan', { began: month(facts.began) })
  return { id: 'start', title: s('start.title'), line, blocks }
}

function moneyChapter({ project, facts, tools }) {
  const { s, money } = tools
  const cost = project.estimated_cost_crore
  const latestSpend = facts.latestSpend
  const actual = project.actual_cost_crore
  const blocks = []

  if (cost != null) {
    // Credited to a report only when that report printed this very figure.
    // A curated row's cost can come from a different document from its
    // readings (Polavaram Phase 1: the Cabinet's ₹30,437 crore, while the
    // surveys printed other totals), and naming the wrong document for a
    // number is the one mistake this page cannot make.
    const costReading = [...facts.readings].reverse()
      .find(r => r.cost != null && money(r.cost) === money(cost))
    blocks.push(para(s('money.cost', { cost: money(cost) }),
      [costReading ? chip(costReading.doc) : rowSource(project, facts)]))
  }
  if (facts.costChanges.length) {
    const printed = facts.readings.filter(r => r.cost != null)
    blocks.push(list(s('money.costHistory'), printed.map(r => ({
      doc: chip(r.doc), text: s('money.costItem', { cost: money(r.cost) }),
    }))))
  }
  if (facts.spendReadings.length === 1) {
    const r = facts.spendReadings[0]
    blocks.push(para(s('money.spentOne', { spent: money(r.spent), doc: r.doc.name }), [chip(r.doc)]))
  } else if (facts.spendReadings.length > 1) {
    blocks.push(list(s('money.spentHistory'), facts.spendReadings.map(r => ({
      doc: chip(r.doc), text: s('money.spentItem', { spent: money(r.spent) }),
    }))))
  }
  if (actual != null) blocks.push(para(s('money.actual', { actual: money(actual) }), [rowSource(project, facts)]))
  if (!blocks.length) return null

  const line = cost != null && latestSpend
    ? s('money.lineCostSpent', { cost: money(cost), spent: money(latestSpend.spent), when: whenOf(latestSpend, tools) })
    : cost != null
      ? s('money.lineCost', { cost: money(cost) })
      : latestSpend
        ? s('money.lineSpent', { spent: money(latestSpend.spent), when: whenOf(latestSpend, tools) })
        : s('money.lineActual', { actual: money(actual) })
  return { id: 'money', title: s('money.title'), line, blocks }
}

function yearsChapter({ facts, tools }) {
  const { s, money, day, t } = tools
  const rs = facts.readings
  if (!rs.length) return null

  const items = []
  let prevPct = null
  let era = rs.length ? eraOf(rs[0].date) : 0
  for (const r of rs) {
    // A change of government between two readings is said where it happened,
    // in the list itself, so nobody reads two figures either side of it as
    // one government's work.
    const nowEra = eraOf(r.date)
    for (let e = era; e < nowEra; e++) {
      const change = GOVERNMENT_CHANGES[e]
      if (change > rs[0].date) items.push({ marker: true, text: s('years.changed', { date: day(change) }) })
    }
    era = nowEra

    const parts = []
    if (r.pct != null) parts.push(s('years.pct', { pct: r.pct }))
    if (r.spent != null) parts.push(s('years.spent', { spent: money(r.spent) }))
    if (!parts.length && r.cost != null) parts.push(s('years.cost', { cost: money(r.cost) }))
    const bits = [parts.length ? s('years.entry', { facts: parts.join(tools.sep) }) : s('years.noFigure')]
    if (r.pct != null && prevPct != null && r.pct < prevPct) bits.push(s('years.lower'))
    if (r.note) bits.push(s('years.note', { note: r.note }))
    if (r.pct != null) prevPct = r.pct
    items.push({ doc: chip(r.doc), text: bits.join(' ') })
  }

  const pcts = facts.pctReadings
  const line = pcts.length >= 2
    ? s('years.linePct', { from: pcts[0].pct, to: pcts[pcts.length - 1].pct, count: pcts.length })
    : pcts.length === 1
      ? s('years.lineOnePct', { pct: pcts[0].pct })
      : t(`projectDetail.story.years.lineCount.${rs.length === 1 ? 'one' : 'other'}`, { count: rs.length })
  return { id: 'years', title: s('years.title'), line, blocks: [list(null, items)] }
}

/**
 * The delay sentences, shared by the chapter and by the "is it late"
 * question so the two can never disagree. Each entry: { kind, line, text,
 * sources }, kind being deadline, status, cost, progress or spend.
 */
export function delayFindings({ project, facts, tools }) {
  const { s, money, month } = tools
  const out = []
  const d = facts.deadline
  if (d?.kind === 'beforeReport') {
    out.push({
      kind: 'deadline',
      line: s('delays.lineDueBefore', { due: month(d.due) }),
      text: s('delays.dueBefore', { due: month(d.due), doc: d.report?.name || '', status: statusWord(project, tools) }),
      sources: [chip(d.report)],
    })
  } else if (d?.kind === 'afterReport') {
    out.push({
      kind: 'deadline',
      line: s('delays.lineDuePassed', { due: month(d.due) }),
      text: s('delays.duePassedEarlierReport', { due: month(d.due), reportDate: month(d.sourceDate) }),
      sources: [facts.latest ? chip(facts.latest.doc) : rowSource(project, facts)],
    })
  } else if (d?.kind === 'passed') {
    out.push({
      kind: 'deadline',
      line: s('delays.lineDuePassed', { due: month(d.due) }),
      text: s('delays.duePassed', { due: month(d.due) }),
      sources: [rowSource(project, facts)],
    })
  }
  for (const c of facts.costChanges) {
    out.push({
      kind: 'cost',
      line: s(c.up ? 'delays.lineCostUp' : 'delays.lineCostDown'),
      text: s(c.up ? 'delays.costUp' : 'delays.costDown', {
        from: money(c.from.cost), to: money(c.to.cost), docFrom: c.from.doc.name, docTo: c.to.doc.name,
      }),
      sources: [chip(c.from.doc), chip(c.to.doc)],
    })
  }
  for (const f of facts.pctDrops) {
    out.push({
      kind: 'progress',
      line: s('delays.lineFell'),
      text: s('delays.fell', { from: f.from.pct, to: f.to.pct, docFrom: f.from.doc.name, docTo: f.to.doc.name }),
      sources: [chip(f.from.doc), chip(f.to.doc)],
    })
  }
  for (const f of facts.spendDrops) {
    out.push({
      kind: 'spend',
      line: s('delays.lineSpentDown'),
      text: s('delays.spentDown', {
        from: money(f.from.spent), to: money(f.to.spent), docFrom: f.from.doc.name, docTo: f.to.doc.name,
      }),
      sources: [chip(f.from.doc), chip(f.to.doc)],
    })
  }
  if (facts.problemStatus) {
    const status = statusLabel({ status: facts.problemStatus }, tools.t)
    if (status) out.push({ kind: 'status', line: s('delays.lineStatus', { status }), text: s('delays.status', { status }), sources: [] })
  }
  return out
}

function delaysChapter({ project, facts, tools }) {
  const findings = delayFindings({ project, facts, tools })
  if (!findings.length) return null
  const blocks = findings.map(f => para(f.text, f.sources))
  blocks.push(para(tools.s('delays.noReason')))
  return { id: 'delays', title: tools.s('delays.title'), line: findings[0].line, blocks }
}

function nowChapter({ project, facts, tools }) {
  const { s, month, t } = tools
  const status = statusLabel(project, t)
  const blocks = []
  const line = []

  if (facts.completedOn) {
    blocks.push(para(s('now.completed', { date: month(facts.completedOn) }), [rowSource(project, facts)]))
    line.push(s('now.lineCompleted', { date: month(facts.completedOn) }))
  } else if (facts.isDone) {
    blocks.push(para(s('now.listedCompleted'), [rowSource(project, facts)]))
    line.push(s('now.lineListedCompleted'))
  } else if (status) {
    blocks.push(para(s('now.status', { status }), [rowSource(project, facts)]))
    line.push(s('now.lineStatus', { status }))
  }

  const lp = facts.latestPct
  if (lp) {
    blocks.push(para(s('now.pct', { pct: lp.pct, doc: lp.doc.name }), [chip(lp.doc)]))
    if (!facts.isDone) line.push(s('now.linePct', { pct: lp.pct }))
  } else if (project.completion_percentage != null) {
    blocks.push(para(s('now.pctRecord', { pct: project.completion_percentage }), [rowSource(project, facts)]))
    if (!facts.isDone) line.push(s('now.linePct', { pct: project.completion_percentage }))
  }

  if (facts.due && !facts.isDone) {
    blocks.push(para(s('now.due', { due: month(facts.due) }), [rowSource(project, facts)]))
    line.push(s('now.lineDue', { due: month(facts.due) }))
  }
  if (!blocks.length) return null
  return { id: 'now', title: s('now.title'), line: line.join(' '), blocks }
}

function gapsChapter({ facts, tools }) {
  const { s, sep } = tools
  if (!facts.gaps.length) return null
  const names = facts.gaps.map(g => s(`gaps.item.${g}`))
  return {
    id: 'gaps',
    title: s('gaps.title'),
    line: s('gaps.line', { list: names.join(sep) }),
    blocks: [
      list(s('gaps.intro'), names.map(text => ({ text }))),
      para(s('gaps.blank')),
    ],
  }
}

/**
 * The automatic story: chapters in reading order, each with a title, a line
 * a reader sees while it is closed, and the blocks behind it.
 *
 * @returns [{ id, title, line, blocks }]
 */
export function automaticStory({ project, facts, tools }) {
  // In the order the story happened: how it began, what each report said,
  // where the money went, what changed or slipped, where it is now, and
  // what nobody has published. What the project is (its type, district,
  // department and code) is already in the page's heading and in "The
  // record's identity", so the story does not say it a third time.
  const args = { project, facts, tools }
  return [
    startChapter(args),
    yearsChapter(args),
    moneyChapter(args),
    delaysChapter(args),
    nowChapter(args),
    gapsChapter(args),
  ].filter(Boolean)
}

// ---------------------------------------------------------------- questions

/**
 * The two questions the automatic story adds to the page's questions: is it
 * late, and where did it stand when the government changed. Asked only when
 * the record can answer them.
 *
 * @returns [{ key, q, a }]
 */
export function storyQuestions({ project, facts, tools }) {
  const { t, s, money, day, month } = tools
  const name = displayTitle(project?.title)
  if (!name) return []
  const out = []

  // Only a deadline or a status answers "is it late". A cost that rose or a
  // figure that fell is a change, and it is told in the story, not passed
  // off as an answer to a question it does not answer.
  const findings = delayFindings({ project, facts, tools }).filter(f => f.kind === 'deadline' || f.kind === 'status')
  if (findings.length) {
    out.push({
      key: 'late',
      q: t('projectDetail.q.late', { name }),
      a: [...findings.map(f => f.text), s('delays.noReason')].join(' '),
    })
  }

  for (const h of facts.handovers) {
    const parts = [s('handover.changed', { date: day(h.change) })]
    if (h.pct) {
      parts.push(s('handover.pct', {
        before: h.pct.before.pct, docBefore: h.pct.before.doc.name,
        after: h.pct.after.pct, docAfter: h.pct.after.doc.name,
      }))
    }
    if (h.spend) {
      parts.push(s('handover.spend', {
        before: money(h.spend.before.spent), docBefore: h.spend.before.doc.name,
        after: money(h.spend.after.spent), docAfter: h.spend.after.doc.name,
      }))
    }
    if (!h.onTheDay) parts.push(s('handover.noDay'))
    out.push({
      key: `handover-${h.change}`,
      q: t('projectDetail.q.handover', { name, date: month(h.change) }),
      a: parts.join(' '),
    })
  }
  return out
}

/**
 * Every question the page asks and answers, in one list, for the page and
 * for the structured data alike.
 *
 * The first eight are the ones the prerenderer has asked since it began
 * writing answers (what, cost, stage, when, where, who, source, differ),
 * built from the same sentences as the summary paragraph. The story adds two
 * after "when": is it late, and where it stood when the government changed.
 * A question whose answer is empty is never asked.
 *
 * @param observation  the latest observation, as the summary uses it
 * @param siblings     every record of the same work, canonical first
 * @returns [{ key, q, a }]  plain text; the prerenderer adds its links
 */
export function projectQuestions({ project, observation, facts, tools, siblings = [] }) {
  const { t, money, fmtNum } = tools
  const name = displayTitle(project?.title)
  if (!name) return []
  const out = []
  const ask = (key, parts) => {
    const a = parts.filter(Boolean).join(' ')
    if (a) out.push({ key, q: t(`projectDetail.q.${key}`, { name }), a })
  }

  ask('what', [project.description])
  ask('cost', [moneySentence({ project, observation, t, fmtNum, fmtMonth: tools.month })])
  ask('stage', [stageSentence(project, t), progressSentence(project, t)])
  ask('when', [timingSentence(project, t, tools.month), approvalSentence(project, t, tools.month)])
  out.push(...storyQuestions({ project, facts, tools }))
  ask('where', [placeSentence(project, t)])
  ask('who', [responsibleSentence(project, t)])
  ask('source', [sourceSentence({ project, observation, t }), codeSentence(project, t)])

  // The disagreement, when there is one, asked as the question a reader
  // would ask. Nobody else holds both government documents open at once.
  if (siblings.length > 1) {
    const costs = siblings.map(p => p.estimated_cost_crore)
    if (costsDisagree(costs)) {
      const real = costs.filter(c => typeof c === 'number' && Number.isFinite(c) && c > 0)
      const label = v => `₹${money(v)} ${t('unit.croreWord')}`
      ask('differ', [t('projectDetail.a.differ', {
        name, count: siblings.length, low: label(Math.min(...real)), high: label(Math.max(...real)),
      })])
    }
  }
  return out
}
