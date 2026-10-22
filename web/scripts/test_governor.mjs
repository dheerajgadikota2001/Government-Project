// Drives the 3D governor (src/three/governor.ts) with made-up frame gaps and checks every decision
// it makes: smooth devices keep their level, slow ones step down, frozen ones rest at once, a
// reader's own request is respected, one hitch is forgiven. Run: npm run test:3d
import { build } from 'esbuild'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const out = join(tmpdir(), `governor-${process.pid}.mjs`)
await build({ entryPoints: [fileURLToPath(new URL('../src/three/governor.ts', import.meta.url))], format: 'esm', outfile: out, logLevel: 'warning' })
let now = 0
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true })
globalThis.window = { devicePixelRatio: 2, matchMedia: () => ({ matches: true }) }
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
globalThis.location = { search: '' }
const store = {}
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) } }
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.document = { createElement: () => ({ getContext: () => null }) }
const g = await import(pathToFileURL(out).href)
const run = (gov, gap, n) => { for (let i = 0; i < n; i++) { now += gap; gov.sample(now) } }
const log = []
let ok = true
const expect = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) ok = false }

// 1. A smooth device stays at its level.
let changes = []
let gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => changes.push(l) })
run(gov, 16.7, 600)
expect('smooth 60 fps keeps level 3', gov.level === 3 && changes.length === 0)

// 2. A struggling device steps down one level per bad window, down to a still picture.
changes = []; now += 5000
gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => changes.push(l) })
run(gov, 60, 400)
expect('15 fps steps 3 -> 2 -> 1 -> 0', JSON.stringify(changes) === '[2,1,0]')

// 3. When the reader asked for 3D, it never goes below level 1.
changes = []; now += 5000
gov = g.createGovernor({ start: 2, floor: 1, onChange: (l) => changes.push(l) })
run(gov, 60, 400)
expect('floor 1 holds when the reader asked', JSON.stringify(changes) === '[1]' && gov.level === 1)

// 4. One-off hitches (compiling, a resize) inside the quiet time are not counted.
changes = []; now += 5000
gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => changes.push(l) })
run(gov, 300, 3)          // 900 ms of heavy first frames, inside the 1.2 s quiet time
run(gov, 16.7, 300)
expect('start-up hitch ignored', changes.length === 0)

// 5. Recovers one level after sustained smooth frames, never above where it started, only once.
changes = []; now += 5000
gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => changes.push(l) })
run(gov, 55, 70)          // past the quiet time, one bad window of 45 -> 2
run(gov, 12, 600)         // long smooth stretch -> back to 3 once
run(gov, 55, 70)          // bad again -> 2
run(gov, 12, 600)         // smooth again: no second step up
console.log('   changes', JSON.stringify(changes))
expect('steps up once, then stays', JSON.stringify(changes) === '[2,3,2]')

// 6. A slow device is remembered for the next visit.
g.settle(1)
expect('saved level is 1', JSON.parse(store['apfc-3d-level']).level === 1)

// 7. Sharpness budgets: phone-size canvas at level 1 draws at 1x, level 3 at up to 2x.
const s1 = g.settingsFor(1, 'inline'), s3 = g.settingsFor(3, 'inline')
expect('level settings ordered', s1.cap === 1 && s3.cap === 2 && s1.shadow < s3.shadow && !s1.shadowEveryFrame && s3.shadowEveryFrame)
// 8. A frozen device (3 s per frame) steps down within seconds, not minutes.
changes = []; now += 5000
let at = 0
const t0 = now
gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => { changes.push(l); at = now } })
run(gov, 3000, 8)
console.log('   changes', JSON.stringify(changes), 'decided after', (at - t0) / 1000, 's')
expect('frozen frames reach a still picture fast', JSON.stringify(changes) === '[0]' && at - t0 <= 12000)

// 9. A single 400 ms hitch on a healthy device does not step it down.
changes = []; now += 5000
gov = g.createGovernor({ start: 3, floor: 0, onChange: (l) => changes.push(l) })
run(gov, 16.7, 100); run(gov, 400, 1); run(gov, 16.7, 400)
expect('one hitch is forgiven', changes.length === 0)
// 10. A laptop or desktop never rests, even when a slow mark was saved; a phone keeps it.
store['apfc-3d-level'] = JSON.stringify({ level: 0, at: Date.now(), v: 1 })
globalThis.window.matchMedia = () => ({ matches: false })
const desktop = await import(pathToFileURL(out).href + '?desktop')
expect('a desktop with a saved slow mark still starts at level 1', desktop.startLevel() === 1)
globalThis.window.matchMedia = () => ({ matches: true })
const phone = await import(pathToFileURL(out).href + '?phone')
expect('a phone with a saved slow mark starts at rest', phone.startLevel() === 0)
process.exit(ok ? 0 : 1)
