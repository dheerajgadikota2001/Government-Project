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
    // A district is a path now (/te/districts/palnadu), so the old query form
    // canonicalises to the register rather than competing with the real page.
    assert.equal(canonicalFor(`/${code}/districts/palnadu`),
      `${SITE_ORIGIN}/${code}/districts/palnadu`)
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

/**
 * THE ONE THAT ONLY A CLICK FOUND
 *
 * Every language switch worked except English. Picking English from a Telugu
 * page navigated to "/", the stored preference still said "te", the returning
 * reader bounce fired, and you were back on Telugu. English was the only
 * language a reader could not select, and the code read perfectly: the switch
 * navigated, the bounce was correctly guarded, and the write to storage was
 * in an effect. The effect was keyed on a prop the router fixes at page load,
 * so it never ran for the language just chosen.
 *
 * Nothing here can catch a missing write on its own, so the last test asserts
 * the order in App.jsx directly: persist, then navigate.
 */
test('the bounce leaves a reader alone once they have chosen English', async () => {
  const { bounceTarget } = await import('../../src/lib/language.js')

  // The bug: stored "te", reader deliberately switched to English, bounced back.
  assert.equal(bounceTarget({ urlLang: 'en', storedLang: 'en', path: '/projects' }), null)
  assert.equal(bounceTarget({ urlLang: 'en', storedLang: null, path: '/projects' }), null)

  // Still does its job for a returning reader who never chose English.
  assert.equal(bounceTarget({ urlLang: 'en', storedLang: 'te', path: '/projects' }), '/te/projects')
  assert.equal(bounceTarget({ urlLang: 'en', storedLang: 'ur', path: '/' }), '/ur')

  // Never fires from a path that already names a language, so it can never
  // fight a reader who deliberately followed a link in another one.
  assert.equal(bounceTarget({ urlLang: 'te', storedLang: 'hi', path: '/projects' }), null)
  assert.equal(bounceTarget({ urlLang: 'ur', storedLang: 'en', path: '/projects' }), null)

  // Query and hash survive the redirect.
  assert.equal(
    bounceTarget({ urlLang: 'en', storedLang: 'te', path: '/projects', search: '?district=Guntur', hash: '#map' }),
    '/te/projects?district=Guntur#map')
})

test('switching language keeps the reader on the same page', async () => {
  const { switchTarget } = await import('../../src/lib/language.js')

  assert.equal(switchTarget({ code: 'en', path: '/te/finances' }), '/finances')
  assert.equal(switchTarget({ code: 'hi', path: '/te/finances' }), '/hi/finances')
  assert.equal(switchTarget({ code: 'te', path: '/projects/613' }), '/te/projects/613')
  assert.equal(switchTarget({ code: 'en', path: '/ur' }), '/')
  assert.equal(
    switchTarget({ code: 'ta', path: '/te/projects', search: '?district=Palnadu' }),
    '/ta/projects?district=Palnadu')
})

test('the language choice is written before the page navigates', () => {
  // If these ever swap order, English becomes unselectable again and every
  // other language keeps working, which is precisely why it went unnoticed.
  const write = APP.indexOf('writeStoredLang(code)')
  const go = APP.indexOf('window.location.assign(switchTarget(')
  assert.ok(write !== -1, 'the language switch no longer records the choice')
  assert.ok(go !== -1, 'the language switch no longer navigates')
  assert.ok(write < go, 'App.jsx navigates before recording the choice; English will bounce back')
})

/**
 * SPEED, WHERE IT IS ACTUALLY LOST
 *
 * Switching language is a full page load, because the router's basename is
 * fixed when the page loads. On top of that reload the catalogue is a
 * separate chunk, 41 to 57 KB gzipped, which the browser cannot discover
 * until the main bundle has run. So the reader clicks, sees white, and waits
 * for a file nothing had asked for yet.
 *
 * Neither of these shows up as an error. The page is correct the whole time.
 * It just feels slow, which is the kind of problem that never gets a bug
 * report, only a reader who does not come back.
 */
test('the switcher starts the download before the click', () => {
  const src = readFileSync(resolve(here, '../../src/components/Layout/LanguageSwitcher.jsx'), 'utf8')
  assert.match(src, /preloadLanguage/, 'the switcher no longer warms the catalogue')
  for (const trigger of ['onMouseEnter', 'onFocus', 'onPointerEnter']) {
    assert.match(src, new RegExp(`${trigger}=\\{\\(\\) => preloadLanguage`),
      `${trigger} no longer preloads, so that path back to a cold click is open again`)
  }
})

test('preloading is idempotent and cannot stampede', () => {
  const src = readFileSync(resolve(here, '../../src/i18n/index.jsx'), 'utf8')
  assert.match(src, /if \(!LOADERS\[code\] \|\| loaded\[code\]\) return Promise\.resolve\(\)/,
    'preload no longer short-circuits a language that is already loaded')
  assert.match(src, /if \(!inflight\[code\]\)/,
    'preload no longer joins an in-flight request, so hovering twice fetches twice')
  assert.match(src, /\.catch\(\(\) => \{ delete inflight\[code\] \}\)/,
    'a failed preload would be cached as permanently in-flight and never retried')
})

test('a loading page is not a blank page', () => {
  // The provider held the whole tree back with `return null` while the
  // catalogue arrived, so the switch painted white and then content. Same
  // wait, but with the shape of a page in it and the right direction set, so
  // an Urdu reader is not watching a left-to-right skeleton.
  const src = readFileSync(resolve(here, '../../src/i18n/index.jsx'), 'utf8')
  assert.ok(!/if \(!cat\) return null/.test(src), 'the provider went back to painting nothing')
  const block = src.slice(src.indexOf('if (!cat) {'), src.indexOf('return <I18nContext.Provider'))
  assert.match(block, /aria-busy="true"/, 'the loading state lost its busy flag')
  assert.match(block, /dir=\{meta\.dir\}/,
    'the loading state lost its direction, so an Urdu reader sees a left-to-right skeleton')
})
