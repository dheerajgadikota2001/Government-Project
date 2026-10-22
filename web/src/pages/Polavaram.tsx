import * as React from 'react'
import { AlertCircle, ArrowUpRight, Newspaper } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { useDesign } from '@/lib/design'
import { href } from '@/lib/route'
import { districtByName, districts, mapViewBox } from '@/lib/data'
import { pol } from '@/lib/data-polavaram'
import { crore, croreTe, dateLong, dateShort, dateTe, num } from '@/lib/format'
import { Page } from '@/components/shell'
import { View3D, Pin } from '@/three/View3D'
import { AnswerBox, ChartFrame, KindBadge, NumTable, PaperChip, Section, StatusWord, Te, Term } from '@/components/kit'
import { PaperList, RoadBlock, Story, Tiles, type Tile } from '@/components/project-parts'
import { Dam } from '@/graphics/Dam'
import { Map3D } from '@/graphics/Map3D'
import { CostDots, DeadlineChart, FamiliesBars, HBars, ProgressRows, type Deadline, type ProgRow } from '@/graphics/PolCharts'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/vendor/magicui/blur-fade'
import { ScrollProgress } from '@/vendor/magicui/scroll-progress'
import { useTokens } from '@/graphics/util'
import { StoryScroller } from '@/components/story/StoryScroller'
import { polavaramStory } from '@/data/stories/polavaram'
import { mix } from '@/graphics/tokens'

const P = pol.papers as Record<string, any>
const paper = (id: string) => (P[id] ? { label: P[id].short, url: P[id].url } : null)
const latest = pol.readings[pol.readings.length - 1]
const first = pol.cost_history[0]

/** Dates and rupees in the reader's language. Paper and newspaper names stay as they are printed. */
function useWords() {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  return {
    te, tr,
    day: (s?: string | null) => (te ? dateTe(s) : dateLong(s)),
    money: (v: number | null | undefined, dec = 2) => (te ? croreTe(v, dec) : crore(v, dec)),
    place: (name: string) => (te ? districtByName.get(name)?.te ?? name : name),
  }
}

