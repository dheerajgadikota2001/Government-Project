import * as React from 'react'

// Reading aloud with the phone's own voice (the browser's speech engine).
//
// This is the preview's voice. Most Android phones carry Google's Telugu voice; some phones and
// most laptops do not, and the page says so instead of staying silent. The live paper will ship
// recorded Telugu audio for every edition, made once when the edition is approved, so every
// phone hears the same clear voice. This hook is the fallback and the way to try it today.
//
// Sentences are queued one by one: some browsers stop a single long utterance after about
// fifteen seconds, and a sentence at a time also lets the page show which item is being read.

export type Voice = 'te' | 'en'

function pickVoice(lang: Voice): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const all = window.speechSynthesis.getVoices()
  const want = lang === 'te' ? ['te-IN', 'te'] : ['en-IN', 'en-GB', 'en-US', 'en']
  for (const w of want) {
    const v = all.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(w.toLowerCase()))
    if (v) return v
  }
  return null
}

const sentences = (text: string) =>
  text.replace(/\s+/g, ' ').split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean)

export function useSpeaker() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [voices, setVoices] = React.useState<{ te: boolean; en: boolean }>({ te: false, en: false })
  const [playing, setPlaying] = React.useState<string | null>(null)   // id of the item being read
  const queue = React.useRef<{ id: string; text: string; lang: Voice }[]>([])
  const stopped = React.useRef(false)

  React.useEffect(() => {
    if (!supported) return
    const check = () => setVoices({ te: !!pickVoice('te'), en: !!pickVoice('en') })
    check()
    window.speechSynthesis.addEventListener?.('voiceschanged', check)
    return () => { window.speechSynthesis.removeEventListener?.('voiceschanged', check); window.speechSynthesis.cancel() }
  }, [supported])

  const next = React.useCallback(() => {
    if (stopped.current) return
    const item = queue.current.shift()
    if (!item) { setPlaying(null); return }
    setPlaying(item.id)
    const u = new SpeechSynthesisUtterance(item.text)
    const v = pickVoice(item.lang)
    if (v) u.voice = v
    u.lang = item.lang === 'te' ? 'te-IN' : 'en-IN'
    u.rate = item.lang === 'te' ? 0.92 : 0.95
    u.onend = () => next()
    u.onerror = () => next()
    window.speechSynthesis.speak(u)
  }, [])

  /** Read a list of (id, text) in order, sentence by sentence. Calling again replaces the queue. */
  const play = React.useCallback((parts: { id: string; text: string }[], lang: Voice) => {
    if (!supported) return
    window.speechSynthesis.cancel()
    stopped.current = false
    queue.current = parts.flatMap((p) => sentences(p.text).map((t) => ({ id: p.id, text: t, lang })))
    next()
  }, [supported, next])

  const stop = React.useCallback(() => {
    stopped.current = true
    queue.current = []
    if (supported) window.speechSynthesis.cancel()
    setPlaying(null)
  }, [supported])

  return { supported, voices, playing, play, stop }
}
