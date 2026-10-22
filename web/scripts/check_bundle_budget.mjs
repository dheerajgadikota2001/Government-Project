// Bundle budget for the site build (web/dist). Run after `vite build`; exits 1 when over budget.
//
// Why a gate and not a habit: the first screen got slow once already because the whole data
// register slipped into the main script through one import. A number checked on every build
// catches that the day it happens, not when a reader on a village network gives up.
//
// What it measures, gzip level 9 (close to what Firebase serves; Brotli is a little smaller):
//   - the entry set: the script index.html loads plus every script it modulepreloads. This is
//     what a first visit must download before anything can run. Budget: 200 KB.
//   - every other chunk on its own. Budget: 150 KB. three.js and the 3D scenes are exempt:
//     they load only when a model comes near the screen, never on the first screen.
//
// Usage: node scripts/check_bundle_budget.mjs [distDir]

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = process.argv[2] ?? 'dist'
const ENTRY_BUDGET_KB = 200
const CHUNK_BUDGET_KB = 150
// three.js itself and the scene modules, which live under src/three/ and load next to a model.
const EXEMPT = /^(three|dam|apmap|money|works|cityworks|skyline|glasses|bhogapuram|common|core|kit|labels|textures|explore-state|View3D|Explore3D)-/

const kb = (n) => Math.round(n / 1024)
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entry = new Set()
for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+\.js)"/g)) entry.add(m[1])
for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)) entry.add(m[1])
if (!entry.size) {
  console.error('No entry script found in index.html; is this a site build (not SINGLE=1)?')
  process.exit(1)
}

const assets = join(DIST, 'assets')
const rows = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, raw: statSync(join(assets, f)).size, gz: gz(join(assets, f)), entry: entry.has(f), exempt: EXEMPT.test(f) }))
  .sort((a, b) => b.gz - a.gz)

const entryGz = rows.filter((r) => r.entry).reduce((s, r) => s + r.gz, 0)
const entryRaw = rows.filter((r) => r.entry).reduce((s, r) => s + r.raw, 0)
const over = rows.filter((r) => !r.entry && !r.exempt && kb(r.gz) > CHUNK_BUDGET_KB)

const pad = (s, n) => String(s).padEnd(n)
const lpad = (s, n) => String(s).padStart(n)
console.log(pad('chunk', 44) + lpad('raw KB', 8) + lpad('gz KB', 8) + '  note')
for (const r of rows.slice(0, 30)) {
  const note = r.entry ? 'first screen' : r.exempt ? '3D, loads near a model' : kb(r.gz) > CHUNK_BUDGET_KB ? 'OVER BUDGET' : ''
  console.log(pad(r.f, 44) + lpad(kb(r.raw), 8) + lpad(kb(r.gz), 8) + '  ' + note)
}
if (rows.length > 30) console.log(`... and ${rows.length - 30} smaller chunks`)
console.log('')
console.log(`First screen (entry set of ${entry.size} files): ${kb(entryRaw)} KB raw, ${kb(entryGz)} KB gz. Budget ${ENTRY_BUDGET_KB} KB gz.`)

let fail = false
if (kb(entryGz) > ENTRY_BUDGET_KB) { console.error(`FAIL: the first screen is ${kb(entryGz)} KB gz, over ${ENTRY_BUDGET_KB} KB.`); fail = true }
for (const r of over) { console.error(`FAIL: ${r.f} is ${kb(r.gz)} KB gz, over ${CHUNK_BUDGET_KB} KB.`); fail = true }
if (!fail) console.log('Budget OK.')
process.exit(fail ? 1 : 0)
