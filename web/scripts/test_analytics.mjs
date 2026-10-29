// Checks the visitor counting (run: npm run test:analytics, no build needed).
//
// Why: the redesign shipped with no counting at all, and nobody could tell for weeks (28 Oct 2026). These
// checks pin what the counting must do and, more important on this site, what it must never send:
//  - search words never reach an event, and `q` never survives in a recorded address
//  - outbound clicks keep the portal only, never the file's address
//  - only the public site counts: previews, local runs and crawlers send nothing
//  - Google's hosts are allowed by the live security policy, or the tag would be silently blocked
//  - the privacy page's promises match the code (ninety-day cookie, two languages)
import { build } from 'esbuild'
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const web = fileURLToPath(new URL('..', import.meta.url))
const out = join(web, 'node_modules/.cache', `analytics-test-${process.pid}.mjs`)
await build({
  entryPoints: [join(web, 'src/lib/analytics.ts')], outfile: out, bundle: true, format: 'esm', platform: 'node',
  alias: { '@': join(web, 'src') }, logLevel: 'warning',
  define: { 'import.meta.env.PROD': 'true', 'import.meta.env.VITE_ROUTES': '"path"', 'import.meta.env.VITE_GA_MEASUREMENT_ID': 'undefined', 'import.meta.env.VITE_ANALYTICS_DEBUG': 'undefined' },
})
const A = await import(pathToFileURL(out).href)
rmSync(out, { force: true })

let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

// ---- the id
expect('the measurement id is the site\'s GA4 stream', A.MEASUREMENT_ID === 'G-T80VZ3SMED', A.MEASUREMENT_ID)

// ---- the catalogue
const names = Object.values(A.EVENTS)
expect('every event name is GA4-legal (snake_case, 40 characters at most, no reserved prefix)',
  names.every((n) => /^[a-z][a-z0-9_]{0,39}$/.test(n) && !/^(google_|ga_|firebase_)/.test(n)), names.join(','))
expect('no two events share a name', new Set(names).size === names.length)

// ---- addresses
const s1 = A.safeUrl('https://apfactcheck.dheeco.com/te/projects/613?q=my+words&view=map#x')
expect('safeUrl removes the reader\'s words (q) and the fragment, keeps the app\'s own parameters',
  s1 === 'https://apfactcheck.dheeco.com/te/projects/613?view=map', s1)
expect('safeUrl of nonsense is empty, not a crash', A.safeUrl('not a url') === '')

// ---- outbound clicks
const here = 'https://apfactcheck.dheeco.com/projects/613'
const d = (h) => A.describeOutbound(h, here)
expect('a link on this site is not an outbound click', d('/districts/eluru') === null && d('https://apfactcheck.dheeco.com/x') === null)
expect('mail and phone links are not outbound clicks', d('mailto:a@b.c') === null && d('tel:1100') === null)
const g = d('https://www.apfinance.gov.in/files/budget/2025/vol2.pdf?x=1')
expect('a government PDF: portal only, flagged government and document',
  g && g.portal === 'apfinance.gov.in' && g.is_government && g.is_document && g.file_type === 'pdf' && !JSON.stringify(g).includes('vol2'), JSON.stringify(g))
const cag = d('https://d1jmc0u14z2tmp.cloudfront.net/uploads/2024/report.pdf')
expect('CAG\'s file store counts as government', cag && cag.is_government && cag.is_document, JSON.stringify(cag))
const s3 = d('https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/SpeechEnglish.pdf')
expect('AP Finance books on S3 are named apfinance.gov.in, and only that', s3 && s3.portal === 'apfinance.gov.in' && s3.is_government, JSON.stringify(s3))
const other = d('https://s3.ap-south-1.amazonaws.com/some-bucket/file.pdf')
expect('other S3 files are not called government', other && !other.is_government, JSON.stringify(other))
const news = d('https://www.thehindu.com/news/article.ece')
expect('a newspaper link is outbound, not government, not a document', news && news.portal === 'thehindu.com' && !news.is_government && !news.is_document, JSON.stringify(news))

