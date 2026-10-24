import * as React from 'react'
import { cn } from '@/lib/utils'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { money } from '@/lib/data-money'
import { crore, croreTe, dateLong, fy, lakhCrore, lakhCroreTe, num, STAGE_WORDS } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { InShort } from '@/components/card-bits'
import { AnswerBox, ChartFrame, ListenButton, NumTable, PaperChip, Section, StageTag, Te, Term } from '@/components/kit'
import { DebtBooks, StateBars, type Book } from '@/graphics/MoneyCharts'
import { CountBars } from '@/graphics/Counts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// Plain names for the papers, so no abbreviations leak onto the page
const SRC: Record<string, { label: string; url: string }> = {
  'RBI-SF-2526': { label: 'RBI, State Finances 2025-26', url: 'https://www.rbi.org.in/Scripts/PublicationsView.aspx?id=23728' },
  'CAG-FY23': { label: 'CAG audit, year to March 2023', url: money.sources['CAG-FY23']?.url },
  'CAG-FY22': { label: 'CAG audit, year to March 2022', url: money.sources['CAG-FY22']?.url },
  'CAG-FY21': { label: 'CAG audit, year to March 2021', url: money.sources['CAG-FY21']?.url },
  'CAG-FY20': { label: 'CAG audit, year to March 2020', url: money.sources['CAG-FY20']?.url },
  'AP-FRBM': { label: 'State budget books (FRBM statements)', url: 'https://apfinance.gov.in/frbmreport.html' },
  'RBI-SF-2526-C': { label: 'RBI, State Finances 2025-26, Statement 18', url: money.sources['RBI-SF-2526-C']?.url },
}
const src = (k?: string) => (k && SRC[k]) || (k && money.sources[k] ? { label: (money.sources[k].title ?? k).split(' — ')[0], url: money.sources[k].url } : { label: k ?? '', url: '' })

