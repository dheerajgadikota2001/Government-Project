import * as React from 'react'
import * as d3 from 'd3'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { invest } from '@/lib/data-invest'
import { crore, croreTe, dateLong, dateTe, lakhCrore, lakhCroreTe, num, tickMoney } from '@/lib/format'
import { useWidth } from '@/graphics/util'
import { href } from '@/lib/route'
import { ChartFrame, ExampleBox, KindBadge, NumTable, ReadLine, Section, ShortAnswer } from '@/components/kit'
import { summitName, summitReport, type Bi, type SummitReport } from '@/lib/docs'

// One summit, explained for a reader who has heard five different totals and wants to know which is true.
// Every figure is copied as printed by the report named beside it. Nothing here is added, subtracted,
// averaged or ranked: bars only stand side by side on one ruler, and the words say what the reports say.
// The data lives in src/data/summit_reports.json; scripts/test_summit_reports.mjs holds it to these rules.

type Row = { key: string; name: React.ReactNode; meta?: React.ReactNode; value: number | null; amount: string; kind: 'press' | 'government'; note?: React.ReactNode }

const BAR = { press: 'bg-foreground/[0.30] outline outline-1 outline-dashed outline-foreground/45', government: 'bg-foreground/80' }

/** Rows of bars on one shared ruler. The amount printed at the end of each bar is the report's own words. */
function Ruler({ groups, max, unit }: { groups: { id: string; label: React.ReactNode; note?: React.ReactNode; rows: Row[] }[]; max: number; unit: 'lakh' | 'crore' }) {
  const [ref, w] = useWidth<HTMLDivElement>(820)
  const { lang } = useLang()
  const te = lang === 'te'
  const wide = w >= 720
  const NAME = wide ? 250 : 0
  const LAB = wide ? 150 : 128
  const lane = Math.max(120, (wide ? w - NAME - 28 : w - 20) - LAB)
  const scale = d3.scaleLinear().domain([0, max]).nice(lane >= 420 ? 5 : 3)
  const top = scale.domain()[1]
  const ticks = scale.ticks(lane >= 420 ? 5 : 3)
  const at = (f: number) => `calc((100% - ${LAB}px) * ${f})`
  const tick = (v: number) => (unit === 'lakh' ? (te ? `₹${num(v / 1e5, 1)} లక్షల కోట్లు` : tickMoney(v)) : num(v, 0))
  return (
    <div ref={ref} className="min-w-0 space-y-3">
      {groups.map((g) => (
        <section key={g.id} className="rounded-xl bg-muted/60 p-2.5" aria-label={typeof g.label === 'string' ? g.label : undefined}>
          <h4 className="px-2 pb-1 text-[15px] font-semibold leading-snug">{g.label}</h4>
          <div aria-hidden className={cn('px-2 text-[11px] text-muted-foreground', wide && 'grid')} style={wide ? { gridTemplateColumns: `${NAME}px minmax(0,1fr)` } : undefined}>
            {wide ? <span /> : null}
            <span className="relative block h-[20px] tnum">
              {ticks.map((t) => <span key={t} className="absolute top-0 whitespace-nowrap" style={{ left: at(t / top), transform: t === 0 ? undefined : 'translateX(-50%)' }}>{t === 0 ? '0' : tick(t)}</span>)}
              <span className="absolute bottom-0 left-0 h-px bg-foreground/25" style={{ width: at(1) }} />
              {unit === 'crore' ? <span className="absolute right-0 top-0 font-medium">{te ? '₹ కోట్లు' : '₹ crore'}</span> : null}
            </span>
          </div>
          <ol>
            {g.rows.map((r) => (
              <li key={r.key} className={cn('rounded-md px-2 py-1.5', wide ? 'grid items-center gap-x-0' : 'space-y-1')} style={wide ? { gridTemplateColumns: `${NAME}px minmax(0,1fr)` } : undefined}>
                <div className="min-w-0 pr-3">
                  <div className="text-[14px] font-medium leading-snug">{r.name}</div>
                  {r.meta ? <div className="text-[12.5px] leading-snug text-muted-foreground">{r.meta}</div> : null}
                </div>
                <div className="min-w-0">
                  <span className="relative flex min-h-[20px] items-center gap-2">
                    {ticks.filter((t) => t > 0).map((t) => <span key={t} aria-hidden className="absolute -bottom-1.5 -top-1.5 border-l border-dashed border-foreground/15" style={{ left: at(t / top) }} />)}
                    {r.value != null ? (
                      <>
                        <span aria-hidden className={cn('relative block h-3.5 shrink-0 rounded-[3px]', BAR[r.kind])} style={{ width: `max(2px, ${at(r.value / top)})` }} />
                        <span className="relative shrink-0 whitespace-nowrap rounded-sm bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))] pr-1 text-[13px] font-semibold tnum" lang={te ? 'te' : undefined}>{r.amount}</span>
                      </>
                    ) : <span className="relative text-[13px] italic text-muted-foreground">{r.amount}</span>}
                  </span>
                  {r.note ? <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{r.note}</div> : null}
                </div>
              </li>
            ))}
          </ol>
          {g.note ? <p className="px-2 pt-1.5 text-[13.5px] leading-relaxed text-foreground/85">{g.note}</p> : null}
        </section>
      ))}
    </div>
  )
}

