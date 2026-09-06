#!/usr/bin/env node
/**
 * Catches layout regressions before a person does.
 *
 * Written after two of them shipped in one afternoon:
 *
 *   1. Mobile fixes were verified only at 390px, so a desktop-only collision
 *      survived and was reported back within minutes.
 *   2. A `min-w-[9rem]` fix compiled, deployed, and did nothing, because a
 *      global `.flex > * { min-width: 0 }` later in the sheet silently beat it.
 *      Nobody checked the rendered result, only the source.
 *
 * Both are the same mistake — trusting the diff instead of the rendered page.
 * So this drives a real browser at a phone width and a desktop width, and fails
 * on the four things that actually went wrong:
 *
 *   - the page scrolls sideways
 *   - a text node is squeezed so narrow it reads one letter per line
 *   - an icon renders as its literal ligature name (the LIGHTBULB bug)
 *   - the floating action button sits on top of real text
 *
 * Usage — needs a server already running (npm run preview):
 *     node scripts/layout-audit.mjs
 *     node scripts/layout-audit.mjs --base http://127.0.0.1:4173
 *
 * Exits non-zero on any finding, so it can gate a deploy.
 *
 * NOTE: pages that render nothing without an API are reported as SKIPPED rather
 * than passing. A page that renders no elements cannot fail these checks, and
 * silently counting that as a pass is how a broken page gets a green tick.
 */
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const BASE = arg('--base', 'http://127.0.0.1:4173')
const WIDTHS = [
  { label: 'phone', width: 390, height: 844, isMobile: true },
  { label: 'desktop', width: 1440, height: 900, isMobile: false },
]
const ROUTES = [
  '/', '/projects', '/investments', '/finances',
  '/governments', '/documents', '/school-education',
]

// Ligature names leak onto the page when an icon is missing from the subset
// font. They are always lowercase words joined by underscores, sitting alone in
// an element — real copy never looks like that.
const LIGATURE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/

const findings = []
const note = (route, width, kind, detail) =>
  findings.push({ route, width, kind, detail })

async function audit(page, route, view) {
  const url = BASE + route
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })
  } catch {
    note(route, view.label, 'LOAD', 'page did not finish loading')
    return
  }
  await page.waitForTimeout(1200)

  const r = await page.evaluate((vw) => {
    const out = { rendered: 0, sideways: false, scrollWidth: 0, squeezed: [], literal: [], covered: [] }
    const doc = document.documentElement
    out.scrollWidth = doc.scrollWidth
    out.sideways = doc.scrollWidth > doc.clientWidth + 1
    out.rendered = document.querySelectorAll('main *').length

    // The floating action button, so we can test what it sits on top of.
    // Its own icon is inside it by definition, so the element is kept as well
    // as its box — otherwise every run reports the button covering itself.
    let fab = null, fabEl = null
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' || parseInt(cs.zIndex || 0) < 50) continue
      // A faded-out button covers nothing a reader can see. Without this the
      // audit reports overlaps against an invisible element and never goes
      // green, which trains everyone to ignore it.
      if (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width > 40 && b.width < 90 && b.height > 40) { fab = b; fabEl = el }
    }

    const pageScrolls = doc.scrollHeight > window.innerHeight + 8
    const pinned = el => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return false
    }

    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue

      const leaf = el.children.length === 0
      const text = (el.textContent || '').trim()

      // One letter per line: tall, far too narrow for its content.
      if (leaf && text.length > 3 && box.width < 26 && box.height > 40) {
        out.squeezed.push({ w: Math.round(box.width), h: Math.round(box.height), text: text.slice(0, 30) })
      }

      // An icon that never made it into the font shows its own name.
      if (leaf && /material-symbols/.test(el.className || '') === false &&
          text.length > 5 && text.length < 30 && /^[a-z0-9_]+$/.test(text)) {
        out.literal.push(text)
      }

      // Real words underneath the floating button — not its own label, and
      // not text the reader can simply scroll out from under it.
      //
      // A fixed button sits over SOMETHING at every scroll position; reporting
      // that is noise, and an audit that can never go green is one everyone
      // learns to ignore. So this only fires when the reader is stuck with it:
      // the page cannot scroll, or the text itself is pinned (fixed/sticky)
      // and therefore travels under the button wherever they go.
      if (fab && leaf && text.length > 8 && !(fabEl && fabEl.contains(el))) {
        const hit = !(box.right < fab.left || box.left > fab.right ||
                      box.bottom < fab.top || box.top > fab.bottom)
        if (hit && (!pageScrolls || pinned(el))) out.covered.push(text.slice(0, 40))
      }
    }
    return out
  }, view.width)

  // A page with no content cannot fail these checks — say so rather than pass it.
  if (r.rendered < 5) {
    note(route, view.label, 'SKIPPED', `only ${r.rendered} elements rendered (API down or empty database?)`)
    return
  }
  if (r.sideways) note(route, view.label, 'OVERFLOW', `page scrolls sideways (${r.scrollWidth}px > ${view.width}px)`)
  for (const s of r.squeezed.slice(0, 3))
    note(route, view.label, 'SQUEEZED', `${s.w}x${s.h}px — "${s.text}"`)
  for (const t of [...new Set(r.literal)].filter(t => LIGATURE.test(t)).slice(0, 3))
    note(route, view.label, 'ICON', `"${t}" rendered as text — missing from the subset font`)
  for (const c of [...new Set(r.covered)].slice(0, 2))
    note(route, view.label, 'UNDER-FAB', `"${c}"`)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
try {
  for (const view of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      isMobile: view.isMobile,
      hasTouch: view.isMobile,
      deviceScaleFactor: view.isMobile ? 2 : 1,
    })
    const page = await ctx.newPage()
    for (const route of ROUTES) await audit(page, route, view)
    await ctx.close()
  }
} finally {
  await browser.close()
}

const problems = findings.filter(f => f.kind !== 'SKIPPED')
const skipped = findings.filter(f => f.kind === 'SKIPPED')

console.log(`\nlayout audit — ${ROUTES.length} routes x ${WIDTHS.length} widths against ${BASE}\n`)
if (skipped.length) {
  console.log(`  ${skipped.length} check(s) skipped — no content to test:`)
  for (const s of skipped) console.log(`    ${s.width.padEnd(8)} ${s.route.padEnd(20)} ${s.detail}`)
  console.log('')
}
if (!problems.length) {
  console.log('  no layout problems found\n')
  process.exit(0)
}
for (const f of problems) {
  console.log(`  ${f.kind.padEnd(10)} ${f.width.padEnd(8)} ${f.route.padEnd(20)} ${f.detail}`)
}
console.log(`\n  ${problems.length} problem(s) found\n`)
process.exit(1)
