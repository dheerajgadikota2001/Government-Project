import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { keepPrerendered } from '@/lib/prerendered'

// The pre-rendered facts (scripts/prerender.mjs) stay on screen until this page's own code has
// arrived, instead of flashing to a loading mark on a slow connection.
const root = document.getElementById('root')!
keepPrerendered(root)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker (public/sw.js) keeps the site's code on the reader's phone after the first
// visit. Only the real site registers it: not the dev server, and not the one-file preview, which
// uses hash addresses and cannot host a worker. It is registered after the page has loaded, so it
// never competes with the first paint. `?nosw=1` removes it on one phone, for support cases.
if (import.meta.env.PROD && import.meta.env.VITE_ROUTES === 'path' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const off = new URLSearchParams(location.search).get('nosw') === '1'
    if (off) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
      return
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('[sw] not registered:', err))
  }, { once: true })
}
