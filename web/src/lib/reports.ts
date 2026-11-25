// The Reports section: one subject at a time, in full (/reports and /reports/<slug>).
//
// This file is small on purpose. The home page and the menu read it, and neither should download a report's
// data to show a card. A report's figures live in its own data file (the summit's in summit_reports.json);
// the three figures on its card are copied here as printed, and scripts/test_summit_reports.mjs fails the
// build if any of them is not word for word a figure in that file, with the same report behind it.
export type Bi = { en: string; te: string }

/** One figure on a report's card: the amount as printed, what it counts, and the report that printed it. */
export type CardFigure = { amount: Bi; what: Bi; report: string; group: string }

export type ReportEntry = {
  slug: string
  /** The summit whose reports this is built from (summit_reports.json). */
  summit: string
  eyebrow: Bi
  /** The heading and the tab title: a name a reader would search with, not a question. */
  title: Bi
  description: Bi
  /** The day the report first went up, and the day its figures were last checked. */
  published: string
  checked: string
  card: CardFigure[]
  /** Said on every card: what is still missing before these are the state's own figures. */
  missing: Bi
}

export const REPORTS: ReportEntry[] = [
  {
    slug: 'summit-2026',
    summit: 'ps2026',
    eyebrow: { en: 'Partnership Summit 2026, Visakhapatnam', te: 'భాగస్వామ్య సదస్సు 2026, విశాఖపట్నం' },
    title: { en: 'Partnership Summit 2026: every reported promise, checked', te: 'భాగస్వామ్య సదస్సు 2026: నివేదించిన ప్రతి హామీ, సరిచూసి' },
    description: {
      en: 'The 12 and 13 November summit in full: what was expected before, the totals and why they differ, each day, every sector, the districts named, every company named, where newspapers disagree, and what earlier summits led to. Promises, not money spent.',
      te: 'నవంబర్ 12, 13 సదస్సు పూర్తిగా: ముందు ఆశించినది, మొత్తాలు, అవి ఎందుకు వేరు, ప్రతి రోజు, ప్రతి రంగం, పేర్కొన్న జిల్లాలు, పేర్కొన్న ప్రతి కంపెనీ, పత్రికలు ఎక్కడ విభేదించాయి, గత సదస్సులు ఏమయ్యాయి. హామీలు, ఖర్చు చేసిన డబ్బు కాదు.',
    },
    published: '2026-11-24',
    checked: '2026-11-24',
    card: [
      { amount: { en: '₹9,88,957 crore', te: '₹9,88,957 కోట్లు' }, what: { en: '303 MoUs, the summit and October’s regional meetings together, in the Chief Minister’s words', te: '303 ఎంఓయూలు, సదస్సు, అక్టోబర్ ప్రాంతీయ సమావేశాలు కలిపి, ముఖ్యమంత్రి మాటల్లో' }, report: 'tt', group: 'both' },
      { amount: { en: '₹9,02,434 crore', te: '₹9,02,434 కోట్లు' }, what: { en: '109 MoUs at the summit itself, in the Chief Minister’s words', te: 'సదస్సులోనే 109 ఎంఓయూలు, ముఖ్యమంత్రి మాటల్లో' }, report: 'tt', group: 'summit' },
      { amount: { en: '₹5,84,355 crore', te: '₹5,84,355 కోట్లు' }, what: { en: 'The first day alone, 73 MoUs and 15 government orders', te: 'మొదటి రోజే, 73 ఎంఓయూలు, 15 ప్రభుత్వ ఉత్తర్వులు' }, report: 'hans', group: 'day1' },
    ],
    missing: { en: 'The state has not yet published its own list of these MoUs. Every figure is a newspaper report, named.', te: 'ఈ ఎంఓయూల సొంత జాబితాను రాష్ట్రం ఇంకా ప్రచురించలేదు. ప్రతి అంకె వార్తా నివేదికదే, పేరుతో సహా.' },
  },
]

export const reportBySlug = new Map(REPORTS.map((r) => [r.slug, r]))
/** The report built from a summit's reports, for the summit page's link to it. */
export const reportForSummit = (key: string) => REPORTS.find((r) => r.summit === key) ?? null
