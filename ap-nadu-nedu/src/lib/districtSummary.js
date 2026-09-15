/**
 * What a district page says about itself.
 *
 * WHY THIS FILE EXISTS
 *
 * "Government projects in Guntur district" is a real search that people type,
 * and /projects?district=Guntur had nothing on it to answer with. The heading
 * said "Projects", the intro said the same sentence as every other district,
 * and the district's name appeared only inside a dropdown. Twenty-six pages
 * that could each rank for their own name, with nothing on them to rank.
 *
 * WHY THE NUMBERS COME FROM WHERE THEY DO
 *
 * /projects/stats accepts a district parameter and ignores it. It returns the
 * statewide totals whatever you pass. Building this from that endpoint would
 * have printed "673 tracked projects, ₹3.78 lakh crore" on all 26 district
 * pages, each one confidently wrong, on a site whose entire argument is that
 * its figures can be checked. So the count comes from the filtered register
 * itself, which is the same query that produced the list on screen, and the
 * cost comes from /projects/insights, whose per-district rows were verified
 * against that count before this was written.
 *
 * And they are checked against each other at render time. If the two ever
 * disagree the cost sentence is dropped rather than guessed at, because a
 * count and a total that came from different places and no longer agree is
 * exactly the moment to say less.
 */
import { croreAmount } from './money.js'

/**
 * @param district  the district name, or falsy for the whole register
 * @param total     count from the filtered register query on this page
 * @param row       this district's row from /projects/insights by_district
 * @param t         translate(key, vars)
 * @param fmtNum    Indian digit grouping
 * @returns string[]  sentences, in order
 */
export function districtSummary({ district, total, row, t, fmtNum }) {
  if (!district || total == null) return []

  const out = [t('projects.district.count', { count: total, district })]

  // The cost is only printed when the aggregate still describes the same set
  // of projects the register just counted.
  if (row && row.count === total && row.cost_crore != null) {
    const amount = croreAmount(row.cost_crore, fmtNum)
    if (amount) {
      out.push(t('projects.district.cost', { amount, unit: t('unit.croreWord') }))
      // Not a disclaimer. A project on the Guntur-Palnadu border is in both
      // counts and its cost is in both totals, so a reader adding the 26
      // district pages together would get more than the register holds. Say
      // that here rather than let them find it out.
      out.push(t('projects.district.method'))
    }
  }

  return out
}
