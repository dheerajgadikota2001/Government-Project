import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { invest, periods } from '@/lib/data'
import { clean, crore, croreTe, dateLong, dateTe, fy, num } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { ChartFrame, KindBadge, ListenButton, NumTable, PaperChip, Section, StageTag, Te } from '@/components/kit'
import { PERIOD_BANDS, type FyPoint } from '@/graphics/PeriodBars'
import { YearBars } from '@/graphics/YearBars'

// Three government periods since the state was divided, each named only by its
// dates and its Chief Minister, in grey shades. The page lays the government's
// own printed figures on one timeline. It never scores or ranks the periods.

const P = periods.periods as { from: string; to: string | null; cm: string; projects_announced: number }[]
const SHADES = ['bg-foreground/[0.12]', 'bg-foreground/[0.3]', 'bg-foreground/[0.6]']
/** The same three greys, for the period headings inside the charts. */
const SHADE_FILL = [12, 30, 60].map((p) => `color-mix(in oklab, var(--foreground) ${p}%, transparent)`)
const shortDate = (s: string) => dateLong(s).replace(/(\d+) (\w{3})\w* (\d{4})/, '$1 $2 $3')

/** What each published index measures, in Telugu. */
const MEASURES_TE: Record<string, string> = {
  'state government (finances)': 'రాష్ట్ర ప్రభుత్వం (ఆర్థికం)',
  'state government (reform implementation)': 'రాష్ట్ర ప్రభుత్వం (సంస్కరణల అమలు)',
  'overall state conditions (development outcomes)': 'రాష్ట్ర మొత్తం స్థితి (అభివృద్ధి ఫలితాలు)',
  'overall state conditions (innovation ecosystem)': 'రాష్ట్ర మొత్తం స్థితి (ఆవిష్కరణల వాతావరణం)',
  'mixed (policy + conditions)': 'రెండూ (విధానం, స్థితి)',
  'state government (governance delivery)': 'రాష్ట్ర ప్రభుత్వం (పాలన అందజేత)',
}
/** Each Chief Minister's name in the reader's script; the same treatment for every government. */
const CM_TE: Record<string, string> = { 'N. Chandrababu Naidu': 'ఎన్. చంద్రబాబు నాయుడు', 'Y.S. Jagan Mohan Reddy': 'వై.ఎస్. జగన్ మోహన్ రెడ్డి' }
export const cmName = (cm: string, lang: 'en' | 'te') => (lang === 'te' ? CM_TE[cm] ?? cm : cm)

export function periodName(i: number, lang: 'en' | 'te') {
  const p = P[i]
  if (lang === 'te') return p.to ? `${dateTe(p.from)} నుంచి ${dateTe(p.to)} వరకు` : `${dateTe(p.from)} నుంచి`
  return p.to ? `${shortDate(p.from)} to ${shortDate(p.to)}` : `From ${shortDate(p.from)}`
}

type Series = { unit: string; note: string; sources: { key: string; title: string; url: string; date?: string; publisher?: string }[]; points: FyPoint[] }
const S = periods.series as Record<string, Series>

const isEst = (s?: string | null) => s === 'RE' || s === 'BE' || s === 'PE'

type ChartDef = {
  key: string; q: { en: string; te: string }; unit: { en: string; te: string }; color: string; max?: number
  /** The unit beside the scale marks, short enough for the year column. */
  scale: { en: string; te: string }; tick: (v: number) => string
  fmt: (v: number) => string; fmtTe: (v: number) => string; long: (v: number) => string; longTe: (v: number) => string
  note?: { en: React.ReactNode; te: React.ReactNode }; example: { en: string; te: string }; madeUp?: boolean
  papers: string
}

