// The Polavaram story, step by step. Generated from the fact-checked draft
// (ap-nadu-nedu/src/data/stories/drafts/613-polavaram.json): every sentence is the draft's own,
// in English and Telugu, with its sources. Two sentences come from the record itself (the June 2025
// reading and the Lok Sabha water answer). Each step names the picture that goes with it, and the
// picture's words (labels, callouts) only repeat what the step itself says or what its paper prints.
// Status: draft, not yet reviewed by the owner. Do not publish to the live site before review.

export type Bi = { en: string; te: string }
export type StoryPin = { at: string; label: Bi }
export type MeasureRow = { src: string; date: string; measure: string; label: Bi }
export type StoryPic =
  /** The 3D dam, drawn to a printed share of work (null: the dam as planned). */
  | { kind: 'dam'; pct: number | null; pins?: StoryPin[]; big?: { value: string; note: Bi } }
  /** The project road: every dated event in the story, with the step's own events lit. */
  | { kind: 'road'; focus: string[]; note: Bi; detail?: Bi }
  /** Each cost as one paper printed it; the step's own costs lit. */
  | { kind: 'cost'; focus: string[] }
  /** Separate measures of progress, each its own bar, never joined. */
  | { kind: 'measures'; rows: MeasureRow[] }
  | { kind: 'deadline' } | { kind: 'families' } | { kind: 'water' }
export type StoryStep = { id: string; text: Bi; sources: string[]; pic: StoryPic }
export type Story = { id: string; question: Bi; title: Bi; status: 'draft' | 'reviewed'; steps: StoryStep[] }

/** A dated event on the project road. `fy` is a financial year (April to March). */
export type RoadMark = { id: string; date: string; prec: 'month' | 'year' | 'fy'; text: Bi; src: string; plan?: boolean }

export const polavaramRoad: RoadMark[] = [
  { id: 'build', date: '2004', prec: 'fy', src: 'cag2025', text: { en: '2004-05: the state began building it', te: '2004-05: రాష్ట్రం నిర్మాణం మొదలుపెట్టింది' } },
  { id: '2009-01', date: '2009-01', prec: 'month', src: 'cag2025', text: { en: 'January 2009: cleared by the Centre', te: '2009 జనవరి: కేంద్రం అనుమతి' } },
  { id: '2014-03', date: '2014-03', prec: 'month', src: 'cag2025', text: { en: '2014: a national project', te: '2014: జాతీయ ప్రాజెక్టు' } },
  { id: 'flood2019', date: '2019', prec: 'year', src: 'cag2025', text: { en: '2019: floods', te: '2019: వరదలు' } },
  { id: '2019-11', date: '2019-11', prec: 'month', src: 'cag2025', text: { en: 'November 2019: new contract', te: '2019 నవంబర్: కొత్త కాంట్రాక్టు' } },
  { id: 'flood2020', date: '2020', prec: 'year', src: 'cag2025', text: { en: '2020: floods', te: '2020: వరదలు' } },
  { id: '2024-08', date: '2024-08', prec: 'month', src: 'pib2025', text: { en: 'August 2024: revised cost for the first phase', te: '2024 ఆగస్టు: మొదటి దశకు సవరించిన వ్యయం' } },
  { id: '2025-06', date: '2025-06', prec: 'month', src: 'mospi2506', text: { en: 'June 2025: 76% physical progress', te: '2025 జూన్: 76% భౌతిక పురోగతి' } },
  { id: '2026-08', date: '2026-08', prec: 'month', src: 'mospi2608', text: { en: 'August 2026: 86.2% physical progress', te: '2026 ఆగస్టు: 86.2% భౌతిక పురోగతి' } },
  { id: '2027-06', date: '2027-06', prec: 'month', src: 'mospi2608', plan: true, text: { en: 'June 2027: the completion date in the August 2026 report, a plan', te: '2027 జూన్: 2026 ఆగస్టు నివేదికలోని పూర్తి తేదీ, ప్రణాళిక మాత్రమే' } },
]

const BUILT_PINS: StoryPin[] = [
  { at: 'gap', label: { en: 'Still to build', te: 'ఇంకా కట్టాలి' } },
  { at: 'spill', label: { en: 'Spillway', te: 'స్పిల్‌వే' } },
]

