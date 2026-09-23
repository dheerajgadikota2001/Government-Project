/**
 * JSON-LD structured data: telling Google what this site actually is.
 *
 * WHY THIS MATTERS MORE HERE THAN ON A NORMAL SITE
 *
 * Search Console reports "URL has no enhancements", which is the polite way of
 * saying Google has no idea what kind of thing this is. It sees a page of
 * numbers.
 *
 * There is a second reason, specific to this project. The Andhra Pradesh
 * government runs its own fact check portal at factcheck.ap.gov.in, on a
 * .gov.in domain, with a near identical name. Google has to decide which of us
 * is which, and right now it has nothing to go on but the words.
 *
 * An Organization block is how you tell a search engine "this is a separate
 * entity, here is what it is called, here is who runs it, here is where else it
 * exists". It will not win the branded search, a .gov.in with five years of
 * authority is not beatable. But it does stop the two being blurred into one
 * thing, and it is the only lever available that pushes in that direction.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * ClaimReview, the schema that produces Google's Fact Check rich result. It
 * looks like an obvious fit for the name and it is not one: it describes a
 * specific claim by a specific person, rated true or false. This site publishes
 * records, not verdicts on statements. Marking up the wrong thing to chase a
 * rich result is exactly the behaviour Google issues manual penalties for, and
 * on a site about honesty it would be an odd place to start lying.
 */

import { SITE_ORIGIN, SITE_NAME, splitLangPath, localizedPath, districtPath } from './routes.js'
import { displayTitle } from './projectTitle.js'

/**
 * Other places this project exists, for Google to connect into one entity.
 *
 * EMPTY ON PURPOSE, AND WORTH FILLING. Every profile listed here is another
 * signal that this is its own organisation rather than a copy of the government
 * portal. Add the real URLs once the accounts exist. Do not add a Reddit
 * comment or a profile that is not clearly this project's own.
 */
/**
 * The profiles that are this organisation elsewhere.
 *
 * This is the signal that tells Google the LinkedIn page and this site are one
 * entity, which is what a Knowledge Panel and a branded search result are built
 * from. The dheeco company page is the publisher; an AP Fact Check page of its
 * own goes here the day it exists.
 */
const SAME_AS = [
  'https://www.linkedin.com/company/dheeco26',
]

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`
const WEBSITE_ID = `${SITE_ORIGIN}/#website`

function organization() {
  const org = {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: 'AP Fact Check',
    url: SITE_ORIGIN + '/',
    description:
      'An independent, citizen-run transparency platform for Andhra Pradesh. ' +
      'Not affiliated with, endorsed by, or connected to the Government of ' +
      'Andhra Pradesh or any political party. Every figure is mirrored from a ' +
      'published government document and cited.',
    areaServed: { '@type': 'State', name: 'Andhra Pradesh' },
  }
  // An empty sameAs array is worse than none: it declares "this exists nowhere
  // else", which is the opposite of the point.
  if (SAME_AS.length) org.sameAs = SAME_AS
  return org
}

function website() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_ORIGIN + '/',
    name: SITE_NAME,
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: ['en', 'te', 'hi', 'ur', 'ta', 'or'],
    // Can produce a search box directly inside the Google result. Costs one
    // block and the search page already exists.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_ORIGIN}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** Breadcrumbs, which Google shows in place of the raw URL in a result. */
function breadcrumb(trail, lang) {
  if (!trail?.length) return null
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      // A Telugu page's breadcrumb has to point at Telugu pages. Pointing the
      // trail back at English would tell Google the Telugu page belongs to the
      // English tree, which is the duplicate reading hreflang exists to stop.
      item: SITE_ORIGIN + localizedPath(lang, step.path),
    })),
  }
}

/**
 * The register pages genuinely are datasets: a structured collection, from a
 * named source, with a licence. Google has a dataset search that indexes these.
 * A single project page is not a dataset and does not get this block.
 */
function dataset({ name, description, path, keywords }) {
  return {
    '@type': 'Dataset',
    name,
    description,
    url: SITE_ORIGIN + path,
    creator: { '@id': ORGANIZATION_ID },
    isAccessibleForFree: true,
    license: 'https://www.indiacode.nic.in/handle/123456789/1367',
    spatialCoverage: { '@type': 'State', name: 'Andhra Pradesh' },
    keywords,
  }
}

const DATASET_PAGES = {
  '/projects': {
    name: 'Andhra Pradesh government projects register',
    description:
      'Government projects in Andhra Pradesh by district, with published cost, status and the official document each figure is taken from.',
    keywords: ['Andhra Pradesh', 'government projects', 'public works', 'district', 'transparency'],
  },
  '/finances': {
    name: 'Andhra Pradesh state finances',
    description:
      'Revenue, expenditure, debt and deficit for Andhra Pradesh, taken from published budget documents and CAG reports.',
    keywords: ['Andhra Pradesh', 'state budget', 'public finance', 'CAG', 'expenditure'],
  },
  '/tenders': {
    name: 'Andhra Pradesh government tenders',
    description:
      'Tenders mirrored from Andhra Pradesh government procurement portals, with the source portal named on every entry.',
    keywords: ['Andhra Pradesh', 'tenders', 'procurement', 'government contracts'],
  },
  '/documents': {
    name: 'Andhra Pradesh government document library',
    description:
      'Official Andhra Pradesh government documents: budget papers, CAG reports, project registers and orders. Free to read and download.',
    keywords: ['Andhra Pradesh', 'government documents', 'budget', 'CAG report', 'open data'],
  },
}

