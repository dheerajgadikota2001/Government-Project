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
 * WHY THE TITLES ARE IN ENGLISH ONLY
 *
 * The site is published in six languages, but the language is chosen in the
 * browser after the page loads, and every language shares one URL. A search
 * engine indexes one title per URL. Translating these would mean whichever
 * language the crawler happened to see, which is worse than picking one on
 * purpose. Real per-language titles need per-language URLs, which is a larger
 * change and not this one.
 */

export const SITE_ORIGIN = 'https://apfactcheck.dheeco.com'

export const SITE_NAME = 'Andhra Pradesh Fact Check'

/**
 * Every route the router serves.
 *
 *   pattern      matches App.jsx exactly, ':' segments are parameters
 *   title        the browser tab and the search result headline
 *   description  the search result snippet, kept under about 155 characters
 *   index        false keeps the page out of search results but still followed
 *   static       false for pages whose address contains a parameter, so the
 *                sitemap generator knows not to publish the literal ':id'
 */
export const ROUTES = [
  {
    pattern: '/',
    title: 'Andhra Pradesh Fact Check | ఏపీ నిజ నిర్ధారణ',
    description:
      'Andhra Pradesh Fact Check is an independent, no-login transparency platform. Every project, budget and commitment figure is taken from a government document and cited, in six languages.',
  },
  {
    pattern: '/projects',
    title: 'Government projects in Andhra Pradesh, with their sources',
    description:
      'Every tracked government project in Andhra Pradesh by district, with cost, status and the official document each figure came from. No login, free to read.',
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
      'Investment memorandums announced by the Andhra Pradesh government, by sector and value, with the announcement each figure came from. An MoU is a promise, not money spent.',
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
    title: 'Andhra Pradesh government news, collected from official sources',
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
    title: 'Andhra Pradesh government documents, free to read and download',
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
    pattern: '/governments',
    title: 'The tenure record of every Andhra Pradesh government',
    description:
      'What each government of Andhra Pradesh announced, built and completed, counted from official documents rather than from speeches.',
  },
  {
    pattern: '/school-education',
    title: 'School education in Andhra Pradesh, by the official statistics',
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
  const path = String(pathname).split('?')[0].split('#')[0]
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
  return ROUTES.find(route => {
    const want = route.pattern.replace(/\/+$/, '').split('/').filter(Boolean)
    if (want.length !== parts.length) return false
    return want.every((seg, i) => seg.startsWith(':') || seg === parts[i])
  })
}
