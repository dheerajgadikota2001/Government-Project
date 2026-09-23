/**
 * The route table. One list, three consumers.
 *
 * WHY THIS FILE EXISTS
 *
 * The router in App.jsx already knew every route. Analytics.jsx kept a second
 * hand-written copy of the same list, and its own comment records what that
 * cost: the copy had drifted before a single event was sent, naming four
 * routes that did not exist and missing five that did, so five working pages
 * would have reported themselves as route_not_found. A hand-maintained mirror
 * drifts by construction.
 *
 * Adding SEO metadata was about to create a third copy. So instead there is
 * one list here, Analytics reads its patterns, the Seo component reads its
 * titles, the sitemap generator reads its paths, and a test asserts this file
 * and App.jsx agree. Drift is now a failing test rather than a silent bug.
 *
 * WHY THE TITLES ARE STILL IN ENGLISH
 *
 * Each language now has its own address (see LANG_CODES below), so a per
 * language title is finally possible. The strings themselves are not written
 * yet: that is 46 strings per language and it is its own piece of work. Until
 * they exist every language serves the English title, which is a weak signal
 * but a truthful one, and far better than the six languages having no address
 * at all, which was the position before.
 */

import { canonicalDistrict } from './districts.js'

export const SITE_ORIGIN = 'https://apfactcheck.dheeco.com'

export const SITE_NAME = 'Andhra Pradesh Fact Check'

/**
 * Every route the router serves.
 *
 *   pattern      matches App.jsx exactly, ':' segments are parameters
 *   title        the browser tab and the search result headline
 *   heading      the page's <h1>, when it differs from the title
 *   description  the search result snippet, kept under about 155 characters
 *   index        false keeps the page out of search results but still followed
 *   static       false for pages whose address contains a parameter, so the
 *                sitemap generator knows not to publish the literal ':id'
 */