const money = (v: number) => crore(v, 1)
const share = (v: number) => `₹${v.toFixed(2)}`
const CHARTS: ChartDef[] = [
  { key: 'capital_outlay', q: { en: 'How much was spent building things that last?', te: 'శాశ్వత ఆస్తుల నిర్మాణానికి ఎంత ఖర్చు చేశారు?' },
    unit: { en: 'Capital outlay, ₹ crore', te: 'మూలధన వ్యయం, ₹ కోట్లు' }, color: 'var(--chart-1)', scale: { en: '₹ crore', te: '₹ కోట్లు' }, tick: (v) => num(v, 0),
    fmt: (v) => num(v, 1), fmtTe: (v) => num(v, 1), long: money, longTe: (v) => croreTe(v, 1),
    note: { en: <>2022-23 was ₹7,244 crore. The CAG audit says capital outlay &ldquo;decreased by 55.76 per cent&rdquo; that year.</>, te: <>2022-23లో ₹7,244 కోట్లు. ఆ ఏడాది మూలధన వ్యయం 55.76 శాతం తగ్గిందని కాగ్ ఆడిట్ చెబుతోంది.</> },
    example: { en: 'Building a house is capital outlay. Rent, salaries and groceries are not.', te: 'ఇల్లు కట్టడం మూలధన వ్యయం. అద్దె, జీతాలు, సరుకులు కావు.' }, madeUp: false,
    papers: 'RBI Handbook Table 174 and State Finances 2025-26; CAG audits of 2019-20 and 2022-23' },
  { key: 'social_sector', q: { en: 'How much went to education, health, welfare and rural development together?', te: 'విద్య, వైద్యం, సంక్షేమం, గ్రామీణాభివృద్ధికి కలిపి ఎంత?' },
    unit: { en: 'Social sector spending, ₹ crore', te: 'సామాజిక రంగ వ్యయం, ₹ కోట్లు' }, color: 'var(--chart-1)', scale: { en: '₹ crore', te: '₹ కోట్లు' }, tick: (v) => num(v, 0),
    fmt: (v) => num(v, 1), fmtTe: (v) => num(v, 1), long: money, longTe: (v) => croreTe(v, 1),
    example: { en: 'These are the rupees of each year. A rupee in 2014 bought more than a rupee today, so part of every rise is price rise.', te: 'ఇవి ఆయా ఏళ్ల రూపాయలు. 2014లో రూపాయికి వచ్చినంత ఈ రోజు రాదు; అందుకే ప్రతి పెరుగుదలలో కొంత ధరల పెరుగుదలే.' }, madeUp: false,
    papers: 'RBI State Finances 2025-26, Statement 31; RBI Handbook Table 175' },
  { key: 'education_share', q: { en: 'Out of every ₹100 the government spent, how much went to education?', te: 'ప్రభుత్వం ఖర్చు చేసిన ప్రతి ₹100లో విద్యకు ఎంత?' },
    unit: { en: 'Education, % of all spending, as RBI prints it', te: 'విద్య, మొత్తం వ్యయంలో %, ఆర్బీఐ ముద్రించినట్లు' }, color: 'var(--chart-3)', max: 16, scale: { en: '% of spending', te: 'వ్యయంలో %' }, tick: (v) => `${num(v, 0)}%`,
    fmt: (v) => `${num(v, 1)}%`, fmtTe: (v) => `${num(v, 1)}%`, long: share, longTe: share,
    example: { en: 'A family spends ₹1,000 in a month and ₹200 of it on school fees. That is ₹20 of every ₹100, or 20%.', te: 'ఒక కుటుంబం నెలకు ₹1,000 ఖర్చు చేసి, అందులో ₹200 బడి ఫీజులకు పెడితే, అది ప్రతి ₹100లో ₹20, అంటే 20%.' }, madeUp: true,
    papers: 'RBI State Finances 2025-26, Statement 26 (includes sports, art and culture)' },
  { key: 'health_share', q: { en: 'Out of every ₹100 the government spent, how much went to health?', te: 'ప్రభుత్వం ఖర్చు చేసిన ప్రతి ₹100లో వైద్యానికి ఎంత?' },
    unit: { en: 'Health, % of all spending, as RBI prints it', te: 'వైద్యం, మొత్తం వ్యయంలో %, ఆర్బీఐ ముద్రించినట్లు' }, color: 'var(--chart-3)', max: 16, scale: { en: '% of spending', te: 'వ్యయంలో %' }, tick: (v) => `${num(v, 0)}%`,
    fmt: (v) => `${num(v, 1)}%`, fmtTe: (v) => `${num(v, 1)}%`, long: share, longTe: share,
    note: { en: 'Same scale as the education chart, 0 to 16%, so the two can be read side by side.', te: 'విద్య చార్టు కొలతే (0 నుంచి 16%), కాబట్టి రెండింటినీ పక్కపక్కనే చదవవచ్చు.' },
    example: { en: 'A family spends ₹1,000 in a month and ₹30 of it on medicines. That is ₹3 of every ₹100, or 3%.', te: 'ఒక కుటుంబం నెలకు ₹1,000 ఖర్చు చేసి, అందులో ₹30 మందులకు పెడితే, అది ప్రతి ₹100లో ₹3, అంటే 3%.' }, madeUp: true,
    papers: 'RBI State Finances 2025-26, Statement 27 (medical, public health and family welfare)' },
  { key: 'committed_pct', q: { en: 'Out of every ₹100 the state received, how much went on salaries, pensions and interest?', te: 'రాష్ట్రానికి వచ్చిన ప్రతి ₹100లో జీతాలు, పింఛన్లు, వడ్డీలకు ఎంత?' },
    unit: { en: 'Committed spending, % of revenue receipts, audited years only', te: 'తప్పనిసరి వ్యయం, రెవెన్యూ రాబడిలో %, ఆడిట్ అయిన ఏళ్లు మాత్రమే' }, color: 'var(--ink2)', max: 80, scale: { en: '% of receipts', te: 'రాబడిలో %' }, tick: (v) => `${num(v, 0)}%`,
    fmt: (v) => `${num(v, 2)}%`, fmtTe: (v) => `${num(v, 2)}%`, long: share, longTe: share,
    note: { en: '2019-20 to 2021-22 use the revised salary figures printed in the CAG’s 2022-23 report.', te: '2019-20 నుంచి 2021-22 వరకు కాగ్ 2022-23 నివేదికలోని సవరించిన జీతాల అంకెలు.' },
    example: { en: 'The CAG calls this committed spending: money spoken for before anything new is built, like a family’s rent and loan payments.', te: 'కాగ్ దీన్ని తప్పనిసరి వ్యయం అంటుంది: కొత్తది ఏదైనా కట్టక ముందే కేటాయించిన డబ్బు, ఒక కుటుంబపు అద్దె, అప్పు వాయిదాల్లా.' }, madeUp: false,
    papers: 'CAG State Finances Audit Reports' },
  { key: 'per_capita', q: { en: 'What is the state’s income per person?', te: 'రాష్ట్ర తలసరి ఆదాయం ఎంత?' },
    unit: { en: 'Per capita NSDP, ₹ per person per year, current prices', te: 'తలసరి ఎన్‌ఎస్‌డీపీ, ఒక్కరికి ఏడాదికి ₹, ఆయా ఏళ్ల ధరల్లో' }, color: 'var(--ink2)', scale: { en: '₹ a person', te: 'ఒక్కరికి ₹' }, tick: (v) => '₹' + num(v, 0),
    fmt: (v) => '₹' + num(v, 0), fmtTe: (v) => '₹' + num(v, 0), long: (v) => '₹' + num(v, 0), longTe: (v) => '₹' + num(v, 0),
    note: { en: '2022-23 to 2024-25 are provisional figures, so they are drawn striped and named.', te: '2022-23 నుంచి 2024-25 వరకు తాత్కాలిక సంఖ్యలు; అందుకే చారలతో, పేరుతో చూపాం.' },
    example: { en: 'The state’s net production in a year, shared out equally among all its people. It is an average; many earn less, a few much more.', te: 'ఒక ఏడాదిలో రాష్ట్ర నికర ఉత్పత్తిని ప్రజలందరికీ సమానంగా పంచితే వచ్చేది. ఇది సగటు; చాలామందికి తక్కువ, కొందరికి చాలా ఎక్కువ.' }, madeUp: false,
    papers: 'RBI Handbook of Statistics on Indian States 2024-25, Table 19 (from the National Statistical Office)' },
]

