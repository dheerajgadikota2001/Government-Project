/**
 * The sentence a person actually searches for.
 *
 * WHY THIS FILE EXISTS
 *
 * A project page held every number a reader could want and never said any of
 * them in a sentence. The cost was in a tile, the spend was in a tile, the
 * progress was in a tile. A tile is a fact; it is not text, and a search
 * engine matches text. So a page carrying the only cited answer to "how much
 * has been spent on Polavaram" did not contain that answer in any form a
 * search for it could match.
 *
 * This builds that answer, in the reader's language, from the record. It is
 * generated for all 673 projects rather than written for the famous ones,
 * because the long tail is where a small site can win: nobody else has a
 * cited spend figure for the Mydukur Badvel four-lane, and somebody
 * eventually searches for it.
 *
 * RULES IT KEEPS
 *
 * Every clause is dropped when its field is missing. There is no sentence
 * here that can be produced by an absent figure, no "0" standing in for "not
 * published", and no rounding that invents precision the source did not give.
 * On this site a made-up number is not a bug, it is the end of the argument
 * the whole platform makes. A shorter paragraph is always the correct answer
 * to a thinner record.
 */

import { croreAmount } from './money.js'

/**
 * @param project      the project record
 * @param observation  the latest progress observation, or null
 * @param t            translate(key, vars)
 * @param fmtNum       Indian digit grouping
 * @param fmtMonth     a date to "June 2025" in the reader's language
 * @returns string[]   sentences, in order. Empty when the record says nothing.
 */
export function projectSummary({ project, observation, t, fmtNum, fmtMonth }) {
  if (!project?.title) return []

  const unit = t('unit.croreWord')
  const name = project.title
  const out = []

  const cost = project.estimated_cost_crore
  const spent = observation?.cumulative_expenditure_crore
  const asOf = observation?.observed_date ? fmtMonth(observation.observed_date) : null
  // No rupee sign here. Every locale string already carries one, in the place
  // its own script puts it, and adding a second produced "₹₹23,776 crore" on
  // all 673 pages in all six languages. The test below now asserts the
  // absence of a doubled sign, because the first version of it matched the
  // amount loosely enough to walk straight past this.
  //
  // Rounding lives in money.js, shared with the tiles directly below this
  // paragraph. Two copies of that rule would eventually print ₹2.82 crore in
  // the sentence and ₹3 Cr in the box beside it, about the same field.
  const money = v => croreAmount(v, fmtNum)

  // A spend figure without the date it was published is not a fact anyone can
  // check, so it is never printed alone.
  if (spent != null && asOf && cost != null) {
    out.push(t('projectDetail.summary.spendVsCost', {
      date: asOf, name, spent: money(spent), cost: money(cost), unit,
    }))
  } else if (spent != null && asOf) {
    out.push(t('projectDetail.summary.spendOnly', { date: asOf, name, spent: money(spent), unit }))
  } else if (cost != null) {
    out.push(t('projectDetail.summary.costOnly', { name, cost: money(cost), unit }))
  }

  if (project.completion_percentage != null) {
    out.push(t('projectDetail.summary.progress', { percent: project.completion_percentage }))
  }

  if (project.actual_completion) {
    out.push(t('projectDetail.summary.completed', { date: fmtMonth(project.actual_completion) }))
  } else if (project.expected_completion) {
    out.push(t('projectDetail.summary.expected', { date: fmtMonth(project.expected_completion) }))
  }

  // Not "announced", whatever the column is named in our own schema.
  //
  // announced_date has exactly one source: the MoSPI flash report Table 7
  // column the parser reads as `approval`. That is the date a project got the
  // investment approval which put it under central monitoring. For Polavaram
  // it reads February 2009, and the project was proposed decades before that.
  // Calling it "announced" would have told 673 pages that a project began the
  // day a ministry started counting it, which is a claim the record does not
  // make and this platform must not make either. The timeline below the fold
  // already hedged it as "Announced / approved (as recorded)"; this sentence
  // had been less careful than the page it sits on.
  if (project.announced_date) {
    out.push(t('projectDetail.summary.approved', { date: fmtMonth(project.announced_date) }))
  }

  // The source line is the point of the paragraph, so it is only added when
  // there is something above it to attribute.
  const source = observation?.source_label || project.source_portal
  if (out.length && source) {
    out.push(t('projectDetail.summary.source', { source }))
  }

  return out
}
