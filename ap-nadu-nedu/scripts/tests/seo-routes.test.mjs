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

test('a district has its own path, and every filter folds away', () => {
  // A district is still a real subject people search for by name. It used to
  // keep its query parameter in the canonical for exactly that reason. It now
  // has a path instead, /districts/palnadu, because a query string cannot be
  // prerendered and those 26 pages were therefore invisible to every crawler
  // that does not run JavaScript. The old form still resolves and folds into
  // the register rather than competing with the real page.
  assert.equal(canonicalFor('/districts/palnadu'),
    'https://apfactcheck.dheeco.com/districts/palnadu')
  assert.equal(canonicalFor('/districts/palnadu?status=completed&page=2'),
    'https://apfactcheck.dheeco.com/districts/palnadu')
  assert.equal(canonicalFor('/projects?district=Palnadu'),
    'https://apfactcheck.dheeco.com/projects',
    'the query form should fold into the register, not sit beside the real page')
  assert.equal(canonicalFor('/projects?status=completed&page=2'),
    'https://apfactcheck.dheeco.com/projects')
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
    // applySeo clears and rewrites the hreflang set on every call, so the fake
    // head has to support removal as well as lookup, or the alternates pile up
    // one navigation at a time and the test never notices.
    querySelectorAll: sel => {
      if (sel === 'link[rel="alternate"][hreflang]') {
        return nodes.filter(n => n.tag === 'link' && n.attrs.rel === 'alternate' && n.attrs.hreflang)
      }
      return []
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
  assert.match(seo.title, /^Polavaram Irrigation Project \|/)
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
 *   "Polavaram Irrigation Project, a government project in Andhra Pradesh.
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
    /^Polavaram Irrigation Project in Andhra Pradesh: under construction, 76% built, published estimated cost ₹55,549 crore\./)
  assert.ok(!/Status:/.test(description),
    'the label "Status:" reads like a form field, not a sentence')
})

/**
 * hreflang names indexed languages only. Pointing it at a noindex page is an
 * error Search Console reports on every URL, and a set of one names nothing.
 * When more than one language is indexed the set must be reciprocal and
 * complete, so that case is asserted too, through the same function.
 */
test('the hreflang set names indexed languages only, and is complete when there is one', async () => {
  const { alternatesFor } = await import('../../src/lib/seo.js')
  const { INDEXED_LANGS, LANG_CODES, SITE_ORIGIN: ORIGIN, localizedPath } = await import('../../src/lib/routes.js')

  const alts = alternatesFor('/finances')
  if (INDEXED_LANGS.length < 2) {
    assert.deepEqual(alts, [], 'one indexed language needs no hreflang, and gets none')
  } else {
    assert.deepEqual(alts.map(([code]) => code), [...INDEXED_LANGS, 'x-default'])
    for (const [code, href] of alts) {
      assert.equal(href, ORIGIN + localizedPath(code === 'x-default' ? 'en' : code, '/finances'))
    }
  }
  for (const code of LANG_CODES.filter(c => !INDEXED_LANGS.includes(c))) {
    assert.deepEqual(alternatesFor(localizedPath(code, '/finances')), [],
      `${code} is not indexed, so its page declares no alternates`)
    assert.ok(!alternatesFor('/finances').some(([, href]) => href.includes(`/${code}/`)),
      `an indexed page names the noindex ${code} page as its translation`)
  }
})

test('a language kept out of the index says so, and still passes its links on', async () => {
  const { robotsFor } = await import('../../src/lib/seo.js')
  const { LANG_CODES, isIndexedLang, localizedPath } = await import('../../src/lib/routes.js')
  for (const code of LANG_CODES) {
    for (const path of ['/', '/finances', '/projects/613', '/districts/palnadu']) {
      const got = robotsFor(localizedPath(code, path))
      if (isIndexedLang(code)) assert.equal(got, null, `${localizedPath(code, path)} asks not to be indexed`)
      else assert.equal(got, 'noindex, follow', `${localizedPath(code, path)} is offered to search`)
    }
  }
  // English is where every figure is written by hand. It can never drop out.
  assert.ok(isIndexedLang('en'))
})

