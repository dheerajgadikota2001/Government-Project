import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  LANG_CODES, PREFIXED_LANGS, SITE_ORIGIN, ROUTES,
  splitLangPath, localizedPath, matchRoute, currentLang,
} from '../../src/lib/routes.js'
import { canonicalFor } from '../../src/lib/seo.js'
import { schemaFor, projectTrail } from '../../src/lib/schema.js'

/**
 * WHY THIS FILE EXISTS
 *
 * The site shipped six languages and Google could see one. The chosen
 * language lived in localStorage, it never appeared in the URL, and a crawler
 * has no stored preference. So 1,810 translated strings per language, on 717
 * pages, were unreachable from search. Nothing was broken. Every page
 * rendered perfectly in Telugu for anyone who clicked the switcher. It simply
 * had no address, and a thing with no address cannot be indexed, cannot be
 * linked to, and cannot be shared.
 *
 * That is the failure this file guards: not a crash, an absence. The rules
 * below are the ones that make a language real to a search engine, and each
 * one is a way the feature can silently stop working again.
 */

const here = dirname(fileURLToPath(import.meta.url))
const APP = readFileSync(resolve(here, '../../src/App.jsx'), 'utf8')

test('English keeps the bare path, so nothing already indexed moves', () => {
  assert.equal(LANG_CODES[0], 'en')
  assert.ok(!PREFIXED_LANGS.includes('en'),
    'prefixing English would move all 717 indexed URLs for no gain')
  assert.equal(localizedPath('en', '/projects/613'), '/projects/613')
  assert.equal(canonicalFor('/projects'), `${SITE_ORIGIN}/projects`)
})

test('every other language gets its own address', () => {
  assert.deepEqual(PREFIXED_LANGS, ['te', 'hi', 'ur', 'ta', 'or'])
  assert.equal(localizedPath('te', '/projects/613'), '/te/projects/613')
  assert.equal(localizedPath('ur', '/'), '/ur')
})

test('a language prefix is read back out again', () => {
  assert.deepEqual(splitLangPath('/te/projects/613'), { lang: 'te', path: '/projects/613' })
  assert.deepEqual(splitLangPath('/te'), { lang: 'te', path: '/' })
})

test('a route named like a language is still a route', () => {
  // The trap in every prefix scheme: treating the first segment as a language
  // without checking. /projects would become a language called "projects" and
  // the register would 404 in five languages.
  assert.deepEqual(splitLangPath('/projects'), { lang: 'en', path: '/projects' })
  assert.deepEqual(splitLangPath('/tenders'), { lang: 'en', path: '/tenders' })
})

test('prefixing is idempotent, so a double prefix cannot happen', () => {
  // The switcher and the sitemap both call this on paths of uncertain
  // provenance. /te/te/projects would be a 404 nobody tests by hand.
  assert.equal(localizedPath('te', '/te/projects'), '/te/projects')
  assert.equal(localizedPath('hi', '/te/projects'), '/hi/projects')
  assert.equal(localizedPath('en', '/te/projects'), '/projects')
})

test('the query string survives the prefix', () => {
  assert.deepEqual(splitLangPath('/te/projects?district=Guntur'),
    { lang: 'te', path: '/projects?district=Guntur' })
  assert.equal(localizedPath('te', '/projects?district=Guntur'),
    '/te/projects?district=Guntur')
})

test('a translated page matches the same route as its English original', () => {
  // If this breaks, every non-English page falls back to the bare site name
  // and loses its title, its description and its schema in one go.
  for (const route of ROUTES) {
    const sample = route.pattern.replace(/:(\w+)/g, '613')
    const english = matchRoute(sample)
    for (const code of PREFIXED_LANGS) {
      assert.equal(matchRoute(localizedPath(code, sample))?.pattern, english?.pattern,
        `${localizedPath(code, sample)} does not match the route ${sample} does`)
    }
  }
})

test('each language canonicalises to itself, never to English', () => {
  // A Telugu page whose canonical points at English is telling Google to
  // discard it. That single line would undo the whole change.
  for (const code of PREFIXED_LANGS) {
    assert.equal(canonicalFor(`/${code}/finances`), `${SITE_ORIGIN}/${code}/finances`)
    assert.equal(canonicalFor(`/${code}/projects?district=Palnadu`),
      `${SITE_ORIGIN}/${code}/projects?district=Palnadu`)
  }
})

test('schema on a translated page describes the translated page', () => {
  const graph = schemaFor('/te/projects/613', {
    title: 'X',
    description: 'Y',
    breadcrumbTrail: projectTrail({ id: 613, district: 'Guntur' }),
  })['@graph']

  const page = graph.find(n => n['@type'] === 'WebPage')
  assert.equal(page.url, `${SITE_ORIGIN}/te/projects/613`)
  assert.equal(page.inLanguage, 'te')

  const crumbs = graph.find(n => n['@type'] === 'BreadcrumbList')
  for (const step of crumbs.itemListElement) {
    assert.ok(step.item.startsWith(`${SITE_ORIGIN}/te`),
      `breadcrumb points out of Telugu: ${step.item}`)
  }
})

test('the register pages are still datasets in every language', () => {
  // DATASET_PAGES is keyed by the English path. Looking it up with the prefix
  // still attached silently drops the Dataset block on five of six languages.
  for (const code of LANG_CODES) {
    const graph = schemaFor(localizedPath(code, '/projects'), { title: 'X' })['@graph']
    const ds = graph.find(n => n['@type'] === 'Dataset')
    assert.ok(ds, `no Dataset block on ${localizedPath(code, '/projects')}`)
    assert.equal(ds.url, SITE_ORIGIN + localizedPath(code, '/projects'))
  }
})

test('currentLang is safe where there is no browser', () => {
  // seo.js calls it on every navigation and the sitemap generator imports the
  // same module under node.
  assert.equal(currentLang(), 'en')
})

test('the router runs with a basename, which is what prefixes every link', () => {
  // Without basename, a Telugu reader clicking any <Link> in the app lands on
  // English, and the fix is rewriting several hundred links by hand.
  assert.match(APP, /<BrowserRouter basename=\{BASENAME\}>/,
    'App.jsx no longer passes a basename to the router')
  assert.match(APP, /const BASENAME = INITIAL_LANG === 'en' \? '\/' : `\/\$\{INITIAL_LANG\}`/,
    'the basename is no longer derived from the language in the address bar')
})
