#!/usr/bin/env node
/**
 * Guards the shipped icon-font subset. Runs automatically before every build
 * (`prebuild` in package.json); needs no network and no dependencies.
 *
 * The font shipped to visitors contains only the icons the source referenced at
 * the time it was generated (see scripts/icon-font.py). Add an icon to a page
 * and forget to regenerate, and it renders as its literal name — "location_on"
 * as plain text in the middle of the UI, which is exactly the bug this guard was
 * written after finding in production. So the build stops here instead.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const MANIFEST = join(SRC, 'fonts', 'icons.generated.json')
const FONT = join(SRC, 'fonts', 'material-symbols-subset.woff2')

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (['.jsx', '.js'].includes(extname(p))) out.push(p)
  }
  return out
}

// Kept deliberately identical to the extraction in scripts/icon-font.py; if one
// side learns about a new way of writing an icon, teach the other too. A span
// body may be a ternary (`{menuOpen ? 'close' : 'menu'}`), so every quoted
// string inside it counts — quoting is what tells an icon name apart from a
// variable like `menuOpen`.
const SPAN = /class(?:Name)?="[^"]*material-symbols-outlined[^"]*"[^>]*>([\s\S]*?)<\/span>/g
const QUOTED = /['"]([a-z][a-z0-9_]{2,})['"]/g
const BARE = /^[a-z][a-z0-9_]{2,}$/
const PROP = /\bicon\s*[:=]\s*['"]([a-z][a-z0-9_]{2,})['"]/g

const used = new Set()
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8')
  for (const [, body] of text.matchAll(SPAN)) {
    const inner = body.trim()
    if (!inner.includes('{')) {
      if (BARE.test(inner)) used.add(inner)
      continue
    }
    // In a ternary the condition can hold quoted values that are not icons
    // (`filters.order === 'asc' ? 'arrow_upward' : ...`), so only the branches —
    // everything after the first `?` — are read.
    const branches = inner.includes('?') ? inner.slice(inner.indexOf('?') + 1) : inner
    for (const m of branches.matchAll(QUOTED)) used.add(m[1])
  }
  for (const m of text.matchAll(PROP)) used.add(m[1])
}

const fail = (msg) => {
  console.error(`\n  icons: ${msg}\n         Fix with:  python scripts/icon-font.py\n`)
  process.exit(1)
}

if (!existsSync(FONT) || !existsSync(MANIFEST)) fail('the icon subset has not been generated.')

const shipped = new Set(JSON.parse(readFileSync(MANIFEST, 'utf8')).icons)
const missing = [...used].filter((i) => !shipped.has(i))
if (missing.length) fail(`these icons are used but not in the shipped font: ${missing.join(', ')}`)
