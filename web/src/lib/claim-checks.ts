// The fact checks: the claim, the record and the reason they differ, in both languages.
//
// The page (src/pages/Claims.tsx) shows these words, and the build (src/lib/seo.ts) writes the
// same words into each check's plain HTML. One source, so a crawler, a link preview and a reader
// see the same explanation. Until 13 Nov 2026 the words lived inside the page component, and the
// plain HTML carried the claim and the figures but not the sentence saying why they differ.
import { CLAIM_Q } from '@/lib/titles'
import { claims } from '@/lib/data-claims'
import { crore, croreTe } from '@/lib/format'

export type Bi = { en: string; te: string }
export type StatusKey = 'matches' | 'definition' | 'unverifiable' | 'differs'

const GOV_2019: Bi = { en: 'The government of 30 May 2019 to 11 June 2024 (Chief Minister Y.S. Jagan Mohan Reddy), about 8 June 2014 to 29 May 2019', te: '2019 మే 30 నుంచి 2024 జూన్ 11 వరకు ప్రభుత్వం (ముఖ్యమంత్రి వై.ఎస్. జగన్ మోహన్ రెడ్డి), 2014 జూన్ 8 నుంచి 2019 మే 29 కాలం గురించి' }
const GOV_2024: Bi = { en: 'The government from 12 June 2024 (Chief Minister N. Chandrababu Naidu), about 30 May 2019 to 11 June 2024', te: '2024 జూన్ 12 నుంచి ప్రభుత్వం (ముఖ్యమంత్రి ఎన్. చంద్రబాబు నాయుడు), 2019 మే 30 నుంచి 2024 జూన్ 11 కాలం గురించి' }
const DOC_2019: Bi = { en: 'White paper on state finances, 10 July 2019 (press record; the official host is offline)', te: 'రాష్ట్ర ఆర్థిక స్థితిపై శ్వేతపత్రం, 2019 జూలై 10 (పత్రికా రికార్డు; అధికారిక సైట్ పనిచేయడం లేదు)' }
const DOC_2024: Bi = { en: 'White Paper on State Finances, tabled 26 July 2024 (press record of a scanned paper)', te: 'రాష్ట్ర ఆర్థిక స్థితిపై శ్వేతపత్రం, 2024 జూలై 26న సభలో (స్కాన్ చేసిన పత్రానికి పత్రికా రికార్డు)' }

export const rec = (slug: string) => claims.find((c: any) => c.slug === slug)
const R = (slug: string, i: number) => rec(slug)?.record[i]?.figure as number
const K = (slug: string, i: number) => rec(slug)?.claims[i]?.figure as number

export type Check = {
  slug: string; q: Bi; status: StatusKey | 'two'; answer: Bi
  claims: { said: Bi; doc: Bi; who: Bi; status: StatusKey; prefix?: Bi }[]
  why: Bi; paperNote: Bi; te: string
}

