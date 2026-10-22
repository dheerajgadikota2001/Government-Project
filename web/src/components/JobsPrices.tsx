import * as React from 'react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { dateLong, dateTe, num } from '@/lib/format'
import { ChartFrame, NumTable } from '@/components/kit'
import raw from '@/data/jobs_prices.json'

// Jobs and prices, newest first: MoSPI's quarterly unemployment rate and monthly CPI inflation for
// Andhra Pradesh, with All India printed beside it as MoSPI prints it. Straight bars on one scale,
// every value printed, the provisional month striped. Nothing here is computed: no gap, no rank.

type Job = { measure: string; place: string; year: number; quarter: string; sex: string; area: string; value: number }
type Price = { measure: string; place: string; year: number; month: number; area: string; index: number; inflation: number | null; stage: string }
const D = raw as unknown as { read_on: string; sources: Record<string, any>; jobs: Job[]; prices: Price[] }
const QORDER: Record<string, number> = { 'Jan-Mar': 1, 'Apr-Jun': 2, 'Jul-Sep': 3, 'Oct-Dec': 4 }
const QTE: Record<string, string> = { 'Jan-Mar': 'జనవరి-మార్చి', 'Apr-Jun': 'ఏప్రిల్-జూన్', 'Jul-Sep': 'జూలై-సెప్టెంబర్', 'Oct-Dec': 'అక్టోబర్-డిసెంబర్' }
const QEN: Record<string, string> = { 'Jan-Mar': 'Jan to Mar', 'Apr-Jun': 'Apr to Jun', 'Jul-Sep': 'Jul to Sep', 'Oct-Dec': 'Oct to Dec' }
const MEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MTE = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']

