import * as React from 'react'
import { ArrowUpRight, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { PAGE_WORDS, useTitle } from '@/lib/titles'
import { Page, PageHead } from '@/components/shell'
import { ChartFrame, ExampleBox, KindBadge, ReadLine, Section, ShortAnswer } from '@/components/kit'
import { Legend, Ruler, BAR, figureGroups, useReportWords, type Row } from '@/components/summit-parts'
import { invest } from '@/lib/data-invest'
import { crore, croreTe, dateLong, dateTe, lakhCrore, lakhCroreTe, num } from '@/lib/format'
import { summitName, summitReport, type SummitReport } from '@/lib/docs'
import { REPORTS, reportBySlug, type ReportEntry } from '@/lib/reports'
import { ReportCard } from '@/components/report-card'
import { SummitDashboard } from '@/components/summit-dashboard'

// The Reports section: one subject at a time, in full.
//
// /reports lists them; /reports/<slug> is one report. The first is the 2026 Partnership Summit, built from
// every newspaper report we could find, because the state has not published its own list. The rules are the
// summit page's, kept by scripts/test_summit_reports.mjs: every figure as printed with the report that printed it;
// where reports differ, every reading is shown; nothing is added up, averaged or ranked by the site; press and
// government figures are never mixed. A report is long, so it opens with the answer and a list of its parts.

/* ------------------------------------------------------------------ /reports */
export default function ReportsHub() {
  const { lang, tr } = useLang()
  useTitle(PAGE_WORDS.reports.title, lang)
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Reports', 'నివేదికలు')} q={PAGE_WORDS.reports.title} lede={PAGE_WORDS.reports.description[lang]} />
      <ul className="mt-8 grid gap-5">
        {REPORTS.map((r) => <li key={r.slug}><ReportCard r={r} /></li>)}
      </ul>
      <p className="mt-8 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{tr('A report is added when one subject needs more than a page: a summit, a budget, a large project. Each one says what it could not find.', 'ఒక అంశానికి ఒక పేజీ సరిపోనప్పుడు నివేదిక చేర్చుతాం: ఒక సదస్సు, ఒక బడ్జెట్, ఒక పెద్ద ప్రాజెక్టు. ప్రతి నివేదికా తనకు ఏం దొరకలేదో చెబుతుంది.')}</p>
    </Page>
  )
}

/* ------------------------------------------------------------------ /reports/<slug> */
export function ReportPage({ slug }: { slug: string }) {
  const { lang, tr } = useLang()
  const r = reportBySlug.get(slug)
  const x = r ? summitReport(r.summit) : null
  useTitle(r ? r.title : null, lang)
  if (!r || !x) {
    return (
      <Page className="pt-10 md:pt-14">
        <PageHead eyebrow={tr('Reports', 'నివేదికలు')} q={{ en: 'We do not have this report', te: 'ఈ నివేదిక మా దగ్గర లేదు' }}
          lede={tr('It may have moved. Every report we have is listed on the Reports page.', 'అది వేరే చోటికి మారి ఉండవచ్చు. మా దగ్గర ఉన్న ప్రతి నివేదికా నివేదికల పేజీలో ఉంది.')} />
        <a href={href('reports')} className="mt-6 inline-flex items-center gap-1 text-[15px] font-semibold underline underline-offset-4">{tr('All reports', 'అన్ని నివేదికలు')}</a>
      </Page>
    )
  }
  return <SummitFullReport r={r} x={x} />
}

const PARTS = [
  ['dashboard', 'The summit at a glance', 'ఒక చూపులో సదస్సు'],
  ['before', 'Expected before, announced after', 'ముందు ఆశించినది, తర్వాత ప్రకటించినది'],
  ['totals', 'Why the totals differ', 'మొత్తాలు ఎందుకు వేరు'],
  ['days', 'Day by day', 'రోజు వారీగా'],
  ['differ', 'Where the newspapers disagree', 'పత్రికలు ఎక్కడ విభేదించాయి'],
  ['pipeline', 'From promise to factory', 'హామీ నుంచి పరిశ్రమ వరకు'],
  ['history', 'What earlier summits led to', 'గత సదస్సులు ఏమయ్యాయి'],
  ['watch', 'What we are waiting for', 'మేము దేని కోసం ఎదురుచూస్తున్నాం'],
  ['method', 'How we checked', 'ఎలా సరిచూశాం'],
] as const

