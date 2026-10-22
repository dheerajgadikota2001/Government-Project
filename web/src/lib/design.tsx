import * as React from 'react'

// Everything the design picker can change. Each option names the platform its
// design came from, so the owner can see exactly what he is choosing.

export type Option = { id: string; label: string; from: string; note?: string }
export type Choice = {
  key: keyof DesignState
  title: string
  scope: string
  options: Option[]
}

export type DesignState = {
  preset: string
  mode: 'system' | 'light' | 'dark'
  sans: string
  head: string
  te: string
  shell: string
  hero: string
  questions: string
  projectsList: string
  road: string
  tiles: string
  story: string
}

export const DEFAULTS: DesignState = {
  preset: 'record', mode: 'system', sans: 'preset', head: 'preset', te: 'noto',
  shell: 'topbar', hero: 'record', questions: '3d', projectsList: 'table',
  road: 'road', tiles: 'cards', story: 'accordion',
}

export const CHOICES: Choice[] = [
  { key: 'preset', title: 'Look', scope: 'Whole site', options: [
    { id: 'record', label: 'Record', from: 'shadcn/ui neutral base, tuned for this site', note: 'Stone paper, ink, one blue for "look here".' },
    { id: 'plum', label: 'Ink and plum', from: 'your share-card choice of 23 September', note: 'Warm paper with a serif headline.' },
    { id: 'vercel', label: 'Vercel', from: 'tweakcn theme "Vercel"', note: 'Pure black and white, Geist.' },
    { id: 'graphite', label: 'Graphite', from: 'tweakcn theme "Graphite"', note: 'Soft greys, Inter.' },
    { id: 'modern-minimal', label: 'Modern minimal', from: 'tweakcn theme "Modern Minimal"', note: 'White with a clear blue.' },
    { id: 'starry-night', label: 'Starry night', from: 'tweakcn theme "Starry Night"', note: 'Navy and a book serif, like a research institute.' },
    { id: 'caffeine', label: 'Caffeine', from: 'tweakcn theme "Caffeine"', note: 'Warm browns, DM Sans.' },
  ] },
  { key: 'shell', title: 'Menu', scope: 'Whole site', options: [
    { id: 'topbar', label: 'Top bar', from: 'shadcn/ui Sheet + Command', note: 'Five menu items across the top, search on ⌘K.' },
    { id: 'sidebar', label: 'Side panel', from: 'shadcn/ui Sidebar block (sidebar-07, inset)', note: 'Menu on the left that folds to icons.' },
  ] },
  { key: 'hero', title: 'Home: first screen', scope: 'Home', options: [
    { id: 'record', label: 'Big works in 3D', from: 'Our three.js models + shadcn/ui Carousel (Embla)', note: 'Fifteen big works, each as a model built up to its latest reading.' },
    { id: 'search', label: 'Search first', from: 'shadcn/ui Command + Magic UI Dot Pattern', note: 'One big search and four questions.' },
    { id: 'ask', label: 'Ask a question', from: 'Kokonut UI Action Search Bar, Data Commons style', note: 'Questions as the way in.' },
  ] },
  { key: 'questions', title: 'Home: the four questions', scope: 'Home', options: [
    { id: '3d', label: '3D models, swipe', from: 'Our three.js models + shadcn/ui Carousel (Embla)', note: 'A real model for each question; swipe on phones.' },
    { id: 'cards', label: 'Hover cards', from: 'Aceternity UI Card Hover Effect', note: 'Plain cards that light up under the finger.' },
    { id: 'bento', label: 'Bento tiles', from: 'Magic UI Bento Grid', note: 'Each question with a small live graphic.' },
    { id: 'list', label: 'Big list', from: 'shadcn/ui Item', note: 'Four large rows, easiest on a small phone.' },
  ] },
  { key: 'projectsList', title: 'Projects: the list', scope: 'Projects', options: [
    { id: 'table', label: 'Data table', from: 'Origin UI table (comp-485) on TanStack Table', note: 'Sortable columns, like a research desk.' },
    { id: 'cards', label: 'Cards', from: 'shadcn/ui Card', note: 'One card per work, easier on phones.' },
  ] },
  { key: 'tiles', title: 'Project page: the three tiles', scope: 'Project pages', options: [
    { id: 'cards', label: 'Stat cards', from: 'blocks.so Stats 01', note: 'Three cards with the paper under each figure.' },
    { id: 'strip', label: 'Stat strip', from: 'shadcnui-blocks Stats 01', note: 'One band split in three, no boxes.' },
    { id: 'tremor', label: 'Stat cards with bars', from: 'Tremor Raw Progress Bar', note: 'Each figure with a small bar.' },
  ] },
  { key: 'road', title: 'Project page: the project road', scope: 'Project pages', options: [
    { id: 'road', label: 'Road on a time scale', from: 'Our own d3 graphic, built to the brief', note: 'True dates, readings as points, the due date as a plan.' },
    { id: 'origin', label: 'Timeline', from: 'Origin UI Timeline (comp-535)', note: 'Steps with icons and the paper under each.' },
    { id: 'blocks', label: 'Dated cards', from: 'shadcnui-blocks Timeline 03', note: 'Each step as a dated card.' },
    { id: 'years', label: 'Year by year', from: 'Written for this site', note: 'Large years that stay in view as you scroll.' },
  ] },
  { key: 'story', title: 'Project page: the full story', scope: 'Project pages', options: [
    { id: 'accordion', label: 'Folded chapters', from: 'shadcn/ui Accordion', note: 'Each chapter opens on tap.' },
    { id: 'longread', label: 'Long read with index', from: 'Kokonut UI Scroll Index + editorial type', note: 'Chapters one after another, an index on the side.' },
  ] },
  { key: 'sans', title: 'Body typeface', scope: 'Whole site', options: [
    { id: 'preset', label: 'As the look sets it', from: '' },
    { id: 'geist', label: 'Geist', from: 'Vercel' },
    { id: 'inter', label: 'Inter', from: 'Rasmus Andersson' },
    { id: 'plex', label: 'IBM Plex Sans', from: 'IBM' },
    { id: 'dm', label: 'DM Sans', from: 'Colophon' },
  ] },
  { key: 'head', title: 'Headline typeface', scope: 'Whole site', options: [
    { id: 'preset', label: 'As the look sets it', from: '' },
    { id: 'same', label: 'Same as body', from: '' },
    { id: 'source-serif', label: 'Source Serif 4', from: 'Adobe' },
    { id: 'instrument', label: 'Instrument Serif', from: 'Instrument' },
    { id: 'baskerville', label: 'Libre Baskerville', from: 'Impallari' },
  ] },
  { key: 'te', title: 'Telugu typeface', scope: 'Whole site', options: [
    { id: 'noto', label: 'Noto Sans Telugu', from: 'Google' },
    { id: 'hind', label: 'Hind Guntur', from: 'Indian Type Foundry' },
    { id: 'anek', label: 'Anek Telugu', from: 'Ek Type' },
  ] },
]