const stripes = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 2px, transparent 2px 5.5px)`

/** One period per row: Andhra Pradesh's bar above All India's, both on one scale, values printed. */
function PairBars({ rows, max, unit }: { rows: { key: string; label: string; ap: number | null; india: number | null; hollow?: boolean }[]; max: number; unit: string }) {
  const { tr } = useLang()
  const bar = (v: number | null, ap: boolean, hollow?: boolean) => {
    const c = ap ? 'var(--chart-1)' : 'color-mix(in oklab, var(--foreground) 38%, transparent)'
    return (
      <span className="flex items-center gap-2">
        <span className="relative h-3 min-w-0 flex-1">
          {v != null ? <span className={cn('absolute inset-y-0 left-0 rounded-[3px]', hollow && 'border-[1.5px] border-dashed')}
            style={{ width: `${(v / max) * 100}%`, background: hollow ? stripes(c) : c, borderColor: hollow ? c : undefined }} /> : null}
        </span>
        <span className={cn('w-14 shrink-0 text-right text-[13px] tnum', ap ? 'font-bold' : 'text-foreground/75')}>{v != null ? `${num(v, 2)}${unit}` : tr('not printed', 'ముద్రించలేదు')}</span>
      </span>
    )
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-[3px] bg-[var(--chart-1)]" />{tr('Andhra Pradesh', 'ఆంధ్రప్రదేశ్')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-[3px] bg-foreground/40" />{tr('All India', 'దేశమంతటా')}</span>
        <span>{tr(`One scale for every bar, 0 to ${max}${unit}.`, `అన్ని బార్లూ ఒకే కొలతపై, 0 నుంచి ${max}${unit}.`)}</span>
      </div>
      <ol className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <span className="row-span-2 text-[13px] font-medium leading-tight">{r.label}</span>
            {bar(r.ap, true, r.hollow)}
            {bar(r.india, false, r.hollow)}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function JobsPrices({ className }: { className?: string }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const read = te ? dateTe(D.read_on) : dateLong(D.read_on)

  const ur = (place: string, y: number, q: string) => D.jobs.find((p) => p.measure === 'ur' && p.place === place && p.year === y && p.quarter === q && p.sex === 'person' && p.area === 'total')?.value ?? null
  const quarters = [...new Set(D.jobs.map((p) => `${p.year}|${p.quarter}`))].map((k) => { const [y, q] = k.split('|'); return { y: +y, q } })
    .sort((a, b) => a.y - b.y || QORDER[a.q] - QORDER[b.q])
  const qLabel = (y: number, q: string) => (te ? `${QTE[q]} ${y}` : `${QEN[q]} ${y}`)
  const lastQ = quarters[quarters.length - 1]
  const apLast = (m: string, sex: string, area: string) => D.jobs.find((p) => p.measure === m && p.place === 'andhra_pradesh' && p.year === lastQ.y && p.quarter === lastQ.q && p.sex === sex && p.area === area)?.value

  const months = [...new Set(D.prices.map((p) => p.month))].sort((a, b) => a - b)
  const cpi = (place: string, m: number) => D.prices.find((p) => p.measure === 'general' && p.place === place && p.year === 2026 && p.month === m && p.area === 'total')
  const lastM = months[months.length - 1]
  const apNow = cpi('andhra_pradesh', lastM)!
  const mLabel = (m: number) => (te ? `${MTE[m - 1]} 2026` : `${MEN[m - 1]} 2026`)
  const prov = (m: number) => cpi('andhra_pradesh', m)?.stage === 'provisional'

  const jobSrc = D.sources.mospi_plfs_quarterly.checked_against
  const cpiSrc = D.sources.mospi_cpi.checked_against
  return (
    <div className={cn('grid gap-5 lg:grid-cols-2', className)}>
      <ChartFrame q={{ en: 'How many people looking for work could not find it?', te: 'పని వెతుకుతున్నవారిలో ఎంతమందికి దొరకలేదు?' }}
        sub={tr('Unemployment rate, age 15 and above, rural and urban together, by quarter', 'నిరుద్యోగ రేటు, 15 ఏళ్లు పైబడినవారు, గ్రామాలు పట్టణాలు కలిపి, త్రైమాసికం వారీగా')}
        answer={tr(<>In {qLabel(lastQ.y, lastQ.q)}, <b>{num(ur('andhra_pradesh', lastQ.y, lastQ.q), 1)}%</b> of people in Andhra Pradesh who wanted work had none. For women it was {num(apLast('ur', 'female', 'total'), 1)}%.</>,
          <>{qLabel(lastQ.y, lastQ.q)}లో ఆంధ్రప్రదేశ్‌లో పని కావాలనుకున్నవారిలో <b>{num(ur('andhra_pradesh', lastQ.y, lastQ.q), 1)}%</b> మందికి పని లేదు. మహిళల్లో {num(apLast('ur', 'female', 'total'), 1)}%.</>)}
        how={tr('Each row is one quarter. The blue bar is Andhra Pradesh, the grey bar All India, both as MoSPI prints them. A longer bar means more people without work.', 'ప్రతి వరుస ఒక త్రైమాసికం. నీలి బార్ ఆంధ్రప్రదేశ్, బూడిద బార్ దేశమంతటా, రెండూ మోస్పి ముద్రించినట్లే. పొడవైన బార్ అంటే ఎక్కువ మందికి పని లేదు.')}
        example={tr('If 100 people are looking for work and 5 of them find none in the week asked about, the rate is 5%.', '100 మంది పని వెతుకుతుంటే, అడిగిన వారంలో 5 మందికి పని దొరకకపోతే, రేటు 5%.')}
        note={tr('The survey was redesigned in January 2025. These quarters are the new survey; older bulletins covered towns only and are not drawn here.', 'ఈ సర్వేను జనవరి 2025లో మార్చారు. ఇవి కొత్త సర్వే త్రైమాసికాలు; పాత బులెటిన్లు పట్టణాలకే, అందుకే ఇక్కడ చూపలేదు.')}
        limits={tr('what kind of work people have, or what it pays. "Current weekly status" means what a person did in the seven days before the survey.', 'ఎలాంటి పని, ఎంత జీతం అనేది. "ప్రస్తుత వారపు స్థితి" అంటే సర్వేకు ముందు ఏడు రోజుల్లో ఆ వ్యక్తి ఏం చేశారు.')}
        sources={[{ label: tr(jobSrc.release, 'పీఎల్ఎఫ్ఎస్ త్రైమాసిక బులెటిన్, ఏప్రిల్-జూన్ 2026, 2026 ఆగస్టు 10న విడుదల'), url: jobSrc.url }, { label: tr(`MoSPI data service, read ${read}`, `మోస్పి డేటా సేవ, ${read}న చదివాం`) }]}
        table={<NumTable head={[tr('Quarter', 'త్రైమాసికం'), tr('Andhra Pradesh', 'ఆంధ్రప్రదేశ్'), tr('All India', 'దేశమంతటా')]} rows={[...quarters].reverse().map(({ y, q }) => [qLabel(y, q), `${num(ur('andhra_pradesh', y, q), 1)}%`, `${num(ur('all_india', y, q), 1)}%`])} />}>
        <PairBars max={10} unit="%" rows={[...quarters].reverse().map(({ y, q }) => ({ key: `${y}${q}`, label: qLabel(y, q), ap: ur('andhra_pradesh', y, q), india: ur('all_india', y, q) }))} />
      </ChartFrame>

      <ChartFrame q={{ en: 'How fast are prices rising?', te: 'ధరలు ఎంత వేగంగా పెరుగుతున్నాయి?' }}
        sub={tr('Consumer price inflation, rural and urban together, against the same month a year earlier', 'వినియోగదారుల ధరల ద్రవ్యోల్బణం, గ్రామాలు పట్టణాలు కలిపి, ఏడాది క్రితం అదే నెలతో పోలిస్తే')}
        answer={tr(<>In {mLabel(lastM)}, prices in Andhra Pradesh were <b>{num(apNow.inflation, 2)}%</b> higher than a year earlier. This month is provisional.</>,
          <>{mLabel(lastM)}లో ఆంధ్రప్రదేశ్‌లో ధరలు ఏడాది క్రితం కంటే <b>{num(apNow.inflation, 2)}%</b> ఎక్కువ. ఈ నెల సంఖ్య తాత్కాలికం.</>)}
        how={tr('Each row is one month of 2026. The blue bar is Andhra Pradesh, the grey bar All India. A longer bar means prices rose faster. The striped month is provisional and may still change.', 'ప్రతి వరుస 2026లో ఒక నెల. నీలి బార్ ఆంధ్రప్రదేశ్, బూడిద బార్ దేశమంతటా. పొడవైన బార్ అంటే ధరలు వేగంగా పెరిగాయి. చారల నెల తాత్కాలికం, ఇంకా మారవచ్చు.')}
        example={tr('At 10% inflation, a basket of things that cost ₹100 a year ago costs ₹110 now.', '10% ద్రవ్యోల్బణం అంటే ఏడాది క్రితం ₹100 అయిన వస్తువులు ఇప్పుడు ₹110.')}
        note={tr('The index moved to a new base, 2024 = 100, from January 2025. MoSPI prints no yearly rate for 2025 on the new base, so the rates start in January 2026.', 'సూచీని జనవరి 2025 నుంచి కొత్త ఆధారానికి (2024 = 100) మార్చారు. కొత్త ఆధారంపై 2025కు మోస్పి వార్షిక రేటు ఇవ్వలేదు, అందుకే రేట్లు జనవరి 2026 నుంచి.')}
        limits={tr('which prices rose most, or how it differs by family. It is one figure for the whole state.', 'ఏ ధరలు ఎక్కువ పెరిగాయో, కుటుంబాల మధ్య తేడా. ఇది రాష్ట్రమంతటికీ ఒకే సంఖ్య.')}
        sources={[{ label: tr(cpiSrc.release, 'సెప్టెంబర్ 2026 సీపీఐ పత్రికా ప్రకటన, 2026 అక్టోబర్ 12న విడుదల (అనుబంధం III)'), url: cpiSrc.url }, { label: tr(`MoSPI data service, read ${read}`, `మోస్పి డేటా సేవ, ${read}న చదివాం`) }]}
        table={<NumTable head={[tr('Month', 'నెల'), tr('Andhra Pradesh', 'ఆంధ్రప్రదేశ్'), tr('All India', 'దేశమంతటా'), tr('Stage', 'దశ')]} rows={[...months].reverse().map((m) => [mLabel(m), `${num(cpi('andhra_pradesh', m)?.inflation, 2)}%`, `${num(cpi('all_india', m)?.inflation, 2)}%`, prov(m) ? tr('Provisional', 'తాత్కాలికం') : tr('Final', 'తుది')])} />}>
        <PairBars max={10} unit="%" rows={[...months].reverse().map((m) => ({ key: String(m), label: mLabel(m) + (prov(m) ? (te ? ' (తాత్కాలికం)' : ' (provisional)') : ''), ap: cpi('andhra_pradesh', m)?.inflation ?? null, india: cpi('all_india', m)?.inflation ?? null, hollow: prov(m) }))} />
      </ChartFrame>
    </div>
  )
}
