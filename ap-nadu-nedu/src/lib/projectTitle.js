/**
 * Titles as a reader should see them, not as a PDF column left them.
 *
 * WHY THIS FILE EXISTS
 *
 * 150 of the 673 projects in the register are titled in capitals, because the
 * MoSPI flash report and the AMRUT lists are typeset that way and the parser
 * copies what the document says. That is right for the record and wrong for
 * the page: 900 pages across six languages carry a shouting h1 and a shouting
 * <title>, which is what a search result shows, and capitals read as spam long
 * before anyone reads the words.
 *
 * WHAT THIS CHANGES AND WHAT IT DOES NOT
 *
 * Case only. Not a single letter is added, removed or reordered, so no figure
 * and no place name can be altered by it. A title that is already written
 * normally is returned untouched, character for character, because a parser
 * that "improves" a correctly cased title is a parser that will eventually
 * mangle one.
 *
 * WHAT IT DELIBERATELY REFUSES TO FIX
 *
 * The same PDFs also break words across a column edge: the register really
 * holds "IMPROVEME NTS", "EAST GODA VARI" and "Venkateshwa rapuram". Joining
 * those needs a dictionary to check the join against, and without one every
 * repair is a guess at what a government document said. On this platform a
 * guessed word is the same class of error as a guessed number. They come out
 * of here as "Improveme Nts", which is no worse than what went in, and the
 * real fix belongs in the PDF parser that split them.
 */

/**
 * Strings that are not words and must keep their capitals.
 *
 * Every entry below length five is one this register actually contains, read
 * off the 150 titles rather than imagined. The longer ones are the agencies
 * and schemes that file these projects. Deliberately absent: NO, IT, CC and
 * anything else that is also an ordinary English word, because keeping those
 * shouting costs more than title casing them.
 */
export const ACRONYMS = new Set([
  // units and road furniture, straight from the flash report's own columns
  'KM', 'KMS', 'NH', 'SH', 'CH', 'RD', 'ROB', 'RUB', 'LC', 'PKG', 'NOS',
  'HP', 'MW', 'MVA', 'KV', 'KVA', 'GW', 'LPS', 'MLD', 'CUMEC', 'TMC',
  // states, bodies and schemes
  'AP', 'TN', 'ULB', 'GVMC', 'APTIDCO', 'AMRUT', 'IISER', 'NITB', 'VUPS',
  'CGD', 'BG', 'CD', 'PS', 'SS', 'NL', 'PB', 'VR', 'DD', 'MA',
  'NTR', 'YSR', 'APIIC', 'APSRTC', 'APEPDCL', 'APSPDCL', 'APCRDA',
  'NHAI', 'NTPC', 'ONGC', 'GAIL', 'BPCL', 'HPCL', 'IOCL', 'RINL', 'BHEL',
  'STP', 'WTP', 'ETP', 'ESR', 'GLSR', 'OHSR', 'RCC', 'SEZ', 'MSME', 'PPP',
])

/** Words that stay lowercase inside a title, but not at the start of one. */
export const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on',
  'or', 'the', 'to', 'via', 'with',
])

const ROMAN = /^(?:X{0,3})(?:IX|IV|V?I{0,3})$/

/**
 * True when a title is written in capitals rather than merely containing some.
 *
 * Measured on letters only, so digits, hyphens and the chainage notation that
 * fills these titles do not tip the count either way. The threshold is 90 per
 * cent rather than 100 because one stray lower case letter from a PDF is
 * common and does not make a shouting title a considered one.
 */
export function isShouting(title) {
  const letters = String(title || '').match(/\p{L}/gu)
  if (!letters || letters.length < 4) return false
  const upper = letters.filter(c => c === c.toUpperCase() && c !== c.toLowerCase())
  return upper.length / letters.length > 0.9
}

/**
 * One whitespace-separated token, cased.
 *
 * Split again on the punctuation that joins two real tokens inside one word,
 * because a title carries PKG-I, VIJAYAWADA-GUDUR, KURNOOL/KADAPA and
 * B.KOTHAPALLI, and each half wants its own answer. A part holding a digit is
 * returned exactly as it arrived: 6L, 228+000 and NH-16 are notation, and
 * nothing good comes of casing notation.
 */
