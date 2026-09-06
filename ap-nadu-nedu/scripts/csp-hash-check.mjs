// Fails the build if the inline font-boot script in index.html no longer
// matches the sha256 allowed by the Content-Security-Policy in firebase.json.
//
// The policy is report-only today, so a drift would only produce console
// reports. The day it is enforced, a drift would stop the language fonts
// loading for every visitor at once. Catching it here costs nothing.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(resolve(here, '../dist/index.html'), 'utf8')
const firebase = JSON.parse(readFileSync(resolve(here, '../../firebase.json'), 'utf8'))

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
const hashes = inline.map(s => 'sha256-' + createHash('sha256').update(s, 'utf8').digest('base64'))

const csp = (firebase.hosting.headers || []).flatMap(h => h.headers)
  .find(h => /Content-Security-Policy/.test(h.key))?.value || ''
const allowed = [...csp.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map(m => m[0].slice(1, -1))

const missing = hashes.filter(h => !allowed.includes(h))
if (missing.length) {
  console.error('csp: inline script hash not in firebase.json:')
  missing.forEach(h => console.error('   ', h))
  console.error('    Update the sha256 in the Content-Security-Policy header, or move the script to a file.')
  process.exit(1)
}
console.log(`csp: ${hashes.length} inline script hash(es) match firebase.json`)