export const polavaramStory: Story = {
  id: 'polavaram',
  question: { en: 'Is Polavaram finished?', te: 'పోలవరం పూర్తయిందా?' },
  title: { en: 'The Polavaram story', te: 'పోలవరం కథ' },
  status: 'draft',
  steps: [
    {
      id: 'start',
      text: {
        en: 'The idea goes back to 1941. The state began building it in 2004-05, and the Centre cleared it in January 2009.',
        te: 'ఈ ఆలోచన 1941 నాటిది. రాష్ట్రం 2004-05లో నిర్మాణం మొదలుపెట్టింది. 2009 జనవరిలో కేంద్రం అనుమతి ఇచ్చింది.',
      },
      sources: ['cag2025'],
      pic: { kind: 'dam', pct: null, pins: [{ at: 'gap', label: { en: 'The dam, as planned', te: 'ప్రణాళికలోని డ్యామ్' } }] },
    },
    {
      id: 'purpose',
      text: {
        en: 'When finished, it is to irrigate 7.20 lakh acres in the old East Godavari, West Godavari, Krishna and Visakhapatnam districts, and produce 960 MW of power. It is also to send 80 TMC of Godavari water to the Krishna river basin, and give drinking water to 28.50 lakh people in 540 villages.',
        te: 'పూర్తయ్యాక ఇది ఉమ్మడి తూర్పు గోదావరి, పశ్చిమ గోదావరి, కృష్ణా, విశాఖపట్నం జిల్లాల్లో 7.20 లక్షల ఎకరాలకు సాగునీరు ఇస్తుంది, 960 మెగావాట్ల విద్యుత్ ఉత్పత్తి చేస్తుంది. 80 టీఎంసీల గోదావరి నీటిని కృష్ణా నదీ పరివాహక ప్రాంతానికి మళ్లిస్తుంది, 540 గ్రామాల్లో 28.50 లక్షల మందికి తాగునీరు ఇస్తుంది.',
      },
      sources: ['cag2025'],
      pic: { kind: 'dam', pct: null, pins: [
        { at: 'power', label: { en: 'Power house: 960 MW', te: 'విద్యుత్ కేంద్రం: 960 మెగావాట్లు' } },
        { at: 'res', label: { en: 'Reservoir', te: 'జలాశయం' } },
      ] },
    },
    {
      id: 'national',
      text: {
        en: 'When the state was divided in 2014, Polavaram became a national project, and the Centre took on the rest of its irrigation cost.',
        te: '2014లో రాష్ట్ర విభజన సమయంలో పోలవరం జాతీయ ప్రాజెక్టుగా మారింది. దాని సాగునీటి భాగానికి మిగిలిన ఖర్చును భరించే బాధ్యతను కేంద్రం తీసుకుంది.',
      },
      sources: ['pib2025', 'cag2025'],
      pic: { kind: 'road', focus: ['2014-03'], note: { en: '2014: a national project', te: '2014: జాతీయ ప్రాజెక్టు' },
        detail: { en: 'Under the Andhra Pradesh Reorganisation Act, 2014', te: 'ఆంధ్రప్రదేశ్ పునర్వ్యవస్థీకరణ చట్టం, 2014 కింద' } },
    },
    {
      id: 'cost',
      text: {
        en: 'The estimate rose from ₹10,151.05 crore in January 2009 to ₹55,548.87 crore in February 2019. On 28 August 2024 the Union Cabinet approved a revised cost of ₹30,436.95 crore for the first phase.',
        te: 'అంచనా వ్యయం 2009 జనవరిలో ₹10,151.05 కోట్ల నుంచి 2019 ఫిబ్రవరి నాటికి ₹55,548.87 కోట్లకు పెరిగింది. 2024 ఆగస్టు 28న మొదటి దశకు ₹30,436.95 కోట్ల సవరించిన వ్యయాన్ని కేంద్ర కేబినెట్ ఆమోదించింది.',
      },
      sources: ['cag2025', 'pib2025'],
      pic: { kind: 'cost', focus: ['2009-01', '2019-02', '2024-08'] },
    },
    {
      id: 'wall',
      text: {
        en: 'A key underground wall was built before the spillway was ready, then damaged by floods in 2019 and 2020. The CAG links the damage to the order of the work and to the gap between contractors.',
        te: 'స్పిల్‌వే సిద్ధం కాకముందే కీలకమైన భూగర్భ గోడను కట్టారు. 2019, 2020 వరదల్లో అది దెబ్బతింది. ఈ నష్టాన్ని పనులు జరిగిన క్రమంతో, ఒక కాంట్రాక్టర్‌ను తప్పించి మరొకరిని నియమించే మధ్య ఏర్పడిన ఖాళీతో కాగ్ ముడిపెట్టింది.',
      },
      sources: ['cag2025'],
      pic: { kind: 'road', focus: ['flood2019', 'flood2020'], note: { en: '2019 and 2020: floods damage the underground wall', te: '2019, 2020: వరదల్లో భూగర్భ గోడ దెబ్బతింది' } },
    },
    {
      id: 'contract',
      text: {
        en: 'In November 2019 the remaining main dam work and the power house went to the only bidder. The CAG found problems with how the tender was run.',
        te: '2019 నవంబర్‌లో మిగిలిన ప్రధాన డ్యామ్ పని, విద్యుత్ కేంద్రం పని టెండర్ వేసిన ఏకైక సంస్థకు దక్కాయి. టెండర్ నిర్వహణలో లోపాలను కాగ్ గుర్తించింది.',
      },
      sources: ['cag2025'],
      pic: { kind: 'road', focus: ['2019-11'], note: { en: 'November 2019: the main dam work goes to the only bidder', te: '2019 నవంబర్: ప్రధాన డ్యామ్ పని ఏకైక బిడ్డర్‌కు' } },
    },
    {
      id: 'reading2025',
      text: {
        en: "The Union Statistics Ministry's report for June 2025 put physical progress at 76%.",
        te: 'కేంద్ర గణాంకాల మంత్రిత్వ శాఖ 2025 జూన్ నివేదిక భౌతిక పురోగతిని 76%గా చూపింది.',
      },
      sources: ['mospi2506'],
      pic: { kind: 'dam', pct: 76.0, pins: BUILT_PINS, big: { value: '76%', note: { en: 'Physical progress, June 2025 report', te: '2025 జూన్ నివేదికలో భౌతిక పురోగతి' } } },
    },
    {
      id: 'progress',
      text: {
        en: "The Union Statistics Ministry's August 2026 report, which is built from what project agencies report to it, gives the physical progress as 86.2%.",
        te: 'ప్రాజెక్టు సంస్థలు నివేదించిన వివరాలతో తయారయ్యే కేంద్ర గణాంకాల మంత్రిత్వ శాఖ 2026 ఆగస్టు నివేదిక భౌతిక పురోగతిని 86.2%గా చూపింది.',
      },
      sources: ['mospi2608'],
      pic: { kind: 'dam', pct: 86.2, pins: BUILT_PINS, big: { value: '86.2%', note: { en: 'Physical progress, August 2026 report', te: '2026 ఆగస్టు నివేదికలో భౌతిక పురోగతి' } } },
    },
    {
      id: 'measure',
      text: {
        en: "These figures come from different documents and dates. The documents do not say how the progress of the works was measured. The figures also do not line up: the CAG's 82% for the works in March 2023 is higher than the survey's 77% for December 2024. So they should not be read as a rise or a fall from one to the next.",
        te: 'ఈ అంకెలు వేర్వేరు పత్రాల నుంచి, వేర్వేరు తేదీల నాటివి. పనుల పురోగతిని ఎలా కొలిచారో ఈ పత్రాలు చెప్పలేదు. అంకెలు ఒకదానితో ఒకటి సరిపోలవు కూడా: 2023 మార్చికి కాగ్ చూపిన పనుల శాతం 82%, 2024 డిసెంబర్‌కు సర్వే చూపిన 77% కంటే ఎక్కువ. అందుకే ఒక పత్రం నుంచి మరో పత్రానికి అంకెలు పెరిగినట్లో తగ్గినట్లో చదవకూడదు.',
      },
      sources: ['ses2425', 'cag2025', 'mospi2608'],
      pic: { kind: 'measures', rows: [
        { src: 'cag2025', date: '2023-03', measure: 'Works (CAG, from the department’s records)', label: { en: 'Works, as the CAG counts them', te: 'పనులు, కాగ్ లెక్క ప్రకారం' } },
        { src: 'ses2425', date: '2024-12', measure: 'Works (Socio-Economic Survey 2024-25)', label: { en: 'Works, as the state’s survey counts them', te: 'పనులు, రాష్ట్ర సర్వే లెక్క ప్రకారం' } },
        { src: 'mospi2608', date: '2026-08', measure: 'Physical progress (MoSPI)', label: { en: 'Physical progress, Statistics Ministry', te: 'భౌతిక పురోగతి, గణాంకాల మంత్రిత్వ శాఖ' } },
      ] },
    },
    {
      id: 'deadline',
      text: {
        en: 'The completion date has changed many times. Documents have given dates from December 2018 to 2027.',
        te: 'పూర్తి చేసే తేదీ చాలాసార్లు మారింది. పత్రాలు 2018 డిసెంబర్ నుంచి 2027 వరకు వేర్వేరు తేదీలు ఇచ్చాయి.',
      },
      sources: ['cag2025', 'ses2425', 'mospi2608'],
      pic: { kind: 'deadline' },
    },
    {
      id: 'people',
      text: {
        en: "1,06,006 families have to be moved. By March 2023, 11,677 had been resettled, by the department's records.",
        te: '1,06,006 కుటుంబాలను తరలించాల్సి ఉంది. శాఖ రికార్డుల ప్రకారం 2023 మార్చి నాటికి 11,677 కుటుంబాలకు పునరావాసం కల్పించారు.',
      },
      sources: ['cag2025'],
      pic: { kind: 'families' },
    },
    {
      id: 'water',
      text: {
        en: 'Once it is complete, Polavaram is to give water to nine districts, a Lok Sabha answer of 1 August 2024 says.',
        te: 'పూర్తయ్యాక పోలవరం తొమ్మిది జిల్లాలకు నీరు ఇవ్వాలని 2024 ఆగస్టు 1 నాటి లోక్‌సభ సమాధానం చెబుతోంది.',
      },
      sources: ['ls1723'],
      pic: { kind: 'water' },
    },
  ],
}