function Legend() {
  const { tr } = useLang()
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', BAR.government)} />{tr('Solid bar: a government paper', 'ముదురు బార్: ప్రభుత్వ పత్రం')}</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-3.5 w-7 rounded-[3px]', BAR.press)} />{tr('Dashed bar: a news report', 'గీతల బార్: వార్తా నివేదిక')}</span>
      <span>{tr('All bars on one ruler. Never added together.', 'అన్ని బార్లూ ఒకే కొలతపై. ఎప్పుడూ కలపం.')}</span>
    </div>
  )
}

export function SummitExplainer({ summitKey }: { summitKey: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const x = summitReport(summitKey)
  if (!x) return null
  const pick = (b: Bi) => (te ? b.te : b.en)
  const R = new Map(x.reports.map((r) => [r.id, r]))
  const by = (id: string) => {
    const r = R.get(id)!
    return <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" lang="en">{r.outlet}, {te ? dateTe(r.date) : dateLong(r.date)}</a>
  }
  const who = (id: string) => pick(R.get(id)!.speaker)
  const srcs = (ids: string[]) => [...new Set(ids)].map((id) => { const r = R.get(id)!; return { label: r.outlet, url: r.url, date: te ? dateTe(r.date) : dateLong(r.date), kind: r.kind } })

  /* 1. The figures going round, grouped by what each counts */
  const figGroups = x.groups.map((g) => ({
    id: g.id, label: pick(g.label), note: pick(g.note),
    rows: x.figures.filter((f) => f.group === g.id).map((f, i) => ({
      key: `${g.id}-${i}`, name: <span lang="en">{R.get(f.report)!.outlet}</span>, meta: <>{who(f.report)} · {by(f.report)}</>,
      value: f.crore, amount: pick(f.amount), kind: R.get(f.report)!.kind as 'press' | 'government', note: pick(f.words),
    })),
  })).filter((g) => g.rows.length)
  const figMax = Math.max(...x.figures.map((f) => f.crore))

  /* 2. The biggest promises named so far, by day, each as printed */
  const money = (v: number) => (v >= 1e5 ? (te ? lakhCroreTe(v) : lakhCrore(v)) : (te ? croreTe(v, 0) : crore(v, 0)))
  const coGroups = [1, 2].map((day) => ({
    id: `day${day}`,
    label: day === 1 ? tr('Day 1, 12 November', 'మొదటి రోజు, నవంబర్ 12') : tr('Day 2, 13 November', 'రెండో రోజు, నవంబర్ 13'),
    rows: x.companies.filter((c) => c.day === day).sort((a, b) => b.crore - a.crore).map((c) => ({
      key: c.name, name: <span lang="en">{c.name}</span>,
      meta: <>{pick(c.what)}{c.place ? <> · <span lang="en">{c.place}</span></> : null}{c.jobs ? <> · {tr(`${num(c.jobs, 0)} jobs`, `${num(c.jobs, 0)} ఉద్యోగాలు`)}</> : null} · {by(c.report)}</>,
      value: c.crore, amount: money(c.crore), kind: 'press' as const, note: c.also ? pick(c.also) : undefined,
    })),
  }))
  const coMax = Math.max(...x.companies.map((c) => c.crore))

  /* 3. Every summit and every year the state counted investment that started, on one ruler */
  const S = invest.summits as unknown as { key: string; name: string; start_date: string; mou_count: number; investment_crore: number; figure_type: string }[]
  const Y = invest.by_year as unknown as { year: string; investment_crore: number | null; basis: string | null }[]
  // A summit total is shown the way its paper printed it: "Rs. 4,67,577 crore" stays in crore, "Rs. 10.54 lakh crore" in lakh crore.
  // A round thousand is the sign of a lakh crore figure; writing it out in crore would invent digits nobody printed.
  const printed = (v: number) => (v % 1000 === 0 ? (te ? lakhCroreTe(v) : lakhCrore(v)) : (te ? croreTe(v, 0) : crore(v, 0)))
  const histGroups = [
    { id: 'promised', label: tr('Announced at each summit, as the state stated it', 'ప్రతి సదస్సులో ప్రకటించినవి, రాష్ట్రం చెప్పినట్లు'),
      rows: [...S].sort((a, b) => a.start_date.localeCompare(b.start_date)).map((s) => ({
        key: s.key, name: <a href={href(`summit-${s.key}`)} className="hover:underline">{pick(summitName(s as Parameters<typeof summitName>[0]))}</a>,
        meta: <>{te ? dateTe(s.start_date) : dateLong(s.start_date)} · {tr(`${num(s.mou_count, 0)} MoUs`, `${num(s.mou_count, 0)} ఎంఓయూలు`)}{s.figure_type === 'press_report' ? <> · {tr('a news report until the state publishes', 'రాష్ట్రం ప్రచురించే వరకు వార్తా నివేదిక')}</> : null}</>,
        value: s.investment_crore, amount: printed(s.investment_crore),
        kind: (s.figure_type === 'press_report' ? 'press' : 'government') as 'press' | 'government',
      })) },
    { id: 'started', label: tr('Investment the state says started on the ground, year by year', 'నేలపై మొదలైందని రాష్ట్రం చెప్పిన పెట్టుబడి, ఏడాది వారీగా'),
      rows: Y.map((y) => ({
        key: y.year, name: <span className="tnum">{y.year}</span>,
        meta: y.basis ? <span lang="en" className="line-clamp-2">{y.basis}</span> : undefined,
        value: y.investment_crore ?? null,
        amount: y.investment_crore != null ? (te ? croreTe(y.investment_crore, 0) : crore(y.investment_crore, 0)) : tr('Not published by the state', 'రాష్ట్రం ప్రచురించలేదు'),
        kind: 'government' as const,
      })) },
  ]
  const histMax = Math.max(...S.map((s) => s.investment_crore ?? 0))

  /* 4. The pipeline since June 2024, as reported */
  const pipeMax = Math.max(...x.pipeline.flatMap((p) => p.readings.map((r) => r.crore)))

  const allReports = [...x.reports].sort((a, b) => a.date.localeCompare(b.date) || a.outlet.localeCompare(b.outlet))
  const figureTable = (
    <NumTable head={[tr('Report', 'నివేదిక'), tr('What it counts', 'ఏది లెక్కిస్తుంది'), tr('As printed', 'ముద్రించినట్లు')]}
      rows={x.figures.map((f) => [<span lang="en">{R.get(f.report)!.outlet}</span>, pick(x.groups.find((g) => g.id === f.group)!.label), pick(f.words)])} />
  )

  return (
    <div className="mt-8 space-y-16">
      <div className="max-w-3xl space-y-3">
        <ShortAnswer>{pick(x.headline)}</ShortAnswer>
        <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground"><KindBadge kind="press" /><span>{pick(x.official_check)}</span></div>
        <ExampleBox madeUp={false}>{tr('An MoU is like agreeing to buy a house. The money moves only when the sale happens. So a summit total is a list of promises, not money spent.', 'ఎంఓయూ ఇల్లు కొనడానికి ఒప్పుకోవడం లాంటిది. అమ్మకం జరిగినప్పుడే డబ్బు చేతులు మారుతుంది. అందుకే సదస్సు మొత్తం హామీల జాబితా, ఖర్చు చేసిన డబ్బు కాదు.')}</ExampleBox>
      </div>

      <Section eyebrow={tr('Why the numbers differ', 'అంకెలు ఎందుకు వేరు')} title={tr('Why you may have heard different totals', 'మీరు వేర్వేరు మొత్తాలు ఎందుకు విని ఉండవచ్చు')}
        lede={tr('The reports are not all counting the same thing. Some count the two summit days, some add the regional meetings held in October, and some count one day only.', 'నివేదికలన్నీ ఒకే దాన్ని లెక్కించడం లేదు. కొన్ని సదస్సు రెండు రోజులను, కొన్ని అక్టోబర్‌లో జరిగిన ప్రాంతీయ సమావేశాలను కలిపి, కొన్ని ఒక్క రోజునే లెక్కిస్తాయి.')}>
        <ChartFrame q={{ en: 'Which total counts what?', te: 'ఏ మొత్తం దేన్ని లెక్కిస్తుంది?' }}
          how={tr('Each row is one report’s figure, as printed, grouped by what it counts. The bar shows its size on a ruler shared by every row. The words under each bar are the report’s own.', 'ప్రతి వరుస ఒక నివేదిక అంకె, ముద్రించినట్లే; అది దేన్ని లెక్కిస్తుందో దాని ప్రకారం గుంపులుగా. బార్ దాని పరిమాణాన్ని అన్ని వరుసలకూ ఒకటే అయిన కొలతపై చూపుతుంది. ప్రతి బార్ కింది మాటలు ఆ నివేదికవే.')}
          limits={tr('which figure the state will publish. Until it does, none of these is the state’s own figure.', 'రాష్ట్రం ఏ అంకెను ప్రచురిస్తుందో. అది ప్రచురించే వరకు ఇవేవీ రాష్ట్ర సొంత అంకె కాదు.')}
          sources={srcs(x.figures.map((f) => f.report))} table={figureTable}>
          <Legend />
          <Ruler groups={figGroups} max={figMax} unit="lakh" />
        </ChartFrame>
      </Section>

      <Section eyebrow={tr('Who promised what', 'ఎవరు ఏం హామీ ఇచ్చారు')} title={tr('The biggest promises named so far', 'ఇప్పటివరకు పేర్కొన్న పెద్ద హామీలు')}
        lede={tr('Only some MoUs have been named in the news, with an amount. These are the ones reported on each day, as printed. A company named here has signed a promise; it has not spent the money.', 'కొన్ని ఎంఓయూలు మాత్రమే మొత్తంతో సహా వార్తల్లో పేర్కొన్నారు. ప్రతి రోజు నివేదించినవి ఇవి, ముద్రించినట్లే. ఇక్కడ పేర్కొన్న కంపెనీ హామీపై సంతకం చేసింది; డబ్బు ఖర్చు చేయలేదు.')}>
        <ChartFrame q={{ en: 'Which companies, and how much did each promise?', te: 'ఏ కంపెనీలు, ఒక్కొక్కటి ఎంత హామీ ఇచ్చింది?' }}
          how={tr('One row per company, biggest first, on one ruler. The amount, place, jobs and report are as printed. One company’s promise is far bigger than the rest, so most bars are short; every amount is printed.', 'ఒక్కో కంపెనీకి ఒక వరుస, పెద్దది ముందు, ఒకే కొలతపై. మొత్తం, ప్రదేశం, ఉద్యోగాలు, నివేదిక ముద్రించినట్లే. ఒక కంపెనీ హామీ మిగతావాటి కంటే చాలా పెద్దది, అందుకే చాలా బార్లు పొట్టిగా ఉంటాయి; ప్రతి మొత్తాన్నీ ముద్రించాం.')}
          limits={tr('the full list. The reports name only some of the MoUs, and nothing here is added up.', 'పూర్తి జాబితా. నివేదికలు కొన్ని ఎంఓయూలనే పేర్కొన్నాయి; ఇక్కడ ఏదీ కలపలేదు.')}
          sources={srcs(x.companies.map((c) => c.report))}>
          <Legend />
          <Ruler groups={coGroups} max={coMax} unit="crore" />
        </ChartFrame>
      </Section>

      <Section eyebrow={tr('From promise to factory', 'హామీ నుంచి పరిశ్రమ వరకు')} title={tr('Where the promises since June 2024 stand, as reported', '2024 జూన్ నుంచి హామీలు ఎక్కడున్నాయి, నివేదికల ప్రకారం')}
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
                        <span aria-hidden className={cn('block h-3 rounded-[3px]', BAR[rep.kind as 'press' | 'government'])} style={{ width: `max(2px, ${(r.crore / pipeMax) * 100}%)` }} />
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

      <Section eyebrow={tr('What happened before', 'ఇంతకు ముందు ఏమైంది')} title={tr('Every summit, and the investment the state says started, on one ruler', 'ప్రతి సదస్సు, మొదలైందని రాష్ట్రం చెప్పిన పెట్టుబడి, ఒకే కొలతపై')}
        lede={tr('Each summit announced lakhs of crores. In the same years, the state’s own papers counted investment that started on the ground in thousands of crores a year. Seeing both on one ruler shows the difference in scale without adding anything up.', 'ప్రతి సదస్సు లక్షల కోట్లు ప్రకటించింది. అదే ఏళ్లలో, నేలపై మొదలైన పెట్టుబడిని రాష్ట్ర సొంత పత్రాలు ఏడాదికి వేల కోట్లలో లెక్కించాయి. రెండింటినీ ఒకే కొలతపై చూస్తే, ఏదీ కలపకుండానే పరిమాణంలో తేడా కనిపిస్తుంది.')}>
        <ChartFrame q={{ en: 'How do summit promises compare with what started?', te: 'సదస్సు హామీలు, మొదలైన పెట్టుబడి ఎలా ఉన్నాయి?' }}
          how={tr('The top group is each summit’s announced total; the bottom group is the state’s yearly count of investment that started. Both share one ruler, so a bottom bar can be a thin sliver; its value is printed beside it.', 'పై గుంపు ప్రతి సదస్సు ప్రకటించిన మొత్తం; కింది గుంపు మొదలైన పెట్టుబడిపై రాష్ట్ర ఏడాది లెక్క. రెండూ ఒకే కొలతపై ఉన్నాయి; అందుకే కింది బార్ సన్నని గీతలా ఉండవచ్చు; దాని విలువ పక్కనే ముద్రించాం.')}
          limits={tr('a like-for-like score. A yearly figure counts investment from any source, not only summit promises; the state counted it differently in different years; and a promise can take years to start. Both are shown because they are the only figures the state publishes.', 'సమానమైన పోలిక. ఏడాది అంకె సదస్సు హామీలే కాకుండా ఏ మూలం నుంచి వచ్చిన పెట్టుబడినైనా లెక్కిస్తుంది; రాష్ట్రం వేర్వేరు ఏళ్లలో దాన్ని వేర్వేరుగా లెక్కించింది; ఒక హామీ మొదలవ్వడానికి ఏళ్లు పట్టవచ్చు. రాష్ట్రం ప్రచురించే అంకెలు ఇవే కాబట్టి రెండూ చూపాం.')}
          sources={[{ label: tr('State budget speeches and Socio Economic Surveys, as each row on the investments page names', 'రాష్ట్ర బడ్జెట్ ప్రసంగాలు, సామాజిక ఆర్థిక సర్వేలు; పెట్టుబడుల పేజీలో ప్రతి వరుస తన ఆధారాన్ని చూపుతుంది'), url: href('investments') }]}>
          <Legend />
          <Ruler groups={histGroups} max={histMax} unit="lakh" />
        </ChartFrame>
      </Section>

      <Section eyebrow={tr('What comes next', 'తర్వాత ఏమిటి')} title={tr('What we are waiting for', 'మేము దేని కోసం ఎదురుచూస్తున్నాం')}>
        <ul className="grid max-w-4xl gap-3 md:grid-cols-3">
          {x.watch.map((w, i) => <li key={i} className="rounded-xl border border-dashed border-foreground/30 bg-card p-4 text-[14.5px] leading-relaxed">{pick(w)}</li>)}
        </ul>
        <p className="mt-3 max-w-3xl text-[13.5px] text-muted-foreground">{tr(`When any of these is published, this page changes to it. Last checked ${dateLong(x.checked)}.`, `వీటిలో ఏది ప్రచురించినా ఈ పేజీ దానికి మారుతుంది. చివరిగా సరిచూసింది ${dateTe(x.checked)}.`)}</p>
      </Section>

      <Section eyebrow={tr('Sources', 'ఆధారాలు')} title={tr('Every report used on this page', 'ఈ పేజీలో వాడిన ప్రతి నివేదిక')}>
        <ul className="grid max-w-5xl gap-2.5 md:grid-cols-2">
          {allReports.map((r) => (
            <li key={r.id} className={cn('rounded-xl border bg-card p-4', r.kind === 'press' ? 'border-dashed border-foreground/30' : 'border-border')}>
              <div className="flex flex-wrap items-center gap-2"><KindBadge kind={r.kind} /><span className="text-[13px] text-muted-foreground">{te ? dateTe(r.date) : dateLong(r.date)}</span></div>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[15.5px] font-semibold underline-offset-4 hover:underline" lang="en">{r.outlet}<ArrowUpRight className="size-4 opacity-60" /></a>
              <div className="text-[13px] text-muted-foreground"><span lang="en">{r.byline}</span> · {pick(r.speaker)}</div>
              <blockquote className="mt-2 border-l-2 border-foreground/25 pl-3 text-[13.5px] leading-relaxed text-foreground/85" lang="en">“{r.quote}”</blockquote>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

export type { SummitReport }
