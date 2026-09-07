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

test('the canonical drops the query string, so filters do not become pages', () => {
  assert.equal(canonicalFor('/projects?district=Guntur&status=completed&page=2'),
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

test('filters on the register do not create a second page', async () => {
  const seo = await seoFor('/projects?district=Guntur&page=3')
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
