/**
 * The story in steps: a project told as a short road of dated steps, each
 * naming the paper it comes from.
 *
 * WHY THIS EXISTS
 *
 * The chapters tell a project's story in full, and most readers will not open
 * them. What a reader in a village wants first is the road: when it started,
 * how far it had got by the latest report, when it is due. A few lines, each
 * with the paper that says so, is something a person can read on a phone,
 * have read aloud, and forward as one picture.
 *
 * WHERE THE STEPS COME FROM
 *
 * For a flagship project they are written by hand in its story file, under
 * the same checks as the rest of the story (storyData.js). For every other
 * project they are built here from the register, by one rule that picks
 * nothing:
 *
 *   the approval date, then the readings, then completion or the due date.
 *
 * When every reading fits in a road of five steps, every reading is shown.
 * When they do not, only the first and the latest are shown, and the chart
 * below carries the rest. There is no third choice, because any rule that
 * picks some readings from the middle can be accused of picking the ones
 * that suit a side.
 *
 * A project with fewer than three steps has no road; its key dates stay.
 *
 * THE RULES OF projectStory.js HOLD HERE TOO
 *
 * Every figure is printed as its report printed it. A figure lower than the
 * one before it is marked, never smoothed. No government is named. A due
 * date that has passed is called passed, never late.
 */

import { rowSource } from './projectStory.js'

export const MAX_STEPS = 5
export const MIN_STEPS = 3

const isoMonth = v => (v ? String(v).slice(0, 7) : null)

/** A reading worth a step: a progress figure, money spent above zero, or a printed cost. */
const worthAStep = r => r.pct != null || (r.spent != null && r.spent > 0) || r.cost != null

/** The same report read twice (a table and its annexure) is one step. */
function distinctReadings(readings) {
  const seen = new Set()
  const out = []
  for (const r of readings.filter(worthAStep)) {
    const key = `${r.date}|${r.doc.name}`
    if (!seen.has(key)) { seen.add(key); out.push(r) }
  }
  return out
}

/** A reading's document as a step names it. */
const paperOf = doc => ({ name: doc.name, title: doc.label || doc.name, url: doc.url || null, tier: doc.tier || 'other' })

/**
 * The road for a project without a hand-written story, or null when the
 * record cannot make one of three steps.
 *
 * @param tools  storyTools(): t, money and month, so a step prints a figure
 *               and a date exactly as the chapters do
 * @returns      [{ key, date, when, icon, text, paper, note }] oldest first
 */
export function automaticSteps({ project, facts, tools, today }) {
  const { t } = tools
  const s = key => `projectDetail.story.steps.${key}`
  const row = rowSource(project, facts)
  const readings = distinctReadings(facts.readings)
  const ends = (facts.approved && row ? 1 : 0) + ((facts.completedOn || facts.due) && row ? 1 : 0)
  const everyReading = ends + readings.length <= MAX_STEPS
  const shown = everyReading ? readings : [readings[0], readings[readings.length - 1]]

  const steps = []
  if (facts.approved && row) {
    steps.push({ key: 'approved', date: facts.approved, when: tools.month(facts.approved), icon: 'verified', text: t(s('approved')), paper: row })
  }
  let before = null
  for (const r of shown) {
    const when = r.doc.dated === 'none' ? (r.doc.edition || String(r.date).slice(0, 4)) : tools.month(r.date)
    let text
    if (r.pct != null) text = t(s('built'), { pct: r.pct })
    else if (r.spent != null && r.spent > 0) text = t(s('spent'), { amount: tools.money(r.spent) })
    else text = t(s('cost'), { amount: tools.money(r.cost) })
    // Lower than the reading just before it on the road, as printed. Only
    // when every reading is shown: with the middle left out, the first and
    // the latest are not neighbours in the record.
    const lower = everyReading && before && r.pct != null && before.pct != null && r.pct < before.pct
    steps.push({ key: `r${r.date}-${steps.length}`, date: r.date, when, icon: 'monitoring', text, paper: paperOf(r.doc),
      note: lower ? t(s('lower')) : null })
    if (r.pct != null) before = r
  }
  if (facts.completedOn && row) {
    steps.push({ key: 'completed', date: facts.completedOn, when: tools.month(facts.completedOn), icon: 'task_alt', text: t(s('completed')), paper: row })
  } else if (facts.due && row) {
    const passed = !facts.isDone && isoMonth(facts.due) < isoMonth(today)
    steps.push({ key: 'due', date: facts.due, when: tools.month(facts.due), icon: 'event', text: t(s('due')), paper: row,
      note: passed ? t('projectDetail.story.keyDates.passed') : null })
  }

  // Oldest first. The sort is stable, so on one date the approval comes
  // before the reading and the reading before the due date.
  steps.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return steps.length >= MIN_STEPS ? steps : null
}

/**
 * The steps of a hand-written story in one language, shaped like the
 * automatic ones, or null when the story has none. The story's checks
 * (validateStory) have already held every step to its source.
 */
export function flagshipSteps(story, lang, { fmtMonth, fmtDay }) {
  if (!story?.steps?.length) return null
  const byId = new Map((story.sources || []).map(x => [x.id, x]))
  const when = x => (x.precision === 'year' ? x.date : x.precision === 'month' ? fmtMonth(x.date) : fmtDay(x.date))
  return story.steps.map((x, i) => {
    const src = byId.get(x.source)
    return {
      key: `s${i}`, date: x.date, when: when(x), icon: x.icon || 'description',
      text: x.text[lang], short: x.short[lang],
      paper: { name: src.short, title: `${src.title}. ${src.publisher}`, url: src.url, tier: src.tier },
      note: null,
    }
  })
}

/**
 * The words on the square picture: the heading, one line per step and the
 * page's own address, so the picture still says where to check after an
 * app has dropped its caption.
 *
 * @param link   the page's address without https://, as a reader would type it
 */
export function stepsPicture({ steps, title, eyebrow = '', link, t, lang }) {
  if (!steps?.length) return null
  return {
    kind: 'steps',
    lang,
    eyebrow,
    title,
    steps: steps.map(x => ({
      chip: x.when && /^\d{4}-\d{2}$/.test(x.when) ? x.when : String(x.date).slice(0, 4),
      label: x.short || x.text,
      note: x.note || '',
    })),
    foot: t('projectDetail.story.steps.pictureFoot'),
    link,
  }
}
