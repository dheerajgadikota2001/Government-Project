// The 3D engine (three.js and the stage) is one file the browser fetches once. Both the model
// door (View3D) and the Home page ask for it through here, so whoever asks first starts the
// download and everyone else shares it.
import { ceilingLevel } from './governor'

export type Engine = typeof import('./core')

let enginePromise: Promise<Engine> | null = null
export const loadEngine = () => (enginePromise ??= import('./core'))

/** True on a connection or device where fetching the engine ahead of need would cost the reader:
 *  data saver is on, or the device already says it can only run the lightest level. */
export function holdEarlyLoad(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  return !!nav.connection?.saveData || ceilingLevel() <= 1
}

/** Resolves when the page's own files have arrived (the load event). Measured on a throttled phone, an
 *  engine fetched before this point competes with the page for the connection and the processor and
 *  brings the live model up later, not sooner; fetched right at this point, it arrives while the browser
 *  is still waiting for a quiet moment to build the model. */
let loaded: Promise<void> | null = null
export function afterLoad(): Promise<void> {
  return (loaded ??= new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve()
    else window.addEventListener('load', () => resolve(), { once: true })
  }))
}

/** Start the engine download as soon as the page has loaded, before any model asks for it. Safe to call often. */
export function warmEngine() {
  if (enginePromise || typeof window === 'undefined') return
  afterLoad().then(() => { if (!holdEarlyLoad()) loadEngine().catch(() => { enginePromise = null }) })
}
