import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readKey, urlsFromSitemap, onThisHost, batches, explain, MAX_PER_POST, HOST }
  from '../indexnow.mjs'

/**
 * WHY THIS TEST EXISTS
 *
 * Every failure mode of an IndexNow ping is silent. The API answers with an
 * empty body and a status code, a wrong key reads as 403 with no hint which
 * key it expected, and a script that posts nothing at all looks exactly like a
 * script that posted successfully. So the parts that decide what gets sent are
 * pure functions, and they are tested here rather than discovered in
 * production three weeks later when nothing has been crawled.
 */

const dir = () => mkdtempSync(join(tmpdir(), 'indexnow-'))

test('the key is the file whose name is its own contents', () => {
  const d = dir()
  try {
    writeFileSync(join(d, 'robots.txt'), 'User-agent: *\n')
    writeFileSync(join(d, 'notes.txt'), 'nothing to do with indexnow')
    const key = 'f85440e0188af29e84f931aec7593cc0'
    writeFileSync(join(d, `${key}.txt`), `${key}\n`)
    assert.equal(readKey(d), key)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a key file edited by hand is refused here, not by the API after a deploy', () => {
  const d = dir()
  try {
    writeFileSync(join(d, 'abcdef0123456789.txt'), 'somebody typed over this')
    assert.throws(() => readKey(d), /No IndexNow key file/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('two key files is an error, because it is not twice as verified', () => {
  // The real failure: an old key left behind after rotating. A post signed
  // with the wrong one comes back 403 with nothing to say why.
  const d = dir()
  try {
    for (const k of ['aaaaaaaa11111111', 'bbbbbbbb22222222']) {
      writeFileSync(join(d, `${k}.txt`), k)
    }
    assert.throws(() => readKey(d), /Keep one/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('no key file at all says what a key file looks like', () => {
  const d = dir()
  try {
    assert.throws(() => readKey(d), /name is its own contents/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('the sitemap gives each page once, not once per language link', () => {
  // Every entry carries five xhtml:link alternates. Reading those too would
  // post all 4,620 pages six times over, which is how a site earns a 429.
  const d = dir()
  const p = join(d, 'sitemap.xml')
  try {
    writeFileSync(p, `<?xml version="1.0"?>
      <urlset>
        <url>
          <loc>https://apfactcheck.dheeco.com/projects/1</loc>
          <xhtml:link rel="alternate" hreflang="te" href="https://apfactcheck.dheeco.com/te/projects/1"/>
          <xhtml:link rel="alternate" hreflang="hi" href="https://apfactcheck.dheeco.com/hi/projects/1"/>
        </url>
        <url><loc>https://apfactcheck.dheeco.com/te/projects/1</loc></url>
      </urlset>`)
    assert.deepEqual(urlsFromSitemap(p), [
      'https://apfactcheck.dheeco.com/projects/1',
      'https://apfactcheck.dheeco.com/te/projects/1',
    ])
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('only URLs on the host we can prove we own are sent', () => {
  // 422 is what the API answers for the rest, and it rejects the whole post,
  // not the offending URL. One stray link would cost the entire batch.
  const kept = onThisHost([
    `https://${HOST}/projects/1`,
    'https://dheeco.com/',
    'https://strata.dheeco.com/',
    'https://evil.example/projects/1',
    'not a url at all',
    '',
  ])
  assert.deepEqual(kept, [`https://${HOST}/projects/1`])
})

test('posts are split at the documented limit', () => {
  assert.equal(MAX_PER_POST, 10000)
  const many = Array.from({ length: 23456 }, (_, i) => `https://${HOST}/projects/${i}`)
  const parts = batches(many)
  assert.deepEqual(parts.map(p => p.length), [10000, 10000, 3456])
  assert.equal(parts.flat().length, many.length, 'a URL was dropped between batches')

  // The register today fits in one post. Worth knowing if it stops being true.
  assert.equal(batches(Array.from({ length: 4620 }, (_, i) => `x${i}`)).length, 1)
})

test('202 is reported as the not-yet-working state it is', () => {
  // The trap: 202 reads as success and means nothing will be crawled until the
  // key file is live. A deploy that has not gone out yet looks exactly like it.
  assert.match(explain(202), /has not been validated/)
  assert.match(explain(202), /\.txt/)
  assert.equal(explain(200), 'accepted')
  assert.match(explain(403), /does not match/)
  assert.match(explain(429), /not the whole site/)
  assert.match(explain(418), /unexpected status 418/)
})

test('a sitemap index is followed to its files, never posted as pages', () => {
  // sitemap.xml names one file per language. Posting its <loc>s would tell
  // Bing that two XML files are the site.
  const d = dir()
  try {
    writeFileSync(join(d, 'sitemap.xml'), `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://apfactcheck.dheeco.com/sitemap-en.xml</loc></sitemap>
        <sitemap><loc>https://apfactcheck.dheeco.com/sitemap-te.xml</loc></sitemap>
      </sitemapindex>`)
    writeFileSync(join(d, 'sitemap-en.xml'), '<urlset><url><loc>https://apfactcheck.dheeco.com/projects/1</loc></url></urlset>')
    writeFileSync(join(d, 'sitemap-te.xml'), '<urlset><url><loc>https://apfactcheck.dheeco.com/te/projects/1</loc></url></urlset>')
    assert.deepEqual(urlsFromSitemap(join(d, 'sitemap.xml')), [
      'https://apfactcheck.dheeco.com/projects/1',
      'https://apfactcheck.dheeco.com/te/projects/1',
    ])
  } finally { rmSync(d, { recursive: true, force: true }) }
})