// ---- crawlers and real browsers
const chrome = { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36', languages: ['te-IN', 'en'] }
const scr = { width: 412, height: 915 }
expect('a phone browser is a reader', A.looksAutomated(chrome, scr) === false)
expect('a driven browser is not', A.looksAutomated({ ...chrome, webdriver: true }, scr) === true)
expect('Googlebot is not', A.looksAutomated({ ...chrome, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, scr) === true)
expect('a browser with no languages is not', A.looksAutomated({ ...chrome, languages: [] }, scr) === true)
expect('a zero-size screen is not', A.looksAutomated(chrome, { width: 0, height: 0 }) === true)

// ---- only the public site counts
expect('outside a browser on https, this is not the public site', A.isPublicSite() === false)
A.start({ language: 'en' })
expect('so start() leaves counting off', A.isCounting() === false)
A.track(A.EVENTS.PAGE_VIEW, { page_location: 'x' })   // must be a quiet no-op
expect('and track() is a quiet no-op', A.isCounting() === false)

// ---- the source: nothing else talks to Google, and search words go nowhere
const files = []
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p) } }
walk(join(web, 'src'))
const gtagUsers = files.filter((f) => !f.endsWith(join('lib', 'analytics.ts')) && /\bgtag\b|googletagmanager|dataLayer/.test(readFileSync(f, 'utf8')))
expect('only lib/analytics.ts talks to Google', gtagUsers.length === 0, gtagUsers.join(', '))
const search = readFileSync(join(web, 'src/components/search-dialog.tsx'), 'utf8')
const searchCalls = [...search.matchAll(/track\(([^)]*)\)/g)].map((m) => m[1])
expect('the search box sends events', searchCalls.length >= 2)
expect('no search event carries what was typed (q, ql)', searchCalls.every((c) => !/\bql?\b/.test(c)), searchCalls.join(' | '))
const trackCalls = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/track\(EVENTS\.[A-Z_]+,\s*\{([^}]*)\}/g)].map((m) => [f, m[1]]))
const leaky = trackCalls.filter(([, body]) => /\b(query|search_term|term|email|phone|name)\s*:/.test(body))
expect('no event anywhere carries a search term, email, phone or name', leaky.length === 0, leaky.map(([f]) => f).join(', '))

// ---- the live security policy lets the tag work
const hosting = JSON.parse(readFileSync(join(web, '..', 'firebase.web.json'), 'utf8')).hosting
const csp = hosting.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value
const dir = (n) => (new RegExp(`(?:^|;)\\s*${n}\\s+([^;]*)`).exec(csp) ?? [, ''])[1]
expect('script-src allows the tag', dir('script-src').includes('https://*.googletagmanager.com'))
expect('connect-src allows sending', ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'].every((h) => dir('connect-src').includes(h)), dir('connect-src'))
expect('img-src allows the fallback pixel', dir('img-src').includes('https://*.google-analytics.com'))
expect('the theme script\'s hash is still allowed', dir('script-src').includes("'sha256-oRuLqfx8DNwqzll53xcrKXFRrs7YHleFfmS+sSpH0eI='"))

// ---- the privacy page says what the code does
const legal = JSON.parse(readFileSync(join(web, 'src/data/legal.json'), 'utf8')).privacy
const src = readFileSync(join(web, 'src/lib/analytics.ts'), 'utf8')
expect('the cookie lasts ninety days, as the privacy page says', /cookie_expires:\s*60 \* 60 \* 24 \* 90/.test(src) && legal.en.sections.cookies.p1.includes('ninety days'))
expect('the privacy page names two languages, not six', !JSON.stringify(legal).includes('six languages') && !JSON.stringify(legal).includes('ఆరు భాష'))
expect('advertising stays denied', /ad_storage: 'denied'/.test(src) && !/ad_storage: 'granted'/.test(src))

if (!ok) { console.error('\nanalytics checks failed'); process.exit(1) }
console.log('\nall analytics checks passed')
