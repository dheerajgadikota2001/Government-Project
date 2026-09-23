/**
 * Links from a page to the pages about the same subject.
 *
 * WHY THIS EXISTS
 *
 * The live check on 23 September 2026 counted the links on every section
 * page. Governments, tenders, news, documents, state facts, states and
 * sources each carried exactly 19: the site menu, and nothing else. A reader
 * who opened "The tenure record of every Andhra Pradesh government" had no
 * way on to the fact checks that test both governments' debt claims, which
 * is the first thing that reader wants next. A crawler saw the same dead end:
 * the fact checks and the finance questions were reachable from their own
 * section pages and from almost nowhere else.
 *
 * WHAT IT IS NOT
 *
 * Not "you may also like". Every group here is the same record seen from
 * another side: a government's tenure and the fact checks about its debt,
 * tenders and the districts they are in. The pairs are written out by hand
 * below, because a link a person chose for a reason is worth more to a reader
 * and to a search engine than twenty chosen by a rule.
 *
 * ONE LIST, TWO READERS
 *
 * The React page (components/RelatedLinks.jsx) and the prerendered HTML
 * (scripts/prerender.mjs) both read relatedGroups, so a crawler is never
 * shown a link a reader does not also get.
 */
import { FACT_CHECKS, factCheckPath } from './factcheck.js'
import { FINANCE_QUESTIONS, financeQuestionPath } from './financeQuestions.js'
import { AP_DISTRICTS } from './districts.js'
import { districtPath } from './routes.js'

/** Which groups each section page carries, in order. */
export const RELATED = {
  '/governments': ['factChecks', 'financeQuestions'],
  '/factcheck': ['financeQuestions'],
  '/news': ['factChecks'],
  '/documents': ['financeQuestions', 'factChecks'],
  '/sources': ['factChecks'],
  '/states': ['financeQuestions'],
  '/state-facts': ['districts'],
  '/tenders': ['districts'],
  '/school-education': ['districts'],
}

const GROUPS = {
  factChecks: t => FACT_CHECKS.map(c => ({ path: factCheckPath(c.slug), label: c.question })),
  financeQuestions: t => FINANCE_QUESTIONS.map(q => ({ path: financeQuestionPath(q.slug), label: t(q.questionKey) })),
  // The name alone, in the page's language (the translator fills {district}
  // from placeNames.js). The heading above says what the list is.
  districts: t => AP_DISTRICTS.map(d => ({ path: districtPath(d), label: t('related.districtName', { district: d }) })),
}

/**
 * @param keep   which paths may be linked. The prerenderer passes "a page was
 *               written for this", because a district with nothing behind it
 *               is a published 404; the app links all 26, since it renders
 *               any district by script whether or not its HTML exists.
 * @returns [{ key, heading, links: [{ path, label }] }] for a route pattern,
 *          or [] for a page that carries none.
 */
export function relatedGroups(pattern, t, { keep = () => true } = {}) {
  return (RELATED[pattern] || []).map(key => ({
    key,
    heading: t(`related.${key}`),
    links: GROUPS[key](t).filter(l => keep(l.path)),
  })).filter(g => g.links.length)
}

/**
 * The projects shown under "Other projects in {district}" on a project page,
 * chosen the way the register lists them by default: most recently updated
 * first, then newest id. Same district when the work has one, otherwise the
 * same type, which is how the central-sector projects MoSPI files state-wide
 * still get neighbours.
 *
 * Pure, and over the whole register, because the prerenderer has all of it in
 * hand. The React section asks the API the same question.
 *
 * @param districtOf   where a project is, including a merged sibling's
 *                     district (prerender.mjs workDistrict)
 * @param isDuplicate  records that hand their page to another (sameWork.js)
 */
export function neighbours(project, projects, { districtOf = p => p.district, isDuplicate = () => false, limit = 6 } = {}) {
  if (!project) return { by: null, items: [] }
  const home = districtOf(project)
  const byDistrict = home ? districtPath(home) : null
  const candidates = projects.filter(p => p.id !== project.id && !isDuplicate(p.id))
  const same = byDistrict
    ? candidates.filter(p => districtOf(p) && districtPath(districtOf(p)) === byDistrict)
    : project.project_type
      ? candidates.filter(p => p.project_type === project.project_type)
      : []
  const when = p => Date.parse(p.updated_at || '') || 0
  const items = same
    .sort((a, b) => (when(b) - when(a)) || (b.id - a.id))
    .slice(0, limit)
  return { by: byDistrict ? 'district' : project.project_type ? 'type' : null, district: home || null, items }
}