export const C19 = 'ap-debt-31-march-2019', C24 = 'ap-debt-june-2024', C14 = 'ap-debt-june-2014'
export const CHECKS: Check[] = [
  {
    slug: C19, te: '2019 మార్చి 31 నాటికి రాష్ట్రం అప్పు ఎంత?', q: CLAIM_Q[C19], status: 'two',
    answer: {
      en: `Two white papers, five years apart, give ${crore(K(C19, 0), 0)} and ${crore(K(C19, 1), 0)} for the same day. RBI prints ${crore(R(C19, 0), 0)}, and the state’s audited accounts ${crore(R(C19, 1), 0)}. The difference is what each one counts.`,
      te: `ఐదేళ్ల తేడాతో వచ్చిన రెండు శ్వేతపత్రాలు ఒకే రోజుకు ${croreTe(K(C19, 0), 0)}, ${croreTe(K(C19, 1), 0)} అని చెప్పాయి. ఆర్బీఐ ${croreTe(R(C19, 0), 0)} అని, రాష్ట్ర ఆడిట్ లెక్కలు ${croreTe(R(C19, 1), 0)} అని ముద్రించాయి. తేడా ఒక్కొక్కరు ఏం లెక్కిస్తారన్న దానిలోనే.`,
    },
    claims: [
      { said: { en: 'Debt by the end of 2018-19.', te: '2018-19 చివరికి అప్పు.' }, doc: DOC_2019, who: GOV_2019, status: 'matches', prefix: { en: 'It is the state’s own revised estimate for 2018-19', te: 'ఇది 2018-19కి రాష్ట్ర సొంత సవరించిన అంచనా' } },
      { said: { en: 'Debt on the state’s exchequer as on 31 March 2019.', te: '2019 మార్చి 31 నాటికి రాష్ట్ర ఖజానాపై అప్పు.' }, doc: DOC_2024, who: GOV_2024, status: 'definition' },
    ],
    why: {
      en: 'All four figures describe the same day. The 2019 paper and the audited accounts count the debt the state itself borrowed. RBI counts the same thing with slightly different coverage. The 2024 paper adds two things the others leave out: money borrowed by state corporations with a government guarantee, and bills not yet paid. Those are real obligations, but no auditor publishes a total that includes them.',
      te: 'నాలుగు అంకెలూ ఒకే రోజువి. 2019 పత్రం, ఆడిట్ లెక్కలు రాష్ట్రం స్వయంగా తీసుకున్న అప్పును లెక్కిస్తాయి. ఆర్బీఐ అదే విషయాన్ని కొద్దిగా వేరే పరిధితో లెక్కిస్తుంది. 2024 పత్రం మిగతావి వదిలేసిన రెండింటిని కలుపుతుంది: ప్రభుత్వ హామీతో రాష్ట్ర కార్పొరేషన్లు తీసుకున్న అప్పులు, ఇంకా చెల్లించని బిల్లులు. అవి నిజమైన బాధ్యతలే, కానీ వాటిని కలిపిన మొత్తాన్ని ఏ ఆడిటరూ ప్రచురించరు.',
    },
    paperNote: { en: 'Both governments’ papers are set against the same two records.', te: 'రెండు ప్రభుత్వాల పత్రాలనూ అవే రెండు రికార్డులతో పోల్చాం.' },
  },
  {
    slug: C24, te: 'జూన్ 2024లో రాష్ట్రం అప్పు ₹9,74,556 కోట్లా?', q: CLAIM_Q[C24], status: 'definition',
    answer: {
      en: `The 2024 white paper gives ${crore(K(C24, 0), 0)} for 12 June 2024. For 31 March 2024, RBI prints ${crore(R(C24, 0), 0)} and the state’s accounts ${crore(R(C24, 1), 0)}. The paper’s own breakup puts government debt at ₹4,38,278 crore; the rest is corporation borrowing and unpaid bills.`,
      te: `2024 శ్వేతపత్రం 2024 జూన్ 12కు ${croreTe(K(C24, 0), 0)} అని చెప్పింది. 2024 మార్చి 31కి ఆర్బీఐ ${croreTe(R(C24, 0), 0)}, రాష్ట్ర లెక్కలు ${croreTe(R(C24, 1), 0)} అని ముద్రించాయి. పత్రంలోని విభజన ప్రకారం ప్రభుత్వ అప్పు ₹4,38,278 కోట్లు; మిగతాది కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు.`,
    },
    claims: [
      { said: { en: 'Debt on 12 June 2024: government debt ₹4,38,278 crore, corporation debt ₹2,48,677 crore, plus unpaid dues.', te: '2024 జూన్ 12 నాటికి అప్పు: ప్రభుత్వ అప్పు ₹4,38,278 కోట్లు, కార్పొరేషన్ల అప్పు ₹2,48,677 కోట్లు, అదనంగా చెల్లించని బకాయిలు.' }, doc: DOC_2024, who: GOV_2024, status: 'definition' },
    ],
    why: {
      en: 'The part of the paper’s total that it calls government debt is ₹4,38,278 crore on 12 June 2024. The headline is reached by adding corporation borrowings and unpaid bills, which no auditor totals. Both facts can be held at once: the wider total is worth watching, and it cannot be compared with RBI’s or the CAG’s debt figure.',
      te: 'పత్రం మొత్తంలో ప్రభుత్వ అప్పు అని చెప్పిన భాగం 2024 జూన్ 12 నాటికి ₹4,38,278 కోట్లు. కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు కలిపితే పెద్ద సంఖ్య వస్తుంది; వాటిని కలిపిన మొత్తాన్ని ఏ ఆడిటరూ ప్రచురించరు. రెండూ నిజమే: విస్తృత మొత్తాన్ని గమనించాలి, కానీ దాన్ని ఆర్బీఐ లేదా కాగ్ అప్పు సంఖ్యతో పోల్చలేం.',
    },
    paperNote: { en: 'The figures in the claim are the paper’s own, read from the press record because the tabled copy is an image-only scan.', te: 'సభలో పెట్టిన ప్రతి స్కాన్ చేసిన బొమ్మ మాత్రమే; అందుకే చెప్పిన అంకెలను పత్రికా రికార్డు నుంచి చదివాం.' },
  },
  {
    slug: C14, te: 'జూన్ 2014లో అప్పు సుమారు ₹97,000 కోట్లా?', q: CLAIM_Q[C14], status: 'unverifiable',
    answer: {
      en: `No auditor publishes a debt figure for June 2014. The first year-end figures, for 31 March 2015, are ${crore(R(C14, 0), 0)} (RBI) and ${crore(R(C14, 1), 0)} (the state’s accounts), and they include nine months of the new state’s own borrowing.`,
      te: `2014 జూన్‌కు ఏ ఆడిటరూ అప్పు సంఖ్య ప్రచురించలేదు. మొదటి ఏడాది ముగింపు సంఖ్యలు, 2015 మార్చి 31కి: ${croreTe(R(C14, 0), 0)} (ఆర్బీఐ), ${croreTe(R(C14, 1), 0)} (రాష్ట్ర లెక్కలు). వీటిలో కొత్త రాష్ట్రం తొమ్మిది నెలల్లో తీసుకున్న అప్పు కూడా ఉంది.`,
    },
    claims: [
      { said: { en: 'Debt when the government took office in June 2014.', te: '2014 జూన్‌లో ప్రభుత్వం బాధ్యతలు చేపట్టినప్పుడు అప్పు.' }, doc: DOC_2019, who: GOV_2019, status: 'unverifiable' },
    ],
    why: {
      en: 'The state began on 2 June 2014. Its share of the undivided state’s debt was set by apportionment under the Reorganisation Act, and no auditor published a figure for that day. RBI and the state’s own book print different figures even for March 2015, which shows that every figure depends on what is counted.',
      te: 'రాష్ట్రం 2014 జూన్ 2న మొదలైంది. ఉమ్మడి రాష్ట్ర అప్పులో దాని వాటాను పునర్వ్యవస్థీకరణ చట్టం ప్రకారం పంపకంతో నిర్ణయించారు; ఆ రోజుకు ఏ ఆడిటరూ సంఖ్య ప్రచురించలేదు. 2015 మార్చికి కూడా ఆర్బీఐ, రాష్ట్ర లెక్కలు వేర్వేరు సంఖ్యలు ముద్రించాయి; ప్రతి సంఖ్య ఏం లెక్కిస్తారన్న దానిపై ఆధారపడుతుందని ఇది చూపుతుంది.',
    },
    paperNote: { en: 'We do not reach for a nearby number to call the claim true or false.', te: 'మాటను నిజం లేదా అబద్ధం అనడానికి దగ్గరలోని వేరే సంఖ్యను తీసుకోం.' },
  },
]
