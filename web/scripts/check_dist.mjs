// Run by Firebase just before every deploy (the "predeploy" step in firebase.web.json), and by hand:
//   node web/scripts/check_dist.mjs [folder]
// It refuses a deploy of a build that is missing its pre-rendered pages. On 22 Oct 2026 a build on
// Windows stopped after `vite build` (the pre-render step refused a CRLF index.html), left only the
// empty shell in web/dist, and that went to the preview and nearly to the live site: every address but
// the home page answered 404. Nothing is deployed unless every check here passes.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = process.argv[2] ?? join(root, 'dist')
const problems = []
const count = (dir, name) => {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) n += count(p, name)
    else if (e.name === name) n++
  }
  return n
}
if (!existsSync(join(dist, 'index.html'))) problems.push(`${dist} has no index.html: run npm run build in web first`)
else {
  const pages = count(dist, 'index.html')
  if (pages < 1000) problems.push(`only ${pages} pages in ${dist} (a full build has about 1618). The pre-render step did not run or did not finish: read the output of npm run build above the last line.`)
  const home = readFileSync(join(dist, 'index.html'), 'utf8')
  if (!home.includes('class="pre"')) problems.push('the home page has no pre-rendered content')
  if (home.includes('\r')) problems.push('the home page has CRLF line endings: the security hash of its theme script will not match')
  for (const f of ['404.html', 'sitemap.xml', 'robots.txt']) if (!existsSync(join(dist, f))) problems.push(`${f} is missing`)
  const pics = existsSync(join(dist, '3d')) ? readdirSync(join(dist, '3d')).flatMap((d) => readdirSync(join(dist, '3d', d))).length : 0
  if (pics < 60) problems.push(`only ${pics} 3D pictures in dist/3d (expected 60)`)
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest', 'share/default.png']) if (!existsSync(join(dist, f))) problems.push(`${f} is missing (icons and the app manifest)`)
  if (!home.includes('rel="manifest"')) problems.push('the home page does not link the app manifest')
  // Every project, district and daily page has its own share picture, and the file it names is there. A page whose
  // picture is not drawn falls back to the default; that is allowed only on purpose (SHARE_CARDS_OPTIONAL=1).
  {
    let plain = 0, dead = 0, own = 0
    for (const base of ['projects', 'districts', 'paper', 'te/projects', 'te/districts', 'te/paper']) {
      const dir = join(dist, base)
      if (!existsSync(dir)) continue
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, e.name, 'index.html')
        if (!e.isDirectory() || !existsSync(f)) continue
        const src = /<meta property="og:image" content="[^"]*\/share\/([^"]+)">/.exec(readFileSync(f, 'utf8'))?.[1]
        if (!src || src === 'default.png') plain++
        else if (!existsSync(join(dist, 'share', src))) dead++
        else own++
      }
    }
    if (dead) problems.push(`${dead} pages name a share picture that is not in dist/share`)
    if (plain && !process.env.SHARE_CARDS_OPTIONAL) problems.push(`${plain} pages have no picture of their own yet (${own} do). Run: npm run cards, then npm run build. To deploy anyway, set SHARE_CARDS_OPTIONAL=1.`)
    else if (plain) console.warn(`Note: ${plain} pages show the default share picture (SHARE_CARDS_OPTIONAL is set).`)
  }
  if (statSync(join(dist, 'index.html')).size < 5000) problems.push('the home page is only the empty shell')
}
if (problems.length) {
  console.error('\nDo not deploy this build:\n - ' + problems.join('\n - ') + '\n')
  process.exit(1)
}
console.log('dist looks complete: safe to deploy.')
