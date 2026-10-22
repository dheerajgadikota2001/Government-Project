// The page the server wrote (scripts/prerender.mjs) is shown again by the app while the first page's
// code is still arriving, so a reader on a slow phone keeps reading facts instead of a loading mark.
// It is used for the first address only: after any move inside the app it is no longer that page.
let html: string | null = null
let path: string | null = null

export function keepPrerendered(root: HTMLElement) {
  const main = root.querySelector('main.pre')
  if (main) { html = main.outerHTML; path = location.pathname }
}

/** The pre-rendered page for the current address, or null once the reader has moved on. */
export function prerenderedHere(): string | null {
  return html && typeof location !== 'undefined' && location.pathname === path ? html : null
}