const UNIT_TE: Record<string, string> = { '₹ per person per year': '₹, ఒక్కరికి ఏడాదికి', '₹ crore': '₹ కోట్లు', '% of GSDP': 'జీఎస్‌డీపీలో %' }
const series = (ind: string, fam: string) => money.series.find((s: any) => s.indicator === ind && s.family === fam)
const BOOKS: Book[] = [
  { key: 'CAG', name: 'CAG audit', short: 'CAG audit', nameTe: 'కాగ్ ఆడిట్', shortTe: 'కాగ్ ఆడిట్', points: series('outstanding_liabilities', 'CAG').points },
  { key: 'RBI', name: 'Reserve Bank of India', short: 'Reserve Bank', nameTe: 'రిజర్వ్ బ్యాంక్ ఆఫ్ ఇండియా', shortTe: 'రిజర్వ్ బ్యాంక్', points: series('outstanding_liabilities', 'RBI').points },
  { key: 'AP', name: 'State budget books', short: 'State budget', nameTe: 'రాష్ట్ర బడ్జెట్ పుస్తకాలు', shortTe: 'రాష్ట్ర బడ్జెట్', points: series('outstanding_liabilities', 'AP_BUDGET').points },
]
const isEst = (s?: string | null) => s === 'RE' || s === 'BE' || s === 'PE'
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function MoneyPage() {
  const { lang, tr } = useLang()
  const C = (v: number, d = 2) => (lang === 'te' ? croreTe(v, d) : crore(v, d))
  const LC = (v: number) => (lang === 'te' ? lakhCroreTe(v) : lakhCrore(v))
  const cag = BOOKS[0].points[BOOKS[0].points.length - 1]
  const rbi = BOOKS[1].points[BOOKS[1].points.length - 1]
  const [year, setYear] = React.useState(2023)
  const offb = series('off_budget_borrowings', 'CAG')
  const guar = series('guarantees', 'RBI')
  const offLast = offb.points[offb.points.length - 1]
  const guarLastA = [...guar.points].reverse().find((p: any) => !isEst(p.stage))
  const at = (b: Book, y: number) => b.points.find((p) => p.fy_end === y)
  const qs: [string, string, string][] = [
    ['Whose number is right?', 'ఎవరి సంఖ్య సరైనది?', 'm-books'], ['What is the debt actually made of?', 'అప్పు నిజంగా దేనితో కూడి ఉంది?', 'm-parts'],
    ['What does not show up in the debt figure?', 'అప్పు సంఖ్యలో ఏం కనిపించదు?', 'm-offbudget'], ['Is the debt big for a state this size?', 'ఈ పరిమాణం గల రాష్ట్రానికి ఈ అప్పు పెద్దదా?', 'money-states'],
    ['Where does the money go before anything gets built?', 'ఏదైనా కట్టక ముందే డబ్బు ఎక్కడికి పోతుంది?', 'm-interest'], ['Does the state earn enough to run itself?', 'రాష్ట్రం తనను నడుపుకోగలిగినంత సంపాదిస్తుందా?', 'm-interest'],
    ['Did the money the Assembly voted actually get spent?', 'శాసనసభ ఆమోదించిన డబ్బు ఖర్చయిందా?', 'm-voted'], ['Which departments was the money voted for?', 'ఏ శాఖలకు డబ్బు ఆమోదించారు?', 'money-departments'],
    ['What have the governments said about each other?', 'ప్రభుత్వాలు ఒకదాని గురించి ఒకటి ఏం చెప్పాయి?', 'claims'],
  ]
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Money', 'డబ్బు')} q={{ en: 'How much does Andhra Pradesh owe?', te: 'ఆంధ్రప్రదేశ్ అప్పు ఎంత?' }} />
      <InShort className="mt-8" items={[
        { value: LC(cag.value), label: tr(`owed at the end of March ${cag.fy_end}, by the CAG audit`, `${cag.fy_end} మార్చి చివరికి అప్పు, కాగ్ ఆడిట్ ప్రకారం`), paper: 'CAG audit, 2022-23' },
        { value: LC(rbi.value), label: tr(`for the end of March ${rbi.fy_end}, a budget estimate`, `${rbi.fy_end} మార్చి చివరికి, బడ్జెట్ అంచనా`), paper: 'RBI, State Finances 2025-26' },
        { value: LC(offLast.value), label: tr(`borrowed through state companies, March ${offLast.fy_end}`, `రాష్ట్ర సంస్థల ద్వారా అప్పు, ${offLast.fy_end} మార్చి`), paper: 'CAG audit, 2022-23' },
        { value: LC(guarLastA.value), label: tr(`promised to repay for others, March ${guarLastA.fy_end}`, `ఇతరుల కోసం ఇచ్చిన హామీలు, ${guarLastA.fy_end} మార్చి`), paper: 'AP fiscal statement' },
      ]} />
      <AnswerBox className="mt-8 max-w-4xl">
        {lang === 'te' ? (<>
          <p><Term term="CAG">కాగ్</Term> ఆడిట్ ప్రకారం {cag.fy_end} మార్చి చివరికి అప్పు <b>{croreTe(cag.value, 0)}</b>.</p>
          <p>కొత్త సంఖ్య {rbi.fy_end} మార్చి చివరికి <b>{croreTe(rbi.value)}</b>; ఇది ఆర్బీఐ ముద్రించిన బడ్జెట్ అంచనా.</p>
          <p>వేర్వేరు కార్యాలయాలు అప్పును వేర్వేరుగా లెక్కిస్తాయి; అందుకే ఒకే ఏడాదికి వాటి సంఖ్యలు వేరు. మూడూ కింద ఉన్నాయి.</p>
        </>) : (<>
          <p>The <Term term="CAG" /> audit for the year to March {cag.fy_end} gives <b>{crore(cag.value, 0)}</b>.</p>
          <p>The newest figure is <b>{crore(rbi.value)}</b> for the end of March {rbi.fy_end}, a <Term term="Budget estimate">budget estimate</Term> printed by the Reserve Bank of India.</p>
          <p>Different offices count debt differently, so their figures for the same year differ. All three are below.</p>
        </>)}
        <div className="flex flex-wrap gap-2 pt-1"><PaperChip {...src('CAG-FY23')} /><PaperChip {...src('RBI-SF-2526')} /></div>
      </AnswerBox>
      <p className="mt-3 max-w-4xl rounded-xl border border-dashed border-foreground/30 px-4 py-2.5 text-[13.5px] text-muted-foreground">{tr('Preview note: the CAG’s report for 2024-25 (Report No. 1 of 2026) is out. This answer moves to it once its figures are read and shown to you, old beside new.', 'ప్రివ్యూ గమనిక: 2024-25కు కాగ్ నివేదిక (2026 నివేదిక సంఖ్య 1) వచ్చింది. దాని అంకెలు చదివి, పాతవి కొత్తవి పక్కపక్కనే మీకు చూపాక ఈ సమాధానం దానికి మారుతుంది.')}</p>

      <Guess className="mt-10" />

      <section className="mt-12" aria-labelledby="pickq">
        <h2 id="pickq" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('Pick a question', 'ఒక ప్రశ్న ఎంచుకోండి')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {qs.map(([en, te, to]) => to.startsWith('m-')
            ? <button key={en} type="button" onClick={() => go(to)} className="rounded-full border border-border bg-card px-3.5 py-2 text-left text-[14px] hover:border-foreground/30" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? te : en}</button>
            : <a key={en} href={href(to)} className="rounded-full border border-border bg-card px-3.5 py-2 text-[14px] hover:border-foreground/30" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? te : en} ›</a>)}
        </div>
      </section>

      <Section id="m-books" className="mt-16" eyebrow={tr('The three books', 'మూడు లెక్కలు')} title={tr('Debt, as three offices print it', 'మూడు కార్యాలయాలు ముద్రించిన అప్పు')}>
        <ChartFrame q={{ en: 'How much does the state owe, by each office’s count?', te: 'ప్రతి కార్యాలయం లెక్క ప్రకారం రాష్ట్రం అప్పు ఎంత?' }}
          sub={tr('₹ crore, end of each financial year, as printed. Press a year to see the three figures side by side.', '₹ కోట్లు, ప్రతి ఆర్థిక సంవత్సరం చివరికి, ముద్రించినట్లే. ఏడాదిని నొక్కితే మూడు సంఖ్యలు పక్కపక్కనే.')}
          answer={tr(<>For the end of March 2023 the three offices print {crore(at(BOOKS[1], 2023)!.value)} (RBI), {crore(at(BOOKS[2], 2023)!.value)} (the state’s own statement) and {crore(at(BOOKS[0], 2023)!.value, 0)} (CAG).</>,
            <>2023 మార్చి చివరికి మూడు కార్యాలయాలు ముద్రించినవి: {croreTe(at(BOOKS[1], 2023)!.value)} (ఆర్బీఐ), {croreTe(at(BOOKS[2], 2023)!.value)} (రాష్ట్ర సొంత ప్రకటన), {croreTe(at(BOOKS[0], 2023)!.value, 0)} (కాగ్).</>)}
          how={tr('Each line is one office’s book; each point is the end of March of that year. Solid points are accounts; hollow points are estimates (revised or budget). Government changes are marked by date only.', 'ప్రతి గీత ఒక కార్యాలయం లెక్క; ప్రతి బిందువు ఆ ఏడాది మార్చి చివర. నిండు బిందువులు లెక్కలు; ఖాళీవి అంచనాలు (సవరించిన లేదా బడ్జెట్). ప్రభుత్వ మార్పులను తేదీతో మాత్రమే గుర్తించాం.')}
          example={tr('Ask three people how much a family owes. One counts only bank loans, one adds money borrowed from relatives, one counts on a different day. Each can be right about what they counted. That is why the books differ.', 'ఒక కుటుంబం అప్పు ఎంతని ముగ్గురిని అడగండి. ఒకరు బ్యాంకు రుణాలే లెక్కిస్తారు, ఇంకొకరు బంధువుల దగ్గర తీసుకున్నదీ కలుపుతారు, మరొకరు వేరే రోజున లెక్కిస్తారు. ఎవరు లెక్కించినదానికి వారు సరైనవారే కావచ్చు. అందుకే లెక్కలు వేరవుతాయి.')} exampleMadeUp={false}
          note={tr('The state’s March 2023 figure includes an un-apportioned amount of ₹4,422.59 crore, as its statement says.', 'రాష్ట్రం 2023 మార్చి సంఖ్యలో ₹4,422.59 కోట్ల పంపకం కాని మొత్తం కూడా ఉందని దాని ప్రకటనే చెబుతోంది.')}
          limits={tr('loans taken through state companies, or guarantees. Those are further down.', 'రాష్ట్ర సంస్థల ద్వారా తీసుకున్న అప్పులు, హామీలు. అవి కింద ఉన్నాయి.')}
          sources={[src('CAG-FY23'), src('RBI-SF-2526'), src('AP-FRBM')]}
          table={<NumTable head={[tr('Year', 'సంవత్సరం'), ...BOOKS.map((b) => tr(b.short, b.shortTe ?? b.short))]} rows={[...new Set(BOOKS.flatMap((b) => b.points.map((p) => p.fy_end)))].sort().map((e) => [fy(e), ...BOOKS.map((b) => { const p = b.points.find((q) => q.fy_end === e); return p ? `${C(p.value)}${STAGE_WORDS[p.stage]?.est ? ` (${tr(STAGE_WORDS[p.stage].en.toLowerCase(), STAGE_WORDS[p.stage].te)})` : ''}` : tr('Not printed', 'ముద్రించలేదు') })])} />}>
          <DebtBooks books={BOOKS} year={year} onYear={setYear} />
        </ChartFrame>
        <div className="@container mt-4"><div className="grid gap-3 @3xl:grid-cols-3">
          {BOOKS.map((b) => {
            const p = b.points.find((q) => q.fy_end === year)
            return (
              <Card key={b.key} className="gap-0 py-0"><CardContent className="p-5">
                <div className="text-[13px] font-medium text-muted-foreground">{tr(`${b.name}, end of March ${year}`, `${b.nameTe ?? b.name}, ${year} మార్చి చివరికి`)}</div>
                {p ? <><div className="mt-1 font-heading text-[28px] font-semibold tnum">{C(p.value)}</div><div className="mt-1 flex items-center gap-2"><StageTag stage={p.stage} /></div><div className="mt-3"><PaperChip {...src(p.source)} /></div></>
                  : <div className="mt-2 text-[14px] text-muted-foreground">{tr('This office has not printed a figure for this year.', 'ఈ ఏడాదికి ఈ కార్యాలయం సంఖ్య ముద్రించలేదు.')}</div>}
              </CardContent></Card>
            )
          })}
        </div></div>
      </Section>

      <Section id="m-parts" className="mt-20" eyebrow={tr('What the debt is made of', 'అప్పు దేనితో కూడి ఉంది')} title={tr('The parts, as each paper prints them', 'భాగాలు, ప్రతి పత్రం ముద్రించినట్లే')}>
        <Parts />
      </Section>

      <Section id="m-offbudget" className="mt-20" eyebrow={tr('Outside the budget', 'బడ్జెట్ బయట')} title={tr('Loans through state companies, and guarantees', 'రాష్ట్ర సంస్థల ద్వారా అప్పులు, హామీలు')}>
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame q={{ en: 'How much was borrowed through state companies, outside the budget?', te: 'బడ్జెట్ బయట, రాష్ట్ర సంస్థల ద్వారా ఎంత అప్పు తీసుకున్నారు?' }}
            answer={tr(<><b>{crore(offLast.value, 0)}</b> at the end of March {offLast.fy_end}, by the CAG’s audit.</>, <>{offLast.fy_end} మార్చి చివరికి <b>{croreTe(offLast.value, 0)}</b>, కాగ్ ఆడిట్ ప్రకారం.</>)}
            how={tr('Each bar is the end of March of a year, on one scale. ₹ crore.', 'ప్రతి బార్ ఒక ఏడాది మార్చి చివర, ఒకే కొలతపై. ₹ కోట్లు.')}
            example={tr('A family asks a relative to take a loan in the relative’s name and promises to repay it. It is not in the family’s own loan book, but the family still pays.', 'ఒక కుటుంబం బంధువును తమ పేరుపై అప్పు తీసుకోమని అడిగి, తామే తీరుస్తామని మాట ఇస్తుంది. అది కుటుంబం సొంత అప్పు పుస్తకంలో ఉండదు, కానీ కట్టేది కుటుంబమే.')} exampleMadeUp={false}
            note={tr(<>The CAG, 2022-23: “including these, overall liability was 41.89% of GSDP.”</>, <>కాగ్, 2022-23: వీటిని కలిపితే మొత్తం బాధ్యతలు జీఎస్‌డీపీలో 41.89%.</>)}
            limits={tr('anything after March 2023, until the CAG’s 2024-25 report is read.', '2023 మార్చి తర్వాతిది ఏదీ; కాగ్ 2024-25 నివేదిక చదివే వరకు.')}
            sources={[src('CAG-FY23'), src('CAG-FY20')]}>
            <CountBars labelWidth="7.5rem" valueWidth="7.5rem" color="var(--ink2)" rows={offb.points.map((p: any) => ({ key: String(p.fy_end), label: tr(`March ${p.fy_end}`, `${p.fy_end} మార్చి`), n: p.value, text: C(p.value) }))} />
          </ChartFrame>
          <ChartFrame q={{ en: 'How much has the state promised to repay for others?', te: 'ఇతరుల అప్పులకు రాష్ట్రం ఎంత హామీ ఇచ్చింది?' }}
            answer={tr(<><b>{crore(guarLastA.value)}</b> in guarantees at the end of March {guarLastA.fy_end}, in the state’s own statement.</>, <>{guarLastA.fy_end} మార్చి చివరికి హామీలు <b>{croreTe(guarLastA.value)}</b>, రాష్ట్ర సొంత ప్రకటన ప్రకారం.</>)}
            how={tr('Each bar is the end of March of a year, on one scale. Solid: actual. Hollow: an estimate.', 'ప్రతి బార్ ఒక ఏడాది మార్చి చివర, ఒకే కొలతపై. నిండు: వాస్తవం. ఖాళీ: అంచనా.')}
            example={tr('Signing as guarantor for a neighbour’s bank loan. You pay only if the neighbour cannot, but the bank can come to you.', 'పొరుగువారి బ్యాంకు రుణానికి హామీదారుగా సంతకం చేయడం. వారు కట్టలేకపోతేనే మీరు కట్టాలి, కానీ బ్యాంకు మీ దగ్గరికి రావచ్చు.')} exampleMadeUp={false}
            limits={tr('how much the state has actually had to pay on these promises.', 'ఈ హామీల కోసం రాష్ట్రం నిజంగా ఎంత కట్టాల్సి వచ్చిందో.')}
            sources={[src('RBI-SF-2526'), src('AP-FRBM')]}>
            <CountBars labelWidth="7.5rem" valueWidth="9rem" color="var(--ink2)" rows={guar.points.slice(-4).map((p: any) => ({ key: String(p.fy_end), label: <span className="inline-flex flex-wrap items-center gap-1.5">{tr(`March ${p.fy_end}`, `${p.fy_end} మార్చి`)}{isEst(p.stage) ? <StageTag stage={p.stage} /> : null}</span>, n: p.value, hollow: isEst(p.stage), text: C(p.value) }))} />
            <p className="mt-2 text-[12.5px] text-muted-foreground">{tr('2023 and 2024 from RBI; 2025 and 2026 from the state’s fiscal statement, because RBI’s table has no 2025 figure.', '2023, 2024 ఆర్బీఐ నుంచి; 2025, 2026 రాష్ట్ర ఆర్థిక ప్రకటన నుంచి, ఎందుకంటే ఆర్బీఐ పట్టికలో 2025 సంఖ్య లేదు.')}</p>
          </ChartFrame>
        </div>
      </Section>

      <Section id="m-interest" className="mt-20" eyebrow={tr('Income and interest', 'ఆదాయం, వడ్డీ')} title={tr('What comes in, and what interest takes', 'వచ్చేది, వడ్డీకి పోయేది')}>
        <EarnInterest />
      </Section>

      <Section id="m-voted" className="mt-20" eyebrow={tr('Voted and spent', 'ఆమోదం, ఖర్చు')} title={tr('Did the money the Assembly voted get spent?', 'శాసనసభ ఆమోదించిన డబ్బు ఖర్చయిందా?')}>
        <VotedSpent />
      </Section>

      <div className="mt-20 grid gap-4 md:grid-cols-3">
        {[['money-departments', tr('What each department planned and spent', 'ప్రతి శాఖ ప్రణాళిక, ఖర్చు'), tr(`${money.departments.length} departments, year by year`, `${money.departments.length} శాఖలు, ఏడాది వారీగా`)],
          ['money-states', tr('Where Andhra Pradesh stands among the states', 'రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ'), tr('As the Reserve Bank of India prints it, with no rank numbers', 'ఆర్బీఐ ముద్రించినట్లే, ర్యాంకు సంఖ్యలు లేకుండా')],
          ['state-facts', tr('State facts', 'రాష్ట్ర గణాంకాలు'), tr('83 indicators with their papers', 'పత్రాలతో 83 సూచికలు')]].map(([t, a, b]) => (
          <a key={t} href={href(t)} className="group rounded-xl border border-border bg-card p-5 hover:border-foreground/30">
            <div className="text-[17px] font-semibold group-hover:underline">{a}</div>
            <div className="mt-1 text-[14px] text-muted-foreground">{b}</div>
            <ArrowRight className="mt-4 size-5" />
          </a>
        ))}
      </div>
      <MoneyPapers />
    </Page>
  )
}

