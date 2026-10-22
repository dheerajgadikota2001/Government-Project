import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * WHY THIS FILE EXISTS
 *
 * The header, the Contacts and State Facts search bars and the Finances
 * question menu were all written to stay in view while the page scrolls, and
 * none of them did. "overflow-x: hidden" on html and body, there to stop any
 * page scrolling sideways, also made them scroll containers, and a sticky
 * element only sticks inside the box that scrolls. Nothing looked broken; the
 * bars simply scrolled away.
 *
 * The fix: "clip" instead of "hidden" where the browser knows it, the header
 * pinned on computers only (a phone has the bottom bar), and the bars below it
 * placed under the header on computers and at the very top on phones. These
 * checks keep each part of that from quietly coming undone.
 */

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../src')
const read = p => readFileSync(resolve(src, p), 'utf8')

function jsxFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return jsxFiles(p)
    return p.endsWith('.jsx') ? [p] : []
  })
}

test('the page cannot scroll sideways, and sticky bars still stick', () => {
  const css = read('index.css')
  assert.match(css, /html,\s*body\s*\{\s*overflow-x:\s*hidden;\s*\}/,
    'the "hidden" fallback is gone, so a browser without "clip" could scroll sideways')
  assert.match(css, /@supports\s*\(overflow:\s*clip\)\s*\{\s*html,\s*body\s*\{\s*overflow-x:\s*clip;\s*\}\s*\}/,
    'html and body need overflow-x: clip where supported; "hidden" alone stops every sticky bar from sticking')
})

test('the header is pinned on computers only', () => {
  const header = read('components/Layout/Header.jsx')
  const cls = header.match(/<header className="([^"]+)"/)?.[1] || ''
  const tokens = cls.split(/\s+/)
  assert.ok(tokens.includes('lg:sticky') && tokens.includes('lg:top-0'), `header classes: ${cls}`)
  assert.ok(!tokens.includes('sticky'), 'a bare "sticky" pins the header on phones too, over a fifth of a small screen')
})

test('no bar waits 64 px below a header that phones do not pin', () => {
  // On a phone the header scrolls away, so a bar with a bare top-16 leaves a
  // 64 px gap above itself. top-16 belongs behind the lg: prefix, where the
  // header is pinned.
  for (const file of jsxFiles(src)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const tokens = (m[1] ?? m[2]).split(/\s+/)
      if (tokens.includes('sticky') && tokens.includes('top-16')) {
        assert.fail(`${file.slice(src.length + 1)}: "sticky top-16" leaves a gap on phones; use "top-0 lg:top-16"`)
      }
    }
  }
})
