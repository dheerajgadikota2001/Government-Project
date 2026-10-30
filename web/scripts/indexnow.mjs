// Tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver) which pages changed, right after a deploy,
// instead of waiting for their crawlers to come back. Bing's index also feeds ChatGPT search and Copilot.
// Google does not use IndexNow; it reads the sitemap.
//
// Run AFTER the clone to live, from web/:
//   node scripts/indexnow.mjs            dry run: lists what would be sent, sends nothing
//   node scripts/indexnow.mjs --send     sends the changed addresses
//   node scripts/indexnow.mjs --send --all   sends every address (first time, or after a big change)
//
// What counts as changed: a page whose fingerprint in seo-lastmod.json (written by every build) differs
// from the fingerprint last sent, a new page, or a page that has gone (search engines are told so it can
// be dropped). The record of what was sent lives in .cache/indexnow-sent.json on this computer and is
// written only after the engine accepts the list, so a failed send is simply sent again next time.
//
// Guards before anything is sent: the key file must be live on the site (otherwise the engines reject
// every address), and one changed address must already answer on the live site (so a list is never
// sent for a build that is only on the preview).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ORIGIN = 'https://apfactcheck.dheeco.com'
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 10000   // the protocol's limit per request

/** The key is the name of the one 32-character hex .txt file in public/, and that file holds the key. */
export function readKey(publicDir) {
  const files = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f))
  if (files.length !== 1) throw new Error(`expected exactly one IndexNow key file in ${publicDir}, found ${files.length}`)
  const key = files[0].slice(0, 32)
  if (readFileSync(join(publicDir, files[0]), 'utf8').trim() !== key) throw new Error(`${files[0]} does not hold its own key`)
  return key
}

/** Every address in both languages, for the pages whose fingerprint differs from what was last sent. */
export function changedUrls(current, sent, all = false) {
  const at = (path, lang) => ORIGIN + (lang === 'te' ? (path === '/' ? '/te' : '/te' + path) : path)
  const paths = new Set()
  for (const [path, v] of Object.entries(current)) if (all || sent[path] !== v.h) paths.add(path)
  for (const path of Object.keys(sent)) if (!(path in current)) paths.add(path)   // gone: say so once
  return [...paths].sort().flatMap((p) => [at(p, 'en'), at(p, 'te')])
}

/** The record to keep after a successful send: the current fingerprints, nothing for pages that have gone. */
export const nextSent = (current) => Object.fromEntries(Object.entries(current).map(([p, v]) => [p, v.h]))

async function main() {
  const web = fileURLToPath(new URL('..', import.meta.url))
  const send = process.argv.includes('--send'), all = process.argv.includes('--all')
  const key = readKey(join(web, 'public'))
  const current = JSON.parse(readFileSync(join(web, 'seo-lastmod.json'), 'utf8'))
  const stateFile = join(web, '.cache', 'indexnow-sent.json')
  const sent = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
  const urls = changedUrls(current, sent, all)
  console.log(`${urls.length} address(es) to send (${Object.keys(sent).length ? 'changed since the last send' : 'first send: every page'}).`)
  if (!urls.length) return
  if (!send) { console.log(urls.slice(0, 10).join('\n') + (urls.length > 10 ? `\n... and ${urls.length - 10} more` : '') + '\n\nDry run. Add --send to send.'); return }

  const keyLive = await fetch(`${ORIGIN}/${key}.txt`).then(async (r) => (r.ok ? (await r.text()).trim() : '')).catch(() => '')
  if (keyLive !== key) { console.error(`The key file ${ORIGIN}/${key}.txt is not live yet. Deploy and clone to live first. Nothing sent.`); process.exit(1) }
  const probe = urls.find((u) => Object.prototype.hasOwnProperty.call(current, new URL(u).pathname))
  if (probe) {
    const status = await fetch(probe, { method: 'HEAD', redirect: 'manual' }).then((r) => r.status).catch(() => 0)
    if (status !== 200) { console.error(`${probe} answers ${status || 'nothing'} on the live site: this build does not look live yet. Nothing sent.`); process.exit(1) }
  }

  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH)
    const r = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(ORIGIN).host, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList }),
    })
    // 200: received. 202: received, key check pending. Anything else: nothing is recorded as sent.
    if (r.status !== 200 && r.status !== 202) {
      const why = { 400: 'bad request', 403: 'key not valid (is the key file live?)', 422: 'an address is not on this host', 429: 'too many requests, try later' }[r.status] ?? ''
      console.error(`IndexNow answered ${r.status} ${why}. Nothing recorded as sent; run again later.`)
      process.exit(1)
    }
    console.log(`Sent ${urlList.length} address(es): ${r.status}.`)
  }
  mkdirSync(join(web, '.cache'), { recursive: true })
  writeFileSync(stateFile, JSON.stringify(nextSent(current)))
  console.log('Recorded. The next run sends only what changes.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main()
