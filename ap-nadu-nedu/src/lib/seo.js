/**
 * The head tags, rewritten on every route change.
 *
 * WHY THIS EXISTS
 *
 * index.html carries one hardcoded title, description and canonical, and every
 * route in this app is served from that same file. So /projects, /finances and
 * every other page told Google "the real page is the homepage". Google obeys a
 * canonical: it would have indexed one page and discarded the other eighteen as
 * duplicates, and it would have looked like Google was simply ignoring the
 * site. Search Console showed exactly that, with User-declared canonical
 * reading https://apfactcheck.dheeco.com/ on every URL inspected.
 *
 * WHY THE QUERY STRING IS DROPPED FROM THE CANONICAL
 *
 * /projects?district=Guntur&status=completed&page=2 is the same page as
 * /projects with the filters moved. Left alone, each combination becomes its
 * own URL competing with the others for the same content, and the register has
 * enough filters to generate thousands of them. Canonicalising to the bare path
 * folds them all back into one.
 *
 * WHY IT WRITES TO THE DOM DIRECTLY
 *
 * A helmet library would add a dependency and a render pass to set six tags.
 * These are plain DOM writes in an effect, which is what a helmet library does
 * underneath, minus the abstraction.
 */

// Explicit .js extension. Vite resolves extensionless imports, plain Node ESM
// does not, and scripts/tests runs under plain Node so that the route table can
// be tested without a bundler in the way.
import { SITE_ORIGIN, SITE_NAME, matchRoute, INDEXED_LANGS, isIndexedLang, localizedPath, splitLangPath, currentLang } from './routes.js'
import { schemaFor } from './schema.js'
import { displayTitle } from './projectTitle.js'
import { croreAmount } from './money.js'

