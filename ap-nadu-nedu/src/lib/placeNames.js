/**
 * District names in the reader's language.
 *
 * WHY THIS FILE EXISTS
 *
 * The Telugu catalogue translates every sentence on the site, 1,900 of them,
 * and then every one of those sentences printed the district in English:
 * "Guntur జిల్లాలో ప్రభుత్వ ప్రాజెక్టులు". The name came from the register,
 * which holds whatever the source document printed, and nothing between the
 * register and the page knew a district has a Telugu name.
 *
 * Twenty six names, checked by hand, cover every district page, every project
 * sentence that says where a work is, and the map. They are keyed by the
 * canonical English name so that a source document's own spelling ("Anantapur",
 * "Tirupathi") still finds its Telugu name through canonicalDistrict.
 *
 * WHY THE TRANSLATORS CALL THIS, NOT EVERY PAGE
 *
 * A {district} slot appears in dozens of catalogue strings and more will be
 * written. Fixing each call site means the next one written forgets. So both
 * translators, the prerenderer's and the app's, fill a {district} slot through
 * localiseVars, and a new sentence gets the Telugu name without anyone
 * remembering to ask for it.
 */
import { canonicalDistrict } from './districts.js'

export const DISTRICT_NAMES = {
  te: {
    'Alluri Sitharama Raju': 'అల్లూరి సీతారామరాజు',
    'Anakapalli': 'అనకాపల్లి',
    'Ananthapuramu': 'అనంతపురం',
    'Annamayya': 'అన్నమయ్య',
    'Bapatla': 'బాపట్ల',
    'Chittoor': 'చిత్తూరు',
    'Dr. B.R. Ambedkar Konaseema': 'డా. బి.ఆర్. అంబేద్కర్ కోనసీమ',
    'East Godavari': 'తూర్పు గోదావరి',
    'Eluru': 'ఏలూరు',
    'Guntur': 'గుంటూరు',
    'Kakinada': 'కాకినాడ',
    'Krishna': 'కృష్ణా',
    'Kurnool': 'కర్నూలు',
    'Nandyal': 'నంద్యాల',
    'NTR': 'ఎన్టీఆర్',
    'Palnadu': 'పల్నాడు',
    'Parvathipuram Manyam': 'పార్వతీపురం మన్యం',
    'Prakasam': 'ప్రకాశం',
    'Sri Potti Sriramulu Nellore': 'శ్రీ పొట్టి శ్రీరాములు నెల్లూరు',
    'Sri Sathya Sai': 'శ్రీ సత్యసాయి',
    'Srikakulam': 'శ్రీకాకుళం',
    'Tirupati': 'తిరుపతి',
    'Visakhapatnam': 'విశాఖపట్నం',
    'Vizianagaram': 'విజయనగరం',
    'West Godavari': 'పశ్చిమ గోదావరి',
    'YSR Kadapa': 'వైఎస్ఆర్ కడప',
  },
}

/**
 * The district's name in `lang`, or the name as given.
 *
 * A name nothing can resolve is returned untouched rather than dropped: a
 * page that says "Ruritania" is wrong in a way a reader can see and report,
 * and a page that says nothing has lost the fact altogether.
 */
export function placeName(raw, lang) {
  if (!raw) return raw
  const table = DISTRICT_NAMES[lang]
  if (!table) return raw
  const canonical = canonicalDistrict(raw)
  return (canonical && table[canonical]) || raw
}

/** The same vars, with any {district} slot in the page's language. */
export function localiseVars(vars, lang) {
  if (!vars || !DISTRICT_NAMES[lang] || !('district' in vars)) return vars
  return { ...vars, district: placeName(vars.district, lang) }
}
