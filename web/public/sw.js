/* AP Fact Check service worker.
 *
 * Why it exists: many readers are on weak village networks. After the first visit, the site's
 * code and compiled data come from the phone itself, and a page still opens when the network
 * is slow or gone for a moment.
 *
 * What it does, and what it deliberately does not do:
 * - /assets/* files have a fingerprint in their name and never change, so they are served from
 *   the phone first (cache-first). A daily rebuild makes new names; old ones are trimmed.
 * - Page loads go to the network first, so readers always get today's version. If the network
 *   has not answered in 3.5 seconds, the last saved page opens instead, and the fresh copy is
 *   saved for next time when it arrives.
 * - Google Fonts are kept on the phone (their files never change either).
 * - /api/* is never touched. Live data (community posts, tenders, news) must say honestly when
 *   the server cannot be reached; a saved old answer shown as current would break that promise.
 *
 * Emergency off switch: deploy a sw.js whose first line is `self.__KILL = true` (see bottom).
 * Every reader's phone then removes the worker and its caches on the next visit.
 */
const VERSION = 'v2'          // v2: every page is its own pre-rendered file now, so pages are saved one by one
const ASSETS = `apfc-assets-${VERSION}`
const PAGES = `apfc-pages-${VERSION}`
const FONTS = `apfc-fonts-${VERSION}`
const KEEP = [ASSETS, PAGES, FONTS]
const MAX_ASSETS = 400          // a few rebuilds' worth; older fingerprints are dropped first
const PAGE_TIMEOUT_MS = 3500
const MAX_PAGES = 60            // the pages a reader opened most recently
const SHELL = '/index.html'     // any saved page can stand in offline: the app draws the right one from the address

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.__KILL) {
      for (const k of await caches.keys()) await caches.delete(k)
      await self.registration.unregister()
      return
    }
    for (const k of await caches.keys()) if (k.startsWith('apfc-') && !KEEP.includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

async function trim(cacheName, max) {
  const c = await caches.open(cacheName)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}

async function cacheFirst(request, cacheName) {
  const c = await caches.open(cacheName)
  const hit = await c.match(request)
  if (hit) return hit
  const res = await fetch(request)
  // Only whole, successful answers are kept; an opaque or partial response could poison the cache.
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
    await c.put(request, res.clone())
    if (cacheName === ASSETS) trim(ASSETS, MAX_ASSETS)
  }
  return res
}

async function latest(c) {
  const keys = await c.keys()
  return keys.length ? c.match(keys[keys.length - 1]) : undefined
}

async function page(event) {
  const c = await caches.open(PAGES)
  const req = event.request
  const network = fetch(req).then(async (res) => {
    // Only real pages are kept: a 404 or a redirect is never saved as a page.
    if (res.ok && res.type === 'basic' && !res.redirected) {
      await c.put(req.url.split('#')[0], res.clone())
      if (new URL(req.url).pathname === '/') await c.put(SHELL, res.clone())
      trim(PAGES, MAX_PAGES)
    }
    return res
  })
  event.waitUntil(network.catch(() => null))
  // This page as it was last saved; failing that, any saved page (the app shows the right one).
  const saved = (await c.match(req.url.split('#')[0], { ignoreSearch: true })) || (await c.match(SHELL)) || (await latest(c))
  if (!saved) return network
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_TIMEOUT_MS))
  try {
    return await Promise.race([network, timeout])
  } catch {
    return saved   // offline: the last saved page, which knows to say the data server cannot be reached
  }
}

self.addEventListener('fetch', (event) => {
  if (self.__KILL) return
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (req.mode === 'navigate') { event.respondWith(page(event)); return }
    if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(req, ASSETS)); return }
    return
  }
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(cacheFirst(req, FONTS))
  }
})