export const ROUTES = [
  // title and description are held to 60 and 160 characters by
  // scripts/tests/seo-lengths.test.mjs. The site name is added to a title by
  // seo.js titleFor when it fits, so it is not written here.
  // heading, where given, is the page's <h1>; otherwise the title is.
  {
    pattern: '/',
    // The site's name first, then the three things people search for. The
    // old title was the name alone, in two scripts, which ranks for nothing
    // but the name, and nobody searches a name they have not heard yet.
    title: 'Andhra Pradesh Fact Check: AP projects, budget and debt',
    // The same words the reader sees in the hero (home.hero.titleLine1/2).
    heading: 'Track Andhra Pradesh Government Work',
    description:
      'Projects, budget, debt and investment MoUs of Andhra Pradesh, every figure taken from a government document and cited. Independent, free, no login.',
  },
  {
    pattern: '/projects',
    title: 'Government projects in Andhra Pradesh, with their sources',
    description:
      'Every tracked government project in Andhra Pradesh by district, with cost, status and the official document each figure came from. No login, free to read.',
  },
  {
    pattern: '/districts/:slug',
    static: false,
    title: 'Government projects by district in Andhra Pradesh',
    description:
      'Every tracked government project in one Andhra Pradesh district, with its combined published cost and the official document behind every figure.',
  },
  {
    pattern: '/projects/tenure/:key',
    static: false,
    title: 'Projects by government tenure | Andhra Pradesh Fact Check',
    description:
      'Which projects were announced, built and completed under each government of Andhra Pradesh, counted from official records.',
  },
  {
    pattern: '/projects/:id',
    static: false,
    title: 'Project record | Andhra Pradesh Fact Check',
    description:
      'The official record for one Andhra Pradesh government project: cost, status, district and the source document behind every figure.',
  },
  {
    pattern: '/investments',
    title: 'Investment MoUs signed by Andhra Pradesh',
    description:
      'Investment MoUs announced by the Andhra Pradesh government, by sector and value, each with its source. An MoU is a promise, not money spent.',
  },
  {
    pattern: '/investments/tenure/:key',
    static: false,
    title: 'Investment MoUs by government tenure | Andhra Pradesh Fact Check',
    description:
      'Investment announced under each government of Andhra Pradesh, by sector and value, taken from official records.',
  },
  {
    pattern: '/news',
    title: 'Andhra Pradesh government news from official sources',
    description:
      'Announcements and updates collected from Andhra Pradesh government portals, each linked back to where it was published.',
  },
  {
    pattern: '/news/:id',
    static: false,
    title: 'News record | Andhra Pradesh Fact Check',
    description:
      'One announcement from an Andhra Pradesh government source, with a link to the original publication.',
  },
  {
    pattern: '/documents',
    title: 'Andhra Pradesh government documents, free to download',
    description:
      'A library of official Andhra Pradesh government documents: budget papers, CAG reports, project registers and orders. Free to read, free to download, no login.',
  },
  {
    pattern: '/tenders',
    title: 'Andhra Pradesh government tenders on record',
    description:
      'Tenders mirrored from the Andhra Pradesh government portals we can reach, with the portal named on every entry and no padded numbers.',
  },
  {
    pattern: '/finances',
    title: 'Andhra Pradesh state finances, from the budget documents',
    description:
      'Revenue, expenditure, debt and deficit for Andhra Pradesh, taken from published budget documents and CAG reports, with every figure cited.',
  },
  {
    // One question from the finances page, open on its own. The page decides
    // the title once it knows which question; see financeQuestions.js.
    pattern: '/finances/:question',
    static: false,
    title: 'Andhra Pradesh state finances, one question at a time',
    description:
      'One question about Andhra Pradesh\'s debt, deficits or spending, answered from the budget documents, RBI tables and CAG audits, with every figure cited.',
  },
  {
    pattern: '/finances/departments/:slug',
    static: false,
    title: 'Andhra Pradesh department budgets, year by year',
    description:
      'What one Andhra Pradesh department was budgeted each year since 2014-15, and what the audited accounts say it spent, with the budget volume cited.',
  },
  {
    pattern: '/factcheck',
    title: 'Fact checks: official claims beside the official record',
    description:
      'Claims from Andhra Pradesh white papers and budgets, set beside what RBI, CAG and the state accounts record for the same date. Both governments, same rules.',
  },
  {
    pattern: '/factcheck/:slug',
    static: false,
    title: 'Fact check | Andhra Pradesh Fact Check',
    description:
      'One claim from an official Andhra Pradesh government document, compared with the figures other official documents record, and why they differ.',
  },
  {
    pattern: '/governments',
    title: 'The tenure record of every Andhra Pradesh government',
    description:
      'What each government of Andhra Pradesh announced, built and completed, counted from official documents rather than from speeches.',
  },
  {
    pattern: '/school-education',
    title: 'School education in Andhra Pradesh, official statistics',
    description:
      'Enrolment, schools, teachers and infrastructure in Andhra Pradesh, taken from published government education statistics.',
  },
  {
    pattern: '/states',
    title: 'Central government records for every Indian state',
    description:
      'How Andhra Pradesh compares with other states on central government records, taken from published national data.',
  },
  {
    pattern: '/sources',
    title: 'Every document this site cites',
    description:
      'The full list of government portals and documents this platform mirrors, when each was last checked, and which checks are currently failing.',
  },
  {
    pattern: '/updates',
    title: 'What changed on this site, and when',
    description:
      'A dated record of every data refresh on Andhra Pradesh Fact Check, including the sources that failed to collect.',
  },
  {
    pattern: '/search',
    index: false,
    title: 'Search | Andhra Pradesh Fact Check',
    description:
      'Search projects, districts, documents and departments across the Andhra Pradesh government record.',
  },
  {
    pattern: '/about',
    title: 'About Andhra Pradesh Fact Check, and why it exists',
    description:
      'An independent, citizen-run transparency platform for Andhra Pradesh. Not affiliated with any government or party. Here is who built it and why.',
  },
  {
    pattern: '/disclaimer',
    title: 'Disclaimer | Andhra Pradesh Fact Check',
    description:
      'What this platform is, what it is not, and the limits of the data it mirrors from Andhra Pradesh government portals.',
  },
  {
    pattern: '/privacy',
    title: 'Privacy | Andhra Pradesh Fact Check',
    description:
      'What this site counts, what it never records, the one cookie it sets, and the switch that turns the counting off.',
  },
  {
    pattern: '/community',
    title: 'Report a correction | Andhra Pradesh Fact Check',
    description:
      'Found a wrong figure or a missing document? Tell us. Corrections are how a platform built on public records stays worth reading.',
  },
  {
    pattern: '/state-facts',
    title: 'Andhra Pradesh state facts, from official records',
    description:
      'Population, districts, geography and administration of Andhra Pradesh, taken from published government sources.',
  },
  {
    pattern: '/contacts',
    title: 'Andhra Pradesh government departments and contacts',
    description:
      'Departments, offices and published contact details across the Andhra Pradesh government, mirrored from official portals.',
  },
]