function casePart(part, { lowerSmall }) {
  if (!part) return part
  if (/\d/.test(part)) return part

  const lead = part.match(/^[^\p{L}]*/u)[0]
  const tail = part.match(/[^\p{L}]*$/u)[0]
  const core = part.slice(lead.length, part.length - tail.length)
  if (!core) return part

  if (core.length === 1) return part                    // B. E. O. initials
  if (ACRONYMS.has(core.toUpperCase())) return lead + core.toUpperCase() + tail
  if (ROMAN.test(core.toUpperCase())) return lead + core.toUpperCase() + tail
  if (lowerSmall && SMALL_WORDS.has(core.toLowerCase())) {
    return lead + core.toLowerCase() + tail
  }
  return lead + core[0].toUpperCase() + core.slice(1).toLowerCase() + tail
}

/**
 * The title to show a reader.
 *
 * @param title  the register's own string
 * @returns      the same string when it is not shouting, otherwise cased
 */
export function displayTitle(title) {
  const raw = String(title == null ? '' : title)
  if (!isShouting(raw)) return raw

  let first = true
  return raw.split(/(\s+)/).map(chunk => {
    if (/^\s+$/.test(chunk) || !chunk) return chunk
    // Split on the joiners, keeping them, so PKG-I stays PKG-I and
    // VIJAYAWADA-GUDUR becomes Vijayawada-Gudur.
    const cased = chunk.split(/([-/.&])/).map((part, i) => {
      if (/^[-/.&]$/.test(part)) return part
      const out = casePart(part, { lowerSmall: !first || i > 0 })
      return out
    }).join('')
    first = false
    return cased
  }).join('')
}

/**
 * Titles where the source PDF looks to have torn a word across a column edge.
 *
 * Reporting only. Nothing here repairs anything: joining "IMPROVEME NTS" back
 * together needs a dictionary to check the join against, and without one every
 * repair is a guess at what a government document said. On this platform a
 * guessed word is the same class of error as a guessed number.
 *
 * WHY IT READS THE WHOLE REGISTER
 *
 * The first version of this flagged any short piece after a long word and
 * returned 219 titles, among them "BYPASS ROAD" and "CROSS ROAD". Shape alone
 * cannot tell a torn fragment from a short English word, and a warning that
 * cries wolf 219 times is worse than no warning.
 *
 * The signal that does work is rarity across the register itself. "ROAD",
 * "PORT" and "NAGAR" recur in hundreds of titles because they are words.
 * "NTS", "VARI" and "ITHA" appear once or twice, because they are the tail of
 * one word that a column edge cut in half. So the vocabulary is built from all
 * 673 titles and the test is: a short piece, rare in the register, sitting
 * directly after a long word.
 *
 * It is still a heuristic, and it is honest about that: it catches
 * "IMPROVEME NTS" and misses "Venkateshwa rapuram", where both halves are long
 * enough to pass for words.
 *
 * @param titles  every title in the register
 * @returns [{ title, at }]  at is the pair that looks torn
 */
export function splitSuspects(titles, { rareAtMost = 1, shortAtMost = 4, longAtLeast = 5 } = {}) {
  const words = t => String(t || '').split(/\s+/).filter(Boolean)
  const bare = w => w.replace(/[^\p{L}]/gu, '').toUpperCase()

  const seen = new Map()
  for (const t of titles) {
    for (const w of words(t)) {
      const key = bare(w)
      if (key) seen.set(key, (seen.get(key) || 0) + 1)
    }
  }

  const out = []
  for (const t of titles) {
    const ws = words(t)
    for (let i = 1; i < ws.length; i++) {
      const prev = bare(ws[i - 1])
      const here = bare(ws[i])
      if (prev.length < longAtLeast) continue
      if (here.length < 2 || here.length > shortAtMost) continue
      if (ACRONYMS.has(here) || ROMAN.test(here) || SMALL_WORDS.has(here.toLowerCase())) continue
      if (/\d/.test(ws[i]) || /\d/.test(ws[i - 1])) continue
      // Both pieces must be plain words. A bracket, a hyphen or a dot means
      // notation, not a torn word: "(PHASE-II PKG-I)" and "CSPURAM I.E." are
      // how the source refers to a package, and flagging them taught the
      // warning to cry wolf.
      if (!/^\p{L}+$/u.test(ws[i]) || !/^\p{L}+$/u.test(ws[i - 1])) continue
      if ((seen.get(here) || 0) > rareAtMost) continue
      out.push({ title: t, at: `${ws[i - 1]} ${ws[i]}` })
      break
    }
  }
  return out
}
