// Writes a real HTML file for every page, in English and Telugu, after `vite build`.
// Also writes the sitemaps, robots.txt and the 404 page. Run by `npm run build`.
//
// Why: see the top of src/lib/seo.ts. In short, link previews, answer engines and slow phones all
// read the HTML before (or instead of) running the script, and that HTML used to be an empty <div>.
//
// What each file holds: the page's own title and description, its canonical address and its other
// language's address, Open Graph tags for link previews, a little structured data, and inside the
// app's root element the heading and the facts with their sources. The app replaces that body when
// its script runs; until then (and for anything that never runs it) the facts are readable.
//
// Every address the app can link to gets a file. Firebase then serves 404.html, with a real 404
// status, for anything else, instead of the home page for every typo (firebase.web.json).
//
// It refuses to write anything when the register looks empty, because hundreds of empty pages
// published with confidence are worse than none.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyLastmod, serialise } from './lastmod.mjs'
import { loadSeo } from './load-seo.mjs'
import { CARD_DIR, cardsFor } from './share-spec.mjs'

// fileURLToPath, not URL.pathname: on Windows .pathname is "/C:/...", which no file call understands.
const WEB = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(WEB, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist')
const TEMPLATE = join(DIST, 'index.html')
if (!existsSync(TEMPLATE)) { console.error('No dist/index.html. Run vite build first.'); process.exit(1) }

// The page list is TypeScript that imports the site's data (scripts/load-seo.mjs turns it into one module).
const seo = await loadSeo(WEB)

// Dates: a page's "last changed" moves only when what it shows moves (see scripts/lastmod.mjs). The state file
// is committed with the code, so every machine that builds gives the same dates.
const STATE = join(WEB, 'seo-lastmod.json')
const lastState = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const dated = applyLastmod(seo.allPages(), lastState, seo.TODAY)
const pages = dated.pages
{
  const text = serialise(dated.next)
  if (!existsSync(STATE) || readFileSync(STATE, 'utf8').replace(/\r\n?/g, '\n') !== text) writeFileSync(STATE, text)
}
const projects = pages.filter((p) => p.path.startsWith('/projects/'))
if (projects.length < 100) { console.error(`Only ${projects.length} project pages: the register looks empty. Nothing written.`); process.exit(1) }

const ORIGIN = seo.ORIGIN
const LANGS = ['en', 'te']
const at = (path, lang) => (lang === 'te' ? (path === '/' ? '/te' : '/te' + path) : path)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SITE = { en: 'AP Fact Check', te: 'ఏపీ ఫ్యాక్ట్ చెక్' }
const SHARE_ALT = { en: 'AP Fact Check: Andhra Pradesh, from its own papers', te: 'ఏపీ ఫ్యాక్ట్ చెక్: ఆంధ్రప్రదేశ్, ప్రభుత్వ పత్రాల్లోనే' }
const full = (t, lang) => (t[lang].startsWith(SITE[lang]) ? t[lang] : `${t[lang]} | ${SITE[lang]}`)

// Line endings are made LF here. On Windows git checks index.html out with CRLF, and the browser hashes the
// inline script exactly as served: a CRLF script has a different hash from the one in the CSP
// (firebase.web.json), so the theme script would be blocked. The pages are always written with LF.
const template = readFileSync(TEMPLATE, 'utf8').replace(/\r\n?/g, '\n')
if (!template.includes('<title>AP Fact Check</title>') || !template.includes('<div id="root"></div>')) {
  console.error('dist/index.html does not have the expected <title> and empty root. Nothing written.')
  process.exit(1)
}

// The CSP is enforced: an inline script whose hash is not in firebase.web.json does not run in the
// browser (the theme would flash, silently). Checked here, on the machine that builds, so a changed
// index.html or a line-ending change fails the build instead of the live site.
{
  const fb = readFileSync(join(WEB, '..', 'firebase.web.json'), 'utf8')
  const missing = [...template.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => 'sha256-' + createHash('sha256').update(m[1]).digest('base64'))
    .filter((h) => !fb.includes(`'${h}'`))
  if (missing.length) {
    console.error(`An inline script in index.html is not allowed by the CSP in firebase.web.json: ${missing.join(', ')}. Add the hash there. Nothing written.`)
    process.exit(1)
  }
}

// Home opens on the first big work's 3D picture. Telling the browser about it in the HTML lets it
// fetch the picture while the script is still arriving (see src/three/posters.ts). The hint covers the
// two shapes (phone, desktop) in the viewer's system theme; a reader who chose a theme by hand gets
// the right picture a moment later, from the script.
const posterHints = (() => {
  const gen = readFileSync(join(WEB, 'src/three/posters.gen.ts'), 'utf8')
  const rev = /POSTER_REV = (\d+)/.exec(gen)?.[1]
  const first = /w(\d+): '([^']+)'/.exec(gen)
  if (!rev || !first) return []
  const base = `/3d/r${rev}/w${first[1]}-${first[2]}`
  return [['light', 'l'], ['dark', 'd']].flatMap(([scheme, t]) => [['(max-width: 525px)', 'n'], ['(min-width: 526px)', 'w']].map(([w, shape]) =>
    `<link rel="preload" as="image" type="image/webp" fetchpriority="high" href="${base}-${t}${shape}.webp" media="(prefers-color-scheme: ${scheme}) and ${w}">`))
})()