/** Just the patterns, for the route-recognition check in Analytics. */
/**
 * LANGUAGES AND URLs
 *
 * The site was published in six languages for months and Google could see
 * exactly one of them. The chosen language lived in localStorage, it never
 * touched the URL, and there is no such thing as a crawler with a stored
 * preference. So every Telugu, Hindi, Urdu, Tamil and Odia page on the site
 * was unreachable from search, on all 717 URLs, despite the translation
 * already being written and paid for.
 *
 * English keeps the bare path. Prefixing it would have moved 717 URLs that
 * Google had already indexed, for no gain. The other five take a prefix:
 *
 *   /projects/613       English
 *   /te/projects/613    Telugu
 *
 * The URL is the single source of truth for language. A stored preference
 * must never override it, or the same address serves different languages to
 * different people and the whole point is lost.
 */
export const LANG_CODES = ['en', 'te', 'hi', 'ur', 'ta', 'or']

/** The five that carry a path prefix. English is the bare path. */
export const PREFIXED_LANGS = LANG_CODES.filter(code => code !== 'en')

/**
 * The languages we ask search engines to index. Today, English only.
 *
 * WHY
 *
 * Every page exists in six languages for the reader who picks one. Only the
 * English text is written by hand; the other five are templated sentences
 * around an untranslated project name, so an Odia page reads "Providing Water
 * Supply Facilities in Badvel Municipalityର ପ୍ରକାଶିତ ଆନୁମାନିକ ବ୍ୟୟ". Submitting
 * that to Google five times over is what put 4,300 URLs in "Discovered,
 * currently not indexed" and 72 of the 97 in "Crawled, currently not indexed".
 * Google judged the whole site by its weakest pages.
 *
 * So the language pages stay, for readers, and step out of search:
 * noindex, follow on the page, no hreflang, not in the sitemap, and no link
 * to them from an English page, so crawl time goes to pages that can rank.
 *
 * WHEN A LANGUAGE IS PROPERLY TRANSLATED, ADD IT HERE. That one line brings
 * back its sitemap entries, its reciprocal hreflang and its indexing, and the
 * tests hold every one of those to this list.
 *
 * Telugu is back, because it is the language of the people this site is for
 * and because it now earns it: every sentence in the catalogue is Telugu,
 * every district has its Telugu name (placeNames.js), and every page title
 * and search snippet is written in Telugu (the "seo" block in te.json). A
 * page whose substance is still English, a fact check or a department's
 * budget volume, stays out of the Telugu index page by page; see
 * ENGLISH_CONTENT_PATTERNS in seo.js.
 */
export const INDEXED_LANGS = ['en', 'te']

/** True when pages in this language should be offered to search engines. */
export const isIndexedLang = code => INDEXED_LANGS.includes(code)

const PREFIX_SET = new Set(PREFIXED_LANGS)

/**
 * Split "/te/projects/613" into { lang: 'te', path: '/projects/613' }.
 *
 * A path that does not start with a known language prefix is English, which
 * means "/projects" reads as English and not as a language called "projects".
 * That distinction is the whole reason this is a function and not a split on
 * the first slash.
 */
