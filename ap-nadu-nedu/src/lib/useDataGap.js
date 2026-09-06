import { useEffect, useRef } from 'react'
import { EVENTS, track } from './analytics'

/**
 * Records that a page told a reader there is nothing here.
 *
 * WHY THIS IS WORTH AN EVENT
 * The News page currently says "No articles collected yet" to every single
 * visitor, and nothing anywhere counts how many people see it. An empty state
 * is honest — this platform shows nothing rather than inventing filler — but
 * an empty state nobody measures is a hole in the product that stays invisible
 * for as long as it takes someone to notice by accident.
 *
 * Fires once per mount and only when the page has finished loading, so a
 * "loading" state is never mistaken for a gap. That distinction is the same one
 * the map makes between `byDistrict == null` and an empty array, and it matters
 * for the same reason: "we do not know yet" and "there is nothing" are
 * different statements about the government's record.
 */
export default function useDataGap(section, { empty, loading = false, extra } = {}) {
  const sent = useRef(false)
  useEffect(() => {
    if (loading || !empty || sent.current) return
    sent.current = true
    track(EVENTS.DATA_GAP_SEEN, { section, ...(extra || {}) })
    // `extra` is deliberately not a dependency: it is usually an inline object
    // and would re-run this on every render, which the ref would swallow but
    // which is still a lie about what this effect depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, empty, loading])
}
