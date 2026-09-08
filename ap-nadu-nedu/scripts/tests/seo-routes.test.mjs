import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { ROUTES, STATIC_ROUTES, matchRoute, SITE_ORIGIN } from '../../src/lib/routes.js'
import { canonicalFor } from '../../src/lib/seo.js'

/**
 * WHY THIS TEST EXISTS
 *
 * index.html carries one hardcoded canonical, and every route is served from
 * that file. So for weeks every page on the site told Google "the real page is
 * the homepage". Search Console confirmed it: User-declared canonical read
 * https://apfactcheck.dheeco.com/ on every URL inspected. Google obeys that. It
 * would have indexed one page and discarded the other eighteen as duplicates,
 * and it would have looked exactly like Google ignoring a new site.
 *
 * Nothing failed. Nothing logged. That is the shape of bug a test has to stand
 * in for.
 *
 * The second job here is drift. Analytics.jsx used to keep its own copy of the
 * route list and it was wrong before the first event was sent. There is now one
 * list, and this asserts it still matches the router.
 */

const here = dirname(fileURLToPath(import.meta.url))
const APP = readFileSync(resolve(here, '../../src/App.jsx'), 'utf8')

const routerPaths = [...APP.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1])

test('the route table and the router name exactly the same routes', () => {
  const table = ROUTES.map(r => r.pattern).sort()
  const router = [...routerPaths].sort()
  assert.deepEqual(table, router,
    'src/lib/routes.js has drifted from the <Route> list in App.jsx')
})

test('every route has a title and a description', () => {
  for (const r of ROUTES) {
    assert.ok(r.title && r.title.trim().length > 10, `${r.pattern} has no usable title`)
    assert.ok(r.description && r.description.trim().length > 40, `${r.pattern} has no usable description`)
  }
})

test('no two routes share a title, or Google reads them as the same page', () => {
  const titles = ROUTES.map(r => r.title)
  assert.equal(new Set(titles).size, titles.length, 'duplicate title in the route table')
})

test('descriptions stay inside what a search result will show', () => {
  for (const r of ROUTES) {
    assert.ok(r.description.length <= 200,
      `${r.pattern} description is ${r.description.length} chars and will be cut off`)
  }
})

test('only the homepage canonicalises to the homepage', () => {
  for (const r of ROUTES) {
    if (r.pattern === '/') continue
    const canonical = canonicalFor(r.pattern)
    assert.notEqual(canonical, SITE_ORIGIN + '/',
      `${r.pattern} points its canonical at the homepage, which is the bug this file exists for`)
  }
})

test('a district keeps its own address, every other filter folds away', () => {
  // District is a real subject people search for by name, and there are 26.
  // Status, sort and page are the same projects rearranged, and the register
  // has enough filters to generate thousands of those.
  assert.equal(canonicalFor('/projects?district=Palnadu'),
    'https://apfactcheck.dheeco.com/projects?district=Palnadu')
  assert.equal(canonicalFor('/projects?district=Guntur&status=completed&page=2&order=desc'),
    'https://apfactcheck.dheeco.com/projects?district=Guntur')
  assert.equal(canonicalFor('/projects?status=completed&page=2'),
    'https://apfactcheck.dheeco.com/projects')
  assert.equal(canonicalFor('/projects?district='),
    'https://apfactcheck.dheeco.com/projects', 'an empty district is not a page')
  assert.equal(canonicalFor('/projects/'), 'https://apfactcheck.dheeco.com/projects')
  assert.equal(canonicalFor('/'), 'https://apfactcheck.dheeco.com/')
  assert.equal(canonicalFor('/search#top'), 'https://apfactcheck.dheeco.com/search')
})

test('routes with a parameter, and search, stay out of the sitemap', () => {
  const patterns = STATIC_ROUTES.map(r => r.pattern)
  assert.ok(!patterns.some(p => p.includes(':')), 'a parameter route leaked into the sitemap set')
  assert.ok(!patterns.includes('/search'), '/search is noindex and must not be published')
  assert.ok(patterns.includes('/projects') && patterns.includes('/finances'))
})