type Ctx = { d: DesignState; set: <K extends keyof DesignState>(k: K, v: DesignState[K]) => void; reset: () => void; dark: boolean }
const DesignContext = React.createContext<Ctx | null>(null)

function systemDark() {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return matchMedia('(prefers-color-scheme: dark)').matches
}

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = React.useState<DesignState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('apfc-design') || '{}') || {}
      // Picks saved before the 3D first screen and question cards existed fall back to the new defaults
      // for those two rows; every other pick (look, menu, typefaces) is kept.
      if (!saved.v || saved.v < 2) { delete saved.hero; delete saved.questions; delete saved.projectsList }
      return { ...DEFAULTS, ...saved }
    } catch { return DEFAULTS }
  })
  const [sys, setSys] = React.useState(systemDark)

  React.useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSys(systemDark())
    mq.addEventListener('change', on)
    // the viewer's own theme switch sets data-theme on the root element
    const mo = new MutationObserver(on)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mq.removeEventListener('change', on); mo.disconnect() }
  }, [])

  const dark = d.mode === 'dark' || (d.mode === 'system' && sys)

  React.useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', dark)
    el.classList.toggle('light', !dark)
    el.setAttribute('data-preset', d.preset)
    const attr = (name: string, v: string, skip: string) => (v === skip ? el.removeAttribute(name) : el.setAttribute(name, v))
    attr('data-sans', d.sans, 'preset')
    attr('data-head', d.head, 'preset')
    el.setAttribute('data-te', d.te)
    loadPickerFonts(d)
    try { localStorage.setItem('apfc-design', JSON.stringify({ ...d, v: 2 })) } catch { /* fine without storage */ }
    window.dispatchEvent(new Event('apfc-theme'))
  }, [d, dark])

  const value = React.useMemo<Ctx>(() => ({
    d, dark,
    set: (k, v) => setD((s) => ({ ...s, [k]: v })),
    reset: () => setD(DEFAULTS),
  }), [d, dark])
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>
}

