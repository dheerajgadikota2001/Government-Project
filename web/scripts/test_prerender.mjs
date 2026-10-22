// Checks the pre-rendered build (run after `npm run build`): every address has its file in both
// languages, every file names itself correctly, every link inside the pre-rendered pages lands on a
// file that exists (with no catch-all rewrite any more, a broken link would be a real 404), and the
// sitemaps list exactly the pages written. Run: npm run test:prerender
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const ORIGIN = 'https://apfactcheck.dheeco.com'
let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

const fileFor = (path) => join(DIST, path === '/' ? 'index.html' : path.replace(/^\//, '') + '/index.html')
const pages = []
;(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) { if (n !== 'assets') walk(p) } else if (n === 'index.html') pages.push(p)
  }
})(DIST)
// Forward slashes whatever the platform, so Windows paths compare like addresses.
const addr = (f) => '/' + relative(DIST, f).split(sep).join('/').replace(/\/?index\.html$/, '')
const all = pages.map((f) => ({ f, path: addr(f) === '/' ? '/' : addr(f).replace(/\/$/, ''), html: readFileSync(f, 'utf8') }))

const isTe = (path) => path === '/te' || path.startsWith('/te/')     // not '/tenders'
const en = all.filter((p) => !isTe(p.path))
const te = all.filter((p) => isTe(p.path))
expect('more than 700 pages in each language', en.length > 700 && te.length > 700, `${en.length} / ${te.length}`)
expect('every English page has its Telugu twin', en.every((p) => existsSync(fileFor(p.path === '/' ? '/te' : '/te' + p.path))))

// Each page names itself.
const wrong = []
for (const p of all) {
  const lang = isTe(p.path) ? 'te' : 'en'
  const canon = p.html.match(/<link rel="canonical" href="([^"]+)">/)?.[1]
  if (canon !== ORIGIN + p.path) wrong.push(`${p.path}: canonical ${canon}`)
  if (!p.html.includes(`<html lang="${lang}">`)) wrong.push(`${p.path}: lang`)
  if (!/<title>[^<]{5,}<\/title>/.test(p.html)) wrong.push(`${p.path}: title`)
  if (!/<meta name="description" content="[^"]{20,}">/.test(p.html)) wrong.push(`${p.path}: description`)
  if (!/<div id="root"><main class="pre"/.test(p.html)) wrong.push(`${p.path}: empty root`)
  if (!/<h1>[^<]+<\/h1>/.test(p.html)) wrong.push(`${p.path}: no heading`)
  if ((p.html.match(/hreflang=/g) ?? []).length < 3) wrong.push(`${p.path}: hreflang`)
}
expect('every page has its own canonical, language, title, description, heading and hreflang', !wrong.length, wrong.slice(0, 5).join('; '))
const titles = new Map()
for (const p of en) titles.set(p.html.match(/<title>([^<]+)<\/title>/)[1], (titles.get(p.html.match(/<title>([^<]+)<\/title>/)[1]) ?? 0) + 1)
const dup = [...titles].filter(([, n]) => n > 1)
expect('no two English pages share a title', !dup.length, dup.slice(0, 3).map(([t, n]) => `${n}x ${t}`).join('; '))

// Every internal link in the pre-rendered bodies lands on a page.
const broken = new Set()
for (const p of all) {
  const body = p.html.slice(p.html.indexOf('<div id="root">'))
  for (const m of body.matchAll(/href="(\/[^"#?]*)"/g)) if (!existsSync(fileFor(m[1].replace(/\/$/, '') || '/'))) broken.add(`${p.path} -> ${m[1]}`)
}
expect('every link inside the pre-rendered pages lands on a page', !broken.size, [...broken].slice(0, 5).join('; '))

// The router's own addresses all exist (a link the app writes must never 404).
const route = readFileSync(new URL('../src/lib/route.tsx', import.meta.url), 'utf8')
const statics = [...route.slice(route.indexOf('const PATHS'), route.indexOf('const PAGES')).matchAll(/:\s*'(\/[^']*)'/g)].map((m) => m[1])
const missing = statics.filter((s) => !existsSync(fileFor(s)) || !existsSync(fileFor(s === '/' ? '/te' : '/te' + s)))
expect(`all ${statics.length} fixed addresses of the router have pages`, statics.length > 15 && !missing.length, missing.join(', '))

// 404 page, sitemaps, robots.
const nf = readFileSync(join(DIST, '404.html'), 'utf8')
expect('404.html is the app, marked noindex', nf.includes('<meta name="robots" content="noindex">') && nf.includes('<script type="module"'))
for (const lang of ['en', 'te']) {
  const sm = readFileSync(join(DIST, `sitemap-${lang}.xml`), 'utf8')
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(ORIGIN.length) || '/')
  const want = (lang === 'en' ? en : te).map((p) => p.path)
  const a = new Set(locs), b = new Set(want)
  expect(`sitemap-${lang}.xml lists exactly the ${lang} pages`, a.size === b.size && [...a].every((x) => b.has(x)), `${a.size} listed, ${b.size} written`)
}
expect('robots.txt points at the sitemap and blocks nothing', /Sitemap: https:\/\/apfactcheck\.dheeco\.com\/sitemap\.xml/.test(readFileSync(join(DIST, 'robots.txt'), 'utf8')) && !/Disallow: \//.test(readFileSync(join(DIST, 'robots.txt'), 'utf8')))

// Structured data cannot break out of its script element.
expect('no structured data contains a raw "<"', all.every((p) => !(p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '').includes('<')))

// The CSP is enforced now: an inline script whose hash is not in firebase.web.json simply does not run
// (the theme would flash). Every executable inline script in the pages must be listed.
const fb = readFileSync(new URL('../../firebase.web.json', import.meta.url), 'utf8')
const inline = new Set()
for (const p of [all.find((x) => x.path === '/'), all.find((x) => x.path === '/te/projects/613')].filter(Boolean)) {
  for (const m of p.html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)) inline.add(m[1])
}
const unlisted = [...inline].map((js) => 'sha256-' + createHash('sha256').update(js).digest('base64')).filter((h) => !fb.includes(`'${h}'`))
expect(`every inline script's hash is in the CSP (${inline.size} found)`, inline.size > 0 && !unlisted.length, unlisted.join(', '))

if (!ok) { console.log('\nSome checks failed.'); process.exit(1) }
console.log(`\nAll checks passed (${all.length} pages).`)