test('the matcher recognises real paths and rejects invented ones', () => {
  assert.equal(matchRoute('/projects/613').pattern, '/projects/:id')
  assert.equal(matchRoute('/projects/tenure/tdp2').pattern, '/projects/tenure/:key')
  assert.equal(matchRoute('/finances').pattern, '/finances')
  assert.equal(matchRoute('/'), ROUTES[0])
  assert.equal(matchRoute('/not-a-page'), undefined)
  assert.equal(matchRoute('/projects/613/extra'), undefined)
})

/**
 * applySeo writes to document.head, and there is no DOM under node --test. A
 * jsdom dependency to check six attribute writes is not worth carrying, so the
 * head is stood up by hand: just enough of querySelector, createElement and
 * appendChild for the function under test to behave normally.
 *
 * This is the part that actually decides what Google reads, so it is worth
 * asserting rather than assuming.
 */
function fakeDocument() {
  const nodes = []
  const make = tag => {
    const attrs = {}
    return {
      tag,
      attrs,
      setAttribute: (k, v) => { attrs[k] = v },
      getAttribute: k => attrs[k],
      remove() { const i = nodes.indexOf(this); if (i !== -1) nodes.splice(i, 1) },
    }
  }
  const head = {
    appendChild: el => { nodes.push(el); return el },
    querySelector: sel => {
      const m = sel.match(/^(\w+)\[([\w-]+)="([^"]+)"\]$/)
      if (m) return nodes.find(n => n.tag === m[1] && n.attrs[m[2]] === m[3])
      const t = sel.match(/^link\[rel="([^"]+)"\]$/)
      if (t) return nodes.find(n => n.tag === 'link' && n.attrs.rel === t[1])
      return undefined
    },
  }
  return { head, title: '', createElement: make, nodes }
}

async function seoFor(pathname, override) {
  const doc = fakeDocument()
  globalThis.document = doc
  const { applySeo } = await import('../../src/lib/seo.js')
  applySeo(pathname, override)
  const get = (tag, attr, key) => doc.nodes.find(n => n.tag === tag && n.attrs[attr] === key)?.attrs.content
  return {
    title: doc.title,
    description: get('meta', 'name', 'description'),
    canonical: doc.nodes.find(n => n.tag === 'link' && n.attrs.rel === 'canonical')?.attrs.href,
    ogTitle: get('meta', 'property', 'og:title'),
    ogUrl: get('meta', 'property', 'og:url'),
    robots: get('meta', 'name', 'robots'),
  }
}

test('a real page gets its own title and its own canonical', async () => {
  const seo = await seoFor('/finances')
  assert.match(seo.title, /Andhra Pradesh state finances/)
  assert.equal(seo.canonical, 'https://apfactcheck.dheeco.com/finances')
  assert.equal(seo.ogUrl, 'https://apfactcheck.dheeco.com/finances')
  assert.equal(seo.ogTitle, seo.title)
  assert.ok(seo.description.length > 40)
  assert.equal(seo.robots, undefined, 'an ordinary page must not be noindex')
})

test('sort and page do not create a second page', async () => {
  const seo = await seoFor('/projects?page=3&order=desc')
  assert.equal(seo.canonical, 'https://apfactcheck.dheeco.com/projects')
})

test('a detail page can supply the title the route table cannot know', async () => {
  const seo = await seoFor('/projects/613', {
    title: 'Polavaram Irrigation Project | Andhra Pradesh Fact Check',
    description: 'Cost, status and source documents for the Polavaram irrigation project.',
  })
  assert.match(seo.title, /Polavaram/)
  assert.equal(seo.canonical, 'https://apfactcheck.dheeco.com/projects/613')
})

test('search results are followed but not listed', async () => {
  const seo = await seoFor('/search?q=amaravati')
  assert.equal(seo.robots, 'noindex, follow')
  assert.equal(seo.canonical, 'https://apfactcheck.dheeco.com/search')
})

test('index.html declares no canonical and no og:url of its own', () => {
  const html = readFileSync(resolve(here, '../../index.html'), 'utf8')
  assert.ok(!/<link[^>]+rel="canonical"/.test(html),
    'index.html hardcodes a canonical. Every route is served from this one file, ' +
    'so that tag tells Google every page is the homepage. It is set at runtime instead.')
  assert.ok(!/<meta[^>]+property="og:url"/.test(html),
    'index.html hardcodes og:url, which points every shared link at the homepage.')
})

const { seoForProject, seoForNews, seoForDistrict } =
  await import('../../src/lib/seo.js')

