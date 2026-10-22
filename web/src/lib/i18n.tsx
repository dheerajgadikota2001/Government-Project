import * as React from 'react'

// Interface words in English and Telugu. The Telugu is a first draft for the
// native editor; nothing here is a translation of a paper's own words.
export type Lang = 'en' | 'te'
type Bi = { en: string; te: string }

const STRINGS = {
  brand: { en: 'AP Fact Check', te: 'ఏపీ ఫ్యాక్ట్ చెక్' },
  tagline: { en: 'Independent. Free. No login.', te: 'స్వతంత్రం. ఉచితం. లాగిన్ అవసరం లేదు.' },
  navHome: { en: 'Home', te: 'హోమ్' },
  navProjects: { en: 'Projects', te: 'పనులు' },
  navDistrict: { en: 'My district', te: 'మా జిల్లా' },
  navMoney: { en: 'Money', te: 'డబ్బు' },
  navInvest: { en: 'Investment promises', te: 'పెట్టుబడి హామీలు' },
  navClaims: { en: 'Check a claim', te: 'నిజమేనా?' },
  navPapers: { en: 'Government papers', te: 'ప్రభుత్వ పత్రాలు' },
  navPeriods: { en: 'Governments by period', te: 'ప్రభుత్వాల వారీగా' },
  navCards: { en: "Today's cards", te: 'నేటి కార్డులు' },
  navCardsShort: { en: 'Cards', te: 'కార్డులు' },
  navMore: { en: 'More', te: 'మరిన్ని' },
  navHelp: { en: 'Helplines', te: 'సహాయ నంబర్లు' },
  navTenders: { en: 'Tenders', te: 'టెండర్లు' },
  navFacts: { en: 'State facts', te: 'రాష్ట్ర గణాంకాలు' },
  navStates: { en: 'All states', te: 'అన్ని రాష్ట్రాలు' },
  navUpdates: { en: "What's new", te: 'కొత్తగా ఏముంది' },
  navCommunity: { en: 'Community', te: 'కమ్యూనిటీ' },
  navSources: { en: 'Sources and method', te: 'మూలాలు, పద్ధతి' },
  navAbout: { en: 'About', te: 'మా గురించి' },
  navDisclaimer: { en: 'Disclaimer', te: 'నిరాకరణ' },
  navPrivacy: { en: 'Privacy', te: 'గోప్యత' },
  navWords: { en: 'Words to know', te: 'తెలుసుకోవాల్సిన పదాలు' },
  shortAnswer: { en: 'The short answer', te: 'సంక్షిప్త సమాధానం' },
  howToRead: { en: 'How to read it', te: 'ఎలా చదవాలి' },
  example: { en: 'An everyday example', te: 'ఒక ఉదాహరణ' },
  madeUp: { en: 'made-up numbers', te: 'ఊహించిన అంకెలు' },
  notTell: { en: 'What this does not tell you', te: 'ఇది చెప్పనిది' },
  navSearch: { en: 'Search', te: 'వెతకండి' },
  search: { en: 'Search a work, a district or a paper', te: 'పని, జిల్లా లేదా పత్రం వెతకండి' },
  listen: { en: 'Listen', te: 'వినండి' },
  seePapers: { en: 'See all the papers', te: 'అన్ని పత్రాలు చూడండి' },
  seeNumbers: { en: 'See the numbers', te: 'సంఖ్యలు చూడండి' },
  hideNumbers: { en: 'Hide the numbers', te: 'సంఖ్యలు దాచండి' },
  source: { en: 'Source', te: 'ఆధారం' },
  notPublished: { en: 'The government has not published this', te: 'ప్రభుత్వం దీన్ని ప్రచురించలేదు' },
  notRead: { en: 'We have not read this paper yet', te: 'ఈ పత్రాన్ని మేము ఇంకా చదవలేదు' },
  noDistrict: { en: 'District not named in the paper', te: 'పత్రంలో జిల్లా పేరు లేదు' },
  newDistrict: { en: 'A district of 1 January 2026', te: '2026 జనవరి 1న ఏర్పడిన జిల్లా' },
  duePassed: { en: 'Due date has passed', te: 'గడువు దాటిపోయింది' },
  plan: { en: 'A plan, not an event', te: 'ఇది ప్రణాళిక మాత్రమే' },
  design: { en: 'Design', te: 'డిజైన్' },
} satisfies Record<string, Bi>

export type StringKey = keyof typeof STRINGS

type Ctx = {
  lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string; pick: (b?: Partial<Bi> | null) => string
  /** Inline bilingual copy: the Telugu is a draft for the native editor. */
  tr: <T,>(en: T, te: T) => T
}
const LangContext = React.createContext<Ctx | null>(null)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => {
    try { return (localStorage.getItem('apfc-lang') as Lang) || 'en' } catch { return 'en' }
  })
  const setLang = React.useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('apfc-lang', l) } catch { /* private mode: keep it in memory */ }
  }, [])
  const value = React.useMemo<Ctx>(() => ({
    lang, setLang,
    t: (k) => STRINGS[k][lang],
    // Paper text with no Telugu stays in English; the caller marks it lang="en".
    pick: (b) => (b ? (b[lang] ?? b.en ?? '') : ''),
    tr: (en, te) => (lang === 'te' ? te : en),
  }), [lang, setLang])
  React.useEffect(() => { document.documentElement.lang = lang === 'te' ? 'te' : 'en' }, [lang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const c = React.useContext(LangContext)
  if (!c) throw new Error('useLang outside LangProvider')
  return c
}
