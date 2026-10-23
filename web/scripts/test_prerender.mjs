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


// Titles fit a search result. A project's heading keeps its full words; the title in the tab, the
// result and the link preview is shortened, and no two pages (in either language) share one.
const titleOf = (h) => h.match(/<title>([^<]+)<\/title>/)[1]
const project = (list) => list.filter((p) => /^\/(te\/)?projects\/\d+$/.test(p.path))
const longEn = project(en).filter((p) => titleOf(p.html).length > 72)
const longTe = project(te).filter((p) => titleOf(p.html).length > 70)
expect('project titles in English are 72 characters or fewer', !longEn.length, longEn.slice(0, 2).map((p) => `${p.path} ${titleOf(p.html).length}`).join('; '))
expect('project titles in Telugu are 70 characters or fewer', !longTe.length, longTe.slice(0, 2).map((p) => `${p.path} ${titleOf(p.html).length}`).join('; '))
const teTitles = new Map()
for (const p of te) teTitles.set(titleOf(p.html), (teTitles.get(titleOf(p.html)) ?? 0) + 1)
const dupTe = [...teTitles].filter(([, n]) => n > 1)
expect('no two Telugu pages share a title', !dupTe.length, dupTe.slice(0, 3).map(([t, n]) => `${n}x ${t}`).join('; '))
const ogOff = all.filter((p) => !p.html.includes(`<meta property="og:title" content="${titleOf(p.html).replace(/ \| (AP Fact Check|ఏపీ ఫ్యాక్ట్ చెక్)$/, '')}">`) && !/^AP Fact Check:|^ఏపీ ఫ్యాక్ట్ చెక్:/.test(titleOf(p.html)) && !/^(About AP Fact Check|ఏపీ ఫ్యాక్ట్ చెక్ గురించి)/.test(titleOf(p.html)))
expect('the link preview title is the page title without the site name', !ogOff.length, ogOff.slice(0, 2).map((p) => p.path).join('; '))
const h1 = (h) => h.match(/<h1>([^<]*)<\/h1>/)?.[1] ?? ''
const p355 = en.find((p) => p.path === '/projects/355')
expect('a project heading keeps the full project name', !!p355 && h1(p355.html).length > titleOf(p355.html).length, p355 ? `${h1(p355.html).length} vs ${titleOf(p355.html).length}` : 'no /projects/355')