export function useDesign() {
  const c = React.useContext(DesignContext)
  if (!c) throw new Error('useDesign outside DesignProvider')
  return c
}

// Fonts beyond the default design load only when a design choice needs them. index.html loads
// the four the default design uses; the picker's other families (about 140 KB of CSS and font
// files) would otherwise be fetched by every reader for a review tool most never open.
const FONT_QUERY: Record<string, string> = {
  Inter: 'Inter:opsz,wght@14..32,400..800',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700',
  'DM Sans': 'DM+Sans:opsz,wght@9..40,400..800',
  'Libre Baskerville': 'Libre+Baskerville:wght@400;700',
  'Instrument Serif': 'Instrument+Serif',
  'Hind Guntur': 'Hind+Guntur:wght@400;500;600;700',
  'Anek Telugu': 'Anek+Telugu:wght@400..700',
}
const PRESET_FONTS: Record<string, string[]> = {
  graphite: ['Inter'], 'modern-minimal': ['Inter'], 'starry-night': ['Inter', 'Libre Baskerville'], caffeine: ['DM Sans'],
}
const PICK_FONTS: Record<string, string> = { inter: 'Inter', plex: 'IBM Plex Sans', dm: 'DM Sans', instrument: 'Instrument Serif', baskerville: 'Libre Baskerville', hind: 'Hind Guntur', anek: 'Anek Telugu' }
const loadedFonts = new Set<string>()
function loadFonts(families: (string | undefined)[]) {
  const want = families.filter((f): f is string => !!f && !!FONT_QUERY[f] && !loadedFonts.has(f))
  if (!want.length) return
  want.forEach((f) => loadedFonts.add(f))
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${want.map((f) => 'family=' + FONT_QUERY[f]).join('&')}&display=swap`
  document.head.appendChild(link)
}
function loadPickerFonts(d: { preset: string; sans: string; head: string; te: string }) {
  loadFonts([...(PRESET_FONTS[d.preset] ?? []), PICK_FONTS[d.sans], PICK_FONTS[d.head], PICK_FONTS[d.te]])
}
/** The picker previews every option in its own font, so opening it loads them all. */
export function loadAllPickerFonts() {
  loadFonts(Object.keys(FONT_QUERY))
}

/** Re-render graphics when the theme or preset changes, so SVG colours follow. */
export function useThemeTick() {
  const [n, setN] = React.useState(0)
  React.useEffect(() => {
    const on = () => setN((x) => x + 1)
    window.addEventListener('apfc-theme', on)
    return () => window.removeEventListener('apfc-theme', on)
  }, [])
  return n
}