function answer(c: ChartDef, pts: FyPoint[], lang: 'en' | 'te') {
  const first = pts.find((p) => !isEst(p.stage))!
  const lastA = [...pts].reverse().find((p) => !isEst(p.stage))!
  const last = pts[pts.length - 1]
  const L = lang === 'te' ? c.longTe : c.long
  const audited = c.key === 'committed_pct'
  if (lang === 'te') {
    const parts = [`${fy(first.fy_end)}లో ${L(first.value)}`, `${fy(lastA.fy_end)}లో ${L(lastA.value)} (${audited ? 'తాజా కాగ్ ఆడిట్' : 'తాజా లెక్కలు'})`]
    if (last !== lastA) parts.push(last.stage === 'BE' ? `${fy(last.fy_end)}కు బడ్జెట్‌లో ${L(last.value)}` : last.stage === 'PE' ? `${fy(last.fy_end)}లో ${L(last.value)} (తాత్కాలిక సంఖ్య)` : `${fy(last.fy_end)}లో ${L(last.value)} (సవరించిన అంచనా)`)
    return parts.join('; ') + '.'
  }
  const parts = [`${L(first.value)} in ${fy(first.fy_end)}`, `${L(lastA.value)} in ${fy(lastA.fy_end)}, the newest ${audited ? 'CAG audit' : 'accounts'}`]
  if (last !== lastA) parts.push(last.stage === 'BE' ? `${L(last.value)} budgeted for ${fy(last.fy_end)}` : last.stage === 'PE' ? `${L(last.value)} in ${fy(last.fy_end)}, a provisional figure` : `${L(last.value)} in ${fy(last.fy_end)}, a revised estimate`)
  return parts.join('; ') + '.'
}