test('the app writes the same head the prerender did, and replaces it on navigation', async () => {
  const { applySeo, alternatesFor } = await import('../../src/lib/seo.js')

  const doc = fakeDocument()
  globalThis.document = doc
  try {
    applySeo('/finances')
    const alts = doc.nodes.filter(n => n.tag === 'link' && n.attrs.rel === 'alternate')
    assert.deepEqual(alts.map(n => [n.attrs.hreflang, n.attrs.href]), alternatesFor('/finances'))
    assert.ok(!doc.nodes.some(n => n.tag === 'meta' && n.attrs.name === 'robots'),
      'an English page carries a robots tag')

    // Navigating again must replace the set, not add to it. A single page app
    // that appends would accumulate stale alternates for every page visited.
    applySeo('/documents')
    const after = doc.nodes.filter(n => n.tag === 'link' && n.attrs.rel === 'alternate')
    assert.deepEqual(after.map(n => [n.attrs.hreflang, n.attrs.href]), alternatesFor('/documents'),
      'alternates accumulated across navigations instead of being replaced')
  } finally {
    delete globalThis.document
  }
})

// ---------------------------------------------------------------------------
// The head in Telugu
// ---------------------------------------------------------------------------

const TE_CAT = JSON.parse(readFileSync(new URL('../../src/i18n/locales/te.json', import.meta.url), 'utf8'))
const EN_CAT = JSON.parse(readFileSync(new URL('../../src/i18n/locales/en.json', import.meta.url), 'utf8'))
const TE_SCRIPT = /[\u0C00-\u0C7F]/

/** The prerenderer's translator, rebuilt here so the test uses the same rules. */
async function teTranslator() {
  const { localiseVars } = await import('../../src/lib/placeNames.js')
  const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
  return (key, vars) => {
    const s = look(TE_CAT, key) ?? look(EN_CAT, key)
    if (typeof s !== 'string') return key.split('.').pop()
    const v = localiseVars(vars, 'te')
    return v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s
  }
}

test('every page Telugu search is offered has a Telugu title and snippet written for it', async () => {
  const { ROUTES, isIndexedLang } = await import('../../src/lib/routes.js')
  const { routeKey, ENGLISH_CONTENT_PATTERNS } = await import('../../src/lib/seo.js')
  const { FINANCE_QUESTIONS } = await import('../../src/lib/financeQuestions.js')
  if (!isIndexedLang('te')) return
  for (const route of ROUTES) {
    if (route.index === false || ENGLISH_CONTENT_PATTERNS.has(route.pattern)) continue
    const entry = TE_CAT.seo?.route?.[routeKey(route.pattern)]
    assert.ok(entry, `no Telugu title for ${route.pattern} (te.json seo.route.${routeKey(route.pattern)})`)
    assert.ok(TE_SCRIPT.test(entry.title) && TE_SCRIPT.test(entry.description),
      `the Telugu head for ${route.pattern} is not in Telugu`)
    assert.ok(entry.description.length <= 200, `${route.pattern}: snippet is ${entry.description.length} characters`)
  }
  for (const q of FINANCE_QUESTIONS) {
    const entry = TE_CAT.seo?.financeQuestion?.[q.slug]
    assert.ok(entry && TE_SCRIPT.test(entry.title) && TE_SCRIPT.test(entry.description),
      `no Telugu head for the finances question ${q.slug}`)
  }
})