export default function Polavaram() {
  const { d } = useDesign()
  const { lang, tr } = useLang()
  const { te, day, money } = useWords()
  const [ri, setRi] = React.useState(pol.readings.length - 1)
  const steps = pol.story.steps.map((s: any) => ({ date: s.date, label: lang === 'te' ? s.short.te : s.short.en, text: lang === 'te' ? s.text.te : s.text.en, long: lang === 'te' ? s.text.te : s.text.en, paper: P[s.source]?.short, url: P[s.source]?.url }))
  const readings = pol.readings.map((r: any) => ({ date: r.date, pct: r.pct, paper: r.paper, url: r.url, spent: r.spent }))
  // one model for every reading: choosing another report glides the dam to it instead of rebuilding
  const damParams = React.useMemo(() => ({ pct: pol.readings[ri].pct as number | null }), [ri])
  const sel = pol.readings[ri]

  const tiles: Tile[] = [
    { label: tr('Work done', 'జరిగిన పని'), te: tr('జరిగిన పని', 'Work done'), value: `${num(latest.pct)}%`, bar: latest.pct,
      caption: tr(<>Physical progress, as reported to the Union Statistics Ministry for {dateLong(latest.date)}. Other papers measure it differently.</>,
        <>{dateTe(latest.date)} నాటికి కేంద్ర గణాంకాల మంత్రిత్వ శాఖకు నివేదించిన భౌతిక పురోగతి. ఇతర పత్రాలు దీన్ని వేరే విధంగా లెక్కిస్తాయి.</>),
      paper: { label: latest.paper, url: latest.url } },
    { label: tr('Money', 'ఖర్చు'), te: tr('ఖర్చు', 'Money'), value: tr(crore(55548.87, 2), croreTe(55548.87, 2)), bar: null,
      caption: tr(<>The cost in the August 2026 report. The first cost on paper was {crore(first.value)} in {dateLong(first.date)}.</>,
        <>2026 ఆగస్టు నివేదికలోని వ్యయం. పత్రాల్లో మొదటి అంచనా {dateTe(first.date)}లో {croreTe(first.value)}.</>),
      extra: <div className="text-[13px] text-muted-foreground">{tr(<>{crore(latest.spent)} spent by {dateLong(latest.date)}, the same report says.</>, <>{dateTe(latest.date)} నాటికి {croreTe(latest.spent)} ఖర్చయిందని అదే నివేదిక చెబుతోంది.</>)}</div>,
      paper: { label: latest.paper, url: latest.url } },
    { label: tr('Due date', 'గడువు'), te: tr('గడువు', 'Due date'), value: tr('June 2027', '2027 జూన్'), bar: null,
      caption: tr(<>The completion date in the August 2026 report. It is a plan, not an event. Papers have given dates from December 2018 onwards.</>,
        <>2026 ఆగస్టు నివేదికలో పూర్తయ్యే తేదీ. ఇది ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు. పత్రాలు 2018 డిసెంబర్ నుంచి ఎన్నో తేదీలు ఇచ్చాయి.</>),
      paper: { label: latest.paper, url: latest.url } },
  ]

  return (
    <div>
      <ScrollProgress className="top-0 h-0.5 bg-foreground/80" />
      <Page className="pt-6 md:pt-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href={href('')}>{tr('Home', 'హోమ్')}</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href={href('projects')}>{tr('Projects', 'పనులు')}</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href={href('district-eluru')}>{tr('Eluru', 'ఏలూరు')}</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{tr('Polavaram', 'పోలవరం')}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Layer 1: the answer */}
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusWord status="under_construction" size="md" />
              <Badge variant="outline">{tr('Irrigation', 'సాగునీరు')}</Badge>
              <Badge variant="outline">{tr('National project since 2014', '2014 నుంచి జాతీయ ప్రాజెక్టు')}</Badge>
            </div>
            <h1 className="mt-4 text-[38px] font-semibold leading-[1.05] tracking-tight md:text-[54px]">{lang === 'te' ? <Te>పోలవరం పూర్తయిందా?</Te> : 'Is Polavaram finished?'}</h1>
            <p lang={lang === 'te' ? 'en' : 'te'} className="mt-2 text-[18px] text-muted-foreground">{lang === 'te' ? 'Is Polavaram finished?' : 'పోలవరం పూర్తయిందా?'}</p>
            <p className="mt-3 text-[15.5px] text-foreground/80">{tr('Polavaram Irrigation Project, on the Godavari near Polavaram in Eluru district.', 'పోలవరం సాగునీటి ప్రాజెక్టు, ఏలూరు జిల్లా పోలవరం దగ్గర గోదావరిపై.')}</p>
            <AnswerBox className="mt-6">
              {lang === 'te' ? (<>
                <p><b>పూర్తి కాలేదు.</b> కేంద్ర గణాంకాల మంత్రిత్వ శాఖ {dateTe(latest.date)} నివేదిక భౌతిక పురోగతిని <b>{num(latest.pct)}%</b>గా చూపింది. ఇప్పటివరకు <b>{croreTe(latest.spent)}</b> ఖర్చయింది.</p>
                <p>ఆ నివేదికలో పూర్తయ్యే తేదీ <b>2027 జూన్</b>. ఇది ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు.</p>
              </>) : (<>
                <p><b>Not finished.</b> The Union Statistics Ministry&rsquo;s report for {dateLong(latest.date)} puts physical progress at <b>{num(latest.pct)}%</b>, with <b>{crore(latest.spent)}</b> spent so far.</p>
                <p>Its completion date in that report is <b>June 2027</b>. That is a plan, not an event.</p>
              </>)}
              <div className="pt-1"><PaperChip label={latest.paper} url={latest.url} /></div>
            </AnswerBox>
          </div>
          <BlurFade delay={0.1}>
            <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('The dam, built to each report', 'ప్రతి నివేదిక ప్రకారం డ్యామ్')}</div>
              </div>
              {/* the 3D dam, rebuilt for each report; a report that printed money only keeps the flat drawing */}
              {sel.pct != null ? (
                <View3D explorable build={() => import('@/three/scenes/dam')} params={damParams}
                  label={tr(`Polavaram drawn ${sel.pct}% solid, as the report of ${dateLong(sel.date)} prints it`, `${dateTe(sel.date)} నివేదిక ముద్రించినట్లు, పోలవరం ${sel.pct}% గట్టిగా గీసింది`)}
                  className="mt-2 h-[260px] rounded-xl sm:h-[300px]" fallback={<Dam readings={pol.readings} index={ri} />}>
                  {sel.pct < 100 ? <Pin id="gap"><span className="rounded-full border border-dashed border-foreground/40 bg-background/92 px-2 py-0.5 text-[12px] font-semibold shadow-sm">{tr('Still to build', 'ఇంకా కట్టాలి')}</span></Pin> : null}
                  <Pin id="spill"><span className="rounded-full bg-background/92 px-2 py-0.5 text-[12px] font-semibold shadow-sm ring-1 ring-border">{tr('Spillway', 'స్పిల్‌వే')}</span></Pin>
                </View3D>
              ) : <Dam readings={pol.readings} index={ri} />}
              <ToggleGroup type="single" value={String(ri)} onValueChange={(v) => v && setRi(Number(v))} variant="outline" className="mt-2 w-full">
                {pol.readings.map((r: any, k: number) => <ToggleGroupItem key={k} value={String(k)} className="h-11 flex-1 px-1 text-[12.5px]">{te ? dateTe(r.date.slice(0, 7)) : dateShort(r.date).replace(/^\d+ /, '')}</ToggleGroupItem>)}
              </ToggleGroup>
              <div className="mt-3 text-[13px] text-muted-foreground">
                {sel.pct == null
                  ? tr(`This report printed money spent, ${crore(sel.spent)}, but no share of work done.`, `ఈ నివేదిక ఖర్చును మాత్రమే ముద్రించింది, ${croreTe(sel.spent)}; పని శాతం ఇవ్వలేదు.`)
                  : tr(`${num(sel.pct)}% physical progress, ${crore(sel.spent)} spent so far.`, `${num(sel.pct)}% భౌతిక పురోగతి, ఇప్పటివరకు ${croreTe(sel.spent)} ఖర్చు.`)}{' '}
                <PaperChip label={sel.paper} url={sel.url} />
              </div>
            </div>
          </BlurFade>
        </div>

        {/* Layer 2: the picture */}
        <div className="mt-12"><Tiles variant={d.tiles} tiles={tiles} /></div>

        {/* Layer 2b: the story, step by step, with a picture that changes as the reader scrolls */}
        <StoryScroller story={polavaramStory} className="mt-20" />

        <Section className="mt-20" eyebrow={tr('The project road', 'ప్రాజెక్టు ప్రయాణం')} title={lang === 'te' ? <Te>{pol.story.stepsTitle.te}</Te> : pol.story.stepsTitle.en}
          lede={tr('Each step is dated and names the paper it comes from. Government changes are marked by date only.', 'ప్రతి అడుగుకు తేదీ, అది వచ్చిన పత్రం ఉన్నాయి. ప్రభుత్వ మార్పులను తేదీతో మాత్రమే చూపాం.')}>
          <RoadBlock variant={d.road} steps={steps} readings={readings} due="2027-06" dueLabel={tr('Due June 2027', 'గడువు 2027 జూన్')} duePaper="MoSPI report, August 2026" />
        </Section>

        <Alert className="mt-20 border-dashed">
          <AlertCircle />
          <AlertTitle className="line-clamp-none">{tr('The story below is a draft, waiting for your line-by-line review', 'కింది కథ ముసాయిదా; మీరు వరుసవారీగా చదవాల్సి ఉంది')}</AlertTitle>
          <AlertDescription>{tr('Every sentence names its paper, and it was fact-checked five times. It goes live only after you sign it off.', 'ప్రతి వాక్యం తన పత్రాన్ని చూపుతుంది; ఐదుసార్లు నిజనిర్ధారణ చేశాం. మీరు ఆమోదించాకే ఇది లైవ్‌కు వెళ్తుంది.')}</AlertDescription>
        </Alert>
        <Section className="mt-8" eyebrow={tr('The full story', 'పూర్తి కథ')} title={tr('How Polavaram got here', 'పోలవరం ఇక్కడికి ఎలా చేరింది')} te={tr('పోలవరం కథ', undefined)}>
          <Story variant={d.story} chapters={pol.story.chapters} paperOf={paper} />
        </Section>
      </Page>

      {/* Layer 3: the papers */}
      <div className="mt-24 border-t border-border bg-paper/60">
        <Page className="space-y-20 py-16 md:space-y-24 md:py-20">
          <div className="max-w-3xl">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tr('See all the papers', 'అన్ని పత్రాలు చూడండి')}</div>
            <h2 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight md:text-[36px]">{tr('Every figure, from every paper', 'ప్రతి పత్రంలోని ప్రతి అంకె')}</h2>
            <p className="mt-3 text-[16px] text-muted-foreground">{tr('Where two papers disagree, both are here. Nothing below is added up or worked out by us.', 'రెండు పత్రాలు వేర్వేరుగా చెబితే, రెండూ ఇక్కడ ఉన్నాయి. కింద ఏదీ మేము కూడలేదు, లెక్కించలేదు.')}</p>
          </div>
          <HowFar />
          <Cost />
          <Deadlines />
          <Families />
          <Water />
          <Heard />
          <Questions />
          <Section eyebrow={tr('Every paper', 'ప్రతి పత్రం')} title={te ? <Te>ఈ పేజీకి ఆధారమైన పత్రాలు</Te> : 'The papers this page uses'} te={te ? undefined : 'ఈ పేజీకి ఆధారమైన పత్రాలు'}>
            <PaperList papers={Object.values(P).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))) as any} />
          </Section>
        </Page>
      </div>
    </div>
  )
}