/* ----------------------------------------------------- guess the figure */
function Guess({ className }: { className?: string }) {
  const { lang, tr } = useLang()
  const truth = BOOKS[1].points.find((p) => p.fy_end === 2024)!
  const [g, setG] = React.useState(300000)
  const [shown, setShown] = React.useState(false)
  const max = 1000000
  return (
    <section className={cn('max-w-3xl rounded-2xl border border-border bg-card p-5', className)} aria-labelledby="guess">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('Guess, then see the paper', 'ఊహించండి, తర్వాత పత్రం చూడండి')}</div>
      <h2 id="guess" className="mt-1 text-[19px] font-semibold leading-snug">{tr('How much did the state government owe on 31 March 2024?', '2024 మార్చి 31 నాటికి రాష్ట్ర ప్రభుత్వ అప్పు ఎంత?')}</h2>
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3"><span className="text-[13px] text-muted-foreground">{tr('Your guess', 'మీ ఊహ')}</span><span className="font-heading text-[22px] font-semibold tnum">{lang === 'te' ? lakhCroreTe(g, 1) : lakhCrore(g, 1)}</span></div>
        <input type="range" min={0} max={max} step={10000} value={g} onChange={(e) => { setG(Number(e.target.value)); setShown(false) }} className="mt-2 w-full accent-[var(--chart-1)]" aria-label={tr('Your guess, in rupees crore', 'మీ ఊహ, ₹ కోట్లలో')} />
        <div className="relative mt-1 h-6 text-[12px] text-muted-foreground">
          <span className="absolute left-0">₹0</span><span className="absolute right-0">{tr('₹10 lakh crore', '₹10 లక్షల కోట్లు')}</span>
          {shown ? <span className="absolute top-0 -translate-x-1/2 font-semibold text-foreground" style={{ left: `${(truth.value / max) * 100}%` }}>▲</span> : null}
        </div>
      </div>
      {shown ? (
        <div className="mt-3 rounded-xl bg-secondary p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr('The paper', 'పత్రం')}</div>
          <div className="mt-1 font-heading text-[26px] font-semibold tnum">{lang === 'te' ? croreTe(truth.value, 0) : crore(truth.value, 0)}</div>
          <p className="text-[14px] text-muted-foreground">{tr('Outstanding liabilities at the end of March 2024, accounts. RBI, State Finances: A Study of Budgets of 2025-26.', '2024 మార్చి చివరికి మిగిలిన అప్పు, లెక్కలు. ఆర్బీఐ, స్టేట్ ఫైనాన్సెస్ 2025-26.')}</p>
          <div className="mt-2"><PaperChip {...src('RBI-SF-2526')} /></div>
        </div>
      ) : (
        <button type="button" onClick={() => setShown(true)} className="mt-3 inline-flex h-10 items-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">{tr('Show the paper', 'పత్రం చూపండి')}</button>
      )}
      <p className="mt-3 text-[12.5px] text-muted-foreground">{tr('No score. Guesses are not saved or added up.', 'మార్కులు లేవు. ఊహలను దాచం, కలపం.')}</p>
    </section>
  )
}

