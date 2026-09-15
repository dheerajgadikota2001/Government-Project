import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schemaFor, projectTrail } from '../../src/lib/schema.js'

/**
 * WHY THIS TEST EXISTS
 *
 * Search Console reported "URL has no enhancements", meaning Google had no idea
 * what kind of thing this site is.
 *
 * There is also a name problem it cannot fix but must not make worse. The state
 * government runs its own fact check portal at factcheck.ap.gov.in with a near
 * identical name. The Organization block is the one signal that says these are
 * two different entities. If its description ever stops saying so, the only
 * thing separating them is gone.
 *
 * And structured data that claims more than the page delivers earns a manual
 * penalty, so these tests are as much about what is absent as what is present.
 */

const types = g => g['@graph'].map(n => n['@type'])

test('the graph is valid JSON and declares a context', () => {
  const s = schemaFor('/')
  assert.equal(s['@context'], 'https://schema.org')
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)))
})

test('every page declares the organisation, and says it is independent', () => {
  for (const path of ['/', '/projects', '/finances', '/about']) {
    const org = schemaFor(path, { title: 'X' })['@graph'].find(n => n['@type'] === 'Organization')
    assert.ok(org, `${path} has no Organization`)
    assert.match(org.description, /independent/i)
    assert.match(org.description, /[Nn]ot affiliated/)
    assert.equal(org.alternateName, 'AP Fact Check')
  }
})

test('sameAs is omitted rather than left empty', () => {
  // An empty array declares "this exists nowhere else", which is worse than
  // saying nothing. Filling it is a real task, not a formality.
  const org = schemaFor('/')['@graph'].find(n => n['@type'] === 'Organization')
  assert.ok(!('sameAs' in org) || org.sameAs.length > 0)
})

test('the register pages are datasets, a single project page is not', () => {
  for (const path of ['/projects', '/finances', '/tenders', '/documents']) {
    assert.ok(types(schemaFor(path, { title: 'X' })).includes('Dataset'), `${path} is not a Dataset`)
  }
  assert.ok(!types(schemaFor('/projects/613', { title: 'Polavaram' })).includes('Dataset'),
    'one project was marked up as a whole dataset')
  assert.ok(!types(schemaFor('/about', { title: 'About' })).includes('Dataset'))
})

test('nothing claims to be a ClaimReview', () => {
  // The name invites it and the schema does not fit: ClaimReview rates a
  // specific statement by a specific person. This site publishes records.
  for (const path of ['/', '/projects', '/projects/613', '/documents']) {
    const json = JSON.stringify(schemaFor(path, { title: 'X' }))
    assert.ok(!/ClaimReview/.test(json), `${path} claims to be a fact check rating`)
  }
})

test('breadcrumbs run home, projects, district, project', () => {
  const trail = projectTrail({ id: 613, title: 'Polavaram Irrigation Project', district: 'Eluru' })
  assert.deepEqual(trail.map(t => t.name), ['Home', 'Projects', 'Eluru', 'Polavaram Irrigation Project'])

  const crumbs = schemaFor('/projects/613', { title: 'X', breadcrumbTrail: trail })
    ['@graph'].find(n => n['@type'] === 'BreadcrumbList')
  assert.equal(crumbs.itemListElement.length, 4)
  assert.equal(crumbs.itemListElement[0].position, 1)
  assert.match(crumbs.itemListElement[3].item, /\/projects\/613$/)
})

test('a project with no district still gets a usable trail', () => {
  const trail = projectTrail({ id: 4, title: 'Amaravati' })
  assert.deepEqual(trail.map(t => t.name), ['Home', 'Projects', 'Amaravati'])
})

test('the site search action points at the real search page', () => {
  const site = schemaFor('/')['@graph'].find(n => n['@type'] === 'WebSite')
  assert.match(site.potentialAction.target.urlTemplate, /\/search\?q=\{search_term_string\}$/)
  assert.deepEqual(site.inLanguage, ['en', 'te', 'hi', 'ur', 'ta', 'or'])
})

test('every URL in the graph is absolute, and leaves the site only where it should', () => {
  // Two kinds of URL are meant to point elsewhere: sameAs, which is the whole
  // point of the field, and a cited document. Everything else that names a
  // page must be this site's own address, or the graph is describing someone
  // else's pages as ours.
  const graph = schemaFor('/projects/613', { title: 'X', breadcrumbTrail: projectTrail({ id: 613, title: 'P', district: 'Eluru' }) })
  const org = graph['@graph'].find(n => n['@type'] === 'Organization')
  const external = new Set([...(org.sameAs || [])])
  for (const url of JSON.stringify(graph).match(/https?:\/\/[^"]+/g) || []) {
    assert.ok(
      url.startsWith('https://apfactcheck.dheeco.com') ||
      url.startsWith('https://schema.org') ||
      url.startsWith('https://www.indiacode.nic.in') ||
      external.has(url),
      `unexpected URL in schema: ${url}`,
    )
  }
  assert.ok(external.size > 0, 'sameAs is empty again; the organisation is not linked to its profiles')
  for (const url of external) assert.match(url, /^https:\/\//, `sameAs is not https: ${url}`)
})
