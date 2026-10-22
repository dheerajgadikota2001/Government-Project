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
import { displayTitle } from './projectTitle.js'
import { summarySource, whenPrinted } from './sourceDocs.js'

/**
 * The reader-facing label for a status or a type, or null.
 *
 * Both columns are enums, so a value that is not in the locale file is a value
 * this build does not understand. Printing the raw enum ("under_construction")
 * in the middle of a Telugu sentence is worse than printing nothing, so a
 * missing label drops the clause instead of leaking a database token.
 *
 * `other` is a real ProjectType, and it is the one type worth saying nothing
 * about: "It is recorded as Other work" is a sentence that informs nobody and
 * would have been printed on every unclassified project in six languages.
 */
/**
 * Both translators in this codebase report a miss the same way: they return
 * the last segment of the key. So an unknown status comes back as the enum
 * token itself, which is exactly the string that must never reach the page.
 * Comparing against that segment is how a miss is detected, and it is safe
 * because no real label is the lower case enum token.
 */
const labelled = (t, key, token) => {
  const label = t(key)
  return label && label !== token ? label : null
}

export function statusLabel(project, t) {
  const key = project?.status
  if (!key) return null
  return labelled(t, `projects.status.${key}`, key)
}

export function typeLabel(project, t) {
  const key = project?.project_type
  if (!key || key === 'other') return null
  return labelled(t, `projects.type.${key}`, key)
}

/**
 * Where the record puts this project, as a sentence, or null.
 *
 * Shared with the "Where is it?" section on the page so that the paragraph and
 * the heading below it can never disagree about the district.
 */
export function placeSentence(project, t) {
  if (!project?.district) return null
  return project.mandal
    ? t('projectDetail.a.placeMandal', {
        name: displayTitle(project.title), district: project.district, mandal: project.mandal })
    : t('projectDetail.a.place', { name: displayTitle(project.title), district: project.district })
}

/** What stage the record puts it at, as a sentence, or null. */
export function stageSentence(project, t) {
  const status = statusLabel(project, t)
  if (!status) return null
  const type = typeLabel(project, t)
  return type
    ? t('projectDetail.a.stageType', { type, status })
    : t('projectDetail.a.stage', { status })
}

/** Who the record holds responsible, as a sentence, or null. */
export function responsibleSentence(project, t) {
  if (!project?.department) return null
  return project.implementing_agency
    ? t('projectDetail.a.runByAgency', { department: project.department, agency: project.implementing_agency })
    : t('projectDetail.a.runBy', { department: project.department })
}

/**
 * The money sentence: spend against cost, spend alone, or cost alone.
 *
 * No rupee sign is added here. Every locale string already carries one, in the
 * place its own script puts it, and adding a second produced "₹₹23,776 crore"
 * on all 673 pages in all six languages.
 *
 * Rounding lives in money.js, shared with the tiles beside this paragraph. Two
 * copies of that rule would eventually print ₹2.82 crore in the sentence and
 * ₹3 Cr in the box next to it, about the same field.
 *
 * A spend figure without the date it was published is not a fact anyone can
 * check, so it is never printed alone.
 */
export function moneySentence({ project, observation, t, fmtNum, fmtMonth }) {
  const name = displayTitle(project?.title)
  if (!name) return null
  const unit = t('unit.croreWord')
  const money = v => croreAmount(v, fmtNum)
  const cost = project.estimated_cost_crore
  const spent = observation?.cumulative_expenditure_crore
  // "As of 2018-19" for a survey that printed no date, never the end-of-year
  // day our register files it under (sourceDocs.js whenPrinted).
  const asOf = whenPrinted(observation, fmtMonth)

  if (spent != null && asOf && cost != null) {
    return t('projectDetail.summary.spendVsCost', {
      date: asOf, name, spent: money(spent), cost: money(cost), unit,
    })
  }
  if (spent != null && asOf) {
    return t('projectDetail.summary.spendOnly', { date: asOf, name, spent: money(spent), unit })
  }
  if (cost != null) return t('projectDetail.summary.costOnly', { name, cost: money(cost), unit })
  return null
}

/** Physical progress, or null. */
export function progressSentence(project, t) {
  return project?.completion_percentage == null
    ? null
    : t('projectDetail.summary.progress', { percent: project.completion_percentage })
}

