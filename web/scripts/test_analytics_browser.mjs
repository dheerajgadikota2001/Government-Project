// The counting, checked end to end in a real browser (run: npm run test:analytics:browser, after npm run build).
//
// The built site is served as if it were https://apfactcheck.dheeco.com, with the live security policy from
// firebase.web.json. Google's tag is fetched for real, so this also reads the stream's settings in Google
// Analytics. Every hit the tag would send is caught here and answered locally: nothing reaches the real
// property and no visitor numbers are touched.
//
// It needs Playwright's Chromium, which the site itself does not depend on. Once per computer:
//   npm i --no-save playwright && npx playwright install chromium
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
let chromium
try { ({ chromium } = await import('playwright')) } catch {
  console.error('Playwright is not installed. Once per computer: npm i --no-save playwright && npx playwright install chromium')
  process.exit(2)
}
const WEB = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(WEB, 'dist')
const FW = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'firebase.web.json'), 'utf8')).hosting
const CSP = FW.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain', '.glb': 'model/gltf-binary' }

function fileFor(p) {
  const clean = decodeURIComponent(p.split('?')[0])
  const cands = [path.join(DIST, clean), path.join(DIST, clean, 'index.html')]
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return null
}

let ok = true
const expect = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !extra ? '' : `  [${extra}]`)); if (!cond) ok = false }

async function session(host, { optOutFirst = false } = {}) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'en-IN', serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' })
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }) })
  const hits = [], tagLoads = [], csp = [], other = []
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url())
    if (u.hostname === host) {
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 503, body: '{}', contentType: 'application/json' })
      const f = fileFor(u.pathname)
      const body = f ? fs.readFileSync(f) : fs.readFileSync(path.join(DIST, '404.html'))
      return route.fulfill({ status: f ? 200 : 404, body, headers: { 'content-type': TYPES[path.extname(f || '404.html')] || 'application/octet-stream', 'content-security-policy': CSP } })
    }
    if (u.hostname.endsWith('googletagmanager.com')) { tagLoads.push({ url: req.url(), t: Date.now() }); return route.continue() }
    if (/google-analytics\.com$|analytics\.google\.com$/.test(u.hostname)) {
      const lines = [u.search.slice(1), ...(req.postData() || '').split('\n')].filter(Boolean)
      for (const l of lines) hits.push(Object.fromEntries(new URLSearchParams(l.includes('en=') ? (u.search.slice(1) + '&' + l) : l)))
      return route.fulfill({ status: 204, body: '' })
    }
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.continue()
    other.push(u.hostname)
    return route.fulfill({ status: 204, body: '' })
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 200)) })
  const t0 = Date.now()
  return { browser, ctx, page, hits, tagLoads, csp, other, t0 }
}
const events = (hits) => hits.filter((h) => h.en).map((h) => h.en)
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

