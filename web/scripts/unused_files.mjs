// Lists files under src/ that nothing reaches from the app's entry point.
//
// Why a script and not a one-off check: the project copied a design kit of about 150 UI files and
// uses a fraction of them. Anything unused still costs install time, type-checking time and review
// attention, and it hides which pieces the site really depends on. Running this after a change
// shows at once if a file became dead, and `npm run unused` can fail a build that adds dead code.
//
// It follows static imports, import(), side-effect imports and import.meta.glob patterns from the
// entry files, resolving the "@/" alias. Files it cannot prove are used are reported, never deleted
// by this script. Use --json for a machine-readable list.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
// src/lib/seo.ts is an entry too: the pre-renderer (scripts/prerender.mjs) runs it at build time.
const ENTRIES = ['src/main.tsx', 'src/lib/seo.ts'].map((p) => path.join(ROOT, p))
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css']

const all = []
;(function walk(d) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, n.name)
    if (n.isDirectory()) walk(p)
    else all.push(p)
  }
})(SRC)
const allSet = new Set(all)

function resolveSpec(spec, from) {
  let base
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null // a package, not our file
  const tries = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, 'index' + e))]
  return tries.find((t) => allSet.has(t)) ?? null
}

function globToRegex(g) {
  let r = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*' && g[i + 1] === '*') { r += '.*'; i++; if (g[i + 1] === '/') i++ }
    else if (c === '*') r += '[^/]*'
    else if (c === '?') r += '[^/]'
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + r + '$')
}

const seen = new Set()
const queue = [...ENTRIES]
const unresolved = []
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f)) continue
  seen.add(f)
  if (!/\.(tsx?|jsx?|mjs|css)$/.test(f)) continue
  const text = fs.readFileSync(f, 'utf8')
  const specs = new Set()
  for (const m of text.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g)) specs.add(m[1])
  for (const m of text.matchAll(/import\s*['"]([^'"]+)['"]/g)) specs.add(m[1])
  for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1])
  for (const m of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) specs.add(m[1])
  for (const m of text.matchAll(/import\.meta\.glob(?:<[^()]*?>)?\(\s*(\[[^\]]*\]|['"][^'"]+['"])/g)) {
    const pats = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1])
    const neg = pats.filter((p) => p.startsWith('!')).map((p) => globToRegex(p.slice(1)))
    for (const p of pats.filter((p) => !p.startsWith('!'))) {
      const abs = p.startsWith('/') ? path.join(ROOT, p) : p.startsWith('@/') ? path.join(SRC, p.slice(2)) : path.resolve(path.dirname(f), p)
      const re = globToRegex(abs.split(path.sep).join('/'))
      for (const a of all) {
        const x = a.split(path.sep).join('/')
        if (re.test(x) && !neg.some((n) => n.test(path.relative(path.dirname(f), a).split(path.sep).join('/')))) queue.push(a)
      }
    }
  }
  for (const s of specs) {
    const r = resolveSpec(s, f)
    if (r) queue.push(r)
    else if (s.startsWith('.') || s.startsWith('@/')) unresolved.push(`${path.relative(ROOT, f)} -> ${s}`)
  }
}

// Files written for this site and parked, not dead: a 3D scene or component waiting for its page.
// Each stays listed here by name, so parking is a decision someone made, not an accident.
const PARKED = new Set([
  'src/components/CityOfWorks.tsx',
  'src/components/QuestionCards3D.tsx',
  'src/three/scenes/cityworks.ts',
  'src/three/scenes/glasses.ts',
  'src/three/scenes/skyline.ts',
])
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const unused = all.filter((a) => !seen.has(a) && a !== path.join(SRC, 'vite-env.d.ts')).map(rel).filter((p) => !PARKED.has(p)).sort()
const json = process.argv.includes('--json')
if (json) {
  console.log(JSON.stringify({ unused, unresolved }, null, 2))
} else {
  console.log(`${seen.size} of ${all.length} files under src/ are reached from the entry point.`)
  if (unresolved.length) console.log('Imports that did not resolve:\n  ' + unresolved.join('\n  '))
  console.log(`${unused.length} not reached:`)
  for (const u of unused) console.log('  ' + u)
}
process.exit(process.argv.includes('--fail') && unused.length ? 1 : 0)
