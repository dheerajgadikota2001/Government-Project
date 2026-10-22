// Each page's name in a browser tab, a search result and a WhatsApp link preview, in both languages.
//
// The title is the page's own question where it has one, because that is what a reader searches for
// ("How much does Andhra Pradesh owe?"), followed by the site's name. The description says what the
// page holds and where its numbers come from, in under about 155 characters so search results do not
// cut it. This file is small on purpose: the app reads it on every page change, so it carries words
// only, no data. Pages about one project, district or claim build their own title from their record
// (see seo.ts for the pre-rendered copy and useTitle below for the live one).
import * as React from 'react'

export type Bi = { en: string; te: string }
export type PageWords = { title: Bi; description: Bi }

export const SITE: Bi = { en: 'AP Fact Check', te: 'ఏపీ ఫ్యాక్ట్ చెక్' }

export const PAGE_WORDS: Record<string, PageWords> = {
  home: {
    title: { en: 'AP Fact Check: Andhra Pradesh from its own papers', te: 'ఏపీ ఫ్యాక్ట్ చెక్: ప్రభుత్వ పత్రాల్లోనే ఆంధ్రప్రదేశ్' },
    description: {
      en: 'Projects, money, tenders and promises in Andhra Pradesh, each number taken from a government paper and cited. Free, no login, in English and Telugu.',
      te: 'ఆంధ్రప్రదేశ్‌లో పనులు, డబ్బు, టెండర్లు, హామీలు. ప్రతి అంకె ప్రభుత్వ పత్రం నుంచే, మూలంతో సహా. ఉచితం, లాగిన్ అవసరం లేదు.',
    },
  },
  cards: {
    title: { en: "Today's cards: one fact at a time", te: 'నేటి కార్డులు: ఒక్కో కార్డులో ఒక్కో నిజం' },
    description: { en: 'Short cards, each with one number as the government paper prints it, the paper’s name and its date.', te: 'చిన్న కార్డులు. ప్రతి దానిలో పత్రం ముద్రించిన ఒక అంకె, పత్రం పేరు, తేదీ.' },
  },
  projects: {
    title: { en: 'What is being built in Andhra Pradesh, and is it finished?', te: 'ఆంధ్రప్రదేశ్‌లో ఏం నిర్మిస్తున్నారు, పూర్తయిందా?' },
    description: { en: 'Every government project on record, by district, with cost, status and the official paper each figure came from.', te: 'రికార్డులోని ప్రతి ప్రభుత్వ పని, జిల్లా వారీగా: ఖర్చు, స్థితి, ప్రతి అంకెకు ఆధారమైన పత్రం.' },
  },
  districts: {
    title: { en: 'What is happening where I live? Andhra Pradesh districts', te: 'మా జిల్లాలో ఏం జరుగుతోంది? ఆంధ్రప్రదేశ్ జిల్లాలు' },
    description: { en: 'Pick a district to see its projects, its official notices and its own facts, each from a government paper.', te: 'జిల్లా ఎంచుకోండి: దాని పనులు, అధికారిక నోటీసులు, గణాంకాలు, అన్నీ ప్రభుత్వ పత్రాల నుంచే.' },
  },
  money: {
    title: { en: 'How much does Andhra Pradesh owe?', te: 'ఆంధ్రప్రదేశ్ అప్పు ఎంత?' },
    description: { en: 'The state’s debt, income and spending, as the budget papers and the CAG print them, year by year.', te: 'రాష్ట్ర అప్పు, ఆదాయం, ఖర్చు: బడ్జెట్ పత్రాలు, కాగ్ ముద్రించినట్లే, ఏడాది వారీగా.' },
  },
  'money-departments': {
    title: { en: 'What was planned, and what was spent? Department budgets', te: 'ఏం ప్రణాళిక వేశారు, ఎంత ఖర్చు చేశారు? శాఖల బడ్జెట్లు' },
    description: { en: 'Each department’s budget estimate, revised estimate and actual spending, from the state’s own budget papers.', te: 'ప్రతి శాఖ బడ్జెట్ అంచనా, సవరించిన అంచనా, వాస్తవ ఖర్చు: రాష్ట్ర బడ్జెట్ పత్రాల నుంచే.' },
  },
  'money-states': {
    title: { en: 'Where does Andhra Pradesh stand among the states?', te: 'రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ ఉంది?' },
    description: { en: 'Andhra Pradesh next to every other state, on the measures the RBI and the Union government publish.', te: 'ఆర్బీఐ, కేంద్ర ప్రభుత్వం ప్రచురించే కొలమానాల్లో ఇతర రాష్ట్రాల పక్కన ఆంధ్రప్రదేశ్.' },
  },
  'state-facts': {
    title: { en: 'Andhra Pradesh, by the numbers', te: 'అంకెల్లో ఆంధ్రప్రదేశ్' },
    description: { en: 'The state’s official indicators, year by year, each with the paper and the year it was printed.', te: 'రాష్ట్ర అధికారిక సూచికలు, ఏడాది వారీగా, ప్రతి దానికి పత్రం, ముద్రించిన ఏడాది.' },
  },
  investments: {
    title: { en: 'Which company promises turned into investment?', te: 'ఏ పెట్టుబడి హామీలు నిజమయ్యాయి?' },
    description: { en: 'Investment promises (MoUs) announced for Andhra Pradesh, with what the record shows happened next. A promise is not money spent.', te: 'ఆంధ్రప్రదేశ్‌కు ప్రకటించిన పెట్టుబడి హామీలు (ఎంఓయూలు), తర్వాత ఏం జరిగిందో రికార్డు. హామీ అంటే ఖర్చు చేసిన డబ్బు కాదు.' },
  },
  governments: {
    title: { en: 'Governments of Andhra Pradesh, period by period', te: 'ఆంధ్రప్రదేశ్ ప్రభుత్వాలు, కాలాల వారీగా' },
    description: { en: 'What the record shows for each period, named by its dates and its Chief Minister, from official papers.', te: 'ప్రతి కాలానికి రికార్డు ఏం చూపుతోంది: తేదీలు, ముఖ్యమంత్రి పేరుతో, అధికారిక పత్రాల నుంచే.' },
  },
  claims: {
    title: { en: 'Is what I heard true? Claims checked against the papers', te: 'నేను విన్నది నిజమేనా? పత్రాలతో సరిచూసిన మాటలు' },
    description: { en: 'Numbers said in public, set beside what the government’s own papers print, with both sources named.', te: 'బహిరంగంగా చెప్పిన అంకెలు, ప్రభుత్వ పత్రాలు ముద్రించిన అంకెల పక్కన, రెండు మూలాలతో.' },
  },
  papers: {
    title: { en: 'Every government paper we hold, in one place', te: 'మా దగ్గర ఉన్న ప్రతి ప్రభుత్వ పత్రం, ఒకే చోట' },
    description: { en: 'Budget papers, CAG reports, orders and registers for Andhra Pradesh, each linked to where the government published it.', te: 'ఆంధ్రప్రదేశ్ బడ్జెట్ పత్రాలు, కాగ్ నివేదికలు, ఉత్తర్వులు, రిజిస్టర్లు. ప్రతిదీ ప్రభుత్వం ప్రచురించిన చోటుకు లింకుతో.' },
  },
  tenders: {
    title: { en: 'Which works are out for bids? Andhra Pradesh tenders', te: 'ఏ పనులకు టెండర్లు పిలిచారు? ఆంధ్రప్రదేశ్ టెండర్లు' },
    description: { en: 'Tender notices read every day from the government portals we can reach, with the portal named on every entry. India time.', te: 'మేము చేరగలిగే ప్రభుత్వ పోర్టళ్ల నుంచి రోజూ చదివే టెండర్ నోటీసులు, ప్రతి దానిపై పోర్టల్ పేరుతో.' },
  },
  updates: {
    title: { en: 'When did each source last update?', te: 'ప్రతి మూలం చివరిగా ఎప్పుడు నవీకరించబడింది?' },
    description: { en: 'The daily check of every source, with its date and its result, including the ones that failed.', te: 'ప్రతి మూలంపై రోజువారీ తనిఖీ, తేదీ, ఫలితంతో, విఫలమైనవి కూడా.' },
  },
  helplines: {
    title: { en: 'Who to call, and where to go: Andhra Pradesh helplines', te: 'ఎవరికి ఫోన్ చేయాలి, ఎక్కడికి వెళ్లాలి: సహాయ నంబర్లు' },
    description: { en: 'Official helpline numbers and offices for Andhra Pradesh, each from the department’s own page.', te: 'ఆంధ్రప్రదేశ్ అధికారిక సహాయ నంబర్లు, కార్యాలయాలు, ప్రతిదీ ఆ శాఖ సొంత పేజీ నుంచి.' },
  },
  words: {
    title: { en: 'The words the papers use, in plain words', te: 'పత్రాల్లోని పదాలు, తేలిక మాటల్లో' },
    description: { en: 'Budget estimate, revised estimate, capital outlay and more, each explained with an everyday example.', te: 'బడ్జెట్ అంచనా, సవరించిన అంచనా, మూలధన వ్యయం వంటి పదాలు, రోజువారీ ఉదాహరణలతో.' },
  },
  community: {
    title: { en: 'Community board: readers talk about the record', te: 'కమ్యూనిటీ బోర్డు: రికార్డుపై పాఠకుల మాట' },
    description: { en: 'Question a number, add what you know, talk to other readers. No account needed. Corrections go privately to the maintainer.', te: 'ఒక అంకెను ప్రశ్నించండి, మీకు తెలిసింది చెప్పండి. ఖాతా అవసరం లేదు. సవరణలు నేరుగా నిర్వాహకుడికే.' },
  },
  sources: {
    title: { en: 'Where every number comes from, and how we keep it right', te: 'ప్రతి అంకె ఎక్కడి నుంచి వస్తుంది, దాన్ని ఎలా సరిచూస్తాం' },
    description: { en: 'The sources this site reads, how often, and the rules every figure follows before it is shown.', te: 'ఈ సైట్ చదివే మూలాలు, ఎంత తరచుగా, ప్రతి అంకె చూపే ముందు పాటించే నియమాలు.' },
  },
  about: {
    title: { en: 'About AP Fact Check', te: 'ఏపీ ఫ్యాక్ట్ చెక్ గురించి' },
    description: { en: 'An independent, free site that shows what the government’s own papers say, so anyone can check a claim. We take no side.', te: 'ప్రభుత్వ సొంత పత్రాలు ఏం చెబుతున్నాయో చూపే స్వతంత్ర, ఉచిత సైట్. ఎవరైనా సరిచూసుకోవచ్చు. మేము ఏ పక్షమూ కాదు.' },
  },
  disclaimer: {
    title: { en: 'Disclaimer', te: 'నిరాకరణ' },
    description: { en: 'What this site is and is not, and how to read its figures.', te: 'ఈ సైట్ ఏమిటి, ఏది కాదు, దాని అంకెలను ఎలా చదవాలి.' },
  },
  privacy: {
    title: { en: 'Privacy', te: 'గోప్యత' },
    description: { en: 'What this site keeps about readers, which is very little, and why.', te: 'ఈ సైట్ పాఠకుల గురించి ఏం ఉంచుకుంటుంది (చాలా తక్కువ), ఎందుకు.' },
  },
  notfound: {
    title: { en: 'Page not found', te: 'పేజీ దొరకలేదు' },
    description: { en: 'This address is not a page on AP Fact Check.', te: 'ఈ చిరునామా ఏపీ ఫ్యాక్ట్ చెక్‌లో ఉన్న పేజీ కాదు.' },
  },
}