/** Every financial year from 2014-15 to 2025-26, so all six charts have the same rows; a year with no printed figure says so. */
const yearRows = (pts: FyPoint[]) => {
  const by = new Map(pts.map((p) => [p.fy_end, p]))
  const out = []
  for (let y = PERIOD_BANDS[0].from; y <= PERIOD_BANDS[PERIOD_BANDS.length - 1].to; y++) {
    const p = by.get(y)
    out.push({ fyEnd: y, year: fy(y), v: p ? p.value : null, stage: p?.stage })
  }
  return out
}

const MOUS = invest.mous as any[]
const inPeriod = (d: string | null | undefined, i: number) => {
  if (!d) return false
  const s = d.slice(0, 10), p = P[i]
  return s >= p.from && (!p.to || s <= p.to)
}

export default function Periods() {
  const { lang, tr } = useLang()
  const promisesBy = P.map((_, i) => MOUS.filter((m) => inPeriod(m.signed_date, i)).length)
  const promisesNoDate = MOUS.filter((m) => !m.signed_date).length
  const promisesPre = MOUS.filter((m) => m.signed_date && m.signed_date.slice(0, 10) < P[0].from).length
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Governments by period', 'ప్రభుత్వాల వారీగా')}
        q={{ en: 'What the papers show, period by period', te: 'ప్రతి ప్రభుత్వ కాలంలో పత్రాలు ఏం చూపిస్తున్నాయి' }}
        lede={tr('Andhra Pradesh has had three government periods since the state was divided on 2 June 2014. This page puts the government’s own printed figures on one timeline, each period marked by its dates and Chief Minister. It does not score or compare governments. You read the figures.',
          '2014 జూన్ 2న రాష్ట్ర విభజన తర్వాత ఆంధ్రప్రదేశ్‌లో మూడు ప్రభుత్వ కాలాలు. ప్రభుత్వం ముద్రించిన అంకెలను ఈ పేజీ ఒకే కాలరేఖపై చూపుతుంది; ప్రతి కాలాన్ని దాని తేదీలు, ముఖ్యమంత్రి పేరుతో గుర్తించాం. ప్రభుత్వాలకు మార్కులు వేయం, పోల్చం. అంకెలు మీరే చదవండి.')}>
        <div className="mt-5"><ListenButton /></div>
      </PageHead>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {P.map((p, i) => (
          <div key={p.from} className="rounded-2xl border border-border bg-card p-4">
            <div className={`h-2 w-14 rounded-full ${SHADES[i]}`} aria-hidden />
            <div className="mt-3 text-[16px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{periodName(i, lang)}</div>
            <div className="text-[14px] text-muted-foreground">{tr('Chief Minister', 'ముఖ్యమంత్రి')} <span lang={lang === 'te' ? 'te' : 'en'}>{cmName(p.cm, lang)}</span></div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">{tr('Grey shades only, never a party colour. In the charts, financial years stand in for the periods: each period began in June, two months into a financial year.',
        'బూడిద రంగు ఛాయలు మాత్రమే; ఏ పార్టీ రంగూ కాదు. చార్టుల్లో ఆర్థిక సంవత్సరాలే కాలాలకు గుర్తు: ప్రతి కాలం జూన్‌లో, ఆర్థిక సంవత్సరం మొదలైన రెండు నెలలకు మొదలైంది.')}</p>

      <Section className="mt-16" eyebrow={tr('Year by year', 'ఏడాది వారీగా')} title={tr('From the government’s own papers', 'ప్రభుత్వ సొంత పత్రాల నుంచి')}
        lede={<div className="space-y-2">
          <p><b className="text-foreground">{tr('How to read these six charts: ', 'ఈ ఆరు చార్టులను ఎలా చదవాలి: ')}</b>{tr('each row is one financial year, 2014-15 at the top to 2025-26 at the bottom, with its figure printed at the end of the row. The years sit under the period they fall in, named by its dates and Chief Minister. Solid bars are final accounts; striped bars are estimates and say which kind. Each chart has its own scale, marked above and below (education and health share one), so compare years within a chart, not across charts.',
            'ప్రతి వరుస ఒక ఆర్థిక సంవత్సరం, పైన 2014-15 నుంచి కింద 2025-26 వరకు; వరుస చివర ఆ ఏడాది అంకె ఉంది. ఏళ్లను అవి వచ్చే కాలం కింద, ఆ కాలం తేదీలు, ముఖ్యమంత్రి పేరుతో ఉంచాం. నిండు బార్లు చివరి లెక్కలు; చారల బార్లు అంచనాలు, ఏ రకమో పేరుతో చెబుతాయి. ప్రతి చార్టుకు దాని కొలత ఉంది, పైన, కింద గుర్తించాం (విద్య, వైద్యం ఒకే కొలత); కాబట్టి ఒకే చార్టులో ఏళ్లను పోల్చండి, చార్టుల మధ్య కాదు.')}</p>
          <p><b className="text-foreground">{tr('What they do not tell you: ', 'ఇవి చెప్పనిది: ')}</b>{tr('who caused a change. A financial year starts in April, two months before each change of government, and much more than a government moves a budget: floods, the Centre’s transfers, prices. Nothing here is totalled or averaged per period.',
            'మార్పుకు ఎవరు కారణమో. ఆర్థిక సంవత్సరం ఏప్రిల్‌లో మొదలవుతుంది, ప్రతి ప్రభుత్వ మార్పుకు రెండు నెలల ముందు. బడ్జెట్‌ను ప్రభుత్వం ఒక్కటే కదిలించదు: వరదలు, కేంద్రం బదిలీలు, ధరలు. ఇక్కడ కాలం వారీగా ఏదీ కలపలేదు, సగటు చేయలేదు.')}</p>
        </div>}>
        <div className="grid gap-5 lg:grid-cols-2">
          {CHARTS.map((c) => {
            const s = S[c.key]
            if (!s) return null
            const fmt = lang === 'te' ? c.fmtTe : c.fmt
            return (
              <ChartFrame key={c.key} q={c.q} sub={lang === 'te' ? <Te>{c.unit.te}</Te> : c.unit.en}
                answer={lang === 'te' ? <Te>{answer(c, s.points, 'te')}</Te> : answer(c, s.points, 'en')}
                example={lang === 'te' ? <Te>{c.example.te}</Te> : c.example.en} exampleMadeUp={c.madeUp}
                note={c.note ? (lang === 'te' ? <Te>{c.note.te}</Te> : c.note.en) : undefined}
                sources={s.sources.slice(0, 3).map((x) => ({ label: x.title.split(' — ')[0], url: x.url }))}
                table={<NumTable head={[tr('Year', 'సంవత్సరం'), lang === 'te' ? c.unit.te : c.unit.en, tr('Stage', 'దశ')]} rows={s.points.map((p) => [fy(p.fy_end), fmt(p.value), <StageTag key="s" stage={p.stage} />])} />}>
                <YearBars rows={yearRows(s.points)} value={fmt} tick={c.tick} unit={lang === 'te' ? c.scale.te : c.scale.en} color={c.color} max={c.max}
                  groups={PERIOD_BANDS.map((b, i) => ({ from: b.from, to: b.to, shade: SHADE_FILL[i],
                    title: lang === 'te' ? `${periodName(i, 'te')}, ముఖ్యమంత్రి ${cmName(P[i].cm, 'te')}` : `${periodName(i, 'en')}, Chief Minister ${P[i].cm}` }))}
                  label={`${c.q.en}: ${c.unit.en}, by financial year`} />
              </ChartFrame>
            )
          })}
        </div>
      </Section>

      <Section className="mt-20" eyebrow={tr('Our records', 'మా రికార్డులు')} title={tr('How many of our records fall in each period?', 'ప్రతి కాలంలో మా రికార్డులు ఎన్ని?')}>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="p-3 font-semibold" />
                {P.map((_, i) => <th key={i} className="p-3 text-right font-semibold" lang={lang === 'te' ? 'te' : undefined}>{periodName(i, lang)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/70"><td className="p-3">{tr('Project records announced', 'ప్రకటించిన ప్రాజెక్టు రికార్డులు')}</td>{P.map((p, i) => <td key={i} className="p-3 text-right font-heading text-[18px] font-semibold tnum">{p.projects_announced}</td>)}</tr>
              <tr><td className="p-3">{tr('Promise records signed', 'సంతకమైన హామీ రికార్డులు')}</td>{promisesBy.map((n, i) => <td key={i} className="p-3 text-right font-heading text-[18px] font-semibold tnum">{n}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1.5 text-[14px] leading-relaxed text-muted-foreground">
          <p><b className="text-foreground/85">{tr('How to read it: ', 'ఎలా చదవాలి: ')}</b>{tr('counts of our records by the date each one carries: the announcement date for a project record, the signing date for a promise.', 'ప్రతి రికార్డుకు ఉన్న తేదీ ప్రకారం లెక్క: ప్రాజెక్టుకు ప్రకటన తేదీ, హామీకి సంతకం తేదీ.')}</p>
          <p><b className="text-foreground/85">{tr('Notes: ', 'గమనిక: ')}</b>{tr(`${num(periods.unattributed, 0)} project records carry no announcement date and ${periods.pre_division} are from before the state was divided; the project counts are the register’s own count of ${dateLong('2026-10-18')}. ${promisesNoDate} promise records carry no signing date and ${promisesPre} were signed before 8 June 2014. We never guess a period.`,
            `${num(periods.unattributed, 0)} ప్రాజెక్టు రికార్డులకు ప్రకటన తేదీ లేదు, ${periods.pre_division} విభజనకు ముందువి; ప్రాజెక్టు లెక్కలు ${dateTe('2026-10-18')} నాటి రిజిస్టర్ సొంత లెక్క. ${promisesNoDate} హామీ రికార్డులకు సంతకం తేదీ లేదు, ${promisesPre} 2014 జూన్ 8కి ముందు సంతకమైనవి. కాలాన్ని ఊహించి పెట్టం.`)}</p>
          <p><b className="text-foreground/85">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('who built or delivered anything. A work announced in one period is often built in the next. No costs are added up.', 'ఎవరు కట్టారో, ఎవరు అందించారో. ఒక కాలంలో ప్రకటించిన పని తరచూ తర్వాతి కాలంలో కడతారు. ఏ ఖర్చూ కలపలేదు.')}</p>
        </div>
      </Section>

      <Section className="mt-20" eyebrow={tr('Dated events', 'తేదీలతో సంఘటనలు')} title={tr('Events, from official papers', 'అధికారిక పత్రాల్లోని సంఘటనలు')}
        lede={tr('One line per dated event, with the paper that records it.', 'ప్రతి సంఘటనకు ఒక వరుస, దాన్ని నమోదు చేసిన పత్రంతో.')}>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(periods.events as any[]).map((e) => (
            <li key={e.date + e.en} className="grid gap-2 px-4 py-3.5 md:grid-cols-[130px_minmax(0,1fr)_auto] md:items-center md:gap-5">
              <span className="text-[13.5px] font-semibold tnum">{lang === 'te' ? dateTe(e.date) : dateLong(e.date)}</span>
              <span className="text-[15px] leading-snug" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? e.te : e.en}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {e.kind === 'company' ? <KindBadge kind="company" /> : null}
                <PaperChip label={e.src.publisher.replace(/ \(official[^)]*\)/, '')} url={e.src.url} />
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section className="mt-20" eyebrow={tr('Rankings', 'ర్యాంకులు')} title={tr('How did central bodies rate the state?', 'కేంద్ర సంస్థలు రాష్ట్రానికి ఏ ర్యాంకులు ఇచ్చాయి?')}
        lede={<>
          <p><b className="text-foreground">{tr('How to read it: ', 'ఎలా చదవాలి: ')}</b>{tr('each row is one index, who publishes it, and what it measures. Ranks and scores are the publisher’s own, never ours.', 'ప్రతి వరుస ఒక సూచిక, దాన్ని ప్రచురించేవారు, అది కొలిచేది. ర్యాంకులు, స్కోర్లు ప్రచురణకర్తవే; మావి కావు.')}</p>
          <p className="mt-1"><b className="text-foreground">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('more than the index measures. Some grade the state government; others grade conditions in the state, which many things besides a government shape.', 'సూచిక కొలిచేదానికి మించినది. కొన్ని ప్రభుత్వాన్ని కొలుస్తాయి; మరికొన్ని రాష్ట్రంలోని పరిస్థితులను, వాటిని ప్రభుత్వమే కాక ఎన్నో అంశాలు మలుస్తాయి.')}</p>
        </>}>
        <div className="grid gap-3 md:grid-cols-2">
          {(periods.rankings as any[]).map((r) => (
            <article key={r.name} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[16.5px] font-semibold" lang="en">{r.name}</h3>
                <span className="text-[13px] text-muted-foreground" lang="en">{r.publisher}</span>
              </div>
              <div className="text-[13px] text-muted-foreground">{tr('Measures: ', 'కొలిచేది: ')}{lang === 'te' && MEASURES_TE[r.measures] ? MEASURES_TE[r.measures] : <span lang="en">{r.measures}</span>}</div>
              <ul className="mt-3 space-y-2.5">
                {r.editions.map((ed: any) => (
                  <li key={ed.edition} className="border-t border-border pt-2.5 text-[14px] leading-snug" lang="en">
                    <div><span className="font-semibold">{clean(ed.edition)}:</span> {clean(ed.result)}</div>
                    {ed.src?.url ? <div className="mt-1.5"><PaperChip label={ed.src.publisher?.replace(/ \(official[^)]*\)/, '') ?? r.publisher} url={ed.src.url} date={ed.src.date ? dateLong(ed.src.date) : undefined} /></div> : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section className="mt-20" eyebrow={tr('Awards', 'అవార్డులు')} title={tr('National awards, as the ministries record them', 'మంత్రిత్వ శాఖలు నమోదు చేసిన జాతీయ అవార్డులు')}
        lede={<><b className="text-foreground">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('everything. A year with nothing listed means we found no official record of an award, not that nothing happened.', 'అన్నీ కాదు. ఏదైనా ఏడాది ఖాళీగా ఉంటే, మాకు అధికారిక రికార్డు దొరకలేదని అర్థం; ఏమీ జరగలేదని కాదు.')}</>}>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(periods.awards as any[]).map((a) => (
            <li key={a.date + a.text} className="grid gap-1.5 px-4 py-3 md:grid-cols-[130px_minmax(0,1fr)_auto] md:items-center md:gap-5">
              <span className="text-[13.5px] font-semibold tnum">{lang === 'te' ? dateTe(a.date) : dateLong(a.date)}</span>
              <span className="text-[14.5px] leading-snug" lang="en">{clean(a.text)}</span>
              <PaperChip label={a.publisher} url={a.url} />
            </li>
          ))}
        </ol>
      </Section>

      <Section className="mt-20" eyebrow={tr('What each government said', 'ప్రతి ప్రభుత్వం చెప్పింది')} title={tr('Claims sit beside the record, never inside it', 'చెప్పిన మాటలు రికార్డు పక్కనే; దానిలో కలపం')}>
        <a href={href('claims')} className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 hover:border-foreground/30">
          <span className="max-w-2xl text-[15.5px] leading-relaxed">{tr('Each government’s own figures, from its white papers, are checked against the same records with the same template, in fair turns.', 'ప్రతి ప్రభుత్వం తన శ్వేతపత్రాల్లో చెప్పిన అంకెలను అవే రికార్డులతో, అదే పద్ధతిలో, వంతుల వారీగా సరిచూస్తాం.')}</span>
          <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">{tr('Check a claim', 'నిజమేనా?')}<ArrowRight className="size-4" /></span>
        </a>
        <p className="mt-3 text-[13px] text-muted-foreground">{tr('Never on this page: figures added up per period, per-year averages, or words that rank one year above another. Where a paper uses such words, we quote the paper.', 'ఈ పేజీలో ఎప్పుడూ ఉండనివి: కాలం వారీగా కలిపిన మొత్తాలు, ఏడాది సగటులు, ఒక ఏడాదిని మరో ఏడాది కంటే పైన పెట్టే మాటలు. పత్రంలో అలాంటి మాట ఉంటే, పత్రాన్నే ఉటంకిస్తాం.')}</p>
      </Section>
    </Page>
  )
}