/** When it finished, or when it is due, or null. */
export function timingSentence(project, t, fmtMonth) {
  if (project?.actual_completion) {
    return t('projectDetail.summary.completed', { date: fmtMonth(project.actual_completion) })
  }
  // A project the record calls completed is not "expected" any more, and the
  // record gives no day it finished: the status sentence says it is done, and
  // nothing here pretends to know when. 97 completed projects used to be told
  // they were still expected, on the date they had been scheduled for.
  if (project?.status === 'completed') return null
  if (project?.expected_completion) {
    return t('projectDetail.summary.expected', { date: fmtMonth(project.expected_completion) })
  }
  return null
}

/**
 * The approval date, and not "announced", whatever the column is named in our
 * own schema.
 *
 * announced_date has exactly one source: the MoSPI flash report Table 7 column
 * the parser reads as `approval`. That is the date a project got the
 * investment approval which put it under central monitoring. For Polavaram it
 * reads February 2009, and the project was proposed decades before that.
 * Calling it "announced" would tell 673 pages that a project began the day a
 * ministry started counting it, a claim the record does not make and this
 * platform must not make either.
 */
export function approvalSentence(project, t, fmtMonth) {
  return project?.announced_date
    ? t('projectDetail.summary.approved', { date: fmtMonth(project.announced_date) })
    : null
}

/**
 * Which document every figure above came from, or null.
 *
 * Not simply the latest reading's document: see summarySource in
 * sourceDocs.js for the two pages that rule used to get wrong.
 */
export function sourceSentence({ project, observation, t }) {
  const source = summarySource({ project, observation })
  return source ? t('projectDetail.summary.source', { source: source.label }) : null
}

/**
 * The project's code as its source document prints it, and what a reader
 * should type to find it there. null when the code is not the source's.
 *
 * Two kinds of external_id are not what they look like:
 *
 *  - SES-IRR-VELIGONDA and its sixty siblings are our own keys. The
 *    Socio-Economic Survey prints no project codes, so telling a reader to
 *    search the survey for one sent them looking for a string that is not
 *    in it.
 *  - AP-SRIKAKULAM-12066 is the AMRUT status PDF's own ID, but the PDF
 *    prints it across three lines of a table cell ("AP-", "SRIKAKULAM",
 *    "-12066"), so the whole code is never found by a search. The number is.
 */
export function sourceCode(project) {
  const code = String(project?.external_id || '').trim()
  if (!code) return null
  if (/^SES-/i.test(code)) return null
  const amrut = code.match(/^AP-.+-(\d+)$/)
  if (amrut && project.source_portal === 'AMRUT_MoHUA') return { code, search: amrut[1] }
  return { code, search: code }
}

/**
 * The project code, and what a reader is meant to do with it.
 *
 * This is the sentence that makes the page checkable rather than merely
 * sourced: the code is the string to search for inside the linked PDF.
 */
export function codeSentence(project, t) {
  const sc = sourceCode(project)
  if (!sc) return null
  return sc.search === sc.code
    ? t('projectDetail.a.code', { code: sc.code })
    : t('projectDetail.a.codeNumber', { code: sc.code, number: sc.search })
}

/**
 * @param project      the project record
 * @param observation  the latest progress observation, or null
 * @param t            translate(key, vars)
 * @param fmtNum       Indian digit grouping
 * @param fmtMonth     a date to "June 2025" in the reader's language
 * @returns string[]   sentences, in order. Empty when the record says nothing.
 *
 * Every clause is one of the helpers above, so the paragraph on the React page
 * and the question sections on the prerendered page are built from the same
 * sentences. They cannot drift into saying two different things about one
 * field, which is the failure that matters most on a site whose only claim is
 * that it repeats the record faithfully.
 */
export function projectSummary({ project, observation, t, fmtNum, fmtMonth }) {
  if (!project?.title) return []

  const out = [
    moneySentence({ project, observation, t, fmtNum, fmtMonth }),
    // Where it is, said in words. The district was on the page already, in a
    // definition list, which is a fact but not a sentence. "Projects in Guntur
    // district" is a search people actually type, and 527 pages held the
    // answer in a form that matched none of it.
    placeSentence(project, t),
    progressSentence(project, t),
    timingSentence(project, t, fmtMonth),
    approvalSentence(project, t, fmtMonth),
    // Status and type were in the database from the first import and had never
    // once been printed. status is a NOT NULL column, so this clause exists for
    // every project in the register, and it is the only one here that needed no
    // scraping to fill.
    stageSentence(project, t),
    responsibleSentence(project, t),
  ].filter(Boolean)

  // The source line is the point of the paragraph, so it is only added when
  // there is something above it to attribute.
  const source = out.length ? sourceSentence({ project, observation, t }) : null
  if (source) out.push(source)

  return out
}
