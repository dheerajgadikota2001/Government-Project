/**
 * Tell Bing what changed, the moment it changes.
 *
 * WHY THIS EXISTS
 *
 * A sitemap is a standing invitation: here are 4,620 URLs, come back whenever.
 * Search Console spent three weeks not taking that invitation up on 4,379 of
 * them. IndexNow is the other direction. It is a push: these exact URLs
 * changed just now, and the engine decides to crawl them knowing that much.
 *
 * Bing, Yandex, Seznam and Naver share one IndexNow pool, so one post reaches
 * all of them. Google does not participate. This is not a Google play.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *
 * It will not fire 4,620 URLs on every deploy. IndexNow's own guidance is to
 * submit content that was added, updated or deleted, and a site that posts its
 * whole register every time it ships a CSS change is teaching the engine to
 * ignore it. --all exists for the first run and for a rebuild after a schema
 * change, and it says so out loud before it goes.
 *
 * THE KEY
 *
 * The key is read from the file in public/ rather than kept in an env var or
 * a constant here. The one way this breaks is the key and the file that proves
 * it disagreeing, and there is no way for them to disagree when the file is
 * the only source. The key is public by design: it proves nothing except that
 * whoever posted can also write to the site's web root, which is exactly the
 * claim being made.
 *
 * USAGE
 *
 *   node scripts/indexnow.mjs https://apfactcheck.dheeco.com/projects/1 ...
 *   node scripts/indexnow.mjs --all            # every URL in the sitemap
 *   node scripts/indexnow.mjs --all --dry-run  # print, post nothing
 *   git diff --name-only | node scripts/indexnow.mjs --stdin
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(here, '../public')

export const ENDPOINT = 'https://api.indexnow.org/indexnow'
export const HOST = 'apfactcheck.dheeco.com'
export const MAX_PER_POST = 10000

/**
 * The IndexNow key, read from the file that proves ownership of it.
 *
 * A key file is any .txt in the web root whose name is its own contents. That
 * self-describing shape is the check: a stray notes.txt is not a key, and a
 * key file someone edited by hand no longer matches its name and is rejected
 * here rather than by the API after a deploy.
 */
export function readKey(dir = PUBLIC) {
  const candidates = readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .map(f => ({ file: f, key: f.slice(0, -4) }))
    .filter(({ key }) => /^[A-Za-z0-9-]{8,128}$/.test(key))
    .filter(({ file, key }) => readFileSync(join(dir, file), 'utf8').trim() === key)

  if (!candidates.length) {
    throw new Error(
      `No IndexNow key file in ${dir}. It is a .txt file whose name is its own ` +
      `contents, for example abc123….txt containing abc123…`)
  }
  if (candidates.length > 1) {
    // Two keys is not twice as verified. It means an old one was left behind,
    // and a post signed with the wrong one is rejected with no clue why.
    throw new Error(
      `${candidates.length} IndexNow key files in ${dir}: ` +
      `${candidates.map(c => c.file).join(', ')}. Keep one.`)
  }
  return candidates[0].key
}

/** Every URL in the built sitemap, in the order it lists them. */
export function urlsFromSitemap(path = join(PUBLIC, 'sitemap.xml')) {
  const xml = readFileSync(path, 'utf8')
  // sitemap.xml is an index of one file per language. Its <loc>s are
  // sitemaps, not pages, and posting them would tell Bing the pages are two
  // XML files. Each child is read from the same folder by its file name.
  if (/<sitemapindex[\s>]/.test(xml)) {
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .flatMap(m => urlsFromSitemap(join(dirname(path), m[1].trim().split('/').pop())))
  }
  // <loc> only. The hreflang alternates are the same pages under their own
  // language address, and every one of them is a <loc> in its own entry, so
  // reading xhtml:link too would post each page six times over.
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
}

/** Only URLs on the host we can prove we own. The API rejects the rest anyway. */
export function onThisHost(urls, host = HOST) {
  return urls.filter(u => {
    try { return new URL(u).host === host } catch { return false }
  })
}

export function batches(urls, size = MAX_PER_POST) {
  const out = []
  for (let i = 0; i < urls.length; i += size) out.push(urls.slice(i, i + size))
  return out
}

/**
 * What a status code means, in words, because the body is always empty.
 *
 * 202 is the one worth reading carefully: it is a success in the sense that
 * the post was accepted, and a failure in the sense that nothing will be
 * crawled until the key file is reachable. A deploy that has not gone out yet
 * looks exactly like this.
 */
export function explain(status) {
  return {
    200: 'accepted',
    202: 'accepted, but the key file has not been validated yet. Check that ' +
         `https://${HOST}/<key>.txt is live and try again.`,
    400: 'bad request: the JSON or the key format is wrong',
    403: 'the key file does not match the key that was sent',
    422: 'those URLs do not belong to the host, or the key does not match the host',
    429: 'too many requests. Post changed URLs, not the whole site.',
  }[status] || `unexpected status ${status}`
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const all = argv.includes('--all')
  const fromStdin = argv.includes('--stdin')
  const given = argv.filter(a => !a.startsWith('--'))

  let urls = given
  if (all) urls = urlsFromSitemap()
  if (fromStdin) {
    urls = (await new Promise(res => {
      let s = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', d => { s += d })
      process.stdin.on('end', () => res(s))
    })).split('\n').map(l => l.trim()).filter(Boolean)
  }

  urls = [...new Set(onThisHost(urls))]
  if (!urls.length) {
    console.error('indexnow: nothing to submit. Pass URLs, --all, or --stdin.')
    process.exit(1)
  }

  const key = readKey()

  if (all && !dryRun) {
    console.warn(`indexnow: submitting all ${urls.length} URLs. Do this on a first run ` +
      'or after a rebuild that changed every page, not on every deploy.')
  }
  if (dryRun) {
    console.log(`indexnow: would post ${urls.length} URL(s) in ${batches(urls).length} request(s)`)
    urls.slice(0, 5).forEach(u => console.log(`  ${u}`))
    if (urls.length > 5) console.log(`  … and ${urls.length - 5} more`)
    return
  }

  let failed = 0
  for (const [i, batch] of batches(urls).entries()) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, urlList: batch }),
    })
    const ok = res.status === 200 || res.status === 202
    if (!ok) failed++
    console.log(`indexnow: batch ${i + 1}, ${batch.length} URL(s) — ` +
      `${res.status} ${explain(res.status)}`)
  }
  // A failed ping is not a failed deploy. The site is live either way and the
  // sitemap still says what changed; this only makes it faster.
  if (failed) process.exitCode = 1
}

if (process.argv[1] && process.argv[1].endsWith('indexnow.mjs')) {
  main(process.argv.slice(2)).catch(e => {
    console.error(`indexnow: ${e.message}`)
    process.exit(1)
  })
}
