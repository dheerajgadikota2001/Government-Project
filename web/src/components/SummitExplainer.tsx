import { ArrowRight } from 'lucide-react'
import { href } from '@/lib/route'
import { ChartFrame, ExampleBox, KindBadge, NumTable, Section, ShortAnswer } from '@/components/kit'
import { summitReport } from '@/lib/docs'
import { reportForSummit } from '@/lib/reports'
import { Legend, Ruler, figureGroups, useReportWords } from '@/components/summit-parts'

// The short version of a summit with reports, on its own page (/investments/<summit>): the answer, why the
// totals differ, and the way into the full report (/reports/<slug>), which has every day, sector, district,
// company and disagreement. Every figure is copied as printed by the report named beside it; nothing is added.

export function SummitExplainer({ summitKey }: { summitKey: string }) {
  const x = summitReport(summitKey)
  const w = useReportWords(x ?? ({ reports: [] } as never))
  if (!x) return null
  const { tr, pick } = w
  const full = reportForSummit(summitKey)
  const figureTable = (
    <NumTable head={[tr('Report', 'నివేదిక'), tr('What it counts', 'ఏది లెక్కిస్తుంది'), tr('As printed', 'ముద్రించినట్లు')]}
      rows={x.figures.map((f) => [<span lang="en">{w.R.get(f.report)!.outlet}</span>, pick(x.groups.find((g) => g.id === f.group)!.label), pick(f.words)])} />
  )
  const fullLink = full ? (
    <a href={href(`report-${full.slug}`)} className="group flex flex-col gap-1 rounded-2xl border border-foreground/20 bg-card p-5 transition-colors hover:border-foreground/50 md:flex-row md:items-center md:justify-between md:gap-6">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('The full report', 'పూర్తి నివేదిక')}</div>
        <div className="mt-1 text-[18px] font-semibold leading-snug">{pick(full.title)}</div>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{tr('Each day, every sector, the districts named, every company, and where the newspapers disagree.', 'ప్రతి రోజు, ప్రతి రంగం, పేర్కొన్న జిల్లాలు, ప్రతి కంపెనీ, పత్రికలు ఎక్కడ విభేదించాయి.')}</p>
      </div>
      <span className="mt-2 inline-flex shrink-0 items-center gap-1.5 text-[15px] font-semibold md:mt-0">{tr('Read it', 'చదవండి')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
    </a>
  ) : null

  return (
    <div className="mt-8 space-y-16">
      <div className="max-w-3xl space-y-3">
        <ShortAnswer>{pick(x.headline)}</ShortAnswer>
        <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground"><KindBadge kind="press" /><span>{pick(x.official_check)}</span></div>
        <ExampleBox madeUp={false}>{tr('An MoU is like agreeing to buy a house. The money moves only when the sale happens. So a summit total is a list of promises, not money spent.', 'ఎంఓయూ ఇల్లు కొనడానికి ఒప్పుకోవడం లాంటిది. అమ్మకం జరిగినప్పుడే డబ్బు చేతులు మారుతుంది. అందుకే సదస్సు మొత్తం హామీల జాబితా, ఖర్చు చేసిన డబ్బు కాదు.')}</ExampleBox>
      </div>
      {fullLink}

      <Section eyebrow={tr('Why the numbers differ', 'అంకెలు ఎందుకు వేరు')} title={tr('Why you may have heard different totals', 'మీరు వేర్వేరు మొత్తాలు ఎందుకు విని ఉండవచ్చు')}
        lede={tr('The reports are not all counting the same thing. Some count the two summit days, some add the regional meetings held in October, and some count one day only.', 'నివేదికలన్నీ ఒకే దాన్ని లెక్కించడం లేదు. కొన్ని సదస్సు రెండు రోజులను, కొన్ని అక్టోబర్‌లో జరిగిన ప్రాంతీయ సమావేశాలను కలిపి, కొన్ని ఒక్క రోజునే లెక్కిస్తాయి.')}>
        <ChartFrame q={{ en: 'Which total counts what?', te: 'ఏ మొత్తం దేన్ని లెక్కిస్తుంది?' }}
          how={tr('Each row is one report’s figure, as printed, grouped by what it counts. The bar shows its size on a ruler shared by every row. The words under each bar are the report’s own.', 'ప్రతి వరుస ఒక నివేదిక అంకె, ముద్రించినట్లే; అది దేన్ని లెక్కిస్తుందో దాని ప్రకారం గుంపులుగా. బార్ దాని పరిమాణాన్ని అన్ని వరుసలకూ ఒకటే అయిన కొలతపై చూపుతుంది. ప్రతి బార్ కింది మాటలు ఆ నివేదికవే.')}
          limits={tr('which figure the state will publish. Until it does, none of these is the state’s own figure.', 'రాష్ట్రం ఏ అంకెను ప్రచురిస్తుందో. అది ప్రచురించే వరకు ఇవేవీ రాష్ట్ర సొంత అంకె కాదు.')}
          sources={w.srcs(x.figures.map((f) => f.report))} table={figureTable}>
          <Legend />
          <Ruler groups={figureGroups(x, w)} max={Math.max(...x.figures.map((f) => f.crore))} unit="lakh" />
        </ChartFrame>
      </Section>
      {fullLink}
    </div>
  )
}
