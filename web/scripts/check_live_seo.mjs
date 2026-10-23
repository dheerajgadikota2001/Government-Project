// Checks a deployed site the way a search engine meets it. Run it after every deploy, like check_live_register.py.
//
//   node scripts/check_live_seo.mjs                          the live site
//   node scripts/check_live_seo.mjs --base https://ap-nadu-nedu--new-design-xxxx.web.app --preview
//   node scripts/check_live_seo.mjs --limit 120              a quick run on a spread of pages
//
// Why it exists: on 22 Oct 2026 an empty-shell build reached a preview and every address but Home answered
// 404. check_dist.mjs now stops that before a deploy; this script proves it afterwards, from outside, on the
// real servers, in both languages, and it also catches the things only a deployed site can get wrong: a
// "noindex" header that travelled with a copy, a redirect that stopped working, a share picture that 404s.
//
// --preview: Firebase adds "X-Robots-Tag: noindex" to preview channels, so that header is expected there (and
// is a failure on the live site). Canonical addresses always point at the live origin.
// Exit code 0 when every check passes. Needs Node 18 or newer. No packages.
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
const ORIGIN = 'https://apfactcheck.dheeco.com'
const BASE = arg('--base', ORIGIN).replace(/\/$/, '')
const PREVIEW = process.argv.includes('--preview')
const LIMIT = Number(arg('--limit', 0))
const CONC = 10

let failures = 0
const out = []
const pass = (n) => out.push('PASS ' + n)
const fail = (n, why = '') => { failures++; out.push('FAIL ' + n + (why ? `  [${why}]` : '')) }
const expect = (n, c, why) => (c ? pass(n) : fail(n, why))

const get = (path, init = {}) => fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; apfc-seo-check/1.0)' }, ...init })
const pool = async (items, n, fn) => { const res = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k) } })); return res }
const at = (url) => url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) || '/' : url
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

console.log(`Checking ${BASE}${PREVIEW ? ' (preview channel)' : ''}\n`)

// 1. robots.txt and the sitemaps
const robots = await (await get('/robots.txt')).text()
expect('robots.txt names the sitemap and blocks nothing', robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`) && !/^\s*Disallow:\s*\/\s*$/m.test(robots))
const idx = await get('/sitemap.xml')
const idxText = idx.status === 200 ? await idx.text() : ''
const parts = locs(idxText)
expect('sitemap.xml is an index of the English and Telugu sitemaps', parts.length === 2 && parts.every((p) => p.startsWith(ORIGIN)), `status ${idx.status}`)
let urls = []
for (const p of parts) {
  const r = await get(at(p))
  const x = r.status === 200 ? await r.text() : ''
  const l = locs(x)
  expect(`${at(p)} lists more than 700 pages`, l.length > 700, `${l.length}`)
  const bad = [...x.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]).filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d > new Date(Date.now() + 864e5).toISOString().slice(0, 10))
  expect(`${at(p)} dates are real and none is in the future`, !bad.length, bad.slice(0, 2).join(','))
  urls.push(...l)
}
urls = [...new Set(urls)]
if (LIMIT && urls.length > LIMIT) urls = urls.filter((_, i) => i % Math.ceil(urls.length / LIMIT) === 0 || i < 8)

// 2. every page, the way a crawler reads it
const seenTitle = new Map(), images = new Set(), problems = []
const header = (r, k) => r.headers.get(k) ?? ''
await pool(urls, CONC, async (u) => {
  const path = at(u)
  let r
  try { r = await get(path) } catch (e) { problems.push(`${path}: ${e.message}`); return }
  if (r.status !== 200) { problems.push(`${path}: status ${r.status}`); return }
  const h = await r.text()
  const te = path === '/te' || path.startsWith('/te/')
  const g = (re) => re.exec(h)?.[1]
  const title = g(/<title>([^<]+)<\/title>/)
  if (!title || title.length < 8) problems.push(`${path}: no title`)
  else {
    if (/^\/(te\/)?projects\/\d+$/.test(path) && unesc(title).length > 75) problems.push(`${path}: title is ${title.length} characters`)
    const key = (te ? 'te:' : 'en:') + title
    seenTitle.set(key, [...(seenTitle.get(key) ?? []), path])
  }
  if (!/<meta name="description" content="[^"]{20,}">/.test(h)) problems.push(`${path}: no description`)
  if (g(/<link rel="canonical" href="([^"]+)">/) !== u) problems.push(`${path}: canonical is ${g(/<link rel="canonical" href="([^"]+)">/)}`)
  if (!h.includes(`<html lang="${te ? 'te' : 'en'}">`)) problems.push(`${path}: wrong lang`)
  if ((h.match(/rel="alternate" hreflang=/g) ?? []).length !== 3) problems.push(`${path}: hreflang`)
  if ((h.match(/<h1[ >]/g) ?? []).length !== 1) problems.push(`${path}: heading count`)
  if (/<meta name="robots" content="[^"]*noindex/.test(h)) problems.push(`${path}: noindex in the page`)
  const hx = header(r, 'x-robots-tag')
  if (!PREVIEW && /noindex/i.test(hx)) problems.push(`${path}: noindex in the headers`)
  if (!h.includes('rel="icon"') || !h.includes('rel="manifest"')) problems.push(`${path}: no icon or manifest link`)
  const img = g(/<meta property="og:image" content="([^"]+)">/)
  if (!img) problems.push(`${path}: no share picture`)
  else images.add(img)
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]) } catch { problems.push(`${path}: markup is not valid JSON`) } }
})
expect(`${urls.length} pages answer 200 with their own title, description, canonical, language, hreflang, heading, icons and share picture`, !problems.length, `${problems.length} problems; first: ${problems.slice(0, 4).join(' | ')}`)
const dup = [...seenTitle].filter(([, p]) => p.length > 1)
expect('no two pages in a language share a title', !dup.length, dup.slice(0, 2).map(([t, p]) => `${p.length}x ${t.slice(0, 50)} (${p.slice(0, 2).join(', ')})`).join(' | '))