test('the Telugu head never carries a long dash or an empty slot', () => {
  const walk = (node, at) => Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${at}.${k}`, v]] : walk(v, `${at}.${k}`))
  for (const [key, text] of walk(TE_CAT.seo, 'seo')) {
    assert.ok(!/[\u2014\u2013]|--/.test(text), `${key} has a long dash`)
    assert.ok(!/undefined|null/.test(text), `${key} says ${text}`)
  }
})

test('a Telugu project snippet is Telugu, names the district in Telugu, and invents nothing', async () => {
  const { seoForProject } = await import('../../src/lib/seo.js')
  const t = await teTranslator()
  const full = seoForProject({
    title: 'POLAVARAM IRRIGATION PROJECT', district: 'Eluru', status: 'under_construction',
    completion_percentage: 76, estimated_cost_crore: 55548.87,
  }, { t, lang: 'te' })
  assert.equal(full.title, 'Polavaram Irrigation Project | ఆంధ్రప్రదేశ్ ఫ్యాక్ట్ చెక్')
  assert.match(full.description, /^Polavaram Irrigation Project, ఏలూరు జిల్లా: నిర్మాణంలో, 76% పూర్తయింది, ప్రకటించిన అంచనా వ్యయం ₹55,549 కోట్లు\./)

  // A legacy spelling still finds its Telugu name.
  const legacy = seoForProject({ title: 'X', district: 'Anantapur' }, { t, lang: 'te' })
  assert.match(legacy.description, /అనంతపురం/)

  // Nothing known: no clause is written for it.
  const bare = seoForProject({ title: 'X' }, { t, lang: 'te' })
  assert.match(bare.description, /^X: ఆంధ్రప్రదేశ్ పరిధిలోని ఒక ప్రభుత్వ ప్రాజెక్టు\./)
  assert.ok(!/undefined|\{/.test(bare.description + bare.title))

  // English is untouched by any of this.
  const en = seoForProject({ title: 'X', district: 'Eluru' }, { t, lang: 'en' })
  assert.match(en.description, /^X, a government project in Eluru\./)
})

test('a Telugu district head names the district in Telugu', async () => {
  const { seoForDistrict } = await import('../../src/lib/seo.js')
  const t = await teTranslator()
  const seo = seoForDistrict('Guntur', 12, { t, lang: 'te' })
  assert.equal(seo.title, 'గుంటూరు జిల్లాలో ప్రభుత్వ ప్రాజెక్టులు, ఆంధ్రప్రదేశ్')
  assert.match(seo.description, /గుంటూరు జిల్లాలో ట్రాక్ చేస్తున్న 12 ప్రభుత్వ ప్రాజెక్టులు/)
  assert.match(seoForDistrict('Guntur', 0, { t, lang: 'te' }).description, /ఇంకా ఏ ప్రభుత్వ ప్రాజెక్టూ/)
})

test('English text keeps a page out of the Telugu index, and out of every hreflang set', async () => {
  const { robotsFor, alternatesFor } = await import('../../src/lib/seo.js')
  const { isIndexedLang, SITE_ORIGIN: ORIGIN } = await import('../../src/lib/routes.js')
  if (!isIndexedLang('te')) return
  assert.equal(robotsFor('/te/projects/613'), null)
  assert.equal(robotsFor('/te/factcheck/anything'), 'noindex, follow')
  assert.equal(robotsFor('/te/finances/departments/school-education'), 'noindex, follow')
  assert.equal(robotsFor('/finances/departments/school-education'), null, 'the English page must stay indexed')

  assert.deepEqual(alternatesFor('/projects/613'), [
    ['en', `${ORIGIN}/projects/613`], ['te', `${ORIGIN}/te/projects/613`], ['x-default', `${ORIGIN}/projects/613`],
  ])
  assert.deepEqual(alternatesFor('/te/projects/613'), alternatesFor('/projects/613'),
    'the two pages of a pair must name each other identically, or Google drops the pair')
  assert.deepEqual(alternatesFor('/finances/departments/school-education'), [])
  assert.deepEqual(alternatesFor('/te/finances/departments/school-education'), [])
})

test('the app registers the page language before any page sets its head', () => {
  const src = readFileSync(new URL('../../src/components/Seo.jsx', import.meta.url), 'utf8')
  const register = src.indexOf('setSeoLanguage({ t, lang })')
  const effect = src.indexOf('useEffect(')
  assert.ok(register !== -1, 'Seo.jsx no longer registers the translator, so every title goes back to English')
  assert.ok(register < src.indexOf('return null') && (effect === -1 || register < effect),
    'the translator must be registered during render, before the effect')
  const fin = readFileSync(new URL('../../src/pages/Finances.jsx', import.meta.url), 'utf8')
  assert.match(fin, /seoForFinanceQuestion\(active\)/, 'a finances question sets an English head again')
})
