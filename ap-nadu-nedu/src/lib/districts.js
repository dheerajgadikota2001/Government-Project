/**
 * The 26 districts of Andhra Pradesh, and every spelling that means one of them.
 *
 * WHY THIS FILE EXISTS
 *
 * The register stores the district exactly as the source document spells it,
 * and sources disagree. A MoSPI table says "Tirupathi", a budget annexure says
 * "Tirupati", and an older road list still says "Nellore" for a district
 * renamed Sri Potti Sriramulu Nellore in 2022. None of those spellings is
 * wrong. They are just different names for one place.
 *
 * The API has folded them for a long time (backend/app/constants/districts.py,
 * normalise_district). The browser did not. So districtSlug turned
 * "Tirupathi" into /districts/tirupathi, a page that does not exist, and 42
 * project pages linked into nothing while the district page they belonged to
 * sat one spelling away. Google followed those links, found nothing, and the
 * projects were orphaned from their own district.
 *
 * WHAT THIS IS NOT
 *
 * It is not a spelling correction. Nothing here rewrites what a source said.
 * The record keeps its own words; only the address is canonicalised, so that
 * one district has one page instead of two half-filled ones.
 *
 * KEEPING IT HONEST
 *
 * This list is a mirror of the Python one, and a mirror drifts. The test in
 * scripts/tests/districts.test.mjs parses districts.py and fails if the two
 * ever disagree, so adding a spelling in one place and forgetting the other
 * breaks the build rather than quietly orphaning pages again.
 */

/** The 26 canonical names, exactly as a reader should see them. */
export const AP_DISTRICTS = [
  "Alluri Sitharama Raju",
  "Anakapalli",
  "Ananthapuramu",
  "Annamayya",
  "Bapatla",
  "Chittoor",
  "Dr. B.R. Ambedkar Konaseema",
  "East Godavari",
  "Eluru",
  "Guntur",
  "Kakinada",
  "Krishna",
  "Kurnool",
  "Nandyal",
  "NTR",
  "Palnadu",
  "Parvathipuram Manyam",
  "Prakasam",
  "Sri Potti Sriramulu Nellore",
  "Sri Sathya Sai",
  "Srikakulam",
  "Tirupati",
  "Visakhapatnam",
  "Vizianagaram",
  "West Godavari",
  "YSR Kadapa"
]


/**
 * Spellings that appear in source documents, mapped onto the canonical name.
 * Keys are lower case with single spaces; lookup normalises before matching.
 */
export const DISTRICT_ALIASES = {
  "alluri seetharama raju": "Alluri Sitharama Raju",
  "alluri sitarama raju": "Alluri Sitharama Raju",
  "ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
  "anantapur": "Ananthapuramu",
  "anantapuramu": "Ananthapuramu",
  "ananthapur": "Ananthapuramu",
  "asr": "Alluri Sitharama Raju",
  "b.r. ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
  "cuddapah": "YSR Kadapa",
  "dr br ambedkar konaseema": "Dr. B.R. Ambedkar Konaseema",
  "kadapa": "YSR Kadapa",
  "konaseema": "Dr. B.R. Ambedkar Konaseema",
  "machilipatnam": "Krishna",
  "manyam": "Parvathipuram Manyam",
  "narasaraopet": "Palnadu",
  "nellore": "Sri Potti Sriramulu Nellore",
  "rajahmundry": "East Godavari",
  "rajamahendravaram": "East Godavari",
  "sathya sai": "Sri Sathya Sai",
  "sps nellore": "Sri Potti Sriramulu Nellore",
  "spsr nellore": "Sri Potti Sriramulu Nellore",
  "sri balaji": "Tirupati",
  "sri satya sai": "Sri Sathya Sai",
  "sri satyasai": "Sri Sathya Sai",
  "tirupathi": "Tirupati",
  "tirupati urban": "Tirupati",
  "vijayawada": "NTR",
  "vishakhapatnam": "Visakhapatnam",
  "vizag": "Visakhapatnam",
  "ysr": "YSR Kadapa"
}


const BY_NAME = new Map(AP_DISTRICTS.map(n => [n.toLowerCase(), n]))
const SQUASHED = new Map(AP_DISTRICTS.map(n => [n.toLowerCase().replace(/\s+/g, ''), n]))
const ALIAS_SQUASHED = new Map(
  Object.entries(DISTRICT_ALIASES).map(([a, n]) => [a.replace(/\s+/g, ''), n]))

/**
 * The canonical name for any spelling of a district, or null.
 *
 * Mirrors normalise_district in the backend, in the same order, so that a name
 * the API accepts is a name this resolves. The substring fallback is
 * deliberately last and deliberately requires a unique hit: "guntur district"
 * is Guntur, but a string containing two district names is ambiguous and
 * resolving it would invent a fact.
 */
export function canonicalDistrict(raw) {
  if (!raw) return null
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ')
  if (!key) return null

  const exact = BY_NAME.get(key)
  if (exact) return exact

  const alias = DISTRICT_ALIASES[key]
  if (alias) return alias

  // A district name broken across a line in a scraped PDF ("Visakhapatna m").
  const squashed = key.replace(/\s+/g, '')
  const noSpace = SQUASHED.get(squashed) || ALIAS_SQUASHED.get(squashed)
  if (noSpace) return noSpace

  const hits = AP_DISTRICTS.filter(n => key.includes(n.toLowerCase()))
  return hits.length === 1 ? hits[0] : null
}