/* ---------------------------------------------------------------- parts */
function Parts() {
  const { lang, tr } = useLang()
  const C = (v: number, d = 2) => (lang === 'te' ? croreTe(v, d) : crore(v, d))
  const cy = money.cag_parts.years[money.cag_parts.years.length - 1]
  const rp = money.rbi_parts
  const [all, setAll] = React.useState(false)
  const parts = [
    { k: 'internal_debt', en: 'Internal debt', te: 'అంతర్గత అప్పు', color: 'var(--chart-1)' },
    { k: 'goi_loans', en: 'Loans from the Centre', te: 'కేంద్రం నుంచి రుణాలు', color: 'var(--chart-3)' },
    { k: 'public_account', en: 'Public Account (provident funds, deposits, reserves)', te: 'పబ్లిక్ అకౌంట్ (భవిష్యనిధి, డిపాజిట్లు, నిల్వలు)', color: 'var(--chart-5)' },
  ]
  const items = (rp.items as { name: string; value: number }[])
  return (
    <ChartFrame q={{ en: 'What is the debt made of?', te: 'అప్పు దేనితో కూడి ఉంది?' }}
      answer={tr(<>The largest part is market loans, bonds that investors buy: <b>{crore(items[0].value)}</b> of the {crore(rp.total)} RBI prints for the end of March {rp.as_of_fy_end}.</>,
        <>అతి పెద్ద భాగం మార్కెట్ రుణాలు, పెట్టుబడిదారులు కొనే బాండ్లు: {rp.as_of_fy_end} మార్చి చివరికి ఆర్బీఐ ముద్రించిన {croreTe(rp.total)}లో <b>{croreTe(items[0].value)}</b>.</>)}
      how={tr(`On the left, the CAG’s total for March ${cy.fy_end} is one bar split into its three parts, each as wide as its figure. On the right, RBI’s parts for March ${rp.as_of_fy_end}, on one scale.`, `ఎడమవైపు, ${cy.fy_end} మార్చికి కాగ్ మొత్తం ఒకే బార్; దాని మూడు భాగాలు, ఒక్కొక్కటి దాని సంఖ్య అంత వెడల్పు. కుడివైపు, ${rp.as_of_fy_end} మార్చికి ఆర్బీఐ భాగాలు, ఒకే కొలతపై.`)}
      example={tr('A family’s debts can be a loan from the bank, a loan from a relative, and money it is keeping for others, such as savings it holds for its children. All three must be paid back.', 'ఒక కుటుంబం అప్పుల్లో బ్యాంకు రుణం, బంధువు దగ్గర తీసుకున్న రుణం, ఇతరుల కోసం దాచిన డబ్బు (పిల్లల పొదుపు లాంటిది) ఉండవచ్చు. మూడూ తిరిగి ఇవ్వాల్సిందే.')} exampleMadeUp={false}
      limits={tr('whether the debt is too high. For that, see what interest takes from the state’s income, further down.', 'అప్పు మరీ ఎక్కువా అని. దాని కోసం, రాష్ట్ర ఆదాయంలో వడ్డీకి ఎంత పోతుందో కింద చూడండి.')}
      sources={[src('CAG-FY23'), src('RBI-SF-2526-C')]}
      table={<NumTable head={[tr('Part', 'భాగం'), tr('₹ crore', '₹ కోట్లు')]} rows={[...parts.map((p) => [p.en + ` (CAG, March ${cy.fy_end})`, crore(cy[p.k])]), ...items.map((i) => [i.name + ` (RBI, March ${rp.as_of_fy_end})`, crore(i.value)])]} />}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{tr(`CAG audit, end of March ${cy.fy_end}`, `కాగ్ ఆడిట్, ${cy.fy_end} మార్చి చివర`)}</div>
          <div className="mt-3 flex h-9 w-full overflow-hidden rounded-md">
            {parts.map((p) => <span key={p.k} style={{ width: `${(cy[p.k] / cy.total) * 100}%`, background: p.color }} title={p.en} />)}
          </div>
          <ul className="mt-3 space-y-1.5">
            {parts.map((p) => <li key={p.k} className="flex items-baseline justify-between gap-3 text-[14px]"><span className="inline-flex items-center gap-2"><span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} /><span lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? p.te : p.en}</span></span><b className="tnum">{C(cy[p.k], 0)}</b></li>)}
          </ul>
          <div className="mt-2 text-[12.5px] text-muted-foreground">{tr(`Printed total ${crore(cy.total, 0)} · CAG, State Finances Audit 2022-23`, `ముద్రించిన మొత్తం ${croreTe(cy.total, 0)} · కాగ్, 2022-23`)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{tr(`RBI, end of March ${rp.as_of_fy_end} (accounts)`, `ఆర్బీఐ, ${rp.as_of_fy_end} మార్చి చివర (లెక్కలు)`)}</div>
          <CountBars className="mt-3" labelWidth="12rem" valueWidth="8.5rem" rows={(all ? items : items.slice(0, 4)).map((i) => ({ key: i.name, label: <span lang="en">{i.name}</span>, n: i.value, text: C(i.value) }))} />
          <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-foreground/80 hover:text-foreground">{all ? tr('Show the four largest', 'పెద్ద నాలుగు మాత్రమే') : tr(`Show all ${items.length} parts`, `మొత్తం ${items.length} భాగాలు`)}<ChevronDown className={cn('size-4 transition-transform', all && 'rotate-180')} /></button>
          <div className="mt-1 text-[12.5px] text-muted-foreground">{tr(`Printed total ${crore(rp.total)} · RBI, State Finances 2025-26, Statement 18`, `ముద్రించిన మొత్తం ${croreTe(rp.total)} · ఆర్బీఐ, స్టేట్ ఫైనాన్సెస్ 2025-26, స్టేట్‌మెంట్ 18`)}</div>
        </div>
      </div>
    </ChartFrame>
  )
}