// Who the site is, for the search engines and answer engines that read the home page. Only what is true and
// already public on the site: its name, address, logo and languages. No social profiles are claimed.
function siteNodes(lang) {
  return [
    {
      '@type': 'WebSite', '@id': ORIGIN + '/#website', url: ORIGIN + '/', name: SITE.en,
      alternateName: [SITE.te], inLanguage: ['en', 'te'], publisher: { '@id': ORIGIN + '/#org' },
    },
    {
      '@type': 'Organization', '@id': ORIGIN + '/#org', name: SITE.en, alternateName: SITE.te, url: ORIGIN + '/',
      logo: { '@type': 'ImageObject', url: ORIGIN + '/icon-512.png', width: 512, height: 512 },
      description: seo.siteDescription[lang],
    },
  ]
}

// Share pictures: each page with a card gets its own picture when it has been drawn (scripts/make_cards.py, npm run cards);
// otherwise it shows the site's default picture and the build says how many did. Only the pictures the pages name are
// copied into dist, so a stale one in the cache is never published.
const cardOf = new Map()   // "path|lang" -> { file, title } for pictures that exist
let cardsWanted = 0
{
  mkdirSync(join(DIST, 'share'), { recursive: true })
  for (const c of cardsFor(pages, WEB)) {
    cardsWanted++
    const from = join(CARD_DIR(WEB), c.file)
    if (!existsSync(from)) continue
    copyFileSync(from, join(DIST, 'share', c.file))
    cardOf.set(`${c.path}|${c.lang}`, { file: c.file, title: c.spec.title })
  }
}
const imageOf = (p, lang) => {
  const c = cardOf.get(`${p.path}|${lang}`)
  return c ? { src: `${ORIGIN}/share/${c.file}`, alt: `${c.title}. ${SITE[lang]}` } : { src: `${ORIGIN}/share/default.png`, alt: SHARE_ALT[lang] }
}