/** Set or create one <meta>, keyed by whichever attribute identifies it. */
function meta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function link(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Apply the head tags for a path.
 *
 * `override` lets a detail page supply its own title and description once the
 * record has loaded, since no static table can know the name of project 613.
 * An unknown path falls back to the site name rather than leaving whatever the
 * previous page set, because a stale title is worse than a generic one.
 */
/**
 * Query parameters that name a genuinely different page, rather than a
 * different view of the same one.
 *
 * The register has enough filters to generate thousands of addresses, and
 * status, sort order and page number all show the same projects rearranged.
 * Those must fold back into one URL or they compete with each other.
 *
 * District is different. "Projects in Palnadu" is its own subject, people
 * search for it by name, and there are only 26 of them. Giving each a real
 * address is 26 pages worth ranking; giving every filter combination one would
 * be thousands of pages worth nothing.
 */
/**
 * Empty on purpose, and that is the change.
 *
 * `district` used to be here, because "projects in Palnadu" is a real subject
 * and folding it into /projects would have discarded 26 pages. It now has a
 * real path, /districts/palnadu, so the query form canonicalises to that
 * instead of competing with it. Nothing else in the register names a
 * different page: status, sort and page number are the same projects
 * rearranged, and there are thousands of combinations of them.
 */
const RANKING_PARAMS = []

export function canonicalFor(pathname) {
  // Kept a separate exported function so the rule can be tested without
  // standing up a DOM for it.
  const [path, query = ''] = String(pathname).split('#')[0].split('?')
  const base = SITE_ORIGIN + (path.replace(/\/+$/, '') || '/')

  const keep = new URLSearchParams()
  const given = new URLSearchParams(query)
  for (const key of RANKING_PARAMS) {
    const value = given.get(key)
    if (value) keep.set(key, value)
  }
  const rest = keep.toString()
  return rest ? `${base}?${rest}` : base
}

/**
 * The hreflang set for a path, as [hreflang, href] pairs.
 *
 * Only the languages this page is indexed in are named. hreflang pointing at a
 * noindex page is an error Search Console reports on every URL, and a set of
 * one names nothing. So an English department page, whose Telugu twin is
 * noindex, declares no alternates, while a project page names English and
 * Telugu. A page that is itself out of the index declares none either: it is
 * not asking to be ranked in any language. Pure, so it is tested without a DOM.
 */
export function alternatesFor(pathname) {
  const clean = String(pathname).split('#')[0]
  if (robotsFor(clean) !== null) return []
  const { path } = splitLangPath(clean)
  const langs = INDEXED_LANGS.filter(code => robotsFor(localizedPath(code, path)) === null)
  if (langs.length < 2) return []
  return langs
    .map(code => [code, canonicalFor(localizedPath(code, path))])
    .concat([['x-default', canonicalFor(localizedPath('en', path))]])
}

/**
 * Rewritten in full on every navigation. Editing in place would be cheaper
 * and would also leave the previous page's alternates behind on any path
 * where the set changed, which is the kind of bug nobody sees for months.
 */
function applyAlternates(pathname) {
  for (const el of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) {
    el.remove()
  }
  const add = (hreflang, href) => {
    const el = document.createElement('link')
    el.setAttribute('rel', 'alternate')
    el.setAttribute('hreflang', hreflang)
    el.setAttribute('href', href)
    document.head.appendChild(el)
  }
  for (const [code, href] of alternatesFor(pathname)) add(code, href)
}

/**
 * Pages whose substance is English whatever language the chrome around it is.
 *
 * A fact check quotes a white paper and a department page reads out a budget
 * volume, and neither text exists in Telugu. Offering the Telugu address to
 * search would put an English page in the Telugu index, which is the
 * half-translated signal that got 4,300 URLs ignored. They stay readable in
 * Telugu, noindex, until their own text is translated. Take a pattern out of
 * this set when it is.
 */
export const ENGLISH_CONTENT_PATTERNS = new Set([
  '/factcheck/:slug',
  '/finances/departments/:slug',
  '/news/:id',
])

/**
 * The robots directive for a page, or null for the default (index, follow).
 *
 * follow, never nofollow: a page out of the index is not a dead end, and the
 * links on it still lead a crawler to pages that rank.
 */
export function robotsFor(pathname, route) {
  const clean = String(pathname).split(/[?#]/)[0]
  const { lang } = splitLangPath(clean)
  if (!isIndexedLang(lang)) return 'noindex, follow'
  const r = route === undefined ? matchRoute(clean) : route
  if (r && r.index === false) return 'noindex, follow'
  if (lang !== 'en' && r && ENGLISH_CONTENT_PATTERNS.has(r.pattern)) return 'noindex, follow'
  return null
}

// ---------------------------------------------------------------------------
// The head in the page's language
// ---------------------------------------------------------------------------

/**
 * WHY A TRANSLATOR IS REGISTERED HERE
 *
 * Every page title and search snippet was English on every language, because
 * these functions had no way to reach the catalogue. Threading `t` through
 * nine call sites would work until the tenth forgot. The Seo component sits
 * inside the language provider on every page, so it registers the page's
 * translator once, during render, before any page's effect can run, and the
 * functions below read it by default. The language never changes during a
 * page's life (switching reloads), so there is nothing to keep in sync.
 *
 * The prerenderer passes { t, lang } explicitly and never touches this.
 */
let ACTIVE = { t: null, lang: 'en' }

export function setSeoLanguage({ t, lang } = {}) {
  ACTIVE = { t: t || null, lang: lang || 'en' }
}

const activeLanguage = () => ACTIVE

/**
 * A catalogue string for a non-English page, or null.
 *
 * Both translators answer a missing key with the key's last segment rather
 * than with nothing, so a miss is recognised by that and turned into null.
 * English never reads the catalogue here: the English head is the text in the
 * route table and below, unchanged.
 */
function localText(ctx, key, vars) {
  if (!ctx?.t || !ctx.lang || ctx.lang === 'en') return null
  const s = ctx.t(key, vars)
  return typeof s === 'string' && s !== key.split('.').pop() ? s : null
}

/** The catalogue key for a route: "/finances/:question" is "finances_question". */
export const routeKey = pattern => String(pattern).replace(/^\/+/, '').replace(/[/:]+/g, '_') || 'home'

/** The title and snippet the route table gives a page, in the page's language. */
export function seoForRoute(route, ctx = activeLanguage()) {
  if (!route) return {}
  const base = `seo.route.${routeKey(route.pattern)}`
  return {
    title: localText(ctx, `${base}.title`) || route.title,
    description: localText(ctx, `${base}.description`) || route.description,
  }
}

export function applySeo(pathname, override = {}) {
  if (typeof document === 'undefined') return

  // Callers pass the path the router gave them, which has no language prefix
  // because the router runs with a basename. Everything below describes an
  // address to a search engine, so it has to be the real one. localizedPath is
  // idempotent, so a caller that already prefixed is fine too.
  const localized = localizedPath(currentLang(), pathname)

  const route = matchRoute(localized)
  const fromRoute = seoForRoute(route)
  const title = override.title || fromRoute.title || SITE_NAME
  const description = override.description || fromRoute.description || ''
  const canonical = canonicalFor(localized)

  document.title = title
  meta('name', 'description', description)
  link('canonical', canonical)
  applyAlternates(localized)

  meta('property', 'og:title', title)
  meta('property', 'og:description', description)
  meta('property', 'og:url', canonical)
  meta('property', 'og:site_name', SITE_NAME)
  meta('name', 'twitter:title', title)
  meta('name', 'twitter:description', description)

  // One JSON-LD block, replaced rather than appended. Appending would leave a
  // trail of stale Organization blocks behind as the reader moves around a
  // single page app, and Google reading five contradictory descriptions of the
  // same site is worse than it reading none.
  let ld = document.head.querySelector('script[type="application/ld+json"]#site-schema')
  if (!ld) {
    ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.id = 'site-schema'
    document.head.appendChild(ld)
  }
  ld.textContent = JSON.stringify(
    schemaFor(localized, {
      title, description, breadcrumbTrail: override.breadcrumbTrail, factCheck: override.factCheck,
    }),
  )

  // Search pages are the classic thin duplicate: one page per query, none of
  // them worth a search result of their own. Followed, so the links out of
  // them still count, just not listed.
  // Language pages are out of the index for now; see INDEXED_LANGS.
  const robots = document.head.querySelector('meta[name="robots"]')
  const directive = robotsFor(localized, route)
  if (directive) {
    meta('name', 'robots', directive)
  } else if (robots) {
    robots.remove()
  }
}

// ---------------------------------------------------------------------------
// Titles for pages the route table cannot know about
// ---------------------------------------------------------------------------

/**
 * WHY THESE EXIST
 *
 * All 673 project pages shared one title: "Project record". Nobody searches
 * that. Thousands search "Polavaram project cost". The route table cannot know
 * the name of project 613, so the page supplies it once the record has loaded.
 *
 * These are pure functions rather than inline JSX so they can be tested, and so
 * a sentence that reads badly can be fixed in one place rather than three.
 *
 * They never invent. Every clause below is dropped when its field is missing,
 * because a description that says "status: undefined" is worse than a shorter
 * one, and on this site in particular a made-up figure would be the whole
 * point of the platform, lost.
 */

const clip = (s, max) => {
  const text = String(s || '').replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

/** "₹55,549 crore", in the grouping Indian readers actually use. */
function rupees(crore) {
  if (crore == null || Number.isNaN(Number(crore))) return null
  return `₹${croreAmount(crore)} crore`
}

export function seoForProject(project, ctx = activeLanguage()) {
  if (!project?.title) return {}
  // The <title> is what a search result shows, and 150 of the 673 records are
  // titled in capitals because the source PDF is typeset that way. Cased here
  // rather than at each call site so the tab, the snippet, the heading and the
  // breadcrumb cannot end up disagreeing about the same project's name.
  const title = displayTitle(project.title)

  // The project's own name stays as the register holds it, in English, until
  // a checked Telugu name exists. Everything around it is Telugu, and the
  // status comes from the same catalogue entry the page itself prints, so the
  // snippet and the page cannot describe one project two ways.
  if (localText(ctx, 'seo.project.title', { name: title })) {
    const tr = (key, vars) => localText(ctx, key, vars)
    const facts = []
    const status = project.status && tr(`projects.status.${project.status}`)
    if (status) facts.push(status)
    if (project.completion_percentage != null) facts.push(tr('seo.project.built', { pct: project.completion_percentage }))
    if (project.estimated_cost_crore != null && !Number.isNaN(Number(project.estimated_cost_crore))) {
      facts.push(tr('seo.project.cost', { cost: croreAmount(project.estimated_cost_crore) }))
    }
    const where = project.district
      ? tr('seo.project.inDistrict', { district: project.district })
      : tr('seo.project.statewide')
    const opening = facts.length
      ? tr('seo.project.opening', { name: title, where, facts: facts.join(', ') })
      : tr('seo.project.openingBare', { name: title, where })
    return {
      title: clip(tr('seo.project.title', { name: title }), 70),
      description: clip(`${opening} ${tr('seo.project.tail')}`, 200),
    }
  }

  const where = project.district || 'Andhra Pradesh'
  const facts = []
  if (project.status) facts.push(String(project.status).replace(/_/g, ' '))
  if (project.completion_percentage != null) facts.push(`${project.completion_percentage}% built`)
  const cost = rupees(project.estimated_cost_crore)
  if (cost) facts.push(`published estimated cost ${cost}`)

  // These are fragments, not sentences. Joining them with full stops is what
  // shipped "76% built. published estimated cost" into live search results on
  // every project page. A reader sees this line before deciding to click, so
  // it is worth writing as one sentence a person would actually say.
  const opening = facts.length
    ? `${title} in ${where}: ${facts.join(', ')}.`
    : `${title}, a government project in ${where}.`

  return {
    // Name first, so it survives whatever Google truncates.
    title: clip(`${title} | ${SITE_NAME}`, 70),
    description: clip(
      `${opening} Every figure links to the government document it came from.`,
      200,
    ),
  }
}

export function seoForNews(article) {
  if (!article?.title) return {}
  const source = article.source_name || article.source || null
  return {
    title: clip(`${article.title} | ${SITE_NAME}`, 70),
    description: clip(
      article.summary ||
      `An announcement collected from an Andhra Pradesh government source${source ? `, ${source}` : ''}, with a link to the original publication.`,
      200,
    ),
  }
}

export function seoForDistrict(district, projectCount, ctx = activeLanguage()) {
  if (!district) return {}
  const count = Number.isFinite(projectCount) ? projectCount : null
  // The {district} slot is filled in the page's language by the translator
  // itself (placeNames.js), so "Guntur" arrives here and "గుంటూరు" leaves.
  const localTitle = localText(ctx, 'seo.district.title', { district })
  if (localTitle) {
    const key = count === 0 ? 'none' : count != null ? 'count' : 'some'
    return {
      title: clip(localTitle, 70),
      description: clip(localText(ctx, `seo.district.${key}`, { district, count }), 200),
    }
  }
  return {
    title: clip(`Government projects in ${district} district, Andhra Pradesh`, 70),
    description: clip(
      count === 0
        ? `No government project in ${district} district, Andhra Pradesh is tracked here yet. Every figure this site publishes comes from an official document we cite.`
        : count != null
          ? `${count} tracked government projects in ${district} district, Andhra Pradesh, with cost, status and the official document behind every figure.`
          : `Tracked government projects in ${district} district, Andhra Pradesh, with cost, status and the official document behind every figure.`,
      200,
    ),
  }
}

/**
 * A finances question's title and snippet, in the page's language.
 *
 * The question itself was already translated for the page body
 * (questionKey); the head was the one place still reading the English title
 * off the question record.
 */
export function seoForFinanceQuestion(question, ctx = activeLanguage()) {
  if (!question) return {}
  const base = `seo.financeQuestion.${question.slug}`
  return {
    title: clip(localText(ctx, `${base}.title`) || question.title, 90),
    description: clip(localText(ctx, `${base}.description`) || question.description, 200),
  }
}