/* ------------------------------------------------------ income, interest */
function EarnInterest() {
  const { lang, tr } = useLang()
  const C = (v: number) => (lang === 'te' ? croreTe(v) : crore(v))
  const rows = money.income_interest as { fy_end: number; fy_label: string; stage: string; source: string; revenue_receipts: number; interest_payments: number }[]
  const [all, setAll] = React.useState(false)
  const shown = all ? rows : rows.slice(-5)
  const max = Math.max(...rows.map((r) => r.revenue_receipts))
  const lastA = [...rows].reverse().find((r) => !isEst(r.stage))!
  return (
    <ChartFrame q={{ en: 'What does the state earn, and how much goes on interest?', te: 'రాష్ట్ర ఆదాయం ఎంత, వడ్డీకి ఎంత పోతోంది?' }}
      answer={tr(<>In {lastA.fy_label} the state’s income (revenue receipts) was <b>{crore(lastA.revenue_receipts)}</b>, and it paid <b>{crore(lastA.interest_payments)}</b> in interest.</>,
        <>{lastA.fy_label}లో రాష్ట్ర ఆదాయం (రెవెన్యూ రాబడి) <b>{croreTe(lastA.revenue_receipts)}</b>; వడ్డీగా <b>{croreTe(lastA.interest_payments)}</b> కట్టింది.</>)}
      how={tr('For each year, two bars on one scale. Blue: what the state earned. Brown: the interest it paid. We print both amounts and no share. Hollow bars are a revised estimate.', 'ప్రతి ఏడాదికి రెండు బార్లు, ఒకే కొలతపై. నీలం: రాష్ట్ర ఆదాయం. గోధుమ: కట్టిన వడ్డీ. రెండు మొత్తాలే ముద్రిస్తాం, శాతం కాదు. ఖాళీ బార్లు సవరించిన అంచనా.')}
      example={tr('A family’s salary first covers the interest on old loans. Only what is left goes to food, school and repairs.', 'ఒక కుటుంబం జీతంలో ముందుగా పాత అప్పుల వడ్డీ పోతుంది. మిగిలినదే తిండి, బడి, మరమ్మతులకు.')} exampleMadeUp={false}
      limits={tr('repayment of the loans themselves; interest is only the cost of borrowing.', 'అప్పుల అసలు చెల్లింపు; వడ్డీ అప్పు తీసుకున్నందుకు ఖర్చు మాత్రమే.')}
      sources={[{ label: 'AP fiscal statements (FRBM), Form F-1', url: 'https://apfinance.gov.in/frbmreport.html' }]}
      table={<NumTable head={[tr('Year', 'సంవత్సరం'), tr('Income (revenue receipts)', 'ఆదాయం'), tr('Interest paid', 'వడ్డీ'), tr('Stage', 'దశ')]} rows={rows.map((r) => [r.fy_label, crore(r.revenue_receipts), crore(r.interest_payments), STAGE_WORDS[r.stage]?.en ?? r.stage])} />}>
      <ul className="space-y-3">
        {shown.map((r) => {
          const est = isEst(r.stage)
          return (
            <li key={r.fy_end} className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold tnum sm:block">{r.fy_label}{est ? <StageTag stage={r.stage} className="sm:mt-1" /> : null}</div>
              <div className="min-w-0 space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className="h-3.5 rounded-[4px] bg-muted/70"><span className={cn('block h-full rounded-[4px]', est && 'border-[1.6px] border-dashed border-[var(--chart-1)]')} style={{ width: `${(r.revenue_receipts / max) * 100}%`, background: est ? 'transparent' : 'var(--chart-1)' }} /></span>
                  <span className="text-[13px] tnum"><span className="text-muted-foreground">{tr('Income ', 'ఆదాయం ')}</span><b>{C(r.revenue_receipts)}</b></span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className="h-3.5 rounded-[4px] bg-muted/70"><span className={cn('block h-full rounded-[4px]', est && 'border-[1.6px] border-dashed border-[var(--chart-3)]')} style={{ width: `${(r.interest_payments / max) * 100}%`, background: est ? 'transparent' : 'var(--chart-3)' }} /></span>
                  <span className="text-[13px] tnum"><span className="text-muted-foreground">{tr('Interest ', 'వడ్డీ ')}</span><b>{C(r.interest_payments)}</b></span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {rows.length > 5 ? <button type="button" onClick={() => setAll((x) => !x)} className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium">{all ? tr('Show the newest five years', 'తాజా ఐదు ఏళ్లు మాత్రమే') : tr(`Show all ${rows.length} years, from ${rows[0].fy_label}`, `${rows[0].fy_label} నుంచి మొత్తం ${rows.length} ఏళ్లు`)}<ChevronDown className={cn('size-4 transition-transform', all && 'rotate-180')} /></button> : null}
    </ChartFrame>
  )
}

/* ------------------------------------------------------ voted and spent */
function VotedSpent() {
  const { lang, tr } = useLang()
  const C = (v: number) => (lang === 'te' ? croreTe(v) : crore(v))
  const years = money.voted_spent as { fy_end: number; fy_label: string; doc: string; blocks: { label: string; promised: number; spent: number; section: string; voted_or_charged: string }[] }[]
  const [yi, setYi] = React.useState(years.length - 1)
  const y = years[yi]
  const order = ['Revenue, voted by the Assembly', 'Capital, voted by the Assembly', 'Revenue, charged on the Consolidated Fund', 'Loans and advances, voted']
  const blocks = [...y.blocks].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  const max = Math.max(...blocks.flatMap((b) => [b.promised, b.spent]))
  const rv = blocks.find((b) => b.label === order[0])!
  const TE: Record<string, string> = { [order[0]]: 'రెవెన్యూ, శాసనసభ ఆమోదించింది', [order[1]]: 'మూలధనం, శాసనసభ ఆమోదించింది', [order[2]]: 'రెవెన్యూ, సంచిత నిధిపై భారం', [order[3]]: 'రుణాలు, అడ్వాన్సులు, ఆమోదించినవి' }
  return (
    <ChartFrame q={{ en: 'Did the money the Assembly voted get spent?', te: 'శాసనసభ ఆమోదించిన డబ్బు ఖర్చయిందా?' }}
      answer={tr(<>In {y.fy_label}, <b>{crore(rv.promised)}</b> was voted for running costs (revenue), and <b>{crore(rv.spent)}</b> was spent.</>, <>{y.fy_label}లో రోజువారీ ఖర్చులకు (రెవెన్యూ) <b>{croreTe(rv.promised)}</b> ఆమోదించారు; <b>{croreTe(rv.spent)}</b> ఖర్చయింది.</>)}
      how={tr('The outline is the amount voted; the solid bar inside is the amount spent. All four rows share one scale. Where the solid bar runs past its outline, more was spent than voted. Pick a year above the chart.', 'బయటి గీత ఆమోదించిన మొత్తం; లోపలి నిండు బార్ ఖర్చయిన మొత్తం. నాలుగు వరుసలూ ఒకే కొలతపై. నిండు బార్ గీత దాటితే, ఆమోదించిన దానికంటే ఎక్కువ ఖర్చయింది. పైన ఏడాది ఎంచుకోండి.')}
      example={tr('A family meeting approves a budget for the year. What was approved is the outline; what was actually spent fills it.', 'కుటుంబ సమావేశం ఏడాది బడ్జెట్‌ను ఆమోదిస్తుంది. ఆమోదించినది బయటి గీత; నిజంగా ఖర్చయినది దాన్ని నింపుతుంది.')} exampleMadeUp={false}
      limits={tr('why money went unspent; the accounts give totals, not reasons.', 'డబ్బు ఎందుకు ఖర్చు కాలేదో; లెక్కలు మొత్తాలే ఇస్తాయి, కారణాలు కాదు.')}
      sources={[{ label: `Appropriation Accounts ${y.fy_label}`, url: money.sources[y.doc]?.url }]}
      table={<NumTable head={[tr('Block', 'విభాగం'), tr('Voted', 'ఆమోదం'), tr('Spent', 'ఖర్చు')]} rows={blocks.map((b) => [b.label, crore(b.promised), crore(b.spent)])} />}>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Year', 'సంవత్సరం')}>
        {years.map((x, i) => <button key={x.fy_end} type="button" role="tab" aria-selected={i === yi} onClick={() => setYi(i)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium tnum', i === yi ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/40')}>{x.fy_label}</button>)}
      </div>
      <ul className="space-y-4">
        {blocks.map((b) => (
          <li key={b.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]"><span className="font-medium" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? TE[b.label] ?? b.label : b.label}</span><span className="text-[13px] tnum"><span className="text-muted-foreground">{tr('Spent ', 'ఖర్చు ')}</span><b>{C(b.spent)}</b><span className="text-muted-foreground">{tr(' · voted ', ' · ఆమోదం ')}{C(b.promised)}</span></span></div>
            <div className="relative mt-1.5 h-[18px]">
              <span className="absolute left-0 top-0 h-[18px] rounded-[4px] border-[1.5px] border-ink2" style={{ width: `${(b.promised / max) * 100}%` }} />
              <span className="absolute left-0 top-[4px] h-[10px] rounded-[2px] bg-[var(--chart-1)]" style={{ width: `${(b.spent / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}

function MoneyPapers() {
  const { tr } = useLang()
  const list = Object.entries(money.sources as Record<string, any>).filter(([, s]) => s.url)
  return (
    <Collapsible className="mt-10 rounded-2xl border border-border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="text-[16px] font-semibold">{tr(`Every paper on this page (${list.length})`, `ఈ పేజీలోని ప్రతి పత్రం (${list.length})`)}</span>
        <ChevronDown className="size-5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-2 border-t border-border px-5 py-4 md:grid-cols-2">
          {list.map(([k, s]) => <li key={k}><PaperChip label={String(s.title ?? s.short ?? k).split(' — ')[0]} url={s.url} date={s.date ? dateLong(s.date) : undefined} /></li>)}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ============================================================ departments */
const CUR_FY_END = 2027 // the year running on the day the data was read (2026-27)

// One row per figure, compact (see web/scripts/prep_departments.py for the keys).
type DeptRow = {
  y: string; s: 'BE' | 'RE' | 'A'; t: number | null; n?: number; src: string; pp?: number
  parts?: [string, number, number?][]; np1?: 1; late?: 1; p2?: 1
  cag?: 'm' | 'c' | 'd' | 'u' | 'x'; cagp?: [string, number][]; cagsrc?: string; cagpp?: number
  alt?: { t: number; src: string; pp?: number }
}
const DEPT_BOOKS = (money.dept_books ?? {}) as Record<string, string>

// Telugu for the labels the papers print, in the books' own words
const PART_TE: Record<string, string> = {
  'Non-Plan': 'ప్రణాళికేతర భాగం', Plan: 'ప్రణాళిక భాగం',
  'Revenue, voted': 'రెవెన్యూ, ఓటు చేసినది', 'Revenue, charged': 'రెవెన్యూ, చార్జి చేసినది',
  'Capital, voted': 'పెట్టుబడి, ఓటు చేసినది', 'Capital, charged': 'పెట్టుబడి, చార్జి చేసినది',
  'Loans, voted': 'రుణాలు, ఓటు చేసినది', 'Loans, charged': 'రుణాలు, చార్జి చేసినది',
}

/** Where a figure is printed, in plain words: the paper, and the page of its PDF. */
function paperName(src: string, pp: number | undefined, te: boolean) {
  const [kind, year, part] = src.split('/')
  const page = pp ? (te ? `, పేజీ ${pp}` : `, page ${pp}`) : ''
  if (kind === 'v12') return (te ? `బడ్జెట్ ${year}, సంపుటం I/2` : `Budget ${year}, Volume I/2`) + page
  if (kind === 'v3') return (te ? `బడ్జెట్ ${year}, సంపుటం III/${part}` : `Budget ${year}, Volume III/${part}`) + page
  if (kind === 'cag') return (te ? `కాగ్ అప్రోప్రియేషన్ అకౌంట్స్ ${year}` : `CAG Appropriation Accounts ${year}`) + page
  return te ? 'ప్రభుత్వ పత్రం' : 'Government paper'
}

export function Departments() {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const C = (v: number) => (te ? croreTe(v) : crore(v))
  const partName = (p: string) => (te ? PART_TE[p] ?? p : p)
  const partsText = (ps: [string, number, number?][]) => ps.map((p) => `${partName(p[0])} ${C(p[1])}`).join('; ')
  const [no, setNo] = React.useState('XII')
  const dep = money.departments.find((d: any) => d.no === no) ?? money.departments[0]
  const all = dep.rows as DeptRow[]
  const years = [...new Set(all.map((r) => r.y))].sort()
  const rows = years.map((y) => {
    const g = (s: DeptRow['s']) => all.find((r) => r.y === y && r.s === s)
    const BE = g('BE'), RE = g('RE'), A = g('A')
    return { year: y, end: Number(y.slice(0, 4)) + 1, BE, RE, A }
  })
  // The scale for drawing only: a bar of printed parts is drawn part after part, so its
  // length is their sum. No sum is ever printed as a figure.
  const len = (r?: DeptRow) => (r == null ? 0 : r.t != null ? r.t : (r.parts ?? []).reduce((a, p) => a + p[1], 0))
  const max = Math.max(1, ...rows.flatMap((r) => [len(r.BE), len(r.RE), len(r.A)]))
  const lastA = [...rows].reverse().find((r) => r.A?.t != null && r.BE?.t != null)
  const spentYears = rows.filter((r) => r.A)
  const cagM = rows.filter((r) => r.A?.cag === 'm').length
  const cagC = rows.filter((r) => r.A?.cag === 'c').length
  const cagD = rows.filter((r) => r.A?.cag === 'd').length
  const note = (r: typeof rows[number]) => r.end >= CUR_FY_END ? tr('The year is still running.', 'ఏడాది ఇంకా నడుస్తోంది.') : tr('Spending not out yet.', 'ఖర్చు లెక్కలు ఇంకా రాలేదు.')
  const words = [
    { en: 'Budget estimate', te: 'బడ్జెట్ అంచనా', p: { en: 'The plan the government makes before the year begins: how much it means to spend.', te: 'ఏడాది మొదలవక ముందు ప్రభుత్వం వేసే ప్రణాళిక: ఎంత ఖర్చు చేయాలనుకుంటోంది.' } },
    { en: 'Revised estimate', te: 'సవరించిన అంచనా', p: { en: 'The same plan, changed during the year, when the government sees how the year is going.', te: 'అదే ప్రణాళిక, ఏడాది ఎలా సాగుతోందో చూసి మధ్యలో మార్చినది.' } },
    { en: 'Accounts', te: 'లెక్కలు', p: { en: 'What was actually spent, from the accounts. They reach the budget book two years later.', te: 'నిజంగా ఖర్చయినది, లెక్కల నుంచి. రెండేళ్ల తర్వాత బడ్జెట్ పుస్తకంలో వస్తాయి.' } },
    { en: 'Demand for grants', te: 'గ్రాంట్ల డిమాండ్', p: { en: 'Each department’s money comes to the Assembly as one numbered demand. School Education is Demand XII.', te: 'ప్రతి శాఖ డబ్బు ఒక సంఖ్యగల డిమాండ్‌గా శాసనసభకు వస్తుంది. పాఠశాల విద్య డిమాండ్ XII.' } },
  ]
  const paperCell = (r?: DeptRow) => (r ? <a className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" href={DEPT_BOOKS[r.src]} target="_blank" rel="noopener noreferrer" lang="en">{paperName(r.src, r.pp, te)}</a> : '')
  const figure = (r: DeptRow | undefined, missing: string) => (r == null ? missing : r.t != null ? C(r.t) : tr(`In parts: ${partsText(r.parts ?? [])}`, `భాగాలుగా: ${partsText(r.parts ?? [])}`))
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Money · Departments', 'డబ్బు · శాఖలు')} q={{ en: 'What was planned, and what was spent?', te: 'ఏం ప్రణాళిక వేశారు, ఎంత ఖర్చు చేశారు?' }}>
        <div className="mt-5 max-w-md">
          <label htmlFor="dept-pick" className="block text-[15px] font-semibold">{tr('Choose a department', 'శాఖను ఎంచుకోండి')}</label>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{tr(`The budget has ${money.departments.length} demands, most of them one department each. Each shows its plan, its changed plan and its spending for every year since 2014-15, each figure with the page it is printed on.`, `బడ్జెట్‌లో ${money.departments.length} డిమాండ్లు ఉన్నాయి; చాలావరకు ఒక్కొక్కటి ఒక శాఖ. ప్రతిదానికీ 2014-15 నుంచి ప్రతి ఏడాది ప్రణాళిక, మార్చిన ప్రణాళిక, ఖర్చు కనిపిస్తాయి; ప్రతి సంఖ్య పక్కన అది ముద్రించిన పేజీ ఉంటుంది.`)}</p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <Select value={no} onValueChange={setNo}>
            <SelectTrigger id="dept-pick" className="h-11 w-full max-w-md border-foreground/40 text-[15px]" aria-label={tr('Choose a department', 'శాఖను ఎంచుకోండి')}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">{money.departments.map((d: any) => <SelectItem key={d.no} value={d.no}>{d.no}. {d.name}</SelectItem>)}</SelectContent>
          </Select>
          <ListenButton />
        </div>
      </PageHead>
      <ChartFrame className="mt-8"
        q={{ en: `How much did the state plan to spend on ${dep.name}, and how much did it spend?`, te: `${dep.name}కు ఎంత ఖర్చు చేయాలనుకున్నారు, ఎంత ఖర్చు చేశారు?` }}
        answer={lastA ? tr(<>In {lastA.year}, the newest year with accounts, the plan was <b>{crore(lastA.BE!.t)}</b>.{lastA.RE?.t != null ? <> It was {lastA.RE.t < lastA.BE!.t! ? 'lowered' : 'raised'} during the year to {crore(lastA.RE.t)}</> : null}{lastA.RE?.t != null ? ', and' : ''} <b>{crore(lastA.A!.t)}</b> was spent.</>,
          <>లెక్కలు ఉన్న తాజా ఏడాది {lastA.year}లో ప్రణాళిక <b>{croreTe(lastA.BE!.t)}</b>.{lastA.RE?.t != null ? <> ఏడాది మధ్యలో దాన్ని {croreTe(lastA.RE.t)}కు {lastA.RE.t < lastA.BE!.t! ? 'తగ్గించారు' : 'పెంచారు'};</> : null} <b>{croreTe(lastA.A!.t)}</b> ఖర్చయింది.</>)
          : null}
        how={tr('Each row is one year. The outlined box is the plan made before the year began. The blue bar inside it is what was actually spent. The brown tick is the plan as changed during the year. When the blue bar is shorter than its box, less was spent than first planned. A bar in two shades is a figure the paper prints in parts, drawn part after part.',
          'ప్రతి వరుస ఒక ఏడాది. బయటి పెట్టె ఏడాది మొదలవక ముందు వేసిన ప్రణాళిక. లోపలి నీలి బార్ నిజంగా ఖర్చయినది. గోధుమ గీత ఏడాది మధ్యలో మార్చిన ప్రణాళిక. నీలి బార్ పెట్టె కంటే చిన్నదైతే, మొదట అనుకున్న దానికంటే తక్కువ ఖర్చయింది. రెండు రంగుల బార్ అంటే పత్రం భాగాలుగా ముద్రించిన సంఖ్య, ఒక భాగం తర్వాత మరొకటి గీసినది.')}
        example={tr('A family plans ₹10,000 for school costs in June, lowers the plan to ₹8,000 in December, and by March has spent ₹9,000. On this chart the box would be the ₹10,000, the brown tick the ₹8,000 and the blue bar the ₹9,000.',
          'ఒక కుటుంబం జూన్‌లో పిల్లల చదువుకు ₹10,000 అనుకుంది, డిసెంబర్‌లో దాన్ని ₹8,000కి తగ్గించింది, మార్చి నాటికి ₹9,000 ఖర్చు చేసింది. ఈ చార్టులో పెట్టె ₹10,000, గోధుమ గీత ₹8,000, నీలి బార్ ₹9,000.')}
        note={tr(<>Every figure is the demand’s gross total, as the book prints it; the net figure after recoveries is in the table. Up to 2016-17 the books printed each demand in two parts, Non-Plan and Plan, with no single total, so those years show the two parts. Spending in 2014-15 is from CAG’s audited accounts, which print it section by section.</>,
          <>ప్రతి సంఖ్య పుస్తకం ముద్రించిన డిమాండ్ మొత్తం (వసూళ్లు తీసివేయక ముందు); వసూళ్లు తీసివేసిన నికర సంఖ్య పట్టికలో ఉంది. 2016-17 వరకు పుస్తకాలు ప్రతి డిమాండ్‌ను ప్రణాళికేతర, ప్రణాళిక అని రెండు భాగాలుగా ముద్రించాయి, ఒకే మొత్తం ఇవ్వలేదు; ఆ ఏళ్లలో రెండు భాగాలు కనిపిస్తాయి. 2014-15 ఖర్చు కాగ్ ఆడిట్ లెక్కల నుంచి; అవి విభాగాల వారీగా ముద్రిస్తాయి.</>)}
        limits={tr('whether the money reached the people on time, or what it bought. The books give one total for the whole demand, not place by place.', 'డబ్బు సమయానికి ప్రజలకు చేరిందో, దానితో ఏం కొన్నారో. పుస్తకాలు మొత్తం డిమాండ్‌కు ఒకే సంఖ్య ఇస్తాయి, ఊరు ఊరుకు కాదు.')}
        sources={[
          { label: tr(`AP budget books, Demand ${dep.no}: Volume I/2 for the plan, Volume III for the changed plan and the accounts`, `AP బడ్జెట్ పుస్తకాలు, డిమాండ్ ${dep.no}: ప్రణాళికకు సంపుటం I/2, మార్చిన ప్రణాళిక, లెక్కలకు సంపుటం III`), url: 'https://apfinance.gov.in/budget.html' },
          { label: tr('CAG, Appropriation Accounts of Andhra Pradesh', 'కాగ్, ఆంధ్రప్రదేశ్ అప్రోప్రియేషన్ అకౌంట్స్'), url: 'https://cag.gov.in/ae/andhra-pradesh/en/state-accounts-report?defuat_account_report_type=358' },
        ]}
        table={<NumTable head={[tr('Year', 'సంవత్సరం'), tr('Plan before the year', 'ముందు ప్రణాళిక'), tr('Plan changed in the year', 'మార్చిన ప్రణాళిక'), tr('Spent', 'ఖర్చు'), tr('Net spent, after recoveries', 'నికర ఖర్చు, వసూళ్ల తర్వాత'), tr('Where each is printed', 'ఎక్కడ ముద్రించారు')]}
          rows={rows.map((r) => [r.year, figure(r.BE, tr('Not printed', 'ముద్రించలేదు')), figure(r.RE, tr('Not printed', 'ముద్రించలేదు')), r.A ? figure(r.A, '') : note(r).replace(/\.$/, ''),
            r.A?.t != null ? C(r.A.n ?? r.A.t) : '',
            <span key="p" className="flex flex-col items-end gap-0.5 text-[12.5px]">{paperCell(r.BE)}{paperCell(r.RE)}{paperCell(r.A)}</span>])} />}>
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-6 rounded-[3px] border-[1.5px] border-ink2 bg-secondary" />{tr('Plan made before the year (budget)', 'ముందు ప్రణాళిక (బడ్జెట్)')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-6 rounded-[2px] bg-[var(--chart-1)]" />{tr('Spent, from the accounts', 'ఖర్చు, లెక్కల నుంచి')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-4 w-1 rounded-[2px] bg-[var(--chart-3)]" />{tr('Plan changed during the year (revised)', 'మార్చిన ప్రణాళిక (సవరించినది)')}</span>
        </div>
        <ul className="space-y-3.5">
          {rows.map((r) => (
            <li key={r.year} className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
              <div className="text-[13.5px] font-semibold tnum">{r.year}</div>
              <div className="min-w-0">
                <div className="relative h-[34px]">
                  {r.BE?.t != null ? <span className="absolute left-0 top-[7px] h-[20px] rounded-[3px] border-[1.5px] border-ink2 bg-secondary" style={{ width: `${(r.BE.t / max) * 100}%` }} /> : null}
                  {r.A?.t != null ? <span className="absolute left-0 top-[12.5px] h-[9px] rounded-[2px] bg-[var(--chart-1)]" style={{ width: `${(r.A.t / max) * 100}%` }} /> : null}
                  {r.A?.t == null && r.A?.parts ? (
                    <span className="absolute left-0 top-[12.5px] flex h-[9px]" style={{ width: `${(len(r.A) / max) * 100}%` }} aria-hidden>
                      {r.A.parts.map((p, i) => <span key={i} className="h-full first:rounded-l-[2px] last:rounded-r-[2px] bg-[var(--chart-1)]" style={{ width: `${(p[1] / len(r.A)) * 100}%`, opacity: i % 2 ? 0.55 : 1 }} />)}
                    </span>) : null}
                  {r.RE?.t != null ? <span className="absolute top-[3px] -ml-[2px] h-[28px] w-[4px] rounded-[2px] bg-[var(--chart-3)]" style={{ left: `${(r.RE.t / max) * 100}%` }} /> : null}
                </div>
                <div className="text-[12.5px] leading-snug">
                  {r.A ? <>
                    <b className="text-brand">{r.A.t != null ? tr('Spent ', 'ఖర్చు ') + C(r.A.t) : tr(`Spent, as CAG prints it by section: ${partsText(r.A.parts ?? [])}`, `ఖర్చు, కాగ్ విభాగాల వారీగా: ${partsText(r.A.parts ?? [])}`)}</b>
                    <span className="text-muted-foreground">{r.BE?.t != null ? tr(` · plan ${crore(r.BE.t)}`, ` · ప్రణాళిక ${croreTe(r.BE.t)}`) : ''}{r.RE ? (r.RE.t != null ? tr(` · revised ${crore(r.RE.t)}`, ` · సవరించినది ${croreTe(r.RE.t)}`) : tr(` · revised, in two parts: ${partsText(r.RE.parts ?? [])}`, ` · సవరించినది, రెండు భాగాలుగా: ${partsText(r.RE.parts ?? [])}`)) : ''}</span></>
                    : <><b>{tr('Plan ', 'ప్రణాళిక ')}{r.BE?.t != null ? C(r.BE.t) : tr('not printed', 'ముద్రించలేదు')}</b><span className="text-muted-foreground">{r.RE?.t != null ? tr(` · revised ${crore(r.RE.t)}`, ` · సవరించినది ${croreTe(r.RE.t)}`) : ''}</span> <i className="text-muted-foreground">{note(r)}</i></>}
                </div>
                {r.A?.cag === 'd' ? <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{tr(`CAG’s audited accounts print this grant as: ${partsText((r.A.cagp ?? []) as [string, number][])}.`, `కాగ్ ఆడిట్ లెక్కల్లో ఈ గ్రాంట్: ${partsText((r.A.cagp ?? []) as [string, number][])}.`)}{' '}{r.A.cagsrc ? <a className="underline underline-offset-2" href={DEPT_BOOKS[r.A.cagsrc]} target="_blank" rel="noopener noreferrer" lang="en">{paperName(r.A.cagsrc, r.A.cagpp, te)}</a> : null}</div> : null}
                {r.A?.cag === 'c' ? <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{tr('Agrees with CAG’s audited accounts to within 0.1 per cent.', 'కాగ్ ఆడిట్ లెక్కలతో 0.1 శాతం లోపు సరిపోలింది.')}</div> : null}
                {r.A?.p2 ? <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{tr('CAG’s book for 2014-15 covers two periods together: the undivided state from 1 April to 1 June 2014, and the new state from 2 June 2014 to 31 March 2015.', '2014-15 కాగ్ పుస్తకం రెండు కాలాలను కలిపి చూపుతుంది: 2014 ఏప్రిల్ 1 నుంచి జూన్ 1 వరకు ఉమ్మడి రాష్ట్రం, 2014 జూన్ 2 నుంచి 2015 మార్చి 31 వరకు కొత్త రాష్ట్రం.')}</div> : null}
                {r.RE?.late ? <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{tr('This changed plan was printed after the year had ended, so it is close to the final spending.', 'ఈ మార్చిన ప్రణాళిక ఏడాది ముగిసిన తర్వాత ముద్రించారు; అందుకే ఇది తుది ఖర్చుకు దగ్గరగా ఉంటుంది.')}</div> : null}
                {r.BE?.alt ? <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{tr(`Volume III of the same budget prints this plan as ${crore(r.BE.alt.t)}. Both are official papers; both are shown.`, `అదే బడ్జెట్ సంపుటం IIIలో ఈ ప్రణాళిక ${croreTe(r.BE.alt.t)}. రెండూ అధికారిక పత్రాలే; రెండూ చూపాం.`)}{' '}<a className="underline underline-offset-2" href={DEPT_BOOKS[r.BE.alt.src]} target="_blank" rel="noopener noreferrer" lang="en">{paperName(r.BE.alt.src, r.BE.alt.pp, te)}</a></div> : null}
              </div>
            </li>
          ))}
        </ul>
      </ChartFrame>
      <Section className="mt-14" eyebrow={tr('Words to know', 'తెలుసుకోవాల్సిన పదాలు')} title={tr('Four words this chart uses', 'ఈ చార్టులోని నాలుగు పదాలు')}>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {words.map((w) => (
            <div key={w.en} className="rounded-xl border border-border bg-card p-4">
              <dt><span className="block text-[15.5px] font-semibold" lang={te ? 'te' : undefined}>{te ? w.te : w.en}</span><span className="block text-[13px] text-muted-foreground" lang={te ? 'en' : 'te'}>{te ? w.en : w.te}</span></dt>
              <dd className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">{w.p[lang]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13.5px] text-muted-foreground">{tr(`Spending is shown for ${spentYears.length} years and checked against CAG’s audited Appropriation Accounts for the same grant. For ${dep.name}, of ${cagM + cagC + cagD} years compared, ${cagM} match to within ₹10,000, ${cagC} agree to within 0.1 per cent and ${cagD} differ by more; where they differ, both are shown. CAG’s files for 2016-17 and 2021-22 carry no readable text; they were read from copies whose fonts were given their letters back, and pass the same checks.`,
          `${spentYears.length} ఏళ్ల ఖర్చు చూపాం; అదే గ్రాంట్‌కు కాగ్ ఆడిట్ చేసిన అప్రోప్రియేషన్ అకౌంట్స్‌తో పోల్చాం. ${dep.name}కు పోల్చిన ${cagM + cagC + cagD} ఏళ్లలో ${cagM} ఏళ్లు ₹10,000 లోపు సరిపోలాయి, ${cagC} ఏళ్లు 0.1 శాతం లోపు సరిపోలాయి, ${cagD} ఏళ్లు అంతకు మించి తేడా ఉంది; తేడా ఉన్నచోట రెండూ చూపాం. 2016-17, 2021-22 కాగ్ ఫైళ్లలో చదవగలిగే అక్షరాలు లేవు; వాటి ఫాంట్‌లకు అక్షరాలను తిరిగి జత చేసిన ప్రతుల నుంచి చదివాం, అవీ అవే తనిఖీలను దాటాయి.`)}</p>
      </Section>
      <Section className="mt-14" eyebrow={tr('All demands', 'అన్ని డిమాండ్లు')} title={tr(`All ${money.departments.length} demands`, `మొత్తం ${money.departments.length} డిమాండ్లు`)}>
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {money.departments.map((d: any) => (
            <li key={d.no}><button type="button" onClick={() => { setNo(d.no); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={cn('w-full rounded-lg border px-3 py-2 text-left text-[14px]', d.no === no ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/30')}>{d.no}. {d.name}</button></li>
          ))}
        </ul>
      </Section>
    </Page>
  )
}

/* ============================================================ all states */
// Our own words beside RBI's tables, in both languages. The figures in them are RBI's, as printed.
const STATE_NOTES: Record<string, { en: string; te: string }> = {
  gsdp: {
    en: 'RBI prints this table in ₹ lakh. We show it in ₹ lakh crore, the unit people say. Only the unit changes, not the figure.',
    te: 'ఆర్బీఐ ఈ పట్టికను ₹ లక్షల్లో ముద్రిస్తుంది. మేము ప్రజలు మాట్లాడే ₹ లక్షల కోట్లలో చూపుతున్నాం. యూనిట్ మాత్రమే మారుతుంది, సంఖ్య కాదు.',
  },
  debt_gsdp: {
    en: 'Shown exactly as RBI prints it. Andhra Pradesh’s figures for end-March 2012, 2013 and 2014 are the undivided state’s debt. The end-March 2017 figures carry odd values from how RBI split the debt between Andhra Pradesh and Telangana: Andhra Pradesh 37.2%, Telangana 12.4%. We do not correct a published table; we say why it looks odd.',
    te: 'ఆర్బీఐ ముద్రించినట్లే చూపాం. 2012, 2013, 2014 మార్చి చివరి నాటి ఆంధ్రప్రదేశ్ సంఖ్యలు ఉమ్మడి రాష్ట్రం అప్పులవి. 2017 మార్చి చివరి సంఖ్యల్లో ఆంధ్రప్రదేశ్, తెలంగాణ మధ్య ఆర్బీఐ అప్పును పంచిన తీరు వల్ల వింత విలువలు ఉన్నాయి: ఆంధ్రప్రదేశ్ 37.2%, తెలంగాణ 12.4%. ప్రచురించిన పట్టికను మేము సరిదిద్దం; అది ఎందుకు వింతగా కనిపిస్తుందో చెబుతాం.',
  },
}

export function AllStates() {
  const { lang, tr } = useLang()
  const sets = money.states as any[]
  const [k, setK] = React.useState(sets[0].key)
  const set = sets.find((s) => s.key === k)!
  const [yi, setYi] = React.useState(set.years.length - 2)
  React.useEffect(() => setYi(Math.max(0, set.years.length - 2)), [k]) // eslint-disable-line react-hooks/exhaustive-deps
  const year = set.years[yi]
  const rows = set.rows.map((r: any) => ({ state: r.state, v: r.values[yi] })).filter((r: any) => r.v != null)
  const te = lang === 'te'
  // The answer gives the value in full words; each bar prints it in the unit its scale is marked in.
  // GSDP in lakh crore to two decimals (₹1,000 crore), so small states and union territories keep their order in words too.
  const fmt = (v: number) => (set.key === 'per_capita' ? '₹' + num(v, 0) : set.key === 'gsdp' ? (te ? lakhCroreTe(v, 2) : lakhCrore(v, 2)) : num(v, 1) + '%')
  const barValue = (v: number) => (set.key === 'per_capita' ? '₹' + num(v, 0) : set.key === 'gsdp' ? (v / 1e5).toFixed(2) : num(v, 1) + '%')
  const tickValue = (v: number) => (set.key === 'gsdp' ? num(v / 1e5, 0) : num(v, 0))
  const scaleUnit = set.key === 'per_capita' ? tr('₹ per person', '₹, ఒక్కరికి') : set.key === 'gsdp' ? tr('₹ lakh crore', '₹ లక్షల కోట్లు') : tr('% of GSDP', 'జీఎస్‌డీపీలో %')
  const sorted = [...rows].sort((a: any, b: any) => b.v - a.v)
  const ap = rows.find((r: any) => r.state === 'Andhra Pradesh')
  const stage = set.stages?.[String(year)] as string | undefined
  const provisional = (set.key === 'per_capita' || set.key === 'gsdp') && year >= 2023
  const hollow = provisional || !!(stage && STAGE_WORDS[stage]?.est)
  const setNote = STATE_NOTES[set.key]
  const qs: Record<string, { en: string; te: string; limit: { en: string; te: string } }> = {
    per_capita: { en: 'Where does Andhra Pradesh stand among the states on income per person?', te: 'తలసరి ఆదాయంలో రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ ఉంది?', limit: { en: 'how income is shared. A higher average does not mean everyone there earns more. These are the rupees of each year.', te: 'ఆదాయం ఎలా పంచుకున్నారో. సగటు ఎక్కువైతే అక్కడ అందరూ ఎక్కువ సంపాదిస్తారని కాదు. ఇవి ఆయా ఏళ్ల రూపాయలు.' } },
    gsdp: { en: 'Where does Andhra Pradesh stand among the states on the size of its economy?', te: 'ఆర్థిక వ్యవస్థ పరిమాణంలో రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ ఉంది?', limit: { en: 'how well people live. A big state produces more in total; the per-person figure is the other tab.', te: 'ప్రజలు ఎలా జీవిస్తున్నారో. పెద్ద రాష్ట్రం మొత్తంగా ఎక్కువ ఉత్పత్తి చేస్తుంది; ఒక్కొక్కరి సంఖ్య ఇంకో ట్యాబ్‌లో.' } },
    debt_gsdp: { en: 'Where does Andhra Pradesh stand among the states on debt, as a share of its economy?', te: 'ఆర్థిక వ్యవస్థలో అప్పు వాటాలో రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ ఉంది?', limit: { en: 'whether the debt can be repaid. That depends on income and interest, on the Money page.', te: 'అప్పు తీర్చగలరా అని. అది ఆదాయం, వడ్డీపై ఆధారపడుతుంది; డబ్బు పేజీలో ఉంది.' } },
  }
  const qq = qs[set.key] ?? { en: set.label, te: set.te ?? set.label, limit: { en: '', te: '' } }
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Money · All states', 'డబ్బు · అన్ని రాష్ట్రాలు')} q={{ en: 'Where does Andhra Pradesh stand among the states?', te: 'రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ ఉంది?' }}
        lede={tr('As the Reserve Bank of India prints it. Sorted by the value shown; no rank number is printed, because the paper prints none.', 'ఆర్బీఐ ముద్రించినట్లే. చూపిన విలువ ప్రకారం వరుస; పత్రం ర్యాంకు ఇవ్వదు కాబట్టి మేమూ ఇవ్వం.')} />
      <div className="-mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Measure">
        {sets.map((st) => (
          <button key={st.key} type="button" role="tab" aria-selected={st.key === k} onClick={() => setK(st.key)}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[14px] font-medium', st.key === k ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/40')}>{lang === 'te' && st.te ? <Te>{st.te}</Te> : st.label}</button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="shrink-0 text-[13px] text-muted-foreground">{tr('Year', 'సంవత్సరం')}</span>
        <input type="range" min={0} max={set.years.length - 1} step={1} value={yi} onChange={(e) => setYi(Number(e.target.value))} aria-label="Year" className="h-2 min-w-0 flex-1 accent-[var(--chart-1)]" />
        <span className="w-[74px] shrink-0 text-right font-heading text-[18px] font-semibold tnum">{fy(year)}</span>
      </div>
      <ChartFrame className="mt-4" q={{ en: qq.en, te: qq.te }} sub={`${set.key === 'gsdp' ? scaleUnit : tr(set.unit, UNIT_TE[set.unit] ?? set.unit)}, ${fy(year)}`}
        answer={ap ? tr(<><b>{fmt(ap.v)}</b> in {fy(year)}{stage ? `, a ${STAGE_WORDS[stage]?.en.toLowerCase()}` : provisional ? ', a provisional figure' : ''}. {rows.length} states and union territories have a figure for that year.</>,
          <>{fy(year)}లో <b>{fmt(ap.v)}</b>{stage ? ` (${STAGE_WORDS[stage]?.te})` : provisional ? ' (తాత్కాలిక సంఖ్య)' : ''}. ఆ ఏడాదికి {rows.length} రాష్ట్రాలు, కేంద్రపాలిత ప్రాంతాలకు సంఖ్య ఉంది.</>) : tr('Andhra Pradesh has no figure for this year.', 'ఈ ఏడాదికి ఆంధ్రప్రదేశ్ సంఖ్య లేదు.')}
        how={tr(`Each row is one state or union territory, with its value printed at the end of the row. Rows are sorted by the value RBI prints, largest first, and every bar shares one scale, marked above and below in ${scaleUnit}. Andhra Pradesh is in blue. We give no rank number.${hollow ? ' Striped bars with a dashed edge are figures that may still change.' : ''}`,
          `ప్రతి వరుస ఒక రాష్ట్రం లేదా కేంద్రపాలిత ప్రాంతం; దాని విలువ వరుస చివర ముద్రించాం. ఆర్బీఐ ముద్రించిన విలువ ప్రకారం ఎక్కువ నుంచి తక్కువకు వరుస; అన్ని బార్లూ ఒకే కొలతపై, పైన కింద ${scaleUnit}లో గుర్తించాం. ఆంధ్రప్రదేశ్ నీలి రంగులో. ర్యాంకు సంఖ్య ఇవ్వం.${hollow ? ' గీతల అంచు, చారల బార్లు ఇంకా మారగల సంఖ్యలు.' : ''}`)}
        note={setNote || provisional ? <>{setNote ? tr(setNote.en, setNote.te) : null}{setNote && provisional ? ' ' : null}{provisional ? tr('The newest years in this table are provisional figures, which may still change.', 'ఈ పట్టికలో తాజా ఏళ్లు తాత్కాలిక సంఖ్యలు; ఇంకా మారవచ్చు.') : null}</> : undefined}
        limits={lang === 'te' ? qq.limit.te : qq.limit.en}
        sources={[{ label: `${set.pub}, ${set.src}`.replace(/TABLE/, 'Table'), url: set.url }]}>
        <StateBars rows={sorted} value={barValue} tick={tickValue} unit={scaleUnit} hollow={hollow}
          label={tr(`${set.label}, every state and union territory for ${fy(year)}, largest first`, `${set.te ?? set.label}, ${fy(year)}, అన్ని రాష్ట్రాలు, ఎక్కువ నుంచి తక్కువకు`)} />
      </ChartFrame>
    </Page>
  )
}
