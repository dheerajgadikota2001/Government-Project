import * as React from 'react'
import { ArrowRight, Check, CircleDashed, FileText, MessagesSquare, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { meta } from '@/lib/data'
import { legal } from '@/lib/data-site'
import { apiGet } from '@/lib/api'
import { useLive, useUpdates, type UpdateSource } from '@/lib/live'
import { dateLong, dateTe, istDay, istTime } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { ExampleBox, Section } from '@/components/kit'
import { LiveGate } from '@/components/live-state'
import { CorrectionForm, Thread } from '@/components/community'
import { Button } from '@/components/ui/button'
import { isOptedOut, isOptedOutByBrowser, isPublicSite, setOptedOut } from '@/lib/analytics'

const paras = (o: Record<string, any>) => Object.keys(o).filter((k) => /^p\d+$/.test(k)).sort().map((k) => o[k] as string)

/* ------------------------------------------------------------ words */
type Word = { en: string; te: string; plain: { en: string; te: string }; example?: { en: string; te: string }; madeUp?: boolean }

// Words the pages use. Each has a plain meaning and, where the idea is new, an
// everyday example with round, made-up numbers that never reuse a page's figures.
export const WORDS: Word[] = [
  { en: 'Budget estimate', te: 'బడ్జెట్ అంచనా', plain: { en: 'The plan for a year, made before the year begins.', te: 'ఏడాది మొదలవక ముందే వేసిన ప్రణాళిక.' },
    example: { en: 'In March a family plans to spend ₹10,000 on school costs over the coming year. That plan is the budget estimate.', te: 'మార్చిలో ఒక కుటుంబం వచ్చే ఏడాది బడి ఖర్చులకు ₹10,000 అనుకుంది. అదే బడ్జెట్ అంచనా.' } },
  { en: 'Revised estimate', te: 'సవరించిన అంచనా', plain: { en: 'The plan, changed during the year, when the government sees how the year is going.', te: 'ఏడాది ఎలా సాగుతోందో చూసి మధ్యలో మార్చిన ప్రణాళిక.' },
    example: { en: 'The family lowers its plan to ₹8,000 in December. ₹8,000 is the revised estimate.', te: 'డిసెంబర్‌లో ఆ కుటుంబం ప్రణాళికను ₹8,000కు తగ్గించింది. ₹8,000 సవరించిన అంచనా.' } },
  { en: 'Actual figure (accounts)', te: 'వాస్తవ సంఖ్య (లెక్కలు)', plain: { en: 'What was really spent or received, from the accounts of a year that is over. It is not an estimate.', te: 'ముగిసిన ఏడాది లెక్కల ప్రకారం నిజంగా ఖర్చయింది లేదా వచ్చింది. ఇది అంచనా కాదు.' },
    example: { en: 'By the end of March the family has spent ₹9,000. That is the actual figure, and it can differ from both plans.', te: 'మార్చి చివరికి ఆ కుటుంబం ₹9,000 ఖర్చు చేసింది. అదే వాస్తవ సంఖ్య; అది రెండు ప్రణాళికలకూ భిన్నంగా ఉండవచ్చు.' } },
  { en: 'Provisional figure', te: 'తాత్కాలిక సంఖ్య', plain: { en: 'An early figure that may still change when the final count is done. We draw it hollow.', te: 'చివరి లెక్క పూర్తయ్యాక మారే అవకాశమున్న తొలి సంఖ్య. దీన్ని ఖాళీ ఆకారంలో చూపుతాం.' } },
  { en: 'Capital outlay', te: 'మూలధన వ్యయం', plain: { en: 'Money spent building things that last: roads, dams, buildings.', te: 'శాశ్వతంగా నిలిచేవాటిపై ఖర్చు: రోడ్లు, ఆనకట్టలు, భవనాలు.' },
    example: { en: 'Building a house is capital outlay. Rent and groceries are not.', te: 'ఇల్లు కట్టడం మూలధన వ్యయం. అద్దె, సరుకులు కావు.' }, madeUp: false },
  { en: 'Committed spending', te: 'తప్పనిసరి వ్యయం', plain: { en: 'Salaries, pensions and interest: money spoken for before anything new can be built.', te: 'జీతాలు, పింఛన్లు, వడ్డీలు: కొత్తది ఏదైనా కట్టక ముందే కేటాయించిన డబ్బు.' },
    example: { en: 'A family earns ₹100 and ₹60 goes on rent and loan payments before anything else. Its committed spending is ₹60 of every ₹100.', te: 'ఒక కుటుంబానికి ₹100 వస్తే, ఏదైనా చేయక ముందే ₹60 అద్దె, అప్పు వాయిదాలకు పోతుంది. ప్రతి ₹100లో ₹60 తప్పనిసరి వ్యయం.' } },
  { en: 'Outstanding debt', te: 'మిగిలి ఉన్న అప్పు', plain: { en: 'Everything the government still owes on a given day, from all its past borrowing.', te: 'ఒక రోజు నాటికి గత అప్పులన్నింటిలో ప్రభుత్వం ఇంకా తీర్చాల్సినది.' },
    example: { en: 'A family borrowed ₹50,000 over the years and has paid back ₹20,000. On that day its outstanding debt is ₹30,000.', te: 'ఒక కుటుంబం ఏళ్ల తరబడి ₹50,000 అప్పు తీసుకుని ₹20,000 తీర్చింది. ఆ రోజు నాటికి మిగిలిన అప్పు ₹30,000.' } },
  { en: 'Off-budget borrowing', te: 'బడ్జెట్ బయటి అప్పు', plain: { en: 'Loans taken through state companies and corporations, which do not show in the budget’s own debt.', te: 'రాష్ట్ర సంస్థలు, కార్పొరేషన్ల ద్వారా తీసుకునే అప్పులు; బడ్జెట్ అప్పులో కనిపించవు.' },
    example: { en: 'A family’s own loan is ₹30,000. A relative also borrows ₹10,000 for the family’s needs. The ₹10,000 is like off-budget borrowing.', te: 'ఒక కుటుంబం సొంత అప్పు ₹30,000. కుటుంబ అవసరాలకు ఒక బంధువు కూడా ₹10,000 అప్పు చేశారు. ఆ ₹10,000 బడ్జెట్ బయటి అప్పు లాంటిది.' } },
  { en: 'Guarantee', te: 'హామీ', plain: { en: 'A promise to repay someone else’s loan if they cannot.', te: 'ఇంకొకరు తీర్చలేకపోతే వారి అప్పు తీరుస్తామన్న హామీ.' },
    example: { en: 'Signing as guarantor for a neighbour’s bank loan. You pay only if the neighbour cannot.', te: 'పొరుగువారి బ్యాంకు రుణానికి హామీదారుగా సంతకం చేయడం. వారు కట్టలేకపోతేనే మీరు కట్టాలి.' }, madeUp: false },
  { en: 'Income per person (per capita NSDP)', te: 'తలసరి ఆదాయం', plain: { en: 'The state’s net production in a year, shared out equally among all its people. It is an average.', te: 'ఒక ఏడాదిలో రాష్ట్ర నికర ఉత్పత్తిని అందరికీ సమానంగా పంచితే వచ్చేది. ఇది సగటు.' },
    example: { en: 'Five people earn ₹2, ₹2, ₹3, ₹3 and ₹40. Shared equally, each gets ₹10, though four of them earn far less.', te: 'ఐదుగురి సంపాదన ₹2, ₹2, ₹3, ₹3, ₹40. సమానంగా పంచితే ఒక్కొక్కరికి ₹10, కానీ నలుగురి సంపాదన అంతకంటే చాలా తక్కువ.' } },
  { en: 'MoU (investment promise)', te: 'ఎంఓయూ (పెట్టుబడి హామీ)', plain: { en: 'A paper signed between the state and a company, saying the company plans to invest. It is a promise, not money spent.', te: 'కంపెనీ పెట్టుబడి పెట్టాలనుకుంటోందని రాష్ట్రం, కంపెనీ సంతకం చేసిన పత్రం. ఇది హామీ మాత్రమే; ఖర్చు చేసిన డబ్బు కాదు.' } },
  { en: 'CAG', te: 'కాగ్', plain: { en: 'The Comptroller and Auditor General: the country’s official auditor, who checks the government’s accounts.', te: 'కంప్ట్రోలర్ అండ్ ఆడిటర్ జనరల్: ప్రభుత్వ లెక్కలను తనిఖీ చేసే దేశ అధికారిక ఆడిటర్.' } },
  { en: 'MoSPI report', te: 'ఎంఓఎస్‌పీఐ నివేదిక', plain: { en: 'The central statistics ministry’s monthly report on big central projects, with their cost and progress.', te: 'పెద్ద కేంద్ర ప్రాజెక్టుల ఖర్చు, పురోగతిపై కేంద్ర గణాంకాల మంత్రిత్వ శాఖ నెలవారీ నివేదిక.' } },
  { en: 'Tender', te: 'టెండర్', plain: { en: 'A public notice inviting companies to bid for a government job or purchase, with a closing date.', te: 'ప్రభుత్వ పని లేదా కొనుగోలుకు కంపెనీలను బిడ్లు వేయమని పిలిచే బహిరంగ ప్రకటన; దానికి గడువు తేదీ ఉంటుంది.' } },
  { en: 'TMC', te: 'టీఎంసీ', plain: { en: 'Thousand million cubic feet: the unit used for river water.', te: 'వేయి మిలియన్ ఘనపుటడుగులు: నదీ జలాలకు వాడే కొలత.' } },
]

export function Words() {
  const { lang, tr } = useLang()
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Words to know', 'తెలుసుకోవాల్సిన పదాలు')} q={{ en: 'The words the papers use, in plain words', te: 'పత్రాల్లోని పదాలు, తేలిక మాటల్లో' }}
        lede={tr('Each word has a plain meaning. Where the idea is new, an everyday example follows, with made-up round numbers that are never the page’s own figures.',
          'ప్రతి పదానికి తేలికైన అర్థం. కొత్త ఆలోచన అయితే, ఒక ఉదాహరణ కూడా; అందులోని అంకెలు ఊహించినవి, పేజీలోని అసలు అంకెలు కావు.')} />
      <dl className="mt-10 grid gap-4 md:grid-cols-2">
        {WORDS.map((w) => (
          <div key={w.en} className="flex flex-col rounded-2xl border border-border bg-card p-5">
            <dt>
              <span className="block text-[19px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? w.te : w.en}</span>
              <span className="block text-[14px] text-muted-foreground" lang={lang === 'te' ? 'en' : 'te'}>{lang === 'te' ? w.en : w.te}</span>
            </dt>
            <dd className="mt-2 space-y-3">
              <p className="text-[15.5px] leading-relaxed" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? w.plain.te : w.plain.en}</p>
              {w.example ? <ExampleBox madeUp={w.madeUp !== false}>{lang === 'te' ? w.example.te : w.example.en}</ExampleBox> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Page>
  )
}

/* ------------------------------------------------------------ sources */
const RULES: [string, string, string, string][] = [
  ['Government papers only', 'Every figure comes from a government paper: budget books, CAG, RBI, MoSPI, ministries, Assembly and Parliament answers.', 'ప్రభుత్వ పత్రాలే', 'ప్రతి అంకె ప్రభుత్వ పత్రం నుంచే: బడ్జెట్ పుస్తకాలు, కాగ్, ఆర్బీఐ, ఎంఓఎస్‌పీఐ, మంత్రిత్వ శాఖలు, శాసనసభ, పార్లమెంటు సమాధానాలు.'],
  ['Claims are labelled', 'What a party, a company or a newspaper says appears only as a labelled claim, beside the record.', 'చెప్పిన మాటలకు గుర్తు', 'పార్టీ, కంపెనీ లేదా పత్రిక చెప్పింది రికార్డు పక్కన, గుర్తు పెట్టిన మాటగా మాత్రమే కనిపిస్తుంది.'],
  ['Nothing added up by us', 'No totals, shares or ranks that the paper did not print. Counts of our own records are fine.', 'మేము ఏదీ కలపం', 'పత్రం ముద్రించని మొత్తాలు, శాతాలు, ర్యాంకులు ఉండవు. మా రికార్డుల లెక్కలు మాత్రమే.'],
  ['Dated, not “current”', 'Every number shows its date and paper. Old figures say they are old.', 'తేదీతో, “ప్రస్తుతం” కాదు', 'ప్రతి అంకెకు దాని తేదీ, పత్రం. పాత అంకెలు పాతవని చెబుతాయి.'],
  ['Estimates look different', 'Revised, budget and provisional figures are drawn hollow and named.', 'అంచనాలు వేరుగా', 'సవరించిన, బడ్జెట్, తాత్కాలిక సంఖ్యలను ఖాళీ ఆకారాల్లో, పేరుతో చూపుతాం.'],
  ['Every government alike', 'The same template and the same words for every period, named by dates and Chief Minister.', 'ప్రతి ప్రభుత్వం ఒకేలా', 'ప్రతి కాలానికి అదే పద్ధతి, అవే మాటలు; తేదీలు, ముఖ్యమంత్రి పేరుతో.'],
  ['One set of numbers', 'English, Telugu, voice and share cards show the same values, taken from the same record.', 'ఒకే అంకెలు', 'ఇంగ్లీష్, తెలుగు, వాయిస్, షేర్ కార్డులు ఒకే రికార్డు నుంచి ఒకే విలువలు చూపుతాయి.'],
  ['Gaps said plainly', '“Not printed” when the state published nothing; “not read yet” when we have not opened the paper.', 'ఖాళీలు స్పష్టంగా', 'రాష్ట్రం ఏమీ ప్రచురించకపోతే “ముద్రించలేదు”; పత్రం మేము తెరవకపోతే “ఇంకా చదవలేదు”.'],
]

const STATUS_WORD: Record<string, { en: string; te: string }> = {
  ok: { en: 'Worked', te: 'పని చేసింది' },
  failed: { en: 'Failed: the portal did not answer', te: 'విఫలం: పోర్టల్ స్పందించలేదు' },
  skipped: { en: 'Skipped by our safety check', te: 'మా భద్రతా తనిఖీ ఆపింది' },
}

export function SourceHealth({ sources }: { sources: UpdateSource[] }) {
  const { lang, tr } = useLang()
  const rows = [...sources].sort((a, b) => String(b.last_run).localeCompare(String(a.last_run)))
  const when = (s: string) => (lang === 'te' ? `${dateTe(istDay(s))}, ${istTime(s)}` : `${dateLong(istDay(s))}, ${istTime(s)}`)
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-border text-left text-[12.5px] text-muted-foreground">
            <th className="p-3 font-semibold">{tr('Source', 'మూలం')}</th>
            <th className="p-3 font-semibold">{tr('Last ran (India time)', 'చివరిగా నడిచింది (భారత కాలం)')}</th>
            <th className="p-3 font-semibold">{tr('Last worked', 'చివరిగా పని చేసింది')}</th>
            <th className="p-3 font-semibold">{tr('Result', 'ఫలితం')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.source} className="border-b border-border/70 last:border-0">
              <td className="p-3 font-medium" lang="en">{s.source}</td>
              <td className="p-3 tnum">{when(s.last_run)}</td>
              <td className="p-3 tnum">{lang === 'te' ? dateTe(istDay(s.last_success)) : dateLong(istDay(s.last_success))}</td>
              <td className={cn('p-3', s.status === 'ok' ? 'font-medium' : 'font-semibold')}>
                <span className="inline-flex items-center gap-1.5">{s.status === 'ok' ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}{(STATUS_WORD[s.status] ?? { en: s.status, te: s.status })[lang]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The same table, fetching the refresh log itself for pages that show it on their own. */
export function SourceHealthLive() {
  const state = useUpdates()
  return <LiveGate state={state} what={{ en: 'The refresh log', te: 'నవీకరణ లాగ్' }} rows={5}>{(u) => <SourceHealth sources={u.sources} />}</LiveGate>
}

export function Sources() {
  const { lang, tr } = useLang()
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Sources and method', 'మూలాలు, పద్ధతి')} q={{ en: 'Where every number comes from, and how we keep it right', te: 'ప్రతి అంకె ఎక్కడి నుంచి వస్తుంది, దాన్ని ఎలా సరిచూస్తాం' }}
        lede={tr('One plain page on the rules every other page follows. The full list of papers lives on the Papers page; this page explains how we use them.',
          'మిగతా ప్రతి పేజీ పాటించే నియమాలు, ఒకే పేజీలో. పత్రాల పూర్తి జాబితా పత్రాల పేజీలో ఉంది; వాటిని ఎలా వాడతామో ఈ పేజీ చెబుతుంది.')} />
      <ol className="mt-10 grid gap-3 md:grid-cols-2">
        {RULES.map(([t, b, tt, bt], i) => (
          <li key={t} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <span className="font-heading text-[28px] font-semibold leading-none text-muted-foreground tnum">{i + 1}</span>
            <div><div className="text-[16.5px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? tt : t}</div><p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? bt : b}</p></div>
          </li>
        ))}
      </ol>
      <Section className="mt-16" eyebrow={tr('Before anything is published', 'ప్రచురించే ముందు')} title={tr('How a page stays right', 'పేజీ ఎలా సరిగ్గా ఉంటుంది')}>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            [tr('Stored, not typed', 'నిల్వ నుంచి, టైప్ చేసి కాదు'), tr('Every figure on a page is read from a stored record with its paper and date. Nobody types a number into a page.', 'పేజీలోని ప్రతి అంకె దాని పత్రం, తేదీతో ఉన్న రికార్డు నుంచే వస్తుంది. ఎవరూ పేజీలో అంకెను టైప్ చేయరు.')],
            [tr('Checked by machine', 'యంత్రం తనిఖీ'), tr('Automatic checks block typed numbers, sums we would make, party labels, judging words and party colours.', 'టైప్ చేసిన అంకెలు, మేము చేసే కూడికలు, పార్టీ పేర్లు, తీర్పు చెప్పే మాటలు, పార్టీ రంగులను ఆటోమేటిక్ తనిఖీలు ఆపుతాయి.')],
            [tr('Read by a person', 'మనిషి చదువుతారు'), tr('A person reads every new page, in English and Telugu, before it goes live.', 'ప్రతి కొత్త పేజీని లైవ్‌కు ముందు ఇంగ్లీష్, తెలుగు రెండింటిలో ఒక వ్యక్తి చదువుతారు.')],
            [tr('Corrected in public', 'బహిరంగంగా సవరణ'), tr('Each page keeps a dated list of its corrections. A figure changes only when a paper backs the change.', 'ప్రతి పేజీలో సవరణల జాబితా తేదీలతో ఉంటుంది. పత్రం ఆధారం ఉంటేనే అంకె మారుతుంది.')],
          ].map(([t, b]) => (
            <li key={String(t)} className="rounded-xl border border-border bg-card p-4"><div className="text-[15.5px] font-semibold">{t}</div><p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{b}</p></li>
          ))}
        </ul>
      </Section>
      <Section className="mt-16" eyebrow={tr('Source health', 'మూలాల స్థితి')} title={tr('When did each source last update?', 'ప్రతి మూలం చివరిగా ఎప్పుడు నవీకరించబడింది?')}
        lede={tr('One line per source: when our reader last ran, when it last worked, and how that run went. Three sources are read by hand on purpose: older MoSPI reports behind a browser check, the yearly Socio-Economic Survey volumes, and the figures inside budget books.',
          'ప్రతి మూలానికి ఒక వరుస: మా రీడర్ చివరిగా ఎప్పుడు నడిచింది, చివరిగా ఎప్పుడు పని చేసింది, ఆ పరుగు ఎలా సాగింది. మూడు మూలాలను కావాలనే చేతితో చదువుతాం: బ్రౌజర్ తనిఖీ వెనుక ఉన్న పాత ఎంఓఎస్‌పీఐ నివేదికలు, ఏటా వచ్చే సామాజిక ఆర్థిక సర్వే సంపుటాలు, బడ్జెట్ పుస్తకాల లోపలి అంకెలు.')}>
        <SourceHealthLive />
        <div className="mt-4 flex flex-wrap gap-4">
          <a href={href('papers')} className="inline-flex items-center gap-1.5 text-[15px] font-medium">{tr('Every paper we read', 'మేము చదివే ప్రతి పత్రం')}<ArrowRight className="size-4" /></a>
          <a href={href('updates')} className="inline-flex items-center gap-1.5 text-[15px] font-medium">{tr('What each check added, day by day', 'ప్రతి తనిఖీ ఏం చేర్చింది, రోజు వారీగా')}<ArrowRight className="size-4" /></a>
        </div>
      </Section>
    </Page>
  )
}

/* ------------------------------------------------------------ community */
type Topic = { key: string; post_count: number; last_post_at: string | null }

export function Community() {
  const { lang, tr } = useLang()
  const C = legal.community[lang] ?? legal.community.en
  // The counts on the topic cards are read again after each post, so they never lag the board below.
  const [posted, setPosted] = React.useState(0)
  const topics = useLive(() => apiGet<Topic[]>('/community/topics'), `topics-${posted}`, { refresh: true })
  const [open, setOpen] = React.useState<string>('general')
  const panel = React.useRef<HTMLDivElement>(null)
  // On a phone the board sits below six topic cards, so opening one brings it into view.
  const pick = (key: string) => {
    setOpen(key)
    requestAnimationFrame(() => {
      const r = panel.current?.getBoundingClientRect()
      if (r && r.top > window.innerHeight * 0.6) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={C.eyebrow} q={{ en: legal.community.en.title, te: legal.community.te.title }} lede={C.sub} />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="boards" className="min-w-0">
          <h2 id="boards" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{C.topicsLabel}</h2>
          <LiveGate state={topics} what={{ en: 'The discussion boards', te: 'చర్చా బోర్డులు' }} rows={3}>
            {(list) => (
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2" role="tablist" aria-label={C.topicsLabel}>
                {list.map((t) => (
                  <li key={t.key}>
                    <button type="button" role="tab" aria-selected={open === t.key} onClick={() => pick(t.key)}
                      className={cn('w-full rounded-xl border bg-card p-4 text-left transition-colors', open === t.key ? 'border-foreground' : 'border-border hover:border-foreground/40')}>
                      <span className="flex items-center gap-2 text-[16px] font-semibold"><MessagesSquare className="size-4 text-muted-foreground" aria-hidden />{C.topics[t.key] ?? t.key}</span>
                      <span className="mt-1 block text-[13.5px] text-muted-foreground">{t.post_count && t.last_post_at
                        ? tr(`${t.post_count} ${t.post_count === 1 ? 'post' : 'posts'}, the latest on ${dateLong(istDay(t.last_post_at))}`, `${t.post_count} పోస్టులు, చివరిది ${dateTe(istDay(t.last_post_at))}న`)
                        : C.empty}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </LiveGate>
          <div ref={panel} className="mt-6 scroll-mt-20 rounded-2xl border border-border bg-card p-5" role="tabpanel">
            <h3 className="mb-4 text-[20px] font-semibold">{C.topics[open] ?? open}</h3>
            <Thread key={open} topic={open} onPosted={() => setPosted((n) => n + 1)} />
          </div>
        </section>
        <section aria-labelledby="corr" className="h-fit min-w-0 rounded-2xl border border-border bg-card p-5">
          <h2 id="corr" className="text-[20px] font-semibold">{C.correction.title}</h2>
          <p className="mb-4 mt-1 text-[14px] leading-relaxed text-muted-foreground">{C.correction.sub}</p>
          <CorrectionForm />
        </section>
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------ about */
export function About() {
  const { lang } = useLang()
  const A = legal.about[lang] ?? legal.about.en
  const pr = A.principles
  const src = A.sources
  return (
    <Page className="pt-10 md:pt-14">
      <div className="max-w-4xl">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{A.eyebrow}</div>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-tight [text-wrap:balance] md:text-[52px]">{A.hero.line1}<br /><span className="text-muted-foreground">{A.hero.line2}</span></h1>
      </div>
      <div className="mt-8 max-w-3xl space-y-4 text-[17px] leading-relaxed text-foreground/85">
        {paras(A.why).map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <Section className="mt-16" title={pr.title}>
        <div className="grid gap-3 md:grid-cols-2">
          {['linksHome', 'createNothing', 'dated', 'noSide'].map((k) => pr[k] ? (
            <div key={k} className="rounded-2xl border border-border bg-card p-5"><div className="text-[17px] font-semibold">{pr[k].title}</div><p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{pr[k].body}</p></div>
          ) : null)}
        </div>
      </Section>
      <Section className="mt-16" title={src.title} lede={src.intro}>
        <ul className="grid gap-2 md:grid-cols-2">
          {Object.entries(src.list as Record<string, { name: string; what: string }>).map(([k, s]) => (
            <li key={k} className="flex gap-3 rounded-xl border border-border bg-card px-4 py-3"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><div className="text-[15px] font-semibold">{s.name}</div><div className="text-[13.5px] text-muted-foreground">{s.what}</div></div></li>
          ))}
        </ul>
      </Section>
      <Section className="mt-16" title={A.independence.title}>
        <p className="max-w-3xl text-[16px] leading-relaxed text-foreground/85">{A.independence.bodyBefore} <a href={href('community')} className="font-medium underline underline-offset-4">{A.independence.tellUs}</a> {A.independence.bodyAfter}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <a href={href('disclaimer')} className="inline-flex items-center gap-1.5 text-[15px] font-medium">{A.cta.disclaimer}<ArrowRight className="size-4" /></a>
          <a href={href('projects')} className="inline-flex items-center gap-1.5 text-[15px] font-medium">{A.cta.explore}<ArrowRight className="size-4" /></a>
        </div>
      </Section>
    </Page>
  )
}

/* ---------------------------------------------------- disclaimer, privacy */
function LegalPage({ doc, extra }: { doc: 'disclaimer' | 'privacy'; extra?: React.ReactNode }) {
  const { lang, tr } = useLang()
  const D = legal[doc][lang] ?? legal[doc].en
  const S = D.sections as Record<string, any>
  const updated = D.lastUpdated.replace('{month}', lang === 'te' ? 'అక్టోబర్' : 'October').replace('{year}', '2026')
  return (
    <Page className="pt-10 md:pt-14">
      <div className="max-w-3xl">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{D.eyebrow}</div>
        <h1 className="mt-1 text-[36px] font-semibold leading-[1.08] tracking-tight md:text-[48px]">{D.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-foreground/85">{D.lead}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">{updated}</p>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={D.tocAria} className="hidden lg:block">
          <ol className="sticky space-y-1.5 text-[14px]" style={{ top: 'calc(var(--header-h) + 1.5rem)' }}>
            {Object.entries(S).map(([k, s]) => <li key={k}><a href={`#${doc}-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`${doc}-${k}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-muted-foreground hover:text-foreground">{s.title}</a></li>)}
          </ol>
        </nav>
        <div className="max-w-3xl space-y-10">
          {Object.entries(S).map(([k, s]) => (
            <section key={k} id={`${doc}-${k}`} className="scroll-mt-32">
              <h2 className="text-[21px] font-semibold tracking-tight">{s.title}</h2>
              <div className="mt-2 space-y-3 text-[16px] leading-relaxed text-foreground/85">{paras(s).map((p, i) => <p key={i}>{p}</p>)}</div>
            </section>
          ))}
          {extra}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[19px] font-semibold">{D.contact.title}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{D.contact.lead} <a href={href('community')} className="font-medium underline underline-offset-4">{D.contact.formLink}</a>. {D.contact.after}</p>
          </section>
          <section lang="te" className="rounded-2xl border border-dashed border-foreground/25 p-5">
            <h2 className="text-[17px] font-semibold">{D.summary.titleTe}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{D.summary.bodyTe}</p>
          </section>
          <p className="text-[12.5px] text-muted-foreground">{tr(`Text as on the live site, ${dateLong(meta.asof)}.`, `లైవ్ సైట్‌లోని పాఠమే, ${dateTe(meta.asof)} నాటిది.`)}</p>
        </div>
      </div>
    </Page>
  )
}

export function Disclaimer() {
  return <LegalPage doc="disclaimer" />
}

export function Privacy() {
  const { lang } = useLang()
  const D = legal.privacy[lang] ?? legal.privacy.en
  const ch = D.choice
  return (
    <LegalPage doc="privacy" extra={
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-[19px] font-semibold">{ch.title}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{ch.lead}</p>
        <CountingSwitch ch={ch} />
        <p className="mt-2 text-[13px] text-muted-foreground">{ch.scope}</p>
      </section>
    } />
  )
}

/** The reader's switch for the counting. It shows the real state (lib/analytics.ts decides it), works the
 *  moment it is pressed, and says so plainly when the browser has already decided or cannot remember. */
function CountingSwitch({ ch }: { ch: Record<string, string> }) {
  const { tr } = useLang()
  const [off, setOff] = React.useState(isOptedOut)
  const [unsaved, setUnsaved] = React.useState(false)
  if (!isPublicSite()) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled className="gap-1.5"><CircleDashed className="size-4" />{ch.optOutBtn}</Button>
        <span className="text-[13px] text-muted-foreground">{tr('This preview counts nothing, so the switch works only on the live site.', 'ఈ ప్రివ్యూ ఏమీ లెక్కించదు; ఈ స్విచ్ లైవ్ సైట్‌లోనే పనిచేస్తుంది.')}</span>
      </div>
    )
  }
  if (isOptedOutByBrowser()) return <p className="mt-3 text-[14px] leading-relaxed">{ch.gpc}</p>
  const flip = () => {
    const next = !off
    setUnsaved(!setOptedOut(next))
    setOff(next)
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[14px] font-medium" role="status">{off ? ch.statusOff : ch.statusOn}</p>
      <Button variant="outline" onClick={flip} className="gap-1.5">
        {off ? <Check className="size-4" /> : <CircleDashed className="size-4" />}{off ? ch.optInBtn : ch.optOutBtn}
      </Button>
      {unsaved && off ? <p className="text-[13px] text-muted-foreground">{ch.noStorage}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------ an address the site does not have */
export function NotFound() {
  const { tr } = useLang()
  const links: [string, string, string][] = [
    ['projects', 'Projects', 'పనులు'], ['districts', 'My district', 'మా జిల్లా'], ['money', 'Money', 'డబ్బు'],
    ['claims', 'Check a claim', 'నిజమేనా?'], ['papers', 'Government papers', 'ప్రభుత్వ పత్రాలు'],
  ]
  return (
    <Page className="py-16 md:py-24">
      <div className="max-w-2xl">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">404</div>
        <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight [text-wrap:balance]">{tr('This page is not here', 'ఈ పేజీ ఇక్కడ లేదు')}</h1>
        <p className="mt-3 text-[16.5px] leading-relaxed text-foreground/85">{tr('The address may be mistyped, or the page may have moved. Nothing on this site is removed quietly: if a record you saw before is gone, tell us and we will say why.', 'చిరునామా తప్పుగా ఉండవచ్చు, లేదా పేజీ మారి ఉండవచ్చు. ఈ సైట్‌లో ఏదీ చెప్పకుండా తీసేయం: మీరు ముందు చూసిన రికార్డు కనిపించకపోతే మాకు చెప్పండి, ఎందుకో చెబుతాం.')}</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {links.map(([k, en, te]) => <li key={k}><a href={href(k)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-[14.5px] font-medium hover:border-foreground/40">{tr(en, te)}<ArrowRight className="size-4" aria-hidden /></a></li>)}
          <li><a href={href('community')} className="inline-flex h-10 items-center rounded-full px-4 text-[14.5px] font-medium underline underline-offset-4">{tr('Tell us', 'మాకు చెప్పండి')}</a></li>
        </ul>
      </div>
    </Page>
  )
}
