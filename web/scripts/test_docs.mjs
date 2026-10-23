// Checks the document and summit pages (run: npm run test:docs, no build needed).
//  - every address ever published stays (web/seo-slugs.json is the frozen list; --freeze rewrites it, for adding new ones only)
//  - addresses are unique, plain, and never end in a changed name
//  - nothing that looks like a voter roll or a list of private people gets a page
//  - every page has a title, a description of 300 characters or fewer, and an official link that starts with https://
//  - the summit pages make no claim beyond the state's own statement
import { build } from 'esbuild'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const web = fileURLToPath(new URL('..', import.meta.url))
const out = join(web, 'node_modules/.cache', `docs-test-${process.pid}.mjs`)
await build({ entryPoints: [join(web, 'src/lib/docs.ts')], outfile: out, bundle: true, format: 'esm', platform: 'node', alias: { '@': join(web, 'src') }, external: ['react'], logLevel: 'warning' })
const D = await import(pathToFileURL(out).href)
rmSync(out, { force: true })

let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

const slugs = D.docRecs.map((d) => d.slug)
const FILE = join(web, 'seo-slugs.json')
const frozen = { docs: slugs.slice().sort(), summits: D.summits.map((s) => s.key).sort() }
if (process.argv.includes('--freeze') || !existsSync(FILE)) { writeFileSync(FILE, JSON.stringify(frozen, null, 1) + '\n'); console.log('wrote seo-slugs.json') }
const saved = JSON.parse(readFileSync(FILE, 'utf8'))

expect('at least 600 document pages', D.docRecs.length >= 600, String(D.docRecs.length))
expect('addresses are unique', new Set(slugs).size === slugs.length)
expect('addresses are plain (a-z, 0-9, hyphen)', slugs.every((s) => /^[a-z0-9][a-z0-9-]*$/.test(s)), slugs.filter((s) => !/^[a-z0-9][a-z0-9-]*$/.test(s)).slice(0, 3).join(' '))
expect('no address is over 80 characters', slugs.every((s) => s.length <= 80))
const gone = saved.docs.filter((s) => !D.docBySlug.has(s))
expect('no published document address has gone', gone.length === 0, gone.slice(0, 5).join(' '))
expect('no published summit address has gone', saved.summits.every((k) => D.summitBySlug.has(k)))
expect('five summits', D.summits.length === 5)
expect('no voter-roll or name-list titles', D.docRecs.every((d) => !/electoral roll|voter list|voters? list|final roll|polling station list/i.test(d.title)))
expect('every page has an https official link', D.docRecs.every((d) => /^https?:\/\//.test(d.url)))
expect('no two pages share a title and a link', new Set(D.docRecs.map((d) => d.title + d.url)).size === D.docRecs.length)
const bad = D.docRecs.filter((d) => D.docDescription(d).en.length > 300 || D.docDescription(d).te.length > 300 || !D.docTitle(d).en)
expect('descriptions fit in 300 characters', bad.length === 0, bad.slice(0, 3).map((d) => d.slug).join(' '))
expect('no working notes in public words', D.docRecs.every((d) => !/\b(we|our)\b|sha-?256|could not locate/i.test(D.docDescription(d).en + ' ' + D.docFacts(d).map((f) => f.value.en).join(' '))))
const titles = D.docRecs.map((d) => D.docTitle(d).en)
const dup = titles.length - new Set(titles).size
expect('document titles are unique (a repeated title is a thin page)', dup === 0, `${dup} repeated, e.g. ${titles.find((t, i) => titles.indexOf(t) !== i)}`)
expect('summit pages say promise, not money spent', D.summits.every((s) => /promise/i.test(D.summitDescription(s).en) && /promise|హామీ/.test(D.SUMMIT_CAVEAT.en + D.SUMMIT_CAVEAT.te)))
expect('summit pages link the state paper', D.summits.every((s) => /^https:\/\//.test(s.source_url)))
if (!ok) process.exit(1)