function head(p, lang, { noindex = false } = {}) {
  const img = imageOf(p, lang)
  const url = ORIGIN + at(p.path, lang)
  const tab = (p.tabTitle ?? p.title)[lang]   // short enough for a search result; the heading keeps the full words
  const tags = [
    `<meta name="description" content="${esc(p.description[lang])}">`,
    // max-image-preview:large lets Google show the share picture at full size (Discover, rich results).
    noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="max-image-preview:large">',
    ...(noindex ? [] : [`<link rel="canonical" href="${url}">`]),
    ...(noindex ? [] : [
      `<link rel="alternate" hreflang="en" href="${ORIGIN + at(p.path, 'en')}">`,
      `<link rel="alternate" hreflang="te" href="${ORIGIN + at(p.path, 'te')}">`,
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN + at(p.path, 'en')}">`,
    ]),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SITE[lang])}">`,
    `<meta property="og:title" content="${esc(tab)}">`,
    `<meta property="og:description" content="${esc(p.description[lang])}">`,
    `<meta property="og:locale" content="${lang === 'te' ? 'te_IN' : 'en_IN'}">`,
    noindex ? '' : `<meta property="og:url" content="${url}">`,
    // A page with figures of its own has its own picture; every other page, and any whose picture is not drawn yet,
    // shows the site's default, so a shared link never appears as bare text.
    `<meta property="og:image" content="${img.src}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(img.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${img.src}">`,
    ...(p.path === '/' && !noindex ? posterHints : []),
  ].filter(Boolean)
  if (!noindex) {
    const crumbs = [{ name: lang === 'te' ? 'హోమ్' : 'Home', path: '/' }, ...(p.trail ?? []).map((t) => ({ name: t.name[lang], path: t.path })), { name: tab, path: p.path }]
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': url, url, name: tab, description: p.description[lang], inLanguage: lang, dateModified: p.lastmod, isPartOf: { '@type': 'WebSite', name: SITE.en, url: ORIGIN + '/' } },
        ...(p.path === '/' ? siteNodes(lang) : []),
        ...(p.ld ?? []),
        ...(p.path === '/' ? [] : [{ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: ORIGIN + at(c.path, lang) })) }]),
      ],
    }
    // "<" is escaped so no text in the data can close the script element.
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`)
  }
  return tags.join('\n    ')
}

function line(l, lang) {
  const t = esc(l.text[lang])
  if (!l.href) return `<li>${t}</li>`
  const href = l.external ? l.href : at(l.href, lang)
  return `<li><a href="${esc(href)}"${l.external ? ' rel="noopener" target="_blank"' : ''}>${t}</a></li>`
}

function body(p, lang) {
  const other = lang === 'te' ? 'en' : 'te'
  const nav = seo.footerLinks.map((l) => `<a href="${at(l.href, lang)}">${esc(l.text[lang])}</a>`).join(' · ')
  // A project page's plain version gets the same heading size as the app's page (see index.css), so a phone does not
  // see a small heading replaced by a bigger one: that second, bigger paint is what Google counts as the load time.
  // Measured on 10 project pages (4G phone, slow CPU): the load time stays at the first paint, 1.2 to 2.3 s, instead of 4.3 s.
  // Other pages are left alone: their app content differs from this text, so matching one heading did not help.
  const kind = /^\/projects\/\d+$/.test(p.path) ? ' data-kind="project"' : ''
  return `<main class="pre"${kind} lang="${lang}">
      <p class="pre-site"><a href="${at('/', lang)}">${esc(SITE[lang])}</a> · <a href="${at(p.path, other)}" lang="${other}" hreflang="${other}">${other === 'te' ? 'తెలుగు' : 'English'}</a></p>
      <h1>${esc(p.title[lang])}</h1>
      <p class="pre-lede">${esc(p.description[lang])}</p>
      ${p.lines.length ? `<ul>${p.lines.map((l) => line(l, lang)).join('')}</ul>` : ''}
      <p class="pre-note">${lang === 'te' ? 'పూర్తి పేజీ లోడ్ అవుతోంది. ప్రతి అంకె ప్రభుత్వ పత్రం నుంచే.' : 'The full page is loading. Every number here is from a government paper.'}</p>
      <nav class="pre-nav">${nav}</nav>
    </main>`
}

function render(p, lang, opts) {
  return template
    .replace('<html lang="en">', `<html lang="${lang}">`)
    .replace('<title>AP Fact Check</title>', `<title>${esc(full(p.tabTitle ?? p.title, lang))}</title>\n    ${head(p, lang, opts)}`)
    .replace('<div id="root"></div>', `<div id="root">${body(p, lang)}</div>`)
}

// Home's English page is index.html itself, so the root address and every cached shell hold it.
let files = 0
for (const p of pages) {
  for (const lang of LANGS) {
    const where = at(p.path, lang)
    const file = where === '/' ? join(DIST, 'index.html') : join(DIST, where, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, render(p, lang))
    files++
  }
}
// The 404 page is the app too: its script shows the "not here" page, in the reader's language.
writeFileSync(join(DIST, '404.html'), render(seo.notFoundPage, 'en', { noindex: true }))

/* ------------------------------------------------------------------ sitemaps and robots.txt */
const NOTE = '<!-- Written by web/scripts/prerender.mjs at build time, from the same page list as the pages. -->'
for (const lang of LANGS) {
  const urls = pages.map((p) => `  <url>
    <loc>${ORIGIN + at(p.path, lang)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN + at(p.path, 'en')}"/>
    <xhtml:link rel="alternate" hreflang="te" href="${ORIGIN + at(p.path, 'te')}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN + at(p.path, 'en')}"/>
  </url>`).join('\n')
  writeFileSync(join(DIST, `sitemap-${lang}.xml`), `<?xml version="1.0" encoding="UTF-8"?>\n${NOTE}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`)
}
const newest = pages.reduce((m, p) => (p.lastmod > m ? p.lastmod : m), '')
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n${NOTE}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${LANGS.map((l) => `  <sitemap>\n    <loc>${ORIGIN}/sitemap-${l}.xml</loc>\n    <lastmod>${newest}</lastmod>\n  </sitemap>`).join('\n')}\n</sitemapindex>\n`)
writeFileSync(join(DIST, 'robots.txt'), `# Public data site. Everything here may be crawled and indexed.
#
# /api/ is NOT blocked on purpose. Blocking it also stops a search engine's renderer from fetching the
# live data a page shows, and the page then looks broken to it. The API keeps its JSON out of search
# results itself, with an "X-Robots-Tag: noindex" header on every answer.
User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`)

console.log(`Share pictures: ${cardOf.size} of ${cardsWanted} pages with figures have their own picture${cardOf.size < cardsWanted ? `; the other ${cardsWanted - cardOf.size} show the default. Run: npm run cards` : ''}.`)
console.log(`Pre-rendered ${files} pages (${pages.length} addresses in English and Telugu), 404.html, sitemaps and robots.txt.`)
