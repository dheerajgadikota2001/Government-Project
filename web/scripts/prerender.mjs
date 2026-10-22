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
import { build } from 'esbuild'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

// fileURLToPath, not URL.pathname: on Windows .pathname is "/C:/...", which no file call understands.
const WEB = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(WEB, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist')
const TEMPLATE = join(DIST, 'index.html')
if (!existsSync(TEMPLATE)) { console.error('No dist/index.html. Run vite build first.'); process.exit(1) }

// The page list is TypeScript that imports the site's data; esbuild turns it into one module.
const mod = join(WEB, 'node_modules/.cache', `seo-${process.pid}.mjs`)
await build({
  entryPoints: [join(WEB, 'src/lib/seo.ts')], outfile: mod, bundle: true, format: 'esm', platform: 'node',
  alias: { '@': join(WEB, 'src') }, external: ['react'], logLevel: 'warning',
  define: { 'import.meta.env.VITE_ROUTES': '"path"', 'import.meta.env.VITE_API_URL': 'undefined' },
})
const seo = await import(pathToFileURL(mod).href)   // a bare C:\\ path is not an import specifier on Windows
rmSync(mod, { force: true })

const pages = seo.allPages()
const projects = pages.filter((p) => p.path.startsWith('/projects/'))
if (projects.length < 100) { console.error(`Only ${projects.length} project pages: the register looks empty. Nothing written.`); process.exit(1) }

const ORIGIN = seo.ORIGIN
const LANGS = ['en', 'te']
const at = (path, lang) => (lang === 'te' ? (path === '/' ? '/te' : '/te' + path) : path)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SITE = { en: 'AP Fact Check', te: 'ఏపీ ఫ్యాక్ట్ చెక్' }
const full = (t, lang) => (t[lang].startsWith(SITE[lang]) ? t[lang] : `${t[lang]} | ${SITE[lang]}`)

const template = readFileSync(TEMPLATE, 'utf8')
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

function head(p, lang, { noindex = false } = {}) {
  const url = ORIGIN + at(p.path, lang)
  const tags = [
    `<meta name="description" content="${esc(p.description[lang])}">`,
    noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`,
    ...(noindex ? [] : [
      `<link rel="alternate" hreflang="en" href="${ORIGIN + at(p.path, 'en')}">`,
      `<link rel="alternate" hreflang="te" href="${ORIGIN + at(p.path, 'te')}">`,
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN + at(p.path, 'en')}">`,
    ]),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SITE[lang])}">`,
    `<meta property="og:title" content="${esc(p.title[lang])}">`,
    `<meta property="og:description" content="${esc(p.description[lang])}">`,
    `<meta property="og:locale" content="${lang === 'te' ? 'te_IN' : 'en_IN'}">`,
    noindex ? '' : `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary">`,
  ].filter(Boolean)
  if (!noindex) {
    const crumbs = [{ name: lang === 'te' ? 'హోమ్' : 'Home', path: '/' }, ...(p.trail ?? []).map((t) => ({ name: t.name[lang], path: t.path })), { name: p.title[lang], path: p.path }]
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': url, url, name: p.title[lang], description: p.description[lang], inLanguage: lang, dateModified: p.lastmod, isPartOf: { '@type': 'WebSite', name: SITE.en, url: ORIGIN + '/' } },
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
  return `<main class="pre" lang="${lang}">
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
    .replace('<title>AP Fact Check</title>', `<title>${esc(full(p.title, lang))}</title>\n    ${head(p, lang, opts)}`)
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

console.log(`Pre-rendered ${files} pages (${pages.length} addresses in English and Telugu), 404.html, sitemaps and robots.txt.`)