// Icons and the app manifest: every page links them, and the files exist and are real.
const files = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest']
expect('the icon and manifest files exist', files.every((f) => existsSync(join(DIST, f))), files.filter((f) => !existsSync(join(DIST, f))).join(', '))
const noLinks = all.filter((p) => !(p.html.includes('<link rel="icon" href="/favicon.svg"') && p.html.includes('<link rel="icon" href="/favicon.ico"') && p.html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">') && p.html.includes('<link rel="manifest" href="/manifest.webmanifest">') && p.html.includes('name="theme-color"')))
expect('every page links the icons, the manifest and a theme colour', !noLinks.length, noLinks.slice(0, 3).map((p) => p.path).join('; '))
{
  const m = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))
  const sized = (f, w, h) => { const b = readFileSync(join(DIST, f)); return b.readUInt32BE(16) === w && b.readUInt32BE(20) === h }
  expect('the manifest names the app and its icons exist at the sizes it claims',
    m.name && m.start_url === '/' && m.display === 'standalone' && m.icons.length >= 3 &&
    m.icons.every((i) => existsSync(join(DIST, i.src.replace(/^\//, ''))) && sized(i.src.replace(/^\//, ''), ...i.sizes.split('x').map(Number))))
}

// Structured data: every block is valid JSON; Home says who the site is; the register page says what it is.
const ldOf = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { try { return JSON.parse(m[1])['@graph'] } catch { return [null] } })
const badLd = all.filter((p) => ldOf(p.html).some((n) => !n || !n['@type']))
expect('the structured data of every page is valid JSON with a type on every node', !badLd.length, badLd.slice(0, 3).map((p) => p.path).join('; '))
for (const prefix of ['', '/te']) {
  const home = all.find((p) => p.path === (prefix || '/'))
  const types = ldOf(home.html).map((n) => n['@type'])
  expect(`${prefix || 'English'} Home names the site and its organisation`, types.includes('WebSite') && types.includes('Organization'), types.join(','))
  const reg = all.find((p) => p.path === prefix + '/projects')
  const ds = ldOf(reg.html).find((n) => n['@type'] === 'Dataset')
  expect(`${prefix || 'English'} projects page describes the register as a dataset`, !!ds && ds.description.length >= 50 && /\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}/.test(ds.temporalCoverage ?? ''), ds ? ds.temporalCoverage : 'no Dataset')
}


// Link previews: every page names a picture that exists, at the size WhatsApp, Facebook and Google use.
{
  const pic = join(DIST, 'share/default.png')
  const b = existsSync(pic) ? readFileSync(pic) : null
  expect('the default share picture is 1200 by 630 and under 300 KB', !!b && b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630 && b.length < 300 * 1024, b ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}, ${Math.round(b.length / 1024)} KB` : 'missing')
  const noPic = all.filter((p) => !(p.html.includes(`<meta property="og:image" content="${ORIGIN}/share/`) && p.html.includes('<meta name="twitter:card" content="summary_large_image">') && p.html.includes('og:image:alt')))
  expect('every page names a share picture, with its description', !noPic.length, noPic.slice(0, 3).map((p) => p.path).join('; '))
  const dead = new Set()
  for (const p of all) for (const m of p.html.matchAll(/<meta property="og:image" content="https:\/\/apfactcheck\.dheeco\.com([^"]+)">/g)) if (!existsSync(join(DIST, m[1]))) dead.add(`${p.path} -> ${m[1]}`)
  expect('every share picture a page names exists in the build', !dead.size, [...dead].slice(0, 3).join('; '))
}


// Robots tag and dates: pages may show large previews, the 404 page stays out of results, and the sitemap
// dates are real (never in the future, and not one date for every page once the data has moved).
{
  const noRobots = all.filter((p) => !p.html.includes('<meta name="robots" content="max-image-preview:large">'))
  expect('every page allows large previews', !noRobots.length, noRobots.slice(0, 3).map((p) => p.path).join('; '))
  const sm = readFileSync(join(DIST, 'sitemap-en.xml'), 'utf8')
  const dates = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1])
  const asOf = JSON.parse(readFileSync(new URL('../src/data/meta.json', import.meta.url), 'utf8')).asof
  expect('no sitemap date is after the data as-of date', dates.length > 700 && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOf), `${dates.length} dates, as of ${asOf}`)
  const state = JSON.parse(readFileSync(new URL('../seo-lastmod.json', import.meta.url), 'utf8'))
  const covered = en.every((p) => state[p.path]) && te.every((p) => state[p.path === '/te' ? '/' : p.path.replace(/^\/te/, '')])
  expect('the saved date state covers every page', covered)
}

// Speed on a phone: a project page's plain version has the same heading as the app's page, so the page is painted once.
// If someone changes the heading size in Project.tsx, this fails until index.css is changed to match.
{
  const proj = readFileSync(new URL('../src/pages/Project.tsx', import.meta.url), 'utf8')
  const h1 = /<h1 className="([^"]*)"/.exec(proj)?.[1] ?? ''
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const small = /\.pre\[data-kind="project"\] h1 \{ font-size: (\d+)px; line-height: ([\d.]+); letter-spacing: (-?[\d.]+)em/.exec(css)
  const big = /min-width: 768px\) \{ \.pre\[data-kind="project"\] h1 \{ font-size: (\d+)px/.exec(css)
  expect('the plain project heading matches the app heading (phone size, line height, spacing, desktop size)',
    !!small && !!big && h1.includes(`text-[${small[1]}px]`) && h1.includes(`leading-[${small[2]}]`) && h1.includes('tracking-tight') && h1.includes(`md:text-[${big[1]}px]`) && small[3] === '-0.025',
    h1)
  const projPages = all.filter((p) => /^\/(te\/)?projects\/\d+$/.test(p.path))
  const missing = projPages.filter((p) => !p.html.includes('<main class="pre" data-kind="project"'))
  expect('every project page carries the project kind', projPages.length > 1000 && !missing.length, `${projPages.length} pages; missing ${missing.slice(0, 2).map((p) => p.path)}`)
}

if (!ok) { console.log('\nSome checks failed.'); process.exit(1) }
console.log(`\nAll checks passed (${all.length} pages).`)
