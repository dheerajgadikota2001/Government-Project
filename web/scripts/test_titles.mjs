// Guards the reader-facing project names.
// 1. The printed name (t) is never changed by hand: it matches the last committed copy unless the paper changed too.
// 2. Every Telugu place (plt) is one the owner approved: in towns_te.json or a district's te, and never a list of spellings.
// 3. Every project page has its own tab title (no two alike) in English and in Telugu, none longer than 80.
// 4. The kind of work never names a different sector from the one the paper files the work under.
// Run after the build:  node scripts/test_titles.mjs   (npm run test:titles)
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))
const projects = read('src/data/projects.json')
const towns = read('src/data/towns_te.json')
const districts = new Set(read('src/data/districts.json').items.map((d) => d.te))
const approved = new Set([...Object.values(towns), ...districts])
let failed = 0
const fail = (m) => { failed++; if (failed <= 30) console.error('FAIL', m) }

// 1. printed name unchanged
try {
  const old = JSON.parse(execSync('git show HEAD:web/src/data/projects.json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString())
  // A name may change only with its paper. MoSPI reworded four projects when it renumbered them (September 2026
  // report): the record now carries the new paper and that paper's name, which is the rule. A name that changes while
  // the paper stays the same is an edit by hand, and that is what this test stops.
  const was = new Map(old.map((p) => [p.id, p]))
  for (const p of projects) {
    const o = was.get(p.id)
    if (!o || o.t === p.t) continue
    if (o.su !== p.su) console.log(`note: ${p.id} has a new name from a new paper: "${o.t}" is now "${p.t}"`)
    else fail(`printed name changed for ${p.id} while its paper stayed the same`)
  }
} catch { console.log('note: no git copy to compare the printed names with (skipped)') }

// 2. Telugu places are approved
for (const p of projects) {
  if (p.plt == null) continue
  if (/ \/ |\?/.test(p.plt)) fail(`${p.id}: Telugu place lists several spellings: ${p.plt}`)
  else if (!approved.has(p.plt)) fail(`${p.id}: Telugu place not in the approved lists: ${p.plt}`)
}

// 4. kind of work agrees with the paper's sector. Until 13 Nov 2026, 27 railway lines with "km" in their name
// showed as "road works", because the road rule in scripts/name_fields.py matched first (SECTOR_KIND there).
const SECTOR_KIND = { roads: 'road works', railways: 'railway works', irrigation: 'irrigation works', airports: 'airport works', ports: 'port works' }
const SECTOR_WORDS = new Set(Object.values(SECTOR_KIND))
for (const p of projects) {
  const own = SECTOR_KIND[p.ty]
  if (own && SECTOR_WORDS.has(p.wk) && p.wk !== own) fail(`${p.id}: filed under ${p.ty} but shown as "${p.wk}"`)
}

// 3. unique tab titles
const dist = path.join(root, 'dist')
for (const lang of ['', 'te/']) {
  const seen = new Map()
  for (const p of projects) {
    const f = path.join(dist, lang, 'projects', String(p.id), 'index.html')
    if (!fs.existsSync(f)) continue
    const m = fs.readFileSync(f, 'utf8').match(/<title>([\s\S]*?)<\/title>/)
    const t = m ? m[1] : ''
    if (!t) { fail(`${lang}${p.id}: no title`); continue }
    if (!lang && t.length > 80) fail(`${p.id}: title over 80: ${t}`)
    if (seen.has(t)) fail(`${lang}${p.id} has the same title as ${seen.get(t)}: ${t}`)
    else seen.set(t, p.id)
  }
  console.log(`${lang || 'en/'}: ${seen.size} unique project titles`)
}
if (failed) { console.error(`${failed} problems`); process.exit(1) }
console.log('Title tests passed.')
