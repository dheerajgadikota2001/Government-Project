/**
 * The numbers behind the tenure picture on the project register, kept apart
 * from the drawing so they can be tested without a browser.
 *
 * Rules, because this is the most political chart on the site:
 *   - A project counts under EVERY government it touched. A project spanning
 *     two terms appears in both rows. The rows therefore do not sum to the
 *     number of projects, and the caption says so.
 *   - Stage is the project's current status folded into four buckets. It says
 *     where the project is today, not who got it there.
 *   - Event share is the count of recorded events per government, so a term
 *     with many documents weighs more than a term with one. Again a fact about
 *     the record, not a verdict.
 */

export const TENURES = ['tdp1', 'ysrcp', 'tdp2']

/** Order matters: it is the drawing order and the darkest-first shade ramp. */
export const STAGES = ['completed', 'building', 'announced', 'stalled']

const STAGE_OF = {
  completed: 'completed',
  under_construction: 'building', tendered: 'building', approved: 'building',
  delayed: 'stalled', suspended: 'stalled', cancelled: 'stalled',
  announced: 'announced',
}

export const stageOf = status => STAGE_OF[status] || 'announced'

/** A project with no recorded span is treated as current-government only. */
export const spansOf = p => (Array.isArray(p?.spans) && p.spans.length ? p.spans : ['tdp2'])

/**
 * @param {Array} shown  the filtered register rows
 * @returns {{ rows: Array, totalEvents: number, max: number }}
 *   rows[i] = { g, total, by: {stage: n}, names: {stage: string[]}, events, spanning }
 */
export function summarise(shown, { namesPerStage = 3 } = {}) {
  const rows = TENURES.map(g => {
    const by = Object.fromEntries(STAGES.map(s => [s, 0]))
    const names = Object.fromEntries(STAGES.map(s => [s, []]))
    let total = 0, spanning = 0, events = 0
    for (const p of shown) {
      events += Number(p?.by_tenure?.[g] || 0)
      const sp = spansOf(p)
      if (!sp.includes(g)) continue
      total += 1
      if (sp.length > 1) spanning += 1
      const s = stageOf(p.status)
      by[s] += 1
      if (names[s].length < namesPerStage && p.title) names[s].push(p.title)
    }
    return { g, total, by, names, events, spanning }
  })
  return {
    rows,
    totalEvents: rows.reduce((a, r) => a + r.events, 0),
    max: Math.max(1, ...rows.map(r => r.total)),
  }
}
