/**
 * Fact checks: a claim from an official document, set beside the record.
 *
 * WHY THIS EXISTS
 *
 * The site is called Fact Check and, until this, had no fact-check pages. It
 * held the material for them: claims from both governments' white papers,
 * already reconciled against RBI, CAG and the state's own accounts, sitting in
 * a context field on the finances endpoint. This gives each one a page.
 *
 * THE RULE THAT MAKES THE SECTION WORTH ANYTHING
 *
 * A status describes the comparison between two numbers. It is never a
 * verdict on the person who made the claim. Most fact-checkers rate people:
 * true, false, misleading. That is an opinion, and it is what both sides will
 * attack. These statuses are each a fact about two figures, which is a thing a
 * reader can check for themselves against the linked documents. The format is
 * the position.
 *
 * Both governments get the same template, the same statuses, and the same
 * rules about what counts as a checkable claim. The day this checks one side
 * only, the word unbiased is gone and does not come back.
 */
// The import attribute is what lets node, which runs the tests and the
// prerenderer, read this file. Vite accepts it too.
import checks from '../data/factchecks.json' with { type: 'json' }

/**
 * The only statuses a claim may carry, and what each one is allowed to mean.
 *
 *   matches       the claimed figure and the record agree, within rounding or
 *                 within the difference between an estimate and its audit
 *   differs       same definition, same date, different number
 *   definition    the claim counts something the record does not, or vice
 *                 versa, so the two numbers are not describing the same thing
 *   unverifiable  no public document carries a figure for that date or that
 *                 definition, so the claim can be neither confirmed nor denied
 *
 * "unverifiable" is a real outcome, not a soft version of "false". A claim
 * from one side that cannot be checked is not published as though it were
 * wrong.
 */
export const STATUSES = ['matches', 'differs', 'definition', 'unverifiable']

/** How each status maps to Google's ClaimReview rating scale (1 worst, 5 best). */
export const STATUS_RATING = {
  matches: 5,
  definition: 3,
  unverifiable: 3,
  differs: 2,
}

export const FACT_CHECKS = checks.checks

export const factCheckPath = slug => `/factcheck/${slug}`

export function findFactCheck(slug) {
  return FACT_CHECKS.find(c => c.slug === slug) || null
}

/** Newest first, by the date of the most recent claim on the page. */
export function factChecksNewestFirst() {
  return [...FACT_CHECKS].sort((a, b) => {
    const da = Math.max(...a.claims.map(c => Date.parse(c.date) || 0))
    const db = Math.max(...b.claims.map(c => Date.parse(c.date) || 0))
    return db - da
  })
}

/**
 * Everything a check must have before it can publish. Run by the tests over
 * every entry, so a half-filled claim fails the build rather than going out
 * with a missing source.
 */
export function validateFactCheck(check) {
  const problems = []
  const need = (cond, msg) => { if (!cond) problems.push(msg) }

  need(typeof check.slug === 'string' && /^[a-z0-9-]+$/.test(check.slug), 'slug must be a clean lowercase slug')
  need(typeof check.question === 'string' && check.question.trim().endsWith('?'), 'question must be a question')
  need(typeof check.summary === 'string' && check.summary.length > 40, 'summary is missing or too short')
  need(typeof check.explanation === 'string' && check.explanation.length > 120, 'explanation is missing or too short')
  // The search result. A question longer than 60 characters, or a summary
  // longer than 160, is cut off by Google, so each then needs its own short
  // form (seoTitle, seoDescription), written to fit rather than clipped.
  const seoTitle = check.seoTitle || check.question || ''
  const seoDescription = check.seoDescription || check.summary || ''
  need(seoTitle.length <= 60, `search title is ${seoTitle.length} characters; add a seoTitle of 60 or fewer`)
  need(seoDescription.length <= 160, `search description is ${seoDescription.length} characters; add a seoDescription of 160 or fewer`)
  need(Array.isArray(check.claims) && check.claims.length > 0, 'at least one claim')
  need(Array.isArray(check.record) && check.record.length > 0, 'at least one record row')

  for (const [i, c] of (check.claims || []).entries()) {
    const at = `claim ${i + 1}`
    need(STATUSES.includes(c.status), `${at}: status "${c.status}" is not one of ${STATUSES.join(', ')}`)
    need(c.made_by && c.party, `${at}: who made it, and which party`)
    need(/^\d{4}-\d{2}-\d{2}$/.test(c.date || ''), `${at}: date must be YYYY-MM-DD`)
    need(c.document && /^https?:\/\//.test(c.document_url || ''), `${at}: document and a real document_url`)
    need(typeof c.quote === 'string' && c.quote.length > 10, `${at}: the claim must be quoted`)
    need(typeof c.figure === 'number' && Number.isFinite(c.figure), `${at}: figure must be a number`)
    need(typeof c.note === 'string' && c.note.length > 20, `${at}: a note saying how the status was reached`)
  }
  for (const [i, r] of (check.record || []).entries()) {
    const at = `record ${i + 1}`
    need(r.source && r.document, `${at}: source and document`)
    need(/^https?:\/\//.test(r.document_url || ''), `${at}: a real document_url`)
    need(r.measure, `${at}: what exactly was measured`)
    need(typeof r.figure === 'number' && Number.isFinite(r.figure), `${at}: figure must be a number`)
  }
  return problems
}

/** Both sides, or the section is not unbiased. Checked across the whole file. */
export function partiesCovered(list = FACT_CHECKS) {
  return [...new Set(list.flatMap(c => c.claims.map(x => x.party)))].sort()
}