await (async () => {
  const HOST = 'apfactcheck.dheeco.com'
  // ---------------- the public site
  const s = await session(HOST)
  let loadAt = 0
  s.page.on('load', () => { loadAt = Date.now() })
  await s.page.goto(`https://${HOST}/projects/613`, { waitUntil: 'load' })
  await settle(6000)
  expect('Google\'s tag is fetched once', s.tagLoads.filter((x) => x.url.includes('/gtag/js')).length === 1, JSON.stringify(s.tagLoads.map((x) => x.url)))
  expect('and only after the page has loaded', s.tagLoads.length && loadAt && s.tagLoads[0].t >= loadAt, `${s.tagLoads[0]?.t - loadAt} ms`)
  const pv1 = s.hits.find((h) => h.en === 'page_view')
  expect('a page view is sent for the first page', !!pv1, JSON.stringify(events(s.hits)))
  if (pv1) {
    expect('with the kind of page and which record', pv1['ep.page_kind'] === 'project' && pv1['ep.content_id'] === '613', JSON.stringify(pv1))
    expect('with the site\'s language', pv1['ep.site_language'] === 'en', JSON.stringify(pv1))
    expect('to the site\'s own stream', pv1.tid === 'G-T80VZ3SMED', pv1.tid)
    expect('with the real address', (pv1.dl || '').startsWith(`https://${HOST}/projects/613`), pv1.dl)
  }
  expect('exactly one page view for one page (no automatic duplicate)', s.hits.filter((h) => h.en === 'page_view').length === 1, JSON.stringify(events(s.hits)))

  // in-app navigation
  await s.page.evaluate(() => { const a = document.createElement('a'); a.href = '/districts/eluru'; a.textContent = 'go'; a.id = 'e2e-go'; document.body.appendChild(a) })
  await s.page.evaluate(() => document.querySelector('#e2e-go').click())
  await settle(4000)
  const pvs = s.hits.filter((h) => h.en === 'page_view')
  expect('moving to another page inside the site sends one more page view', pvs.length === 2, JSON.stringify(pvs.map((p) => p['ep.page_kind'])))
  expect('with the new page\'s own title, not the last one\'s', pvs[1] && /Eluru/.test(decodeURIComponent(pvs[1].dt || '')), pvs[1] && pvs[1].dt)
  expect('naming the district', pvs[1] && pvs[1]['ep.page_kind'] === 'district' && pvs[1]['ep.content_id'] === 'eluru', JSON.stringify(pvs[1]))

  // a source click (the link is opened in a new tab, as the site's source links are)
  await s.page.evaluate(() => { const a = document.createElement('a'); a.href = 'https://www.apfinance.gov.in/files/budget/vol2.pdf'; a.target = '_blank'; a.textContent = 'src'; a.id = 'e2e-src'; document.body.appendChild(a) })
  const popup = s.ctx.waitForEvent('page').catch(() => null)
  await s.page.evaluate(() => document.querySelector('#e2e-src').click())
  const p2 = await popup; if (p2) await p2.close()
  await settle(4000)
  const sc = s.hits.find((h) => h.en === 'source_click')
  expect('a click on a government paper is counted, portal only', sc && sc['ep.portal'] === 'apfinance.gov.in' && !JSON.stringify(sc).includes('vol2'), JSON.stringify(sc))
  expect('and counted as a document opened', s.hits.some((h) => h.en === 'document_open' && h['ep.file_type'] === 'pdf'))

  // search: counted, never recorded
  await s.page.keyboard.press('Control+k')
  await settle(1500)
  const box = await s.page.$('[cmdk-input]')
  if (box) {
    await box.type('srikakulam', { delay: 30 })
    await settle(500)
    await s.page.keyboard.press('Escape')
    await settle(1000)
    await settle(9000)   // GA4 batches events for a few seconds before sending
  }
  expect('the search box opened (keyboard shortcut)', !!box)
  const sp = s.hits.find((h) => h.en === 'search_performed')
  expect('a search is counted, with whether it found anything', sp && ('ep.had_results' in sp || 'epn.had_results' in sp), JSON.stringify(sp))
  const all = JSON.stringify(s.hits).toLowerCase()
  expect('the words typed never reach Google', !all.includes('srikakulam') && !all.includes('srikak'))
  expect('no security-policy refusals on the public site', s.csp.length === 0, s.csp.join(' | '))
  console.log('events seen:', events(s.hits).join(', '))
  // Google's "enhanced measurement" sends its own page view on every in-site move, and its own outbound
  // click and file download with the file's full address. Ours already send these, once and portal only.
  // They are switched off in Google Analytics (Admin, Data streams, the web stream, Enhanced measurement);
  // the tag fetched above carries those settings, so this fails if they are ever switched back on.
  const autoPv = s.hits.filter((h) => h.en === 'page_view' && !h['ep.page_kind']).length
  expect('no automatic page views from Google on in-site moves (enhanced measurement: page changes off)', autoPv === 0, `${autoPv} extra`)
  expect('no automatic outbound clicks or file downloads with full addresses (enhanced measurement: off)', !s.hits.some((h) => h.en === 'click' || h.en === 'file_download'), events(s.hits).join(','))

  // switch counting off on the privacy page, then reload
  await s.page.goto(`https://${HOST}/privacy`, { waitUntil: 'load' })
  await settle(3000)
  const btn = s.page.getByRole('button', { name: 'Stop counting my visits' })
  expect('the privacy page shows a working switch on the public site', await btn.isVisible().catch(() => false))
  await btn.click().catch(() => {})
  await settle(500)
  expect('and says the reader is no longer counted', await s.page.getByText('You are not being counted.').isVisible().catch(() => false))
  const before = s.hits.length
  await s.page.evaluate(() => { const a = document.createElement('a'); a.href = '/districts/guntur'; a.id = 'e2e-go2'; a.textContent = 'x'; document.body.appendChild(a) })
  await s.page.evaluate(() => document.querySelector('#e2e-go2').click()); await settle(4000)
  expect('after switching off, nothing more is sent', s.hits.slice(before).filter((h) => h.en).length === 0, JSON.stringify(events(s.hits.slice(before))))
  const tagsBefore = s.tagLoads.length
  await s.page.goto(`https://${HOST}/projects/2`, { waitUntil: 'load' }); await settle(5000)
  expect('and on the next visit the tag is not even fetched', s.tagLoads.length === tagsBefore, String(s.tagLoads.length - tagsBefore))
  await s.browser.close()

  // ---------------- a preview address counts nothing
  const p = await session('ap-nadu-nedu.web.app')
  await p.page.goto('https://ap-nadu-nedu.web.app/projects/613', { waitUntil: 'load' }); await settle(5000)
  expect('a preview address fetches no tag and sends nothing', p.tagLoads.length === 0 && p.hits.length === 0)
  await p.browser.close()

  // ---------------- Telugu
  const t = await session(HOST)
  await t.page.goto(`https://${HOST}/te/districts/eluru`, { waitUntil: 'load' }); await settle(6000)
  const tpv = t.hits.find((h) => h.en === 'page_view')
  expect('a Telugu page is counted as Telugu', tpv && tpv['ep.site_language'] === 'te' && (tpv.dl || '').includes('/te/districts/eluru'), JSON.stringify(tpv))
  await t.browser.close()

  console.log(ok ? '\nall end-to-end checks passed' : '\nend-to-end checks FAILED')
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
