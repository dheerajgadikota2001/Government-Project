/**
 * One source of truth for how a government is coloured on this platform.
 *
 * This file is .jsx, not .js, because it exports a component (TenureDefs). esbuild
 * does not parse JSX inside a .js file and the build fails with a confusing syntax
 * error on the first tag.
 *
 * WHY THIS FILE EXISTS
 * Nine components each declared their own TINT map, and they had already drifted:
 * three different values were in use for the 2024 government, and one page coloured
 * it identically to the 2014 one. A reader comparing two charts was being shown two
 * different colour systems. Everything now imports from here.
 *
 * WHY THESE COLOURS
 * The previous pair failed an accessibility check. The 2024 gold read as grey to a
 * colourblind reader (chroma below the floor), and the 2014 gold sat at 2.36:1
 * against the page — below the 3:1 minimum for a filled mark. The values below pass
 * all six checks in both light and dark mode: lightness band, chroma floor, CVD
 * separation (ΔE 25.4 protan, 22.3 tritan), normal-vision separation (28.5) and
 * contrast.
 *
 * WHY ONLY TWO COLOURS FOR THREE GOVERNMENTS
 * The 2014 and 2024 governments are the same party. Giving them two similar golds is
 * what broke the palette before: two shades of one hue is the hardest pair for a
 * colourblind reader, and darkening a gold enough to separate it turns it grey. So
 * they share a colour, which is also the honest thing to show, and the second term is
 * distinguished by a diagonal hatch plus its position on the time axis. The two terms
 * are never adjacent in a time series -- the 2019 government sits between them -- so
 * position does most of the work already.
 *
 * Colour is never the only carrier of identity. Every chart that uses this also
 * labels its series or its axis.
 */

export const TENURE_COLOR = {
  pre: '#8d8b83',       // before the first post-bifurcation government
  pre_tenure: '#8d8b83',
  tdp1: '#b5851b',      // TDP, June 2014 to May 2019
  ysrcp: '#2f6bb5',     // YSRCP, May 2019 to June 2024
  tdp2: '#b5851b',      // TDP-led NDA, June 2024 onward — same party, same colour
  boundary: '#8d8b83',  // the day a government changed
}

/** Order for legends and stacked marks. Never cycled, never re-assigned by rank. */
export const TENURE_ORDER = ['pre', 'tdp1', 'ysrcp', 'tdp2']

/** Governments that carry a hatch so a same-colour pair stays distinguishable. */
export const TENURE_HATCHED = new Set(['tdp2'])

/** Stable SVG pattern ids, so two charts on one page cannot collide. */
export const PATTERN_ID = {
  tdp2: 'apnnHatchTdp2',
  partial: 'apnnHatchPartial',
  unchecked: 'apnnHatchUnchecked',
}

/**
 * What to paint a mark with. Pass the tenure key; returns a colour or a pattern url.
 * `plain` forces the flat colour, for legend swatches and small dots where a hatch
 * would just look like noise.
 */
export function tenureFill(tenure, { plain = false } = {}) {
  const color = TENURE_COLOR[tenure] || TENURE_COLOR.boundary
  if (!plain && TENURE_HATCHED.has(tenure)) return `url(#${PATTERN_ID.tdp2})`
  return color
}

/** Stroke for a hatched mark, so its edge still reads at small sizes. */
export function tenureStroke(tenure) {
  return TENURE_HATCHED.has(tenure) ? TENURE_COLOR[tenure] : 'none'
}

/**
 * The <defs> every chart needs. Drop <TenureDefs /> inside each <svg> once.
 * Kept here rather than duplicated per chart so a change to the hatch angle or
 * weight lands everywhere at once.
 */
export function TenureDefs() {
  return (
    <defs>
      {/* second term of the same party: same colour, diagonal hatch */}
      <pattern id={PATTERN_ID.tdp2} width="7" height="7"
        patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill={TENURE_COLOR.tdp2} opacity="0.3" />
        <rect width="3.2" height="7" fill={TENURE_COLOR.tdp2} />
      </pattern>
      {/* a figure the state published, but on a narrower basis than its neighbours */}
      <pattern id={PATTERN_ID.partial} width="6" height="6"
        patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
        <rect width="6" height="6" fill="currentColor" opacity="0.18" />
        <rect width="2.4" height="6" fill="currentColor" opacity="0.85" />
      </pattern>
      {/* a blank that is ours: we could not open the document */}
      <pattern id={PATTERN_ID.unchecked} width="6" height="6"
        patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="transparent" />
        <rect width="2" height="6" fill="#d6d4cc" />
      </pattern>
    </defs>
  )
}

/** i18n key for a government's name, so labels stay in one place too. */
export function tenureLabelKey(tenure) {
  return `depts.tenure.${tenure}`
}