function SummitFullReport({ r, x }: { r: ReportEntry; x: SummitReport }) {
  const w = useReportWords(x)
  const { te, tr, pick, by, srcs } = w
  const others = (c: SummitReport['companies'][number]) => (c.others?.length || c.also) ? (
    <ul className="space-y-0.5">
      {(c.others ?? []).map((o, i) => <li key={i}>{tr('Also', 'ఇంకా')} {by(o.report)}: {pick(o.words)}</li>)}
      {c.also ? <li>{pick(c.also)}</li> : null}
    </ul>
  ) : undefined

  return (
    <Page className="pt-10 md:pt-14">
      <a href={href('reports')} className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />{tr('Reports', 'నివేదికలు')}
      </a>
      <PageHead eyebrow={pick(r.eyebrow)} q={r.title} lede={pick(r.description)} />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-muted-foreground">
        <span>{tr(`First published ${dateLong(r.published)}`, `మొదట ప్రచురించింది ${dateTe(r.published)}`)}</span>
        <span aria-hidden>·</span>
        <span>{tr(`Figures checked ${dateLong(x.checked)}`, `అంకెలు సరిచూసింది ${dateTe(x.checked)}`)}</span>
        <span aria-hidden>·</span>
        <span>{tr(`${x.reports.length} reports read`, `${x.reports.length} నివేదికలు చదివాం`)}</span>
        <KindBadge kind="press" />
      </div>

      <nav aria-label={tr('Parts of this report', 'ఈ నివేదిక భాగాలు')} className="mt-8 rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('In this report', 'ఈ నివేదికలో')}</div>
        <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {PARTS.map(([id, en, teW], i) => (
            <li key={id}><a href={`#${id}`} className="flex gap-2 rounded-md py-1 text-[14.5px] hover:underline hover:underline-offset-4"><span className="w-5 shrink-0 text-right text-muted-foreground tnum">{i + 1}</span><span>{te ? teW : en}</span></a></li>
          ))}
        </ol>
      </nav>

      <div className="mt-14 space-y-20">
        {/* 1. the answer */}
        <section id="dashboard" className="scroll-mt-24 space-y-5">
          <SummitDashboard x={x} w={w} others={others} />
          <div className="max-w-3xl"><ShortAnswer>{pick(x.headline)}</ShortAnswer></div>
          <div className="flex max-w-4xl flex-wrap items-start gap-2 text-[13.5px] leading-relaxed text-muted-foreground"><KindBadge kind="press" /><span className="min-w-0 flex-1">{pick(x.official_check)}</span></div>
          <div className="max-w-3xl"><ExampleBox madeUp={false}>{tr('An MoU is like agreeing to buy a house. The money moves only when the sale happens. So a summit total is a list of promises, not money spent.', 'ఎంఓయూ ఇల్లు కొనడానికి ఒప్పుకోవడం లాంటిది. అమ్మకం జరిగినప్పుడే డబ్బు చేతులు మారుతుంది. అందుకే సదస్సు మొత్తం హామీల జాబితా, ఖర్చు చేసిన డబ్బు కాదు.')}</ExampleBox></div>
        </section>

        {/* 2. expected before against announced after */}
        <Section id="before" eyebrow={tr('Before and after', 'ముందు, తర్వాత')} title={tr('What was expected before the summit, and what was announced after', 'సదస్సుకు ముందు ఏం ఆశించారు, తర్వాత ఏం ప్రకటించారు')}
          lede={tr('In the days before the summit, the government and its ministers said how much they expected. After it, the Chief Minister announced what was signed. Both are shown on one ruler, each as printed. The gap is not worked out here, because the two do not count the same things.', 'సదస్సుకు ముందు రోజుల్లో ప్రభుత్వం, మంత్రులు ఎంత ఆశిస్తున్నారో చెప్పారు. తర్వాత, ఏం సంతకమైందో ముఖ్యమంత్రి ప్రకటించారు. రెండింటినీ ఒకే కొలతపై, ముద్రించినట్లే చూపాం. రెండూ ఒకే వాటిని లెక్కించవు కాబట్టి తేడాను ఇక్కడ లెక్కించలేదు.')}>
          <ChartFrame q={{ en: 'Expected before, announced after', te: 'ముందు ఆశించినది, తర్వాత ప్రకటించినది' }}
            how={tr('The top group is what was said before any signing; the bottom group is the summit’s own total, as announced after. One ruler for both.', 'పై గుంపు ఏ సంతకమూ జరగక ముందు చెప్పినది; కింది గుంపు తర్వాత ప్రకటించిన సదస్సు మొత్తం. రెండింటికీ ఒకే కొలత.')}
            limits={tr('why the figures changed. No report explains it. The release before also counted government orders.', 'అంకెలు ఎందుకు మారాయో. ఏ నివేదికా వివరించలేదు. ముందటి ప్రకటన ప్రభుత్వ ఉత్తర్వులనూ లెక్కించింది.')}
            sources={srcs(x.figures.filter((f) => f.group === 'expected' || f.group === 'summit').map((f) => f.report))}>
            <Legend />
            <Ruler groups={figureGroups(x, w, ['expected', 'summit'])} max={Math.max(...x.figures.filter((f) => f.group === 'expected' || f.group === 'summit').map((f) => f.crore))} unit="lakh" />
          </ChartFrame>
        </Section>

        {/* 3. the totals */}
        <Section id="totals" eyebrow={tr('Why the numbers differ', 'అంకెలు ఎందుకు వేరు')} title={tr('Why you may have heard different totals', 'మీరు వేర్వేరు మొత్తాలు ఎందుకు విని ఉండవచ్చు')}
          lede={tr('The reports are not all counting the same thing. Some count the summit and the regional meetings held in October together, some only the two summit days. Each total is shown with what it counts.', 'నివేదికలన్నీ ఒకే దాన్ని లెక్కించడం లేదు. కొన్ని సదస్సు, అక్టోబర్ ప్రాంతీయ సమావేశాలు కలిపి, కొన్ని సదస్సు రెండు రోజులు మాత్రమే. ప్రతి మొత్తాన్నీ అది దేన్ని లెక్కిస్తుందో దానితో చూపాం.')}>
          <ChartFrame q={{ en: 'Which total counts what?', te: 'ఏ మొత్తం దేన్ని లెక్కిస్తుంది?' }}
            how={tr('Each row is one report’s figure, as printed, grouped by what it counts, on one ruler. The words under each bar are the report’s own.', 'ప్రతి వరుస ఒక నివేదిక అంకె, ముద్రించినట్లే; అది దేన్ని లెక్కిస్తుందో దాని ప్రకారం గుంపులుగా, ఒకే కొలతపై. ప్రతి బార్ కింది మాటలు ఆ నివేదికవే.')}
            limits={tr('which figure the state will publish. Until it does, none of these is the state’s own figure.', 'రాష్ట్రం ఏ అంకెను ప్రచురిస్తుందో. అది ప్రచురించే వరకు ఇవేవీ రాష్ట్ర సొంత అంకె కాదు.')}
            sources={srcs(x.figures.filter((f) => ['both', 'unsplit', 'summit', 'regional'].includes(f.group)).map((f) => f.report))}>
            <Legend />
            <Ruler groups={figureGroups(x, w, ['both', 'unsplit', 'summit', 'regional'])} max={Math.max(...x.figures.map((f) => f.crore))} unit="lakh" />
          </ChartFrame>
        </Section>

        {/* 3. day by day */}
        <Section id="days" eyebrow={tr('Day by day', 'రోజు వారీగా')} title={tr('What each summit day was reported to bring', 'ప్రతి సదస్సు రోజు ఏం తెచ్చిందని నివేదికలు చెప్పాయి')}
          lede={tr('The first day was reported in detail, with sectors. The second day was reported as two separate lists of signings. No report says how the two days make up the 109 MoUs.', 'మొదటి రోజును రంగాల వారీగా వివరంగా నివేదించారు. రెండో రోజును రెండు వేర్వేరు సంతకాల జాబితాలుగా నివేదించారు. రెండు రోజులు కలిసి 109 ఎంఓయూలు ఎలా అయ్యాయో ఏ నివేదికా చెప్పలేదు.')}>
          <ChartFrame q={{ en: 'What did each day bring, as reported?', te: 'ప్రతి రోజు ఏం వచ్చిందని నివేదికలు చెప్పాయి?' }}
            how={tr('One row per report, grouped by day, on one ruler. A day’s figure counts that day only.', 'ఒక్కో నివేదికకు ఒక వరుస, రోజు వారీగా, ఒకే కొలతపై. ఒక రోజు అంకె ఆ రోజునే లెక్కిస్తుంది.')}
            limits={tr('the full list for either day. The state has not published one.', 'ఏ రోజుకైనా పూర్తి జాబితా. రాష్ట్రం ప్రచురించలేదు.')}
            sources={srcs(x.figures.filter((f) => f.group === 'day1' || f.group === 'day2').map((f) => f.report))}>
            <Legend />
            <Ruler groups={figureGroups(x, w, ['day1', 'day2'])} max={Math.max(...x.figures.filter((f) => f.group === 'day1' || f.group === 'day2').map((f) => f.crore))} unit="lakh" />
          </ChartFrame>
        </Section>

        {/* 7. differences */}
        {x.differences?.length ? (
          <Section id="differ" eyebrow={tr('Check before you repeat it', 'చెప్పే ముందు సరిచూడండి')} title={tr('Where the newspapers disagree', 'పత్రికలు ఎక్కడ విభేదించాయి')}
            lede={tr('If someone quotes one of these figures, it may be right by one report and wrong by another. Here is every reading, side by side, with the report that printed it.', 'ఎవరైనా వీటిలో ఒక అంకె చెబితే, అది ఒక నివేదిక ప్రకారం సరి, మరో దాని ప్రకారం తప్పు కావచ్చు. ప్రతి అంకెనూ, దాన్ని ముద్రించిన నివేదికతో, పక్కపక్కన ఇక్కడ చూపాం.')}>
            <ul className="grid gap-4 lg:grid-cols-2">
              {x.differences.map((d) => (
                <li key={d.id} className="min-w-0 rounded-xl border border-border bg-card p-4 md:p-5">
                  <h3 className="text-[17px] font-semibold leading-snug">{pick(d.subject)}</h3>
                  <ul className="mt-3 space-y-2">
                    {d.readings.map((rd, i) => (
                      <li key={i} className="rounded-lg border border-dashed border-foreground/30 bg-background px-3 py-2">
                        <div className="text-[15px] font-semibold leading-snug tnum">{pick(rd.words)}</div>
                        <div className="mt-0.5 text-[12.5px] text-muted-foreground">{by(rd.report)}</div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[14px] leading-relaxed text-foreground/85">{pick(d.note)}</p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* 8. pipeline */}
        <Pipeline x={x} w={w} />

        {/* 9. history */}
        <History w={w} />

        {/* 10. watch */}
        <Section id="watch" eyebrow={tr('What comes next', 'తర్వాత ఏమిటి')} title={tr('What we are waiting for', 'మేము దేని కోసం ఎదురుచూస్తున్నాం')}>
          <ul className="grid max-w-5xl gap-3 md:grid-cols-3">
            {x.watch.map((it, i) => <li key={i} className="rounded-xl border border-dashed border-foreground/30 bg-card p-4 text-[14.5px] leading-relaxed">{pick(it)}</li>)}
          </ul>
          <p className="mt-3 max-w-3xl text-[13.5px] text-muted-foreground">{tr(`When any of these is published, this report changes to it, and the state’s figures are shown apart from the newspapers’. Last checked ${dateLong(x.checked)}.`, `వీటిలో ఏది ప్రచురించినా ఈ నివేదిక దానికి మారుతుంది; రాష్ట్ర అంకెలను పత్రికల అంకెల నుంచి వేరుగా చూపుతాం. చివరిగా సరిచూసింది ${dateTe(x.checked)}.`)}</p>
        </Section>

        {/* 11. method and sources */}
        <Method x={x} w={w} />
      </div>
    </Page>
  )
}

type W = ReturnType<typeof useReportWords>

/* ------------------------------------------------------------------ 8. the pipeline */
function Pipeline({ x, w }: { x: SummitReport; w: W }) {
  const { tr, pick, R, by } = w
  const pipeMax = Math.max(...x.pipeline.flatMap((p) => p.readings.map((r) => r.crore)))
  return (
    <Section id="pipeline" eyebrow={tr('From promise to factory', 'హామీ నుంచి పరిశ్రమ వరకు')} title={tr('Where the promises since June 2024 stand, as reported', '2024 జూన్ నుంచి హామీలు ఎక్కడున్నాయి, నివేదికల ప్రకారం')}
      lede={tr('An MoU is the first step. Next, the state approves land and incentives. Then building starts, and only after that do production and jobs begin. These are the stages as the reports put them, with every reading where two reports differ.', 'ఎంఓయూ మొదటి అడుగు. తర్వాత రాష్ట్రం భూమి, ప్రోత్సాహకాలు ఆమోదిస్తుంది. తర్వాత నిర్మాణం మొదలవుతుంది; ఆ తర్వాతే ఉత్పత్తి, ఉద్యోగాలు. నివేదికలు చెప్పిన దశలు ఇవి; రెండు నివేదికలు వేరుగా చెప్పిన చోట రెండూ చూపాం.')}>
      <figure className="rounded-xl border border-border bg-card p-4 md:p-6">
        <ol className="space-y-3">
          {x.pipeline.map((st, i) => (
            <li key={st.id} className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr(`Step ${i + 1}`, `దశ ${i + 1}`)}</div>
                <div className="text-[16px] font-semibold leading-snug">{pick(st.label)}</div>
                {st.projects != null ? <div className="font-heading text-[26px] font-semibold leading-tight tnum">{num(st.projects, 0)} <span className="text-[14px] font-normal text-muted-foreground">{tr('projects', 'ప్రాజెక్టులు')}</span></div> : null}
              </div>
              <div className="min-w-0 space-y-2">
                {st.readings.length ? st.readings.map((r, j) => {
                  const rep = R.get(r.report)!
                  return (
                    <div key={j}>
                      <span aria-hidden className={cn('block h-3 rounded-[3px]', BAR[rep.kind])} style={{ width: `max(2px, ${(r.crore / pipeMax) * 100}%)` }} />
                      <div className="mt-1 text-[13.5px] leading-snug"><b className="tnum">{pick(r.amount)}</b> <span className="text-muted-foreground">· {pick(r.words)} · {by(r.report)}</span>{rep.kind === 'government' ? <KindBadge kind="government" className="ml-2 align-middle" /> : null}</div>
                    </div>
                  )
                }) : <p className="rounded-lg border border-dashed border-foreground/25 px-3 py-2 text-[13.5px] text-muted-foreground">{tr('No report gives a figure for this step.', 'ఈ దశకు ఏ నివేదికా అంకె ఇవ్వలేదు.')}</p>}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 space-y-1.5 border-t border-border pt-3">
          {x.pipeline_notes.map((n, i) => <p key={i} className="text-[13.5px] leading-relaxed text-muted-foreground">{pick(n)}</p>)}
          <ReadLine kind="limits" className="text-[13.5px]">{tr('what each project has actually spent. The bars show each stage’s stated amount on one ruler; they are not shares worked out by us.', 'ప్రతి ప్రాజెక్టు నిజంగా ఎంత ఖర్చు చేసిందో. బార్లు ప్రతి దశ చెప్పిన మొత్తాన్ని ఒకే కొలతపై చూపుతాయి; మేము లెక్కించిన వాటాలు కావు.')}</ReadLine>
        </div>
      </figure>
    </Section>
  )
}

/* ------------------------------------------------------------------ 9. earlier summits against what started */
function History({ w }: { w: W }) {
  const { te, tr, pick } = w
  const S = invest.summits as unknown as { key: string; name: string; start_date: string; mou_count: number; investment_crore: number; figure_type: string }[]
  const Y = invest.by_year as unknown as { year: string; investment_crore: number | null; basis: string | null }[]
  // A summit total is shown the way its paper printed it: a round thousand is the sign of a lakh crore figure, and
  // writing it out in crore would invent digits nobody printed.
  const printed = (v: number) => (v % 1000 === 0 ? (te ? lakhCroreTe(v) : lakhCrore(v)) : (te ? croreTe(v, 0) : crore(v, 0)))
  const groups = [
    { id: 'promised', label: tr('Announced at each summit, as the state stated it', 'ప్రతి సదస్సులో ప్రకటించినవి, రాష్ట్రం చెప్పినట్లు'),
      rows: [...S].sort((a, b) => a.start_date.localeCompare(b.start_date)).map((s): Row => ({
        key: s.key, name: <a href={href(`summit-${s.key}`)} className="hover:underline">{pick(summitName(s as Parameters<typeof summitName>[0]))}</a>,
        meta: <>{te ? dateTe(s.start_date) : dateLong(s.start_date)} · {tr(`${num(s.mou_count, 0)} MoUs`, `${num(s.mou_count, 0)} ఎంఓయూలు`)}{s.figure_type === 'press_report' ? <> · {tr('a news report until the state publishes', 'రాష్ట్రం ప్రచురించే వరకు వార్తా నివేదిక')}</> : null}</>,
        value: s.investment_crore, amount: printed(s.investment_crore), kind: s.figure_type === 'press_report' ? 'press' : 'government',
      })) },
    { id: 'started', label: tr('Investment the state says started on the ground, year by year', 'నేలపై మొదలైందని రాష్ట్రం చెప్పిన పెట్టుబడి, ఏడాది వారీగా'),
      rows: Y.map((y): Row => ({
        key: y.year, name: <span className="tnum">{y.year}</span>, meta: y.basis ? <span lang="en" className="line-clamp-2">{y.basis}</span> : undefined,
        value: y.investment_crore ?? null,
        amount: y.investment_crore != null ? (te ? croreTe(y.investment_crore, 0) : crore(y.investment_crore, 0)) : tr('Not published by the state', 'రాష్ట్రం ప్రచురించలేదు'),
        kind: 'government',
      })) },
  ]
  return (
    <Section id="history" eyebrow={tr('What happened before', 'ఇంతకు ముందు ఏమైంది')} title={tr('Every summit, and the investment the state says started, on one ruler', 'ప్రతి సదస్సు, మొదలైందని రాష్ట్రం చెప్పిన పెట్టుబడి, ఒకే కొలతపై')}
      lede={tr('Each summit announced lakhs of crores. In the same years, the state’s own papers counted investment that started on the ground in thousands of crores a year. Seeing both on one ruler shows the difference in scale without adding anything up.', 'ప్రతి సదస్సు లక్షల కోట్లు ప్రకటించింది. అదే ఏళ్లలో, నేలపై మొదలైన పెట్టుబడిని రాష్ట్ర సొంత పత్రాలు ఏడాదికి వేల కోట్లలో లెక్కించాయి. రెండింటినీ ఒకే కొలతపై చూస్తే, ఏదీ కలపకుండానే పరిమాణంలో తేడా కనిపిస్తుంది.')}>
      <ChartFrame q={{ en: 'How do summit promises compare with what started?', te: 'సదస్సు హామీలు, మొదలైన పెట్టుబడి ఎలా ఉన్నాయి?' }}
        how={tr('The top group is each summit’s announced total; the bottom group is the state’s yearly count of investment that started. Both share one ruler, so a bottom bar can be a thin sliver; its value is printed beside it.', 'పై గుంపు ప్రతి సదస్సు ప్రకటించిన మొత్తం; కింది గుంపు మొదలైన పెట్టుబడిపై రాష్ట్ర ఏడాది లెక్క. రెండూ ఒకే కొలతపై ఉన్నాయి; అందుకే కింది బార్ సన్నని గీతలా ఉండవచ్చు; దాని విలువ పక్కనే ముద్రించాం.')}
        limits={tr('a like-for-like score. A yearly figure counts investment from any source, not only summit promises; the state counted it differently in different years; and a promise can take years to start. Both are shown because they are the only figures the state publishes.', 'సమానమైన పోలిక. ఏడాది అంకె సదస్సు హామీలే కాకుండా ఏ మూలం నుంచి వచ్చిన పెట్టుబడినైనా లెక్కిస్తుంది; రాష్ట్రం వేర్వేరు ఏళ్లలో దాన్ని వేర్వేరుగా లెక్కించింది; ఒక హామీ మొదలవ్వడానికి ఏళ్లు పట్టవచ్చు. రాష్ట్రం ప్రచురించే అంకెలు ఇవే కాబట్టి రెండూ చూపాం.')}
        sources={[{ label: tr('State budget speeches and Socio Economic Surveys, as each row on the investments page names', 'రాష్ట్ర బడ్జెట్ ప్రసంగాలు, సామాజిక ఆర్థిక సర్వేలు; పెట్టుబడుల పేజీలో ప్రతి వరుస తన ఆధారాన్ని చూపుతుంది'), url: href('investments') }]}>
        <Legend />
        <Ruler groups={groups} max={Math.max(...S.map((s) => s.investment_crore ?? 0))} unit="lakh" />
      </ChartFrame>
    </Section>
  )
}

/* ------------------------------------------------------------------ 11. how we checked, and every report */
function Method({ x, w }: { x: SummitReport; w: W }) {
  const { tr, pick, when } = w
  const all = [...x.reports].sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.outlet.localeCompare(b.outlet))
  const rules = [
    tr('Every figure is copied as the report printed it, with the report named and linked beside it.', 'ప్రతి అంకెనూ నివేదిక ముద్రించినట్లే తీసుకున్నాం; పక్కనే నివేదిక పేరు, లింకు.'),
    tr('Where two reports print different figures for the same thing, both are shown. We do not pick one.', 'ఒకే విషయానికి రెండు నివేదికలు వేర్వేరు అంకెలు ముద్రిస్తే, రెండూ చూపాం. ఒకదాన్ని ఎంచుకోలేదు.'),
    tr('Nothing is added up, averaged or ranked by us. Bars only stand side by side on one ruler.', 'మేము ఏదీ కలపలేదు, సగటు తీయలేదు, ర్యాంకు ఇవ్వలేదు. బార్లు ఒకే కొలతపై పక్కపక్కన మాత్రమే.'),
    tr('Newspaper figures are marked as such, and are never mixed with figures from government papers.', 'పత్రికల అంకెలను అలాగే గుర్తించాం; ప్రభుత్వ పత్రాల అంకెలతో ఎప్పుడూ కలపలేదు.'),
    tr('A link we have not confirmed, such as between two promises that look alike, is not made.', 'రెండు ఒకేలా కనిపించే హామీల మధ్య వంటి, మేము నిర్ధారించని సంబంధాన్ని చూపలేదు.'),
    tr('Before this page goes live, an automatic check stops it if any figure differs from its report’s words, or if English and Telugu show different numbers.', 'ఈ పేజీ ప్రచురించే ముందు, ఏ అంకె అయినా నివేదిక మాటలకు వేరుగా ఉన్నా, ఇంగ్లీష్ తెలుగు అంకెలు వేరుగా ఉన్నా ఆటోమేటిక్ తనిఖీ దాన్ని ఆపుతుంది.'),
  ]
  return (
    <Section id="method" eyebrow={tr('Sources', 'ఆధారాలు')} title={tr('How we checked, and every report we read', 'ఎలా సరిచూశాం, మేము చదివిన ప్రతి నివేదిక')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-3">
          <ol className="space-y-2.5">
            {rules.map((t, i) => <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold tnum">{i + 1}</span><span className="min-w-0">{t}</span></li>)}
          </ol>
          <p className="rounded-xl border border-dashed border-foreground/25 px-3.5 py-3 text-[13.5px] leading-relaxed text-muted-foreground">{pick(x.official_check)}</p>
          {x.not_read?.length ? (
            <div className="rounded-xl border border-dashed border-foreground/25 px-3.5 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
              <div className="mb-1 font-semibold text-foreground">{tr('What we could not read', 'మేము చదవలేకపోయినవి')}</div>
              <ul className="space-y-1">{x.not_read.map((n, i) => <li key={i}>{pick(n)}</li>)}</ul>
            </div>
          ) : null}
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">{tr('Found a figure we got wrong, or a report we missed? The About page says how to tell us; a correction is made and dated.', 'మేము తప్పుగా చూపిన అంకె, లేదా మేము చూడని నివేదిక కనిపించిందా? ఎలా చెప్పాలో మా గురించి పేజీలో ఉంది; సవరణ చేసి తేదీ వేస్తాం.')} <a href={href('about')} className="font-medium text-foreground underline underline-offset-4">{tr('About', 'మా గురించి')}</a></p>
        </div>
        <ul className="grid min-w-0 gap-2.5 md:grid-cols-2">
          {all.map((r) => (
            <li key={r.id} className={cn('min-w-0 rounded-xl border bg-card p-4', r.kind === 'press' ? 'border-dashed border-foreground/30' : 'border-border')}>
              <div className="flex flex-wrap items-center gap-2"><KindBadge kind={r.kind} /><span className="text-[13px] text-muted-foreground">{when(r.date)}</span></div>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[15.5px] font-semibold underline-offset-4 hover:underline" lang="en">{r.outlet}<ArrowUpRight className="size-4 opacity-60" /></a>
              <div className="text-[13px] text-muted-foreground"><span lang="en">{r.byline}</span> · {pick(r.speaker)}</div>
              {r.date_note ? <div className="mt-1 text-[12.5px] text-muted-foreground">{pick(r.date_note)}</div> : null}
              <blockquote className="mt-2 border-l-2 border-foreground/25 pl-3 text-[13.5px] leading-relaxed text-foreground/85" lang={/[\u0C00-\u0C7F]/.test(r.quote) ? 'te' : 'en'}>“{r.quote}”</blockquote>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
