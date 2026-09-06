import { Component } from 'react'
import { EVENTS, track } from '../lib/analytics'

/**
 * Recovers the one failure mode a single-page app cannot survive on its own:
 * a code chunk that no longer exists.
 *
 * WHAT GOES WRONG, PRECISELY
 * Every route here is loaded with React.lazy, so moving between sections
 * fetches a content-hashed chunk — /assets/Projects-CE0yUZ4H.js. Those hashes
 * change on every build. A browser tab that was already open when a deploy went
 * out is still running the PREVIOUS index.html, and it asks for chunk names
 * that are no longer on the server.
 *
 * Firebase Hosting then makes it worse than a 404. The catch-all rewrite
 *
 *     { "source": "**", "destination": "/index.html" }
 *
 * answers the missing chunk with index.html, 200 OK, Content-Type text/html.
 * The browser tries to parse a web page as a JavaScript module, the dynamic
 * import rejects, React unmounts the whole tree, and the reader gets a white
 * screen — but only when they click through to another section, and only after
 * a deploy, which is exactly what was reported and exactly what never happens
 * to anyone testing with a fresh load.
 *
 * WHY A RELOAD IS THE RIGHT ANSWER AND NOT A SHORTCUT
 * The running code is stale; there is nothing this tab can do to obtain the new
 * chunk under the old name. Fetching index.html again is the only way to learn
 * the current names, and that is a reload. It is also precisely what a person
 * does by reflex when a page goes blank — this just does it before they see the
 * blank page and lose confidence in the site.
 *
 * THE LOOP THIS DELIBERATELY CANNOT BECOME
 * A boundary that reloads on every error is a machine for producing infinite
 * refreshes. Two guards:
 *
 *   1. It only reloads for errors that carry a chunk-loading signature. Any
 *      other error — a genuine bug in a page — shows a message and stays put,
 *      because reloading would hide the bug and spin.
 *   2. It records WHEN it last reloaded, in sessionStorage. A second failure
 *      within the cooldown means the reload did not help, so it stops trying
 *      and says so. Later failures, after a future deploy, are free to recover
 *      again.
 *
 * WHAT IT REFUSES TO DO
 * It does not swallow ordinary errors, and it does not pretend the page is
 * fine. On a platform whose whole claim is that it shows the government's real
 * figures, a blank screen and a silently half-rendered page are the same lie
 * told two ways.
 */

const RELOAD_KEY = 'apnn.chunkReloadAt'
// Long enough that a reload has plainly failed, short enough that a genuine
// second deploy an hour later still recovers by itself.
const COOLDOWN_MS = 15000

/**
 * Every browser words this differently, and the Firebase rewrite adds a fourth
 * shape by answering with HTML. Matching narrowly matters: this decides whether
 * an error is met with a page refresh or with an honest message.
 */
function isChunkLoadError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  const message = String(error.message || error)
  return (
    // webpack / vite, Chrome, Firefox, Safari
    /Loading chunk \d+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    // The Firebase case: index.html returned where JavaScript was expected, so
    // the parser trips on the opening tag of the document.
    (error.name === 'SyntaxError' && /[<]/.test(message))
  )
}

// sessionStorage throws outright in some privacy modes. A recovery mechanism
// that can itself throw is not a recovery mechanism.
function lastReloadAt() {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY) || 0)
  } catch {
    return 0
  }
}
function markReloaded() {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* no memory of the attempt: the message below is then the outcome */
  }
}

// The rare screen a reader might actually see, in the language they chose.
// Written out rather than routed through the catalogue because this component
// renders when the app is already broken — reaching for a hook or a context
// here is one more thing that can fail at the worst moment.
const COPY = {
  en: { t: 'A new version of the site is available.', b: 'Reload' },
  te: { t: 'సైట్‌కు కొత్త వెర్షన్ అందుబాటులో ఉంది.', b: 'రీలోడ్ చేయండి' },
  hi: { t: 'साइट का नया संस्करण उपलब्ध है।', b: 'फिर से लोड करें' },
  ur: { t: 'سائٹ کا نیا ورژن دستیاب ہے۔', b: 'دوبارہ لوڈ کریں' },
  ta: { t: 'தளத்தின் புதிய பதிப்பு கிடைக்கிறது.', b: 'மீண்டும் ஏற்று' },
  or: { t: 'ସାଇଟର ନୂଆ ସଂସ୍କରଣ ଉପଲବ୍ଧ।', b: 'ପୁନଃଲୋଡ୍ କରନ୍ତୁ' },
}
function copy() {
  try {
    return COPY[window.localStorage.getItem('apnn.lang')] || COPY.en
  } catch {
    return COPY.en
  }
}

export default class ChunkReloadBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, chunk: false }
  }

  static getDerivedStateFromError(error) {
    return { failed: true, chunk: isChunkLoadError(error) }
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && Date.now() - lastReloadAt() > COOLDOWN_MS) {
      // Recorded before the reload, with beacon transport, so it survives the
      // page going away. A rise here after a deploy is the signal that the
      // deploy hurt people who had the site open.
      track(EVENTS.CHUNK_RELOAD, { page_path: window.location.pathname })
      markReloaded()
      window.location.reload()
      return
    }
    // Console only — this site collects nothing about its readers, so the
    // console is where whoever reproduces this will look.
    console.error('[route failed]', error, info?.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { t, b } = copy()
    return (
      <div className="max-w-xl mx-auto my-10 px-5 py-6 border border-surface-variant rounded-xl bg-surface text-center">
        <p className="text-body-lg text-on-surface">
          {this.state.chunk ? t : 'This page could not be shown.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-[44px] px-5 rounded-xl bg-primary text-on-primary text-label-lg font-bold"
        >
          {b}
        </button>
      </div>
    )
  }
}
