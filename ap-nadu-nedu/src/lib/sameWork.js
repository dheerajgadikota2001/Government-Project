/**
 * When two records in the register are one thing in the world.
 *
 * WHY THIS FILE EXISTS
 *
 * The register is fed by several government sources and they do not agree with
 * each other about what a project is called or what it costs. Polavaram is in
 * the Socio-Economic Survey 2024-25 annexure as "Polavaram Irrigation Project
 * (Phase 1)" at ₹30,437 crore, and in the MoSPI flash report as "POLAVARAM
 * IRRIGATION PROJECT" at ₹55,549 crore. One dam, two rows, two pages, twenty
 * five thousand crore apart.
 *
 * That cost both pages. To a search engine they are near duplicates competing
 * for the same query, so neither wins. To a reader who finds both, the site
 * looks careless.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not delete a row and it does not pick a winning figure. Both numbers
 * are real, both are published by the government, and the gap between them is
 * the single most interesting fact this site holds about Polavaram. One page is
 * made canonical so the search engine has one address to rank, and that page
 * carries every source's figure side by side, named and dated. Deciding which
 * figure is "right" is not this platform's job; showing that the question
 * exists is exactly its job.
 *
 * WHY THIS IS A HAND WRITTEN LIST
 *
 * Deciding that two rows are one dam is a judgement, not a string comparison.
 * An automatic title match on this register groups six genuinely different
 * water bodies in Eluru, because they are all called "Rejuvenation of water
 * bodies" and differ only inside the brackets. Guessing wrong here merges two
 * real projects into one and hides public money, which is a worse failure than
 * leaving a duplicate in place. So each entry is added deliberately, with the
 * reason recorded, and the test file checks the shape rather than the judgement.
 */

/**
 * @property canonical  the id whose page every other member points at
 * @property also       the other ids for the same real-world work
 * @property name       what to call it when the members disagree on the name
 * @property why        why these are one thing, in a sentence, for the reader
 */
export const SAME_WORK = [
  {
    canonical: 613,
    also: [1],
    name: 'Polavaram Irrigation Project',
    // 613 is canonical because its record is the fuller one: it carries the
    // spend to date, the physical progress and the MoSPI project code, and its
    // source is eighteen months newer. Neither of those is on the survey row.
    why: 'The MoSPI flash report and the Socio-Economic Survey annexure both ' +
      'track this dam, under different names and with different figures.',
  },
]

const BY_MEMBER = new Map()
for (const group of SAME_WORK) {
  for (const id of [group.canonical, ...group.also]) BY_MEMBER.set(id, group)
}

/** The group this project belongs to, or null. */
export function groupFor(id) {
  return BY_MEMBER.get(Number(id)) || null
}

/** The id whose page should carry this work. Itself, when it is not grouped. */
export function canonicalIdFor(id) {
  const g = groupFor(id)
  return g ? g.canonical : Number(id)
}

/**
 * True when this page exists only because a second source filed the same work.
 *
 * Such a page is still written and still reachable, because its URL may already
 * be indexed or shared. It declares the canonical page instead of competing
 * with it, and it stays out of the sitemap, because a sitemap is a list of URLs
 * asking to be indexed and this one is asking not to be.
 */
export function isDuplicate(id) {
  const g = groupFor(id)
  return Boolean(g) && g.canonical !== Number(id)
}

/** Every project in this work, canonical first. Empty when it is not grouped. */
export function membersOf(id) {
  const g = groupFor(id)
  return g ? [g.canonical, ...g.also] : []
}

/**
 * True when the members put materially different money on the same work.
 *
 * A tenth of a crore apart is two sources rounding. A quarter of the cost apart
 * is a disagreement worth a heading. The threshold is a ratio rather than an
 * amount because the register runs from half a crore to fifty thousand.
 */
export function costsDisagree(costs, tolerance = 0.02) {
  const real = costs.filter(c => typeof c === 'number' && Number.isFinite(c) && c > 0)
  if (real.length < 2) return false
  const low = Math.min(...real)
  const high = Math.max(...real)
  return (high - low) / high > tolerance
}
