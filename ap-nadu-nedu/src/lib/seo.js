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
import { SITE_ORIGIN, SITE_NAME, matchRoute, LANG_CODES, localizedPath, currentLang } from './routes.js'
import { schemaFor } from './schema.js'
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
const RANKING_PARAMS = ['district']

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
 * hreflang: the six addresses of one page, each naming the others.
 *
 * Without these Google sees six pages that look like near duplicates of each
 * other and picks one, which is the opposite of the point. With them it knows
 * they are the same page in six languages and serves a Telugu reader the
 * Telugu one. x-default names English as the fallback for a language we do
 * not publish.
 *
 * Rewritten in full on every navigation. Editing them in place would be
 * cheaper and would also leave the previous page's alternates behind on any
 * path where the set changed, which is the kind of bug nobody sees for months.
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
  for (const code of LANG_CODES) add(code, canonicalFor(localizedPath(code, pathname)))
  add('x-default', canonicalFor(localizedPath('en', pathname)))
}

export function applySeo(pathname, override = {}) {
  if (typeof document === 'undefined') return

  // Callers pass the path the router gave them, which has no language prefix
  // because the router runs with a basename. Everything below describes an
  // address to a search engine, so it has to be the real one. localizedPath is
  // idempotent, so a caller that already prefixed is fine too.
  const localized = localizedPath(currentLang(), pathname)

  const route = matchRoute(localized)
  const title = override.title || route?.title || SITE_NAME
  const description = override.description || route?.description || ''
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
    schemaFor(localized, { title, description, breadcrumbTrail: override.breadcrumbTrail }),
  )

  // Search pages are the classic thin duplicate: one page per query, none of
  // them worth a search result of their own. Followed, so the links out of
  // them still count, just not listed.
  const robots = document.head.querySelector('meta[name="robots"]')
  if (route && route.index === false) {
    meta('name', 'robots', 'noindex, follow')
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

export function seoForProject(project) {
  if (!project?.title) return {}

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
    ? `${project.title} in ${where}: ${facts.join(', ')}.`
    : `${project.title}, a government project in ${where}.`

  return {
    // Name first, so it survives whatever Google truncates.
    title: clip(`${project.title} | ${SITE_NAME}`, 70),
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

export function seoForDistrict(district, projectCount) {
  if (!district) return {}
  const count = Number.isFinite(projectCount) ? projectCount : null
  return {
    title: clip(`Government projects in ${district} district, Andhra Pradesh`, 70),
    description: clip(
      count != null
        ? `${count} tracked government projects in ${district} district, Andhra Pradesh, with cost, status and the official document behind every figure.`
        : `Tracked government projects in ${district} district, Andhra Pradesh, with cost, status and the official document behind every figure.`,
      200,
    ),
  }
}