test('a project page is titled with the project, not the word "record"', () => {
  const seo = seoForProject({
    title: 'POLAVARAM IRRIGATION PROJECT',
    district: null,
    status: 'under_construction',
    estimated_cost_crore: 55549,
    completion_percentage: 76,
  })
  assert.match(seo.title, /^POLAVARAM IRRIGATION PROJECT \|/)
  assert.match(seo.description, /Andhra Pradesh/)
  assert.match(seo.description, /under construction/)
  assert.match(seo.description, /76% built/)
  assert.match(seo.description, /₹55,549 crore/)
  assert.ok(seo.title.length <= 70 && seo.description.length <= 200)
})

test('missing fields are dropped, never guessed at', () => {
  const seo = seoForProject({ title: 'Some Project', district: 'Guntur' })
  assert.match(seo.description, /^Some Project, a government project in Guntur\./)
  assert.ok(!/undefined|null|NaN|₹/.test(seo.description),
    'a missing field leaked into the description')
})

test('a project with no title gets no override, so the route title stands', () => {
  assert.deepEqual(seoForProject(null), {})
  assert.deepEqual(seoForProject({ district: 'Guntur' }), {})
})

test('a district page names the district, which is what people search', () => {
  const seo = seoForDistrict('Palnadu', 43)
  assert.match(seo.title, /^Government projects in Palnadu district/)
  assert.match(seo.description, /^43 tracked government projects in Palnadu district/)
  assert.deepEqual(seoForDistrict(null), {})
  assert.match(seoForDistrict('Guntur').description, /^Tracked government projects in Guntur/)
})

test('a news page is titled with the headline', () => {
  const seo = seoForNews({ title: 'Cabinet clears the coastal corridor', source_name: 'AP CRDA' })
  assert.match(seo.title, /^Cabinet clears the coastal corridor \|/)
  assert.match(seo.description, /AP CRDA/)
  assert.deepEqual(seoForNews({}), {})
})

test('a very long project name is cut, not left to break the title', () => {
  const seo = seoForProject({ title: 'X'.repeat(200), status: 'completed' })
  assert.ok(seo.title.length <= 70, `title is ${seo.title.length} chars`)
  assert.ok(seo.title.endsWith('…'))
})

/**
 * The description is the sentence a person reads in the search result before
 * deciding whether to trust this site enough to click. It shipped broken:
 *
 *   "POLAVARAM IRRIGATION PROJECT, a government project in Andhra Pradesh.
 *    Status: under construction. 76% built. published estimated cost ..."
 *
 * The clauses were fragments joined with full stops, so two of them began in
 * lowercase. It read like a machine had stopped halfway. Nothing threw, no
 * test failed, and it went out on all 673 project pages. This asserts the
 * shape of the sentence rather than its exact words, so the wording can still
 * be improved without the test having to be rewritten each time.
 */
test('a description never starts a sentence in lowercase', () => {
  const cases = [
    { title: 'POLAVARAM IRRIGATION PROJECT', district: 'Andhra Pradesh', status: 'under_construction', completion_percentage: 76, estimated_cost_crore: 55549 },
    { title: 'Pattiseema Lift Irrigation Scheme', district: 'West Godavari', status: 'completed', completion_percentage: 100 },
    { title: 'Gundrevula Reservoir Project', district: 'Kurnool', estimated_cost_crore: 1200 },
    { title: 'KC Canal Lift Scheme', district: 'Kurnool', status: 'ongoing' },
    { title: 'Some Project', district: 'Guntur' },
  ]
  for (const project of cases) {
    const { description } = seoForProject(project)
    const broken = description.match(/\.\s+[a-z]/g)
    assert.equal(broken, null,
      `lowercase after a full stop in: ${description}`)
  }
})

test('the facts read as one sentence, not a list of fragments', () => {
  const { description } = seoForProject({
    title: 'POLAVARAM IRRIGATION PROJECT',
    district: 'Andhra Pradesh',
    status: 'under_construction',
    completion_percentage: 76,
    estimated_cost_crore: 55549,
  })
  assert.match(description,
    /^POLAVARAM IRRIGATION PROJECT in Andhra Pradesh: under construction, 76% built, published estimated cost ₹55,549 crore\./)
  assert.ok(!/Status:/.test(description),
    'the label "Status:" reads like a form field, not a sentence')
})
