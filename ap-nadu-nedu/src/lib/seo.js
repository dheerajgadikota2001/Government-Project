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
import { SITE_ORIGIN, SITE_NAME, matchRoute } from './routes.js'

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
export function canonicalFor(pathname) {
  // Any query string is dropped here. Kept a separate exported function so the
  // rule can be tested without standing up a DOM for it.
  const path = String(pathname).split('?')[0].split('#')[0]
  return SITE_ORIGIN + (path.replace(/\/+$/, '') || '/')
}

export function applySeo(pathname, override = {}) {
  if (typeof document === 'undefined') return

  const route = matchRoute(pathname)
  const title = override.title || route?.title || SITE_NAME
  const description = override.description || route?.description || ''
  const canonical = canonicalFor(pathname)

  document.title = title
  meta('name', 'description', description)
  link('canonical', canonical)

  meta('property', 'og:title', title)
  meta('property', 'og:description', description)
  meta('property', 'og:url', canonical)
  meta('property', 'og:site_name', SITE_NAME)
  meta('name', 'twitter:title', title)
  meta('name', 'twitter:description', description)

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