// 3. the share pictures are real pictures, of a size WhatsApp will take
const imgProblems = []
await pool([...images], CONC, async (i) => {
  const r = await get(at(i).startsWith('/') ? at(i) : i)
  if (r.status !== 200) return imgProblems.push(`${at(i)}: status ${r.status}`)
  const b = Buffer.from(await r.arrayBuffer())
  if (!/^image\//.test(header(r, 'content-type'))) imgProblems.push(`${at(i)}: type ${header(r, 'content-type')}`)
  if (b.length > 300 * 1024) imgProblems.push(`${at(i)}: ${Math.round(b.length / 1024)} KB`)
  if (b.readUInt32BE(0) === 0x89504e47 && (b.readUInt32BE(16) !== 1200 || b.readUInt32BE(20) !== 630)) imgProblems.push(`${at(i)}: ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`)
})
expect(`${images.size} share pictures exist, are images, 1200 x 630 and under 300 KB`, images.size > 0 && !imgProblems.length, images.size ? imgProblems.slice(0, 3).join(' | ') : 'no page names a share picture')

// 4. headers, icons and the manifest
const home = await get('/')
expect('Home sends HSTS and a CSP', !!header(home, 'strict-transport-security') && !!header(home, 'content-security-policy'))
if (PREVIEW) expect('the preview is marked noindex (so it stays out of search)', /noindex/i.test(header(home, 'x-robots-tag')))
else expect('the live site is NOT marked noindex in its headers', !/noindex/i.test(header(home, 'x-robots-tag')), header(home, 'x-robots-tag'))
for (const [f, type] of [['favicon.ico', /icon/], ['favicon.svg', /svg/], ['apple-touch-icon.png', /png/], ['icon-192.png', /png/], ['icon-512.png', /png/], ['icon-maskable-512.png', /png/], ['manifest.webmanifest', /manifest|json/]]) {
  const r = await get('/' + f)
  expect(`/${f} answers 200 with the right type`, r.status === 200 && type.test(header(r, 'content-type')), `${r.status} ${header(r, 'content-type')}`)
}
{
  const r = await get('/manifest.webmanifest')
  let m = null; try { m = await r.json() } catch {}
  expect('the manifest names the app and three icons', !!m && m.name && m.start_url === '/' && m.icons?.length >= 3)
}

// 5. redirects and the 404
const redir = async (path, base = BASE) => { const r = await fetch(base + path, { redirect: 'manual' }); return [r.status, r.headers.get('location') ?? ''] }
if (!PREVIEW && BASE === ORIGIN) {
  const [s, l] = await redir('/projects', 'http://apfactcheck.dheeco.com')
  expect('http redirects to https with a 301', s === 301 && l.startsWith('https://'), `${s} ${l}`)
}
{
  const [s, l] = await redir('/te/')
  expect('a trailing slash redirects once, with a 301', s === 301 && /\/te$/.test(l), `${s} ${l}`)
  const [s2, l2] = await redir('/polavaram')
  expect('/polavaram goes to the Polavaram page with a 301', s2 === 301 && /\/projects\/613$/.test(l2), `${s2} ${l2}`)
  const nf = await get('/this-page-does-not-exist-' + Date.now())
  expect('an unknown address answers a real 404', nf.status === 404, String(nf.status))
}

console.log(out.join('\n'))
console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll SEO checks passed.')
process.exit(failures ? 1 : 0)
