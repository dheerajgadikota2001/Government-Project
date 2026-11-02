// What a crawler that runs no JavaScript gets from the site (run: npm run test:crawlable, after npm run build).
//
// WHY
// The audit of 2 Nov 2026 read every page as a crawler without JavaScript does. Home was 76 words against
// 2,311 once rendered, the Money page 57 against 1,694; 460 of 730 project pages had no plain link from any
// other page; sitemap dates did not move when pages changed; the median document tab was 94 characters.
// Answer engines, many Bing fetches and WhatsApp previews read only that HTML. These checks keep it fixed.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('..', import.meta.url))
const dist = join(web, 'dist')
let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

const read = (p) => readFileSync(join(dist, p === '/' ? 'index.html' : p.replace(/^\//, '') + '/index.html'), 'utf8')
const rootText = (html) => {
  const m = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<\/body>/) || html.match(/<div id="root">([\s\S]*)$/)
  return (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
const words = (p) => rootText(read(p)).split(' ').filter(Boolean).length

// ---- hubs carry their own words and figures
const HUBS = { '/': 150, '/finances': 600, '/finances/departments': 300, '/state-facts': 1000, '/projects': 600, '/governments': 50 }
for (const [p, min] of Object.entries(HUBS)) {
  for (const lang of ['', '/te']) {
    const path = lang + (p === '/' ? '' : p) || '/'
    const w = words(path)
    expect(`${path} has at least ${Math.round(min * (lang ? 0.7 : 1))} words before any script runs`, w >= min * (lang ? 0.7 : 1), `${w} words`)
  }
}
expect('the Money page shows a debt figure with its stage and paper', /Debt at the end of March \d{4}, as the [^:]+: ₹[\d,.]+ crore \((actual figure|revised estimate|budget estimate)\)\. /.test(rootText(read('/finances'))))
expect('no hub writes a live tender count', !/\d+ open tenders/i.test(rootText(read('/tenders'))))

// ---- every project page is reachable by a plain link from a page that is not a project page
const projectIds = readdirSync(join(dist, 'projects')).filter((d) => /^\d+$/.test(d))
const linked = new Set()
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) { if (!(dir.endsWith('/projects') && /^\d+$/.test(e)) && e !== 'te' && e !== 'assets' && e !== 'share' && e !== '3d') walk(f); continue }
    if (e !== 'index.html') continue
    for (const m of readFileSync(f, 'utf8').matchAll(/href="\/projects\/(\d+)"/g)) linked.add(m[1])
  }
}
walk(dist)
const orphans = projectIds.filter((id) => !linked.has(id))
expect(`every one of the ${projectIds.length} project pages has a plain link from a hub or district page`, orphans.length === 0, orphans.slice(0, 10).join(' '))

// ---- result snippets fit
const descOf = (html) => (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? ''
const titleOf = (html) => ((html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '').replace(/&amp;/g, '&')
const long = []
const longDoc = []
for (const id of projectIds) { const d = descOf(read('/projects/' + id)).replace(/&amp;/g, '&'); if (d.length > 160) long.push(`${id}:${d.length}`) }
for (const slug of readdirSync(join(dist, 'documents'))) {
  if (!existsSync(join(dist, 'documents', slug, 'index.html'))) continue
  const h = read('/documents/' + slug)
  const d = descOf(h).replace(/&amp;/g, '&')
  if (d.length > 160) long.push(`doc ${slug}:${d.length}`)
  if (titleOf(h).length > 80) longDoc.push(`${slug}:${titleOf(h).length}`)
}
expect('project and document descriptions fit a search result (160 characters)', long.length === 0, long.slice(0, 5).join(' '))
expect('document tab titles stay within 80 characters', longDoc.length === 0, `${longDoc.length}: ${longDoc.slice(0, 4).join(' ')}`)

// ---- sitemap dates move with the pages
const state = JSON.parse(readFileSync(join(web, 'seo-lastmod.json'), 'utf8'))
const smap = readFileSync(join(dist, 'sitemap-en.xml'), 'utf8')
const lm = (p) => (smap.match(new RegExp(`<loc>[^<]*${p.replace(/\//g, '\\/')}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1]
expect('the sitemap date of a page is the date saved for it', lm('/projects/160') === state['/projects/160']?.d, `${lm('/projects/160')} vs ${state['/projects/160']?.d}`)
const newest = Object.values(state).map((x) => x.d).sort().at(-1)
expect('the sitemap index carries the newest page date', readFileSync(join(dist, 'sitemap.xml'), 'utf8').includes(`<lastmod>${newest}</lastmod>`), newest)

if (!ok) { console.log('\nSome crawlable checks failed.'); process.exit(1) }
console.log('\nAll crawlable checks passed.')
