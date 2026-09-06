import { Component } from 'react'
import { EVENTS, track } from '../lib/analytics'

/**
 * The last line between a bad response and a blank page.
 *
 * WHY THIS IS NOT OPTIONAL HERE
 * A React component that throws while rendering takes the whole tree with it,
 * and the reader is left looking at a white screen. On most sites that is an
 * outage. On this one it is worse than an outage, because a blank page is
 * indistinguishable from "there is nothing on record" — and the entire claim of
 * the platform is that it will tell you what is and is not on record.
 *
 * The failures this catches are real and already happened: components that
 * guard with `if (!data)` and then read `data.projects`, `data.filters.x`. That
 * guard covers "still loading" and not "the response arrived in a shape we did
 * not expect" — an older deployment, an error body, a proxy that returned
 * something else. Each such read is one line from a blank page.
 *
 * Guarding every read individually is the right thing to do and will still be
 * incomplete, because the next one is always written by someone who assumed the
 * happy path. So the fixes live in both places: guards where we know, and this
 * where we do not.
 *
 * It deliberately does NOT try to explain the error to the reader. "Cannot read
 * properties of undefined" tells them nothing; what they need is that this
 * section failed, the rest of the site works, and nothing shown is wrong.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    // Console only. There is no error-reporting service here on purpose —
    // this site collects nothing about its readers — so the console is where a
    // developer reproducing the problem will look.
    console.error('[section failed]', this.props.label || '', error, info?.componentStack)
    // Until now a reader hitting this saw a message and nobody else ever knew.
    track(EVENTS.SECTION_FAILED, {
      section: this.props.label || 'unknown',
      // The message only, never the stack: stacks are long, and on a minified
      // build they say nothing a name does not.
      reason: String(error?.message || error).slice(0, 100),
    })
  }

  componentDidUpdate(prev) {
    // A boundary that latches forever turns one bad response into a section
    // that stays broken for the rest of the visit. Navigating away and back
    // should give it another go.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="border border-error/40 bg-error/5 rounded-xl p-5 text-body-md text-on-surface max-w-3xl mx-auto my-6">
        <p className="font-bold">{this.props.title || 'This section could not be shown.'}</p>
        <p className="text-label-md text-on-surface-variant mt-1 leading-relaxed">
          {this.props.hint
            || 'Something in the data it received was not the shape it expected. Nothing here is wrong — it simply could not be drawn. The rest of the site is unaffected; reloading usually clears it.'}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="text-label-md text-primary font-bold mt-3"
        >
          Try again
        </button>
      </div>
    )
  }
}