function HowFar() {
  const { te, tr, day } = useWords()
  const rows: ProgRow[] = [
    ...pol.progress.filter((p: any) => p.src.startsWith('mospi')).reverse().map((p: any) => ({ measure: te ? p.measure_te : p.measure, date: p.date, pct: p.pct, paper: P[p.src]?.short ?? p.src, kind: 'gov' as const })),
    ...pol.progress.filter((p: any) => !p.src.startsWith('mospi')).map((p: any) => ({ measure: te ? p.measure_te : p.measure, date: p.date, pct: p.pct, paper: P[p.src]?.short ?? p.src, kind: 'gov' as const })),
    ...pol.press.flatMap((n: any) => n.figures.filter((f: any) => f.kind === 'progress').map((f: any) => ({ measure: te ? f.label_te : f.label, date: f.date, pct: f.pct, paper: n.paper, kind: 'press' as const }))),
  ]
  return (
    <Section eyebrow={tr('How far along', 'ఎంతవరకు వచ్చింది')} title={te ? <Te>ఏది లెక్కిస్తారో దాన్ని బట్టి</Te> : 'It depends on what is counted'} te={te ? undefined : 'ఏది లెక్కిస్తారో దాన్ని బట్టి'}
      lede={tr('The building works are much further along than the moving of families. These papers do not say how they measure progress, so read each row on its own.', 'నిర్మాణ పనులు కుటుంబాల తరలింపు కంటే చాలా ముందున్నాయి. ఈ పత్రాలు పురోగతిని ఎలా కొలుస్తాయో చెప్పవు, కాబట్టి ప్రతి వరుసను విడిగా చదవండి.')}>
      <ChartFrame q={{ en: 'How far along is Polavaram?', te: 'పోలవరం ఎంతవరకు వచ్చింది?' }}
        sub={tr('Each row is one measure in one paper, from 0 to 100%. Dashed rows are newspaper reports.', 'ప్రతి వరుస ఒక పత్రంలోని ఒక కొలత, 0 నుంచి 100% వరకు. గీతల వరుసలు పత్రికల వార్తలు.')}
        answer={tr(<>It depends on what is counted. The central report for {dateLong(latest.date)} puts physical progress at <b>{num(latest.pct)}%</b>. The CAG counted the moving of families separately: about 11% by March 2023.</>,
          <>ఏది లెక్కిస్తారో దాన్ని బట్టి ఉంటుంది. {dateTe(latest.date)} నాటి కేంద్ర నివేదిక భౌతిక పురోగతిని <b>{num(latest.pct)}%</b>గా చూపింది. కుటుంబాల తరలింపును CAG విడిగా లెక్కించింది: 2023 మార్చి నాటికి సుమారు 11%.</>)}
        how={tr('Each row is one measure, from one paper, on the same 0 to 100% scale. Read each row on its own: the papers do not say how they measure progress.', 'ప్రతి వరుస ఒక పత్రంలోని ఒక కొలత, అన్నీ ఒకే 0 నుంచి 100% కొలబద్దపై. ప్రతి వరుసను విడిగా చదవండి: పత్రాలు పురోగతిని ఎలా కొలుస్తాయో చెప్పవు.')}
        example={tr('A house can have its walls nearly built while the family has moved only a few of its things in. Both are true, about different things.', 'ఒక ఇంటి గోడలు దాదాపు పూర్తయి ఉండొచ్చు, కానీ కుటుంబం కొన్ని సామాన్లనే లోపలికి తెచ్చి ఉండొచ్చు. రెండూ నిజమే, వేర్వేరు విషయాల గురించి.')} exampleMadeUp={false}
        limits={tr('when the dam will hold water, or when families will have moved. A share of work is not a date.', 'డ్యామ్‌లో నీరు ఎప్పుడు నిలుస్తుందో, కుటుంబాలు ఎప్పటికి తరలుతాయో. పని శాతం ఒక తేదీ కాదు.')}
        sources={[paper('mospi2608')!, paper('ses2425')!, paper('cag2025')!].map((p) => ({ ...p }))}
        table={<NumTable head={[tr('Measure', 'కొలత'), tr('Date', 'తేదీ'), tr('Share', 'శాతం'), tr('Paper', 'పత్రం')]} rows={rows.map((r) => [r.measure, day(r.date), `${num(r.pct)}%`, r.kind === 'press' ? `${r.paper} (${tr('newspaper', 'పత్రిక')})` : r.paper])} />}>
        <ProgressRows rows={rows} />
      </ChartFrame>
    </Section>
  )
}

