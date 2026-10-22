// Baked pictures of the 3D models ("posters"), one per work, per theme and per box shape.
// A poster is what the reader sees the instant a model's place appears: the model itself, drawn
// once by scripts/make_posters.py from the real scene, so there is no empty box and no spinner
// while the live model loads, and no flat stand-in for a reader whose device rests the model.
// A poster is only used while the work's data still matches the data it was drawn from
// (POSTERS says which printed share each poster shows), so a poster can never show an old figure.
import { POSTERS, POSTER_REV } from './posters.gen'

/** The base of a work's poster files, or undefined when no poster matches the work's current data. */
export function workPoster(id: number, drawPct: number | null): string | undefined {
  const tag = drawPct == null ? 'plan' : String(drawPct)
  return POSTERS['w' + id] === tag ? `/3d/r${POSTER_REV}/w${id}-${tag}` : undefined
}

export const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
/** Wide boxes (desktop) and narrow boxes (phones) have their own framing. */
export const WIDE_FROM = 1.9

export function posterSrc(base: string, dark: boolean, wide: boolean) {
  return `${base}-${dark ? 'd' : 'l'}${wide ? 'w' : 'n'}.webp`
}

/** The first big work's poster, for Home's placeholder while the big works are still arriving. It is only
 *  a placeholder: the real card replaces it within a moment, and test:posters keeps it in step with the data. */
export function firstPosterBase(): string | undefined {
  const first = Object.keys(POSTERS)[0]
  return first ? `/3d/r${POSTER_REV}/${first}-${POSTERS[first]}` : undefined
}

/** Fetch the first work's poster early, from Home, before the big works have even arrived. */
export function preloadFirstPoster() {
  const base = firstPosterBase()
  if (!base || typeof window === 'undefined') return
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return
  const img = new Image()
  img.decoding = 'async'
  img.src = posterSrc(base, isDark(), window.innerWidth >= 526)
}