/** Each checked claim's question, used by the claims page and by its search-result title. */
export const CLAIM_Q: Record<string, Bi> = {
  'ap-debt-31-march-2019': { en: 'What was Andhra Pradesh’s debt on 31 March 2019?', te: '2019 మార్చి 31 నాటికి రాష్ట్రం అప్పు ఎంత?' },
  'ap-debt-june-2024': { en: 'Was Andhra Pradesh’s debt ₹9,74,556 crore in June 2024?', te: 'జూన్ 2024లో రాష్ట్రం అప్పు ₹9,74,556 కోట్లా?' },
  'ap-debt-june-2014': { en: 'Was the debt about ₹97,000 crore in June 2014?', te: 'జూన్ 2014లో అప్పు సుమారు ₹97,000 కోట్లా?' },
}

/** "Page question | AP Fact Check", without repeating the name on Home. */
export function fullTitle(t: Bi, lang: 'en' | 'te') {
  const s = t[lang]
  return s.startsWith(SITE[lang]) ? s : `${s} | ${SITE[lang]}`
}

/** Sets the tab's title while a page is open. A page about one record passes its own words. */
export function useTitle(t: Bi | null | undefined, lang: 'en' | 'te') {
  const text = t ? fullTitle(t, lang) : null
  React.useEffect(() => { if (text) document.title = text }, [text])
}

/* ------------------------------------------------------------------ one record's words */
type ProjectLike = { t: string; st: string }
const bare = (t: string) => t.replace(/\s*\(.*?\)\s*$/, '')

/** A project page asks the reader's question about the work: has it started, or is it finished? */
export function projectQuestion(p: ProjectLike) {
  return p.st === 'tendered' || p.st === 'approved' ? `Has work on ${bare(p.t)} started?` : `Is ${bare(p.t)} finished?`
}
export function projectQuestionTe(p: ProjectLike) {
  return p.st === 'tendered' || p.st === 'approved' ? `${bare(p.t)}: పనులు మొదలయ్యాయా?` : `${bare(p.t)}: పూర్తయిందా?`
}
export const districtTitle = (d: { name: string; te: string }): Bi =>
  ({ en: `What is happening in ${d.name} district?`, te: `${d.te} జిల్లాలో ఏం జరుగుతోంది?` })
export const paperTitle = (d: { name: string; te: string }): Bi =>
  ({ en: `${d.name} district paper: today's news from official sources`, te: `${d.te} జిల్లా పత్రిక: అధికారిక మూలాల నుంచి నేటి వార్తలు` })
