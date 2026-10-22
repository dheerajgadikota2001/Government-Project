// Checks the baked 3D pictures (see scripts/make_posters.py and src/three/posters.ts):
//  - every big work on the first screen has pictures drawn from its current printed share,
//  - every picture file exists (light and dark, phone and desktop) and is small,
//  - the scene code has not changed since the pictures were drawn.
// A work whose pictures are out of date is not wrong on the site (the site only uses a picture whose
// share matches), it just loses its instant picture, so this test is what tells you to redraw them.
// Run: npm run test:posters
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(tmpdir(), `bigworks-${process.pid}.mjs`)
await build({ entryPoints: [join(root, 'src/lib/bigworks.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, alias: { '@': join(root, 'src') }, logLevel: 'error' })
const { bigWorks } = await import(pathToFileURL(out).href)
const gen = readFileSync(join(root, 'src/three/posters.gen.ts'), 'utf8')
const rev = Number(/POSTER_REV = (\d+)/.exec(gen)?.[1])
const scenes = /POSTER_SCENES = '([0-9a-f]+)'/.exec(gen)?.[1]
const listed = [...gen.matchAll(/w(\d+): '([^']+)'/g)].map((m) => [m[1], m[2]])
const posters = Object.fromEntries(listed)

let ok = true
const expect = (name, cond, more = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : more ? `: ${more}` : '')); if (!cond) ok = false }

const missing = [], stale = [], absent = [], big = []
for (const w of bigWorks) {
  const tag = w.drawPct == null ? 'plan' : String(w.drawPct)
  if (!(String(w.id) in posters)) { missing.push(w.id); continue }
  if (posters[String(w.id)] !== tag) { stale.push(`${w.id} (pictures show ${posters[String(w.id)]}, data prints ${tag})`); continue }
  for (const v of ['ln', 'lw', 'dn', 'dw']) {
    const f = join(root, 'public/3d', `r${rev}`, `w${w.id}-${tag}-${v}.webp`)
    if (!existsSync(f)) absent.push(`w${w.id}-${tag}-${v}.webp`)
    else if (statSync(f).size > 90 * 1024) big.push(f)
  }
}
expect(`all ${bigWorks.length} big works have pictures`, !missing.length, `no pictures for work ${missing.join(', ')}`)
expect('every picture was drawn from the current printed share', !stale.length, stale.join('; '))
expect('all four files exist for each work', !absent.length, absent.slice(0, 4).join(', '))
expect('every picture is under 90 KB', !big.length, big.join(', '))
expect('the first picture listed is the first work Home shows', listed[0]?.[0] === String(bigWorks[0]?.id), `first is ${listed[0]?.[0]}, Home opens on ${bigWorks[0]?.id}`)
const dir = join(root, 'public/3d', `r${rev}`)
const used = new Set(bigWorks.map((w) => `w${w.id}-${w.drawPct == null ? 'plan' : String(w.drawPct)}-`))
const extra = existsSync(dir) ? readdirSync(dir).filter((f) => ![...used].some((u) => f.startsWith(u))) : []
expect('no leftover pictures of an old share', !extra.length, extra.slice(0, 4).join(', '))
const now = createHash('sha256')
for (const f of [...readdirSync(join(root, 'src/three/scenes')).filter((f) => f.endsWith('.ts')).sort().map((f) => join(root, 'src/three/scenes', f)), join(root, 'src/three/core.ts')]) now.update(readFileSync(f, 'utf8').replace(/\r/g, ''))
expect('the scene code is the code the pictures were drawn from', now.digest('hex').slice(0, 12) === scenes, 'a 3D scene changed: run scripts/make_posters.py again (and bump REV in it)')
console.log(ok ? '\nAll poster checks passed.' : '\nPoster checks failed.')
process.exit(ok ? 0 : 1)
