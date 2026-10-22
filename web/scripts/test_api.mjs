// Drives the API client (src/lib/api.ts) against a fake server and checks the promises it makes to
// readers on weak networks: the data-version stamp rides on every read, a read is tried twice and a
// write once, a "not found" is not retried, the same read asked twice costs one request, community
// reads are never kept, a write clears what was kept, and a long list is read to its last page.
// It also checks the one rule for "open" tenders (src/lib/live.ts). Run: npm run test:api
import { build } from 'esbuild'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rmSync } from 'node:fs'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const src = (p) => join(SRC, p)
// Built inside node_modules/.cache so the bundle can find react the normal way.
const cache = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url))
const out = join(cache, `api-${process.pid}.mjs`)
const outLive = join(cache, `live-${process.pid}.mjs`)
const common = {
  format: 'esm', bundle: true, platform: 'neutral', logLevel: 'warning',
  define: { 'import.meta.env.VITE_API_URL': 'undefined' },
  alias: { '@': SRC.replace(/[\\/]$/, '') },
  external: ['react'],
}
await build({ ...common, entryPoints: [src('lib/api.ts')], outfile: out })
await build({ ...common, entryPoints: [src('lib/live.ts')], outfile: outLive })

// ---------------------------------------------------------------- the fake server
const calls = []
let answer = () => ({ status: 200, body: {} })
globalThis.window = { location: { origin: 'https://site.test' } }
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url), 'https://site.test')   // the site calls the API by a relative address
  calls.push({ url: u, method: init.method || 'GET', body: init.body })
  if (u.pathname === '/api/v1/meta/version') return reply(200, { version: 'abc123' })
  const a = answer(u, init)
  if (a === 'throw') throw new TypeError('network down')
  return reply(a.status, a.body)
}
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
const reads = (path) => calls.filter((c) => c.url.pathname === '/api/v1' + path)

let ok = true
const expect = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) ok = false }
const api = await import(pathToFileURL(out).href)

// 1. Every read carries the data-version stamp.
answer = () => ({ status: 200, body: { n: 1 } })
let r = await api.apiGet('/projects/', { page: 1 })
expect('a read returns the body', r.n === 1)
expect('the stamp rides on the read as ?v=', reads('/projects/')[0].url.searchParams.get('v') === 'abc123')
expect('params are passed, empty ones dropped', reads('/projects/')[0].url.searchParams.get('page') === '1')

// 2. The same read within five minutes is answered from memory.
await api.apiGet('/projects/', { page: 1 })
expect('a repeated read costs no request', reads('/projects/').length === 1)

// 3. The same read asked twice at once costs one request.
calls.length = 0
answer = () => ({ status: 200, body: { n: 2 } })
const [a1, a2] = await Promise.all([api.apiGet('/districts/'), api.apiGet('/districts/')])
expect('two reads at once share one request', reads('/districts/').length === 1 && a1.n === 2 && a2.n === 2)

// 4. A server error is tried once more, and the second answer is used.
calls.length = 0
let n = 0
answer = () => (++n === 1 ? { status: 503, body: {} } : { status: 200, body: { ok: true } })
r = await api.apiGet('/flaky/')
expect('a 503 is retried and the retry succeeds', r.ok === true && reads('/flaky/').length === 2)

// 5. A "not found" is not retried, and is recognised as not found.
calls.length = 0
answer = () => ({ status: 404, body: { detail: 'Not found' } })
let err = null
try { await api.apiGet('/projects/99999') } catch (e) { err = e }
expect('a 404 is not retried', reads('/projects/99999').length === 1)
expect('a 404 is an ApiError that isNotFound accepts', err instanceof api.ApiError && err.status === 404 && api.isNotFound(err))
expect('a 422 also counts as not found', api.isNotFound(new api.ApiError('x', { status: 422 })))

// 6. No network at all: two tries, then an error that says the server was unreachable.
calls.length = 0
answer = () => 'throw'
err = null
try { await api.apiGet('/down/') } catch (e) { err = e }
expect('unreachable is tried twice', reads('/down/').length === 2)
expect('unreachable is reported as unreachable', err instanceof api.ApiError && err.unreachable === true)
expect('a failed read is not kept', (await (async () => { answer = () => ({ status: 200, body: { back: 1 } }); return api.apiGet('/down/') })()).back === 1)

// 7. Community reads are never kept: someone who just posted must see their post.
calls.length = 0
answer = () => ({ status: 200, body: [] })
await api.apiGet('/community/topics')
await api.apiGet('/community/topics')
expect('community reads are never kept', reads('/community/topics').length === 2)

// 8. A write is tried once, carries the server's error code, and clears what was kept.
calls.length = 0
answer = (u, init) => (init.method === 'POST' ? { status: 429, body: { detail: 'rate_limited' } } : { status: 200, body: { n: 3 } })
err = null
try { await api.apiPost('/community/posts', { body: 'hi' }) } catch (e) { err = e }
expect('a refused write is tried once', calls.filter((c) => c.method === 'POST').length === 1)
expect("the server's short code comes through", err?.detail === 'rate_limited' && err.status === 429)
await api.apiGet('/kept/')
answer = (u, init) => (init.method === 'POST' ? { status: 201, body: { id: 7 } } : { status: 200, body: { n: 4 } })
const posted = await api.apiPost('/community/corrections', { body: 'a long enough report' })
const after = await api.apiGet('/kept/')
expect('a write returns the new record', posted.id === 7)
expect('a write clears every kept read', after.n === 4 && reads('/kept/').length === 2)
answer = () => ({ status: 204, body: null })
expect('a 204 write returns null', (await api.apiPost('/community/posts/7/report')) === null)

// 9. A long list is read to its last page, and the pages after the first load side by side.
calls.length = 0
answer = (u) => {
  const page = Number(u.searchParams.get('page')), size = Number(u.searchParams.get('page_size'))
  const total = 250
  const items = Array.from({ length: Math.max(0, Math.min(size, total - (page - 1) * size)) }, (_, i) => ({ id: (page - 1) * size + i }))
  return { status: 200, body: { items, total } }
}
const all = await api.apiGetAll('/tenders/', { status: 'active' })
expect('all 250 rows arrive, each once', all.items.length === 250 && new Set(all.items.map((x) => x.id)).size === 250)
expect('three pages of 100 were asked for', reads('/tenders/').length === 3 && reads('/tenders/').every((c) => c.url.searchParams.get('status') === 'active'))

// 10. Open means the last day to bid has not passed, in India time.
const live = await import(pathToFileURL(outLive).href)
const t = (end) => ({ bid_submission_end: end })
expect('closing 23:30 India time today is open', live.isOpen(t('2026-10-22T18:00:00Z'), '2026-10-22'))
expect('closing 23:59 India time yesterday is not open', !live.isOpen(t('2026-10-21T18:29:00Z'), '2026-10-22'))
expect('closing 00:30 India time today (still 21 Oct in UTC) is open', live.isOpen(t('2026-10-21T19:00:00Z'), '2026-10-22'))

rmSync(out, { force: true }); rmSync(outLive, { force: true })
if (!ok) { console.log('\nSome checks failed.'); process.exit(1) }
console.log('\nAll checks passed.')