/**
 * The whole JSON-LD graph for one page.
 *
 * One @graph rather than several separate script tags, so the Organization is
 * declared once and everything else points at it by id. That is what lets
 * Google treat these as one entity across the site instead of a fresh
 * organisation on every page.
 */
/**
 * ClaimReview: Google's own vocabulary for a fact check.
 *
 * One node per claim on the page, each naming who said it, when, and what the
 * comparison found. Google can show these as a fact-check rich result, though
 * it is selective about which publishers qualify and a new site will not be
 * one of them for a while. It is built in now so the day the site qualifies
 * nothing has to change.
 *
 * The rating is the awkward part. ClaimReview expects a number on a scale, and
 * this site deliberately does not rate people. The mapping in factcheck.js is
 * about the comparison: a match scores high, a definition mismatch sits in the
 * middle, and so does a claim no document can check, because "we cannot tell"
 * is not "false" and must not be scored as though it were.
 */
function claimReviews(check, path, ratings, labels) {
  return (check.claims || []).map(c => ({
    '@type': 'ClaimReview',
    url: SITE_ORIGIN + path,
    datePublished: c.date,
    claimReviewed: c.quote,
    author: { '@id': ORGANIZATION_ID },
    itemReviewed: {
      '@type': 'Claim',
      appearance: { '@type': 'CreativeWork', name: c.document, url: c.document_url },
      author: { '@type': 'Organization', name: c.made_by },
      datePublished: c.date,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: ratings[c.status],
      bestRating: 5,
      worstRating: 1,
      alternateName: labels[c.status] || c.status,
    },
  }))
}

/**
 * The question and answer pairs on a project page, as data.
 *
 * Every answer is the same sentence the reader is shown, so this graph cannot
 * say something the page does not. A pair with an empty side is dropped rather
 * than published with a blank answer, because an FAQPage carrying an empty
 * acceptedAnswer is invalid markup and a validator failing on 4,038 pages is
 * worse than no markup at all.
 */
function faqPage(pairs, url) {
  const entities = (pairs || [])
    .filter(p => p && p.q && p.a)
    .map(p => ({
      '@type': 'Question',
      name: p.q,
      acceptedAnswer: { '@type': 'Answer', text: p.a },
    }))
  if (!entities.length) return null
  return { '@type': 'FAQPage', url, mainEntity: entities }
}

export function schemaFor(pathname, { title, description, breadcrumbTrail, factCheck, faq } = {}) {
  // Two paths, deliberately. `bare` has no language prefix and is what the
  // lookup tables are keyed by, so /te/projects is still recognised as the
  // projects register. `path` carries the prefix and is what goes into every
  // url, so a Telugu page describes its Telugu address.
  const { lang, path: unprefixed } = splitLangPath(pathname)
  const bare = String(unprefixed).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  const path = localizedPath(lang, bare)
  const graph = [organization(), website()]

  const ds = DATASET_PAGES[bare]
  if (ds) graph.push(dataset({ ...ds, path }))

  const crumbs = breadcrumb(breadcrumbTrail, lang)
  if (crumbs) graph.push(crumbs)

  if (factCheck?.check) {
    graph.push(...claimReviews(factCheck.check, path, factCheck.ratings, factCheck.labels))
  }

  const questions = faqPage(faq, SITE_ORIGIN + path)
  if (questions) graph.push(questions)

  if (bare !== '/' && title) {
    graph.push({
      '@type': 'WebPage',
      url: SITE_ORIGIN + path,
      name: title,
      description: description || undefined,
      inLanguage: lang,
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORGANIZATION_ID },
    })
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}

/**
 * The trail shown above a project in a search result.
 *
 * @param districtUrl  the district page's path, or null to leave the district
 *                     out of the trail. Omit the argument to derive it.
 *
 * The prerenderer passes null when the register's spelling resolves to no page
 * that was built, because a breadcrumb is a published URL: emitting one for a
 * page that does not exist hands a crawler a 404 with a schema.org blessing on
 * it. The browser keeps the derived default, where an unresolved slug lands on
 * the register rather than on nothing.
 */
export function projectTrail(project, districtUrl) {
  const trail = [
    { name: 'Home', path: '/' },
    { name: 'Projects', path: '/projects' },
  ]
  if (project?.district) {
    // districtPath, not ?district=. The query form renders the same page and
    // canonicalises to this one, so a breadcrumb pointing at it published a
    // URL that tells the crawler to go somewhere else. It also folds a source
    // document's spelling onto the district's real address, so a project
    // filed as "Tirupathi" sits under Tirupati in the trail rather than
    // hanging off a page that does not exist.
    const href = districtUrl === undefined ? districtPath(project.district) : districtUrl
    if (href) trail.push({ name: project.district, path: href })
  }
  if (project?.title) trail.push({ name: displayTitle(project.title), path: `/projects/${project.id}` })
  return trail
}