export function splitLangPath(pathname) {
  const raw = String(pathname || '/')
  const [pathOnly, ...restParts] = raw.split(/(?=[?#])/)
  const rest = restParts.join('')
  const segments = pathOnly.split('/').filter(Boolean)
  if (segments.length && PREFIX_SET.has(segments[0])) {
    const tail = '/' + segments.slice(1).join('/')
    return { lang: segments[0], path: (tail === '/' ? '/' : tail) + rest }
  }
  return { lang: 'en', path: pathOnly + rest }
}

/**
 * The address of `path` in `lang`. Idempotent: passing an already-prefixed
 * path does not stack a second prefix, because the language switcher and the
 * sitemap generator both call this on paths of uncertain provenance.
 */
export function localizedPath(lang, pathname) {
  const { path } = splitLangPath(pathname)
  if (!PREFIX_SET.has(lang)) return path
  return path === '/' ? `/${lang}` : `/${lang}${path}`
}

/**
 * The language of the page currently in the address bar.
 *
 * Read from window.location rather than from React state on purpose. The
 * router runs with a basename, so useLocation() reports the path without its
 * language prefix, and anything building a canonical URL or a hreflang set
 * from that would quietly emit the English address for every language. This
 * reads the real address, so it is right on first paint and after every
 * navigation, with no ordering to get wrong.
 */
/**
 * A district's own address.
 *
 * Districts used to live at /projects?district=Guntur. That was a real page
 * with a real heading and its own numbers, but a query string is not a file
 * path, so there was nowhere for the prerenderer to write it. Twenty six pages
 * that Google could see only by running JavaScript, and that ChatGPT, Bing and
 * a WhatsApp preview could not see at all.
 *
 * Moved now rather than later on purpose: they had been in the sitemap for
 * days, with almost nothing indexed, so the cost of changing the address is
 * close to zero today and real in three months. The old query URL still works
 * and canonicalises here, so nothing that was shared or indexed breaks.
 */
/**
 * The address form of a district name.
 *
 * Folded through canonicalDistrict first, and that is the whole point. The
 * register keeps each source document's own spelling, so the same district
 * arrives as "Tirupathi" from one table and "Tirupati" from another. Slugging
 * the raw string gave each spelling its own address, and only one of those
 * addresses was ever built. Forty two project pages linked to a page that did
 * not exist, and the projects behind them were missing from the district page
 * where a reader would look for them.
 *
 * Folding here rather than at each call site is deliberate: the sitemap, the
 * prerenderer, the register filter and the related-projects card all ask this
 * one function, so they cannot disagree about where a district lives.
 *
 * An unknown name still slugs as written. That keeps a district we have not
 * catalogued reachable instead of silently redirecting it to the register.
 */
export const districtSlug = name => String(canonicalDistrict(name) || name || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

export function districtPath(name) {
  const slug = districtSlug(name)
  return slug ? `/districts/${slug}` : '/projects'
}

export function currentLang() {
  if (typeof window === 'undefined') return 'en'
  return splitLangPath(window.location.pathname).lang
}

export const ROUTE_PATTERNS = ROUTES.map(r => r.pattern)

/** Routes with a fixed address, which are the ones a sitemap can publish. */
export const STATIC_ROUTES = ROUTES.filter(r => r.static !== false && r.index !== false)

/**
 * The route entry whose pattern matches this pathname, or undefined.
 *
 * Segment count first, then segment by segment, with ':' matching anything.
 * Deliberately not a regex: the patterns are written by hand and a regex would
 * make a typo in one of them silently match nothing.
 */
export function matchRoute(pathname) {
  // Strip any query or hash first. useLocation().pathname never carries one,
  // but applySeo is exported for detail pages to call by hand, and the obvious
  // thing to pass is location.pathname + location.search. Without this line
  // that call silently matches no route, and the page quietly falls back to
  // the bare site name instead of its own title. Found by the test below.
  // The language prefix is not part of the route. /te/projects/613 and
  // /projects/613 are the same page in two languages and must match the same
  // route, or every non-English page falls back to the bare site name.
  const { path: unprefixed } = splitLangPath(pathname)
  const path = String(unprefixed).split('?')[0].split('#')[0]
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
  return ROUTES.find(route => {
    const want = route.pattern.replace(/\/+$/, '').split('/').filter(Boolean)
    if (want.length !== parts.length) return false
    return want.every((seg, i) => seg.startsWith(':') || seg === parts[i])
  })
}