function Cost() {
  const { te, tr, day, money } = useWords()
  // CostDots tells the first-phase cost by its English scope, so the points keep the English fields.
  const pts = pol.cost_history.map((c: any) => ({ ...c, paper: P[c.src]?.short }))
  return (
    <Section eyebrow={tr('What it costs', 'ఖర్చు ఎంత')} title={te ? <Te>ప్రతి పత్రంతో వ్యయం మారింది</Te> : 'The cost has changed with each paper'} te={te ? undefined : 'ఖర్చు ఎలా మారింది'}
      lede={te
        ? <>ప్రతి బిందువు ఒక పత్రం ముద్రించిన వ్యయం. అవి వేర్వేరు పరిధులు, వేర్వేరు ధరల సంవత్సరాలకు చెందినవి, అందుకే వాటిని గీతతో కలపలేదు. <Term term="Revised cost">సవరించిన వ్యయం</Term> ముందున్న వ్యయం స్థానంలో వస్తుంది.</>
        : <>Each point is a cost as one paper printed it. They cover different scopes and price years, so they are not joined. A <Term term="Revised cost" /> replaces the one before it.</>}>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <ChartFrame q={{ en: 'What does Polavaram cost, paper by paper?', te: 'పోలవరం ఖర్చు ఎంత, పత్రం పత్రానికీ?' }} sub={tr('₹ crore, as printed', '₹ కోట్లు, ముద్రించినట్లు')}
          answer={tr(<>{crore(55548.87)} in the August 2026 report. The first cost on paper was {crore(first.value)}, in {dateLong(first.date)}.</>,
            <>2026 ఆగస్టు నివేదికలో {croreTe(55548.87)}. పత్రాల్లో మొదటి వ్యయం {croreTe(first.value)}, {dateTe(first.date)}లో.</>)}
          how={tr("Each point is a cost as one paper printed it, placed at that paper's date. They cover different scopes and price years, so they are not joined by a line.", 'ప్రతి బిందువు ఒక పత్రం ముద్రించిన వ్యయం, ఆ పత్రం తేదీ దగ్గర ఉంచాం. అవి వేర్వేరు పరిధులు, వేర్వేరు ధరల సంవత్సరాలకు చెందినవి, అందుకే గీతతో కలపలేదు.')}
          example={tr("A house estimated at ₹10 lakh in one year's prices, and later at ₹25 lakh with a bigger plan in later prices: both are 'the cost', of different things at different prices.", "ఒక ఇంటి అంచనా ఒక ఏడాది ధరల్లో ₹10 లక్షలు; తర్వాత పెద్ద ప్లాన్‌తో, తర్వాతి ధరల్లో ₹25 లక్షలు. రెండూ 'వ్యయమే', కానీ వేర్వేరు ధరల్లో వేర్వేరు పనులకు.")}
          limits={tr('how much has been spent. That is in the panel beside it.', 'ఎంత ఖర్చయిందో. అది పక్కనున్న ప్యానెల్‌లో ఉంది.')}
          sources={[paper('cag2025')!, paper('pib2025')!]}
          table={<NumTable head={[tr('Date', 'తేదీ'), tr('What happened', 'ఏం జరిగింది'), tr('Scope', 'పరిధి'), tr('Cost', 'వ్యయం')]} rows={pts.map((p: any) => [day(p.date), te ? p.label_te : p.label, te ? p.scope_te : p.scope, money(p.value)])} />}>
          <CostDots points={pts} />
        </ChartFrame>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-[17px] font-semibold">{tr('Money spent and paid back', 'ఖర్చు, తిరిగి చెల్లింపు')}</div>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{tr('The state spends first. The Centre pays back the irrigation part.', 'ముందు రాష్ట్రం ఖర్చు చేస్తుంది. సాగునీటి భాగాన్ని కేంద్రం తిరిగి చెల్లిస్తుంది.')}</p>
          <ul className="mt-4 space-y-4">
            {pol.money.map((m: any) => (
              <li key={m.label} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="font-heading text-[22px] font-semibold tnum">{money(m.value)}</div>
                <div className="text-[14px] leading-snug">{te ? m.label_te : m.label}</div>
                <div className="mt-1"><PaperChip label={P[m.src]?.short} url={P[m.src]?.url} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function Deadlines() {
  const { te, tr, day } = useWords()
  const items: Deadline[] = [
    ...pol.deadlines.map((d: any) => ({ said: d.said, target: d.target, prec: d.prec, paper: d.paper, kind: 'gov' as const })),
    ...pol.press.flatMap((n: any) => n.figures.filter((f: any) => f.kind === 'deadline').map((f: any) => ({ said: n.date.slice(0, 7), target: f.target, prec: f.prec, paper: `${n.paper}: ${te ? f.label_te : f.label}`, kind: 'press' as const }))),
  ]
  return (
    <Section eyebrow={tr('A date that keeps moving', 'మారుతూ వచ్చిన తేదీ')} title={te ? <Te>పత్రాలు ఇచ్చిన ప్రతి పూర్తి తేదీ</Te> : 'Every completion date a paper has given'} te={te ? undefined : 'మారుతూ వచ్చిన గడువు'}
      lede={tr('Each dot is one paper. Up the page is the date it gave; across is when it was printed. A dot below the dashed line gave a date that had already passed.', 'ప్రతి చుక్క ఒక పత్రం. నిలువుగా పత్రం ఇచ్చిన తేదీ; అడ్డంగా పత్రం ముద్రించిన తేదీ. గీతల గీత కింద ఉన్న చుక్క, అప్పటికే దాటిపోయిన తేదీని ఇచ్చింది.')}>
      <ChartFrame q={{ en: 'When was Polavaram to be finished, by each paper?', te: 'పోలవరం ఎప్పటికి పూర్తవుతుందని ఒక్కో పత్రం చెప్పింది?' }} sub={tr('Government papers solid; newspaper reports dashed and labelled', 'ప్రభుత్వ పత్రాలు నిండుగా; పత్రికల వార్తలు గీతలతో, పేరుతో')}
        answer={tr(<>Papers have given dates from December 2018 onwards. The newest, the August 2026 report, gives <b>June 2027</b>, a plan, not an event.</>,
          <>పత్రాలు 2018 డిసెంబర్ నుంచి తేదీలు ఇస్తూ వచ్చాయి. తాజా పత్రం, 2026 ఆగస్టు నివేదిక, <b>2027 జూన్</b> అని ఇచ్చింది; ఇది ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు.</>)}
        how={tr('Each dot is one paper. Up the page is the date it gave for completion; across is when the paper was printed. A dot below the dashed line gave a date that had already passed when it was printed.', 'ప్రతి చుక్క ఒక పత్రం. నిలువుగా పత్రం ఇచ్చిన పూర్తి తేదీ; అడ్డంగా పత్రం ముద్రించిన తేదీ. గీతల గీత కింద ఉన్న చుక్క, ముద్రించే నాటికే దాటిపోయిన తేదీని ఇచ్చింది.')}
        limits={tr('why a date moved. The papers give the new date, rarely the reason.', 'తేదీ ఎందుకు మారిందో. పత్రాలు కొత్త తేదీ ఇస్తాయి, కారణం అరుదుగా చెబుతాయి.')}
        sources={[paper('cag2025')!, paper('ses2425')!, paper('ls1723')!, paper('mospi2608')!]}
        table={<NumTable head={[tr('Paper', 'పత్రం'), tr('Printed', 'ముద్రించిన తేదీ'), tr('Date given', 'ఇచ్చిన తేదీ'), tr('Kind', 'రకం')]} rows={items.map((d) => [d.paper, day(d.said), d.prec === 'year' ? d.target : day(d.target), d.kind === 'press' ? tr('Newspaper says', 'పత్రిక చెప్పింది') : tr('Government record', 'ప్రభుత్వ రికార్డు')])} />}>
        <DeadlineChart items={items} />
      </ChartFrame>
    </Section>
  )
}

function Families() {
  const C = useTokens()
  const { te, tr, day } = useWords()
  const f = pol.families
  const l = pol.land
  return (
    <Section eyebrow={tr('Land and families', 'భూమి, కుటుంబాలు')} title={te ? <Te>{num(f.total, 0)} కుటుంబాలు తరలాల్సి ఉంది</Te> : `${num(f.total, 0)} families have to move`} te={te ? undefined : 'ముంపు కుటుంబాలు'}
      lede={tr("The CAG counts the families, the land and the colonies from the department's own records, up to March 2023.", 'కుటుంబాలు, భూమి, కాలనీలను CAG శాఖ సొంత రికార్డుల నుంచి 2023 మార్చి వరకు లెక్కించింది.')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame q={{ en: 'How many families have been resettled?', te: 'ఎన్ని కుటుంబాలకు పునరావాసం కల్పించారు?' }} sub={tr('By March 2023', '2023 మార్చి నాటికి')} sources={[paper('cag2025')!]}
          answer={tr(<><b>{num(f.resettled_by_2023_03, 0)}</b> of the {num(f.total, 0)} families to be moved, by March 2023, as the CAG counts them.</>,
            <>2023 మార్చి నాటికి, తరలించాల్సిన {num(f.total, 0)} కుటుంబాల్లో <b>{num(f.resettled_by_2023_03, 0)}</b>, CAG లెక్క ప్రకారం.</>)}
          how={tr("The long bar is all the families to be moved; the filled part is those resettled. Below, each year's count, on one scale.", 'పొడవైన పట్టీ తరలించాల్సిన మొత్తం కుటుంబాలు; నిండిన భాగం పునరావాసం పొందినవి. కింద, ఏడాది వారీ లెక్క, ఒకే కొలబద్దపై.')}
          limits={tr('how the families are living now, or what they were paid.', 'కుటుంబాలు ఇప్పుడు ఎలా ఉన్నారో, వారికి ఎంత చెల్లించారో.')}
          note={tr('The CAG says about 11%. It also found that 10,138 of the 11,677 families had moved to the new colonies.', 'CAG సుమారు 11% అని చెప్పింది. 11,677 కుటుంబాల్లో 10,138 కొత్త కాలనీలకు వెళ్లాయని కూడా గుర్తించింది.')}>
          <div className="space-y-3">
            <div className="flex h-10 w-full overflow-hidden rounded-md bg-muted">
              <div style={{ width: `${(f.resettled_by_2023_03 / f.total) * 100}%`, background: C.c1 }} />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-[14px]">
              <span><b className="tnum">{num(f.resettled_by_2023_03, 0)}</b> {tr('resettled', 'పునరావాసం పొందినవి')}</span>
              <span><b className="tnum">{num(f.total, 0)}</b> {tr('to be moved in all', 'మొత్తం తరలించాల్సినవి')}</span>
            </div>
          </div>
          <div className="mt-6 text-[14px] font-semibold">{tr('Each year', 'ఏడాది వారీగా')}</div>
          <FamiliesBars rows={f.by_year.map((r: any) => ({ year: te ? r.year_te : r.year, n: r.n }))} />
        </ChartFrame>
        <ChartFrame q={{ en: 'How much land has been acquired?', te: 'ఎంత భూమి సేకరించారు?' }} sub={tr('Acres, by March 2023', 'ఎకరాలు, 2023 మార్చి నాటికి')} sources={[paper('cag2025')!]}
          answer={tr(<><b>{num(l.acquired, 0)}</b> acres acquired, of the {num(l.needed, 0)} acres the project needs, by March 2023 (CAG).</>,
            <>2023 మార్చి నాటికి, ప్రాజెక్టుకు కావాల్సిన {num(l.needed, 0)} ఎకరాల్లో <b>{num(l.acquired, 0)}</b> ఎకరాలు సేకరించారు (CAG).</>)}
          how={tr('Three bars on one scale: the land the project needs, the land requested for acquisition, and the land acquired.', 'ఒకే కొలబద్దపై మూడు పట్టీలు: ప్రాజెక్టుకు కావాల్సిన భూమి, సేకరణకు కోరిన భూమి, సేకరించిన భూమి.')}
          limits={tr('whether the owners have been paid in full.', 'భూయజమానులకు పూర్తిగా చెల్లించారో లేదో.')}
          note={tr('The CAG prints 67.43% of the land requested as acquired. The state said in November 2024 that the first phase needs about 1,00,099 acres, of which 83,659 were acquired.', 'సేకరణకు కోరిన భూమిలో 67.43% సేకరించినట్లు CAG ముద్రించింది. మొదటి దశకు సుమారు 1,00,099 ఎకరాలు కావాలని, అందులో 83,659 సేకరించామని 2024 నవంబర్‌లో రాష్ట్రం చెప్పింది.')}>
          <HBars rows={[
            { key: 'n', label: tr('Land the project needs', 'ప్రాజెక్టుకు కావాల్సిన భూమి'), value: l.needed },
            { key: 'r', label: tr('Requested for acquisition', 'సేకరణకు కోరినది'), value: l.requested },
            { key: 'a', label: tr('Acquired', 'సేకరించినది'), value: l.acquired },
          ]} valueFmt={(v) => num(v, 0)} unit={tr('acres', 'ఎకరాలు')} />
          <div className="mt-6 text-[14px] font-semibold">{tr('Families in the first phase', 'మొదటి దశలో కుటుంబాలు')}</div>
          <ul className="mt-2 space-y-2 text-[14px]">
            {f.phase1.map((p: any) => <li key={p.date} className="flex justify-between gap-3 border-b border-border pb-2"><span>{te ? p.label_te : p.label}, {day(p.date)}</span><b className="tnum">{num(p.n, 0)}</b></li>)}
          </ul>
        </ChartFrame>
      </div>
    </Section>
  )
}

function Water() {
  const w = pol.water
  const { te, tr, place } = useWords()
  const [sel, setSel] = React.useState<string | null>(null)
  const C = useTokens()
  const named = Object.fromEntries(w.rows.map((r: any) => [r.district, mix(C.land, C.brand, C.dark ? 0.35 : 0.22)]))
  const rows = [...w.rows].sort((a: any, b: any) => b.tmc - a.tmc)
  return (
    <Section eyebrow={tr('Who gets the water', 'నీరు ఎవరికి')} title={te ? <Te>పూర్తయ్యాక తొమ్మిది జిల్లాలకు నీరు</Te> : 'Water for nine districts, once it is complete'} te={te ? undefined : 'ఏ జిల్లాలకు నీరు'}
      lede={te
        ? <>2024 ఆగస్టు 1 నాటి లోక్‌సభ సమాధానం ప్రతి జిల్లాకు ఎంత నీరు రావాలో <Term term="TMC" />లలో చెబుతుంది. అది పేర్కొన్న తొమ్మిది జిల్లాలు మ్యాప్‌లో రంగుతో ఉన్నాయి. చూడటానికి ఒకదాన్ని నొక్కండి.</>
        : <>A Lok Sabha answer of 1 August 2024 lists the water each district is to get, in <Term term="TMC" />. The nine districts it names are tinted on the map. Press one to see it.</>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <View3D build={() => import('@/three/scenes/apmap')} params={{ shapes: districts.map((d) => ({ name: d.name, shape: d.shape })), viewBox: mapViewBox, selected: sel, highlight: w.rows.map((r: any) => r.district), onPick: (n: string) => setSel(n), spin: false }}
            label={tr("Andhra Pradesh's districts; the nine that get Polavaram water are tinted", 'ఆంధ్రప్రదేశ్ జిల్లాలు; పోలవరం నీరు అందే తొమ్మిది జిల్లాలు రంగుతో')} className="h-[340px] sm:h-[420px]" interactive
            fallback={<div className="p-4"><Map3D selected={sel} highlight={named} onPick={(n) => setSel(n)} /></div>}>
            <Pin id="label"><span className="rounded-full bg-background/92 px-2 py-0.5 text-[12px] font-semibold shadow-sm ring-1 ring-border">{sel ? `${place(sel)} · ${num(w.rows.find((r: any) => r.district === sel)?.tmc ?? 0)} TMC` : ''}</span></Pin>
          </View3D>
          <div className="border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">{tr('Tinted: the nine districts the answer names. Tap one to see its water. District lines as of 2024, when the answer was given.', 'రంగుతో: సమాధానం పేర్కొన్న తొమ్మిది జిల్లాలు. ఒక జిల్లాను నొక్కితే దాని నీరు కనిపిస్తుంది. జిల్లా సరిహద్దులు 2024 నాటివి, సమాధానం ఇచ్చిన ఏడాది.')}</div>
        </div>
        <ChartFrame q={{ en: 'Which districts get the water, and how much?', te: 'ఏ జిల్లాలకు ఎంత నీరు?' }} sub={tr('TMC, on completion', 'TMC, పూర్తయ్యాక')} sources={[{ ...paper('ls1723')! }]}
          answer={tr(<>Nine districts. East Godavari is to get the most, {num(51.34)} TMC, in the Lok Sabha answer of 1 August 2024.</>,
            <>తొమ్మిది జిల్లాలు. 2024 ఆగస్టు 1 నాటి లోక్‌సభ సమాధానం ప్రకారం తూర్పు గోదావరికి అత్యధికంగా {num(51.34)} TMC.</>)}
          how={tr('Each bar is one district, sorted from most water to least, on one scale. TMC means a thousand million cubic feet, the unit river water is measured in. Tap a name to see it on the map.', 'ప్రతి పట్టీ ఒక జిల్లా, ఎక్కువ నీటి నుంచి తక్కువకు వరుసలో, ఒకే కొలబద్దపై. TMC అంటే వంద కోట్ల ఘనపుటడుగులు; నదీ జలాలను కొలిచే ప్రమాణం. మ్యాప్‌లో చూడటానికి పేరు నొక్కండి.')}
          limits={tr('when the water will flow. These are amounts planned for when the project is complete.', 'నీరు ఎప్పుడు పారుతుందో. ఇవి ప్రాజెక్టు పూర్తయ్యాక వచ్చేలా ప్రణాళిక చేసిన పరిమాణాలు.')}
          note={tr(<>The answer prints a total of {num(w.total_printed)} TMC for these nine districts.</>, <>ఈ తొమ్మిది జిల్లాలకు మొత్తం {num(w.total_printed)} TMC అని సమాధానమే ముద్రించింది.</>)}
          table={<NumTable head={[tr('District, as the answer spells it', 'జిల్లా, సమాధానంలో రాసినట్లు'), 'TMC']} rows={w.rows.map((r: any) => [r.paper, num(r.tmc)])} />}>
          <HBars rows={rows.map((r: any) => ({ key: r.district, label: <button type="button" className="text-left hover:underline" onClick={() => setSel(r.district)}>{te ? place(r.district) : r.paper}</button>, value: r.tmc }))} unit="TMC" highlight={sel && w.rows.some((r: any) => r.district === sel) ? sel : null} />
          {sel && districtByName.get(sel) ? <a href={href('district-' + districtByName.get(sel)!.slug)} className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium underline underline-offset-4">{tr(`Open ${sel} district`, `${place(sel)} జిల్లా పేజీ తెరవండి`)}<ArrowUpRight className="size-4" /></a> : null}
        </ChartFrame>
      </div>
    </Section>
  )
}

function Heard() {
  const { te, tr, day } = useWords()
  return (
    <Section eyebrow={tr('Figures you may hear', 'మీరు వినే అంకెలు')} title={te ? <Te>పత్రికలు ఏం రాశాయి</Te> : 'What newspapers have reported'} te={te ? undefined : 'పత్రికలు చెప్పినవి'}
      lede={tr(<>Newspaper reports, read on {dateLong(pol.press_read_on)}. Each is a claim, not a record: compare it with the government papers above. The summaries are ours, in plain words.</>,
        <>{dateTe(pol.press_read_on)}న చదివిన పత్రికల వార్తలు. ప్రతిదీ ఒక మాట మాత్రమే, రికార్డు కాదు: పై ప్రభుత్వ పత్రాలతో పోల్చి చూడండి. సారాంశాలు మావి, సులువైన మాటల్లో.</>)}>
      <div className="grid gap-4 md:grid-cols-2">
        {pol.press.map((n: any) => (
          <article key={n.id} className="flex flex-col rounded-xl border border-dashed border-foreground/30 bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind="press" />
              <span className="text-[13px] text-muted-foreground">{n.paper} · {day(n.date)}</span>
            </div>
            <p className="mt-3 text-[15.5px] leading-relaxed">{te ? n.summary_te : n.summary}</p>
            {n.figures.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {n.figures.map((f: any, i: number) => (
                  <span key={i} className="rounded-md border border-dashed border-foreground/30 px-2 py-1 text-[12.5px]">
                    {f.kind === 'progress' ? `${num(f.pct)}% · ${te ? f.label_te : f.label}` : `${te ? f.label_te : f.label}: ${f.prec === 'year' ? f.target : day(f.target)}`}
                  </span>
                ))}
              </div>
            ) : null}
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-[13.5px] font-medium text-foreground/80 hover:text-foreground"><Newspaper className="size-4" />{tr('Read the report', 'వార్త చదవండి')}<ArrowUpRight className="size-3.5" /></a>
          </article>
        ))}
      </div>
    </Section>
  )
}

function Questions() {
  const { lang } = useLang()
  const { te, tr } = useWords()
  return (
    <Section eyebrow={tr('Questions people ask', 'ప్రజలు అడిగే ప్రశ్నలు')} title={te ? <Te>చిన్న సమాధానాలు, ఒక్కోదానికి దాని పత్రం</Te> : 'Short answers, each with its paper'} te={te ? undefined : 'తరచూ అడిగే ప్రశ్నలు'}>
      <Accordion type="single" collapsible className="rounded-xl border border-border bg-card px-4 md:px-6">
        {pol.story.questions.map((q: any, i: number) => (
          <AccordionItem key={i} value={String(i)}>
            <AccordionTrigger className="text-left text-[17px] font-semibold hover:no-underline">{lang === 'te' && q.q.te ? <Te>{q.q.te}</Te> : q.q.en}</AccordionTrigger>
            <AccordionContent>
              <p className="max-w-[70ch] text-[16px] leading-[1.7]">{lang === 'te' && q.a.te ? <Te>{q.a.te}</Te> : q.a.en}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{(q.sources ?? []).map((s: string) => { const p = paper(s); return p ? <PaperChip key={s} {...p} /> : null })}</div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}
