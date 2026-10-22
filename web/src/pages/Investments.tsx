import * as React from 'react'
import { Quote, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtByName, invest, meta, periods } from '@/lib/data'
import { clean, crore, croreTe, dateLong, dateShort, dateTe, num, MOU_STATUS, KIND_WORDS } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { CountBars } from '@/graphics/Counts'
import { cmName, periodName } from './Periods'
import { href } from '@/lib/route'
import { PromiseBoard } from '@/components/PromiseBoard'
import { Blank, ChartFrame, ExampleBox, KindBadge, ListenButton, PaperChip, Section } from '@/components/kit'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTokens } from '@/graphics/util'
import { motion } from 'motion/react'

const MOUS = invest.mous as any[]
const SECTOR: Record<string, string> = { manufacturing: 'Manufacturing', renewable_energy: 'Clean energy', it_tech: 'IT and technology', food_processing: 'Food processing', infrastructure: 'Infrastructure', pharma: 'Medicines', real_estate: 'Real estate' }
const STATUSES = Object.keys(MOU_STATUS).sort((a, b) => MOU_STATUS[a].order - MOU_STATUS[b].order)

const SECTOR_TE: Record<string, string> = { manufacturing: 'తయారీ', renewable_energy: 'పునరుత్పాదక శక్తి', it_tech: 'ఐటీ, సాంకేతికత', food_processing: 'ఆహార శుద్ధి', infrastructure: 'మౌలిక వసతులు', pharma: 'మందులు', real_estate: 'రియల్ ఎస్టేట్' }
const PER = periods.periods as { from: string; to: string | null; cm: string }[]
const inPer = (d: string | null | undefined, i: number) => !!d && d.slice(0, 10) >= PER[i].from && (!PER[i].to || d.slice(0, 10) <= PER[i].to!)
const tally = (xs: any[], key: (x: any) => string) => {
  const m = new Map<string, number>()
  xs.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export default function Investments() {
  const { lang, tr } = useLang()
  const [q, setQ] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [open, setOpen] = React.useState<any>(null)
  const notState = MOUS.filter((m) => m.source_tier !== 'government').length
  const list = MOUS.filter((m) => (kind === 'all' || m.source_tier === kind) && (!q || (m.company_name + ' ' + (m.district ?? '')).toLowerCase().includes(q.toLowerCase())))
  const byStatus = STATUSES.map((s) => [s, MOUS.filter((m) => m.status === s).length] as const).filter(([, n]) => n)
  const bySector = tally(MOUS, (m) => m.sector)
  const byDist = tally(MOUS, (m) => m.district ?? '')
  const ones = byDist.filter(([d, n]) => d && n === 1)
  const distRows = [...byDist.filter(([d, n]) => d && n > 1), ...(ones.length ? [['__ones', ones.length] as [string, number]] : []), ...byDist.filter(([d]) => !d)]
  const foreign = MOUS.filter((m) => m.is_foreign_investment).length
  const op = MOUS.filter((m) => m.status === 'operational').length
  const noDate = MOUS.filter((m) => !m.signed_date).length
  const pre = MOUS.filter((m) => m.signed_date && m.signed_date.slice(0, 10) < PER[0].from).length
  const st = (k: string) => MOUS.filter((m) => m.status === k).length
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Investment promises', 'పెట్టుబడి హామీలు')} q={{ en: 'Which company promises turned into investment?', te: 'ఏ పెట్టుబడి హామీలు నిజమయ్యాయి?' }}
        lede={tr(`A promise is not money spent. ${MOUS.length} promise records, each saying who reported it: the government, the company, or a newspaper.${notState > MOUS.length / 2 ? ` Most were reported by the company or a newspaper, not by the state: ${notState} of ${MOUS.length}.` : ''}`,
          `హామీ అంటే ఖర్చు చేసిన డబ్బు కాదు. ${MOUS.length} హామీ రికార్డులు; ప్రతిదానికీ ఎవరు చెప్పారో ఉంది: ప్రభుత్వం, కంపెనీ, లేదా పత్రిక.${notState > MOUS.length / 2 ? ` వీటిలో ${notState} కంపెనీ లేదా పత్రిక చెప్పినవి, రాష్ట్రం కాదు.` : ''}`)}>
        <div className="mt-5 flex flex-wrap items-center gap-3"><ListenButton /></div>
      </PageHead>
      <ExampleBox className="mt-6 max-w-3xl" madeUp={false}>{tr('Signing an MoU is like agreeing to buy a house. The money moves only when the sale happens. So this page shows each promise’s status, not a total of promises.', 'ఎంఓయూ సంతకం ఇల్లు కొనడానికి ఒప్పుకోవడం లాంటిది. అమ్మకం జరిగినప్పుడే డబ్బు చేతులు మారుతుంది. అందుకే ఈ పేజీ ప్రతి హామీ స్థితిని చూపుతుంది; హామీల మొత్తాన్ని కాదు.')}</ExampleBox>

      <Section className="mt-14" eyebrow={tr('The promises at a glance', 'హామీలు ఒక చూపులో')} title={tr('Counts of promise records, never their rupees', 'హామీ రికార్డుల లెక్కలు; వాటి రూపాయలు కాదు')}
        lede={<><b className="text-foreground">{tr('How to read: ', 'ఎలా చదవాలి: ')}</b>{tr('each bar counts promise records, on that panel’s own scale. ', 'ప్రతి బార్ హామీ రికార్డుల లెక్క, ఆ ప్యానెల్ సొంత కొలతపై. ')}<b className="text-foreground">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('how much money actually arrived. A promise is not money spent.', 'నిజంగా ఎంత డబ్బు వచ్చిందో. హామీ అంటే ఖర్చు చేసిన డబ్బు కాదు.')}</>}>
        <div className="grid gap-5 lg:grid-cols-3">
          <ChartFrame q={{ en: 'What became of the promises?', te: 'హామీలు ఏమయ్యాయి?' }}
            answer={tr(<><b>{op}</b> of the {MOUS.length} records are now reported operational; {st('stalled')} are stalled and {st('cancelled')} is cancelled.</>, <>{MOUS.length}లో <b>{op}</b> రికార్డులు నడుస్తున్నట్లు నమోదయ్యాయి; {st('stalled')} నిలిచిపోయాయి, {st('cancelled')} రద్దయింది.</>)}
            note={tr('By the status the newest report gives.', 'తాజా నివేదిక ఇచ్చిన స్థితి ప్రకారం.')} sources={[{ label: tr('Our register of promise records', 'మా హామీ రికార్డుల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="9rem" rows={byStatus.map(([s, n]) => ({ key: s, n, label: (MOU_STATUS[s] ?? { en: s, te: s })[lang] }))} />
          </ChartFrame>
          <ChartFrame q={{ en: 'Which sectors are they in?', te: 'ఏ రంగాల్లో ఉన్నాయి?' }}
            answer={tr(<>{bySector.slice(0, 3).map(([k, n], i) => <span key={k}>{i ? ', ' : ''}{SECTOR[k] ?? k} {n}</span>)}.</>, <>{bySector.slice(0, 3).map(([k, n], i) => <span key={k}>{i ? ', ' : ''}{SECTOR_TE[k] ?? k} {n}</span>)}.</>)}
            note={tr(`Records by sector. ${foreign} records are foreign investors.`, `రంగాల వారీగా రికార్డులు. ${foreign} రికార్డులు విదేశీ పెట్టుబడిదారులవి.`)} sources={[{ label: tr('Our register of promise records', 'మా హామీ రికార్డుల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="9rem" color="var(--ink2)" rows={bySector.map(([k, n]) => ({ key: k, n, label: lang === 'te' ? SECTOR_TE[k] ?? k : SECTOR[k] ?? k }))} />
          </ChartFrame>
          <ChartFrame q={{ en: 'Which districts are named?', te: 'ఏ జిల్లాల పేర్లు ఉన్నాయి?' }}
            answer={tr(<>{byDist.filter(([d]) => d).slice(0, 3).map(([d, n], i) => <span key={d}>{i ? ', ' : ''}{d} {n}</span>)}; {byDist.find(([d]) => !d)?.[1] ?? 0} records name no district.</>, <>{byDist.filter(([d]) => d).slice(0, 3).map(([d, n], i) => <span key={d}>{i ? ', ' : ''}<span lang="en">{d}</span> {n}</span>)}; {byDist.find(([d]) => !d)?.[1] ?? 0} రికార్డుల్లో జిల్లా పేరు లేదు.</>)}
            note={ones.length ? tr(<>Sorted by count. {ones.map(([d]) => d).join(', ')} have 1 each.</>, <>లెక్క ప్రకారం వరుస. {ones.map(([d]) => districtByName.get(d)?.te ?? d).join(', ')}: ఒక్కొక్కటి.</>) : undefined}
            sources={[{ label: tr('Our register of promise records', 'మా హామీ రికార్డుల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="9rem" color="var(--ink2)" rows={distRows.map(([d, n]) => ({ key: d || 'none', n: d === '__ones' ? 1 : n, text: d === '__ones' ? tr(`1 each`, 'ఒక్కొక్కటి') : undefined, label: d === '__ones' ? tr(`${n} districts`, `${n} జిల్లాలు`) : d ? <span lang="en">{d}</span> : tr('No district named', 'జిల్లా పేరు లేదు') }))} />
          </ChartFrame>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">{tr('Never on this page: rupees or jobs added up across promises. Each promise keeps its own figure and its reporter.', 'ఈ పేజీలో ఎప్పుడూ ఉండనివి: హామీల రూపాయలు గానీ ఉద్యోగాలు గానీ కలిపిన మొత్తాలు. ప్రతి హామీకి దాని సంఖ్య, చెప్పినవారు మాత్రమే.')}</p>
      </Section>

      <Section className="mt-14" eyebrow={tr('By period', 'కాలాల వారీగా')} title={tr('How many promises were signed in each period?', 'ప్రతి కాలంలో ఎన్ని హామీలు సంతకమయ్యాయి?')}>
        <div className="grid gap-3 md:grid-cols-3">
          {PER.map((p, i) => {
            const signed = MOUS.filter((m) => inPer(m.signed_date, i))
            return (
              <a key={p.from} href={href('governments')} className="rounded-2xl border border-border bg-card p-4 hover:border-foreground/30">
                <div className={cn('h-1.5 w-12 rounded-full', ['bg-foreground/[0.12]', 'bg-foreground/[0.3]', 'bg-foreground/[0.6]'][i])} aria-hidden />
                <div className="mt-2.5 text-[15px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{periodName(i, lang)}</div>
                <div className="text-[13px] text-muted-foreground">{tr('Chief Minister', 'ముఖ్యమంత్రి')} <span lang={lang === 'te' ? 'te' : 'en'}>{cmName(p.cm, lang)}</span></div>
                <div className="mt-3 font-heading text-[30px] font-semibold leading-none tnum">{signed.length}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">{tr(`promise records signed · ${signed.filter((m) => m.status === 'operational').length} now reported operational`, `సంతకమైన హామీ రికార్డులు · ${signed.filter((m) => m.status === 'operational').length} ఇప్పుడు నడుస్తున్నాయి`)}</div>
              </a>
            )
          })}
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground"><b className="text-foreground/85">{tr('How to read it: ', 'ఎలా చదవాలి: ')}</b>{tr('each card is one period, named by its dates and Chief Minister, with the promise records signed in it and how many are now reported operational. ', 'ప్రతి కార్డు ఒక కాలం, తేదీలు, ముఖ్యమంత్రి పేరుతో; అందులో సంతకమైన హామీ రికార్డులు, ఇప్పుడు నడుస్తున్నవి. ')}<b className="text-foreground/85">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr(`who brought a project in; a promise signed in one period may open in the next. ${noDate} records carry no signing date and ${pre} were signed before June 2014.`, `ప్రాజెక్టును ఎవరు తెచ్చారో; ఒక కాలంలో సంతకమైన హామీ తర్వాతి కాలంలో మొదలవ్వవచ్చు. ${noDate} రికార్డులకు సంతకం తేదీ లేదు, ${pre} 2014 జూన్‌కు ముందువి.`)}</p>
      </Section>

      <Section className="mt-14" eyebrow={tr('Every promise, at a glance', 'ప్రతి హామీ ఒక చూపులో')} title={tr('How big each promise is, and how far it has got', 'ప్రతి హామీ ఎంత పెద్దది, ఎంత దూరం వచ్చింది')}>
        <ChartFrame q={{ en: 'Where does each promise stand, and who reported it?', te: 'ప్రతి హామీ ఎక్కడ ఉంది, ఎవరు చెప్పారు?' }}
          how={tr('Each row is one promise: the company, who reported it, and the amount it claims, printed at the end of its bar. Promises are grouped by the stage they have reached. All bars share one scale, marked at the top of each group, so a longer bar is a bigger claim. A dark bar is a government record; a grey bar is what the company or a newspaper says, and the label beside each name says which. Tap a row to open it.',
            'ప్రతి వరుస ఒక హామీ: కంపెనీ పేరు, ఎవరు చెప్పారు, అది చెప్పిన మొత్తం; మొత్తాన్ని బార్ చివర ముద్రించాం. హామీలు అవి చేరిన దశ వారీగా గుంపులుగా ఉన్నాయి. అన్ని బార్లూ ఒకే కొలతపై ఉన్నాయి; ప్రతి గుంపు పైన కొలత గుర్తులు ఉన్నాయి. పొడవైన బార్ అంటే పెద్ద హామీ. ముదురు బార్ ప్రభుత్వ రికార్డు; బూడిద బార్ కంపెనీ లేదా పత్రిక చెప్పినది; ఎవరో ప్రతి పేరు పక్కన రాశాం. తెరవడానికి వరుసను నొక్కండి.')}
          note={tr('Most promises are small next to the biggest few, so their bars are short. Every amount is printed beside its bar.', 'పెద్ద హామీల పక్కన చాలా హామీలు చిన్నవి, అందుకే వాటి బార్లు పొట్టిగా ఉంటాయి. ప్రతి మొత్తాన్నీ దాని బార్ పక్కన ముద్రించాం.')}
          limits={tr('whether the money claimed was ever spent. Bars are what each reporter claimed, side by side, never added.', 'చెప్పిన డబ్బు నిజంగా ఖర్చయిందో. బార్లు ఒక్కొక్కరు చెప్పినవే, పక్కపక్కనే; ఎప్పుడూ కలపం.')}
          sub={tr(`${MOUS.length} promises in our register`, `మా రిజిస్టర్‌లో ${MOUS.length} హామీలు`)} sources={[{ label: tr('Company announcements, newspapers and state papers, as each card names', 'కంపెనీ ప్రకటనలు, పత్రికలు, రాష్ట్ర పత్రాలు; ఒక్కో కార్డు తన ఆధారాన్ని చూపుతుంది') }]}>
          <PromiseBoard mous={MOUS} onOpen={setOpen} />
          <div className="mt-3 rounded-lg border border-dashed border-foreground/30 px-3 py-2 text-[13px] text-muted-foreground">{tr('The newest promise in our register is from November 2025. The state’s investment board has approved more in 2026, for example on 12 August and 18 September 2026; they are not added here yet.', 'మా రిజిస్టర్‌లో తాజా హామీ 2025 నవంబర్‌ది. రాష్ట్ర పెట్టుబడి బోర్డు 2026లో మరిన్ని ఆమోదించింది, ఉదా: 2026 ఆగస్టు 12, సెప్టెంబర్ 18; అవి ఇంకా ఇక్కడ చేర్చలేదు.')}</div>
        </ChartFrame>
      </Section>

      <Section className="mt-14" eyebrow={tr('Every promise', 'ప్రతి హామీ')} title={tr('Search a company or a district', 'కంపెనీ లేదా జిల్లా వెతకండి')}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Company or district', 'కంపెనీ లేదా జిల్లా')} className="h-10 pl-9" /></div>
          <ToggleGroup type="single" value={kind} onValueChange={(v) => setKind(v || 'all')} variant="outline">
            <ToggleGroupItem value="all">{tr('All', 'అన్నీ')}</ToggleGroupItem>
            <ToggleGroupItem value="government">{tr('State', 'రాష్ట్రం')}</ToggleGroupItem>
            <ToggleGroupItem value="company">{tr('Company', 'కంపెనీ')}</ToggleGroupItem>
            <ToggleGroupItem value="press">{tr('Newspaper', 'పత్రిక')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => <MouCard key={m.id} m={m} onOpen={() => setOpen(m)} />)}
        </div>
      </Section>

      <Section className="mt-20" eyebrow={tr('Summits', 'సదస్సులు')} title={tr('What did each investment summit announce?', 'ప్రతి పెట్టుబడి సదస్సు ఏం ప్రకటించింది?')} te={tr('సదస్సుల్లో ప్రకటించినవి', undefined)}
        lede={<><b className="text-foreground">{tr('How to read: ', 'ఎలా చదవాలి: ')}</b>{tr('each card is one summit’s own figures, quoted from the state’s statement, in a dashed box because they are announcements. They are never added together. ', 'ప్రతి కార్డు ఒక సదస్సు సొంత అంకెలు, రాష్ట్ర ప్రకటన నుంచి; అవి ప్రకటనలు కాబట్టి గీతల పెట్టెలో. వాటిని ఎప్పుడూ కలపం. ')}<b className="text-foreground">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('how many of these MoUs became investment on the ground.', 'వీటిలో ఎన్ని ఎంఓయూలు నిజంగా పెట్టుబడిగా మారాయో.')}</>}>
        <div className="grid gap-4 md:grid-cols-2">
          {invest.summits.map((s: any) => (
            <article key={s.key} className="rounded-xl border border-border bg-card p-5">
              <div className="text-[13px] text-muted-foreground">{lang === 'te' ? `${districtByName.get(s.city)?.te ?? s.city} · ${dateTe(s.start_date)}` : `${s.city} · ${dateLong(s.start_date)}`}</div>
              <h3 className="mt-1 text-[19px] font-semibold" lang="en">{s.name}</h3>
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-dashed border-foreground/30 p-3">
                <div><div className="font-heading text-[20px] font-semibold tnum">{s.mou_count != null ? num(s.mou_count, 0) : tr('Not stated', 'చెప్పలేదు')}</div><div className="text-[12px] text-muted-foreground">{tr('MoUs, as stated', 'ఎంఓయూలు, చెప్పినట్లు')}</div></div>
                <div className="col-span-2"><div className="font-heading text-[20px] font-semibold tnum">{s.investment_crore != null ? (lang === 'te' ? croreTe(s.investment_crore, 0) : crore(s.investment_crore, 0)) : tr('Not stated', 'చెప్పలేదు')}</div><div className="text-[12px] text-muted-foreground">{tr('Investment, as stated', 'పెట్టుబడి, చెప్పినట్లు')}</div></div>
              </div>
              {s.quote ? <blockquote className="mt-4 border-l-2 border-foreground/30 pl-3 text-[14.5px] leading-relaxed text-foreground/85" lang="en"><Quote className="mb-1 size-4 text-muted-foreground" />{clean(s.quote)}</blockquote> : null}
              <div className="mt-3"><PaperChip label={tr('The paper with these words', 'ఈ మాటలున్న పత్రం')} url={s.source_url} /></div>
            </article>
          ))}
        </div>
      </Section>

      <Section className="mt-20" eyebrow={tr('Year by year', 'ఏడాది వారీగా')} title={tr('How much investment did the state say had started, year by year?', 'ఏడాది వారీగా ఎంత పెట్టుబడి మొదలైందని రాష్ట్రం చెప్పింది?')}
        lede={<><b className="text-foreground">{tr('In plain words: ', 'తేలిక మాటల్లో: ')}</b>{tr('the state’s papers call this “grounded” investment, meaning work has started on the site. The state counted this differently in different years, so the rows are not a scoreboard. Years with nothing published say so.', 'రాష్ట్ర పత్రాలు దీన్ని “గ్రౌండెడ్” పెట్టుబడి అంటాయి, అంటే స్థలంలో పని మొదలైంది. రాష్ట్రం వేర్వేరు ఏళ్లలో దీన్ని వేర్వేరుగా లెక్కించింది; కాబట్టి ఈ వరుసలు స్కోరుబోర్డు కావు. ఏమీ ప్రచురించని ఏళ్లు ఆ విషయమే చెబుతాయి.')}</>}>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {invest.by_year.map((y: any) => (
            <div key={y.year} className="grid gap-2 px-4 py-4 md:grid-cols-[110px_1fr]">
              <div className="font-heading text-[18px] font-semibold tnum">{y.year}</div>
              {y.quote ? (
                <div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                    {y.investment_crore != null ? <span><b className="tnum">{lang === 'te' ? croreTe(y.investment_crore, 0) : crore(y.investment_crore, 0)}</b> <span className="text-muted-foreground">{tr('as stated', 'చెప్పినట్లు')}</span></span> : null}
                    {y.employment != null ? <span><b className="tnum">{num(y.employment, 0)}</b> <span className="text-muted-foreground">{tr('jobs, as stated', 'ఉద్యోగాలు, చెప్పినట్లు')}</span></span> : null}
                  </div>
                  {y.basis ? <div className="mt-1 text-[13px] text-muted-foreground" lang="en">{tr('Basis: ', 'ఆధారం: ')}{clean(y.basis)}</div> : null}
                  <blockquote className="mt-2 text-[14px] leading-relaxed text-foreground/80" lang="en">&ldquo;{clean(y.quote)}&rdquo;</blockquote>
                  <div className="mt-2"><PaperChip label={y.source_publisher ?? 'The paper'} url={y.source_url} /></div>
                </div>
              ) : <Blank kind={y.missing_kind === 'unchecked' ? 'notRead' : 'notPublished'} />}
            </div>
          ))}
        </div>
      </Section>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open ? (
            <>
              <DialogHeader><DialogTitle className="text-xl">{open.company_name}</DialogTitle><DialogDescription>{SECTOR[open.sector] ?? open.sector} · {open.district ?? 'District not named'}</DialogDescription></DialogHeader>
              <MouBody m={open} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

const WHO_TE: Record<string, string> = { government: 'రాష్ట్ర రికార్డులోని పెట్టుబడి', gov: 'రాష్ట్ర రికార్డులోని పెట్టుబడి', company: 'కంపెనీ చెప్పిన పెట్టుబడి', press: 'పత్రిక చెప్పిన పెట్టుబడి' }

function MouBody({ m }: { m: any }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><KindBadge kind={m.source_tier} /><span className="rounded-full border border-border px-2 py-0.5 text-[12.5px]">{(te ? MOU_STATUS[m.status]?.te : MOU_STATUS[m.status]?.en) ?? m.status}</span></div>
      <div><div className="font-heading text-[26px] font-semibold tnum">{m.investment_crore != null ? (te ? croreTe(m.investment_crore, 0) : crore(m.investment_crore, 0)) : tr('No figure', 'సంఖ్య లేదు')}</div><div className="text-[13px] text-muted-foreground">{te
        ? `${WHO_TE[m.source_tier] ?? WHO_TE.government}${m.expected_employment ? ` · ${num(m.expected_employment, 0)} ఉద్యోగాలు అని చెప్పారు` : ''}`
        : `Investment ${KIND_WORDS[m.source_tier]?.en.toLowerCase().replace(' says', ' claims').replace('government record', 'in the state record')}${m.expected_employment ? ` · ${num(m.expected_employment, 0)} jobs claimed` : ''}`}</div></div>
      <div className="text-[13.5px] text-muted-foreground">{m.signed_date ? tr(`Signed ${dateShort(m.signed_date)}`, `${dateTe(m.signed_date)}న సంతకం`) : tr('Date not stated in the paper', 'పత్రంలో తేదీ లేదు')}{m.summit_name ? <> · <span lang="en">{m.summit_name}</span></> : ''}</div>
      <div className="text-[13px] text-muted-foreground">{clean(m.source_label)}</div>
    </div>
  )
}

function MouCard({ m, onOpen }: { m: any; onOpen: () => void }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  return (
    <button type="button" onClick={onOpen} className={cn('flex flex-col rounded-xl border bg-card p-4 text-left hover:border-foreground/40', m.source_tier === 'press' ? 'border-dashed border-foreground/30' : m.source_tier === 'company' ? 'border-dotted border-foreground/35' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2"><KindBadge kind={m.source_tier} /><span className="text-[12.5px] text-muted-foreground">{te ? MOU_STATUS[m.status]?.te : MOU_STATUS[m.status]?.en}</span></div>
      <div className="mt-2 text-[16px] font-semibold leading-snug">{m.company_name}</div>
      <div className="text-[13px] text-muted-foreground">{(te ? SECTOR_TE[m.sector] : SECTOR[m.sector]) ?? m.sector} · {m.district ? (te ? districtByName.get(m.district)?.te ?? m.district : m.district) : tr('District not named', 'జిల్లా పేరు లేదు')}</div>
      <div className="mt-3 font-heading text-[20px] font-semibold tnum">{m.investment_crore != null ? (te ? croreTe(m.investment_crore, 0) : crore(m.investment_crore, 0)) : tr('No figure', 'సంఖ్య లేదు')}</div>
      <div className="text-[12px] text-muted-foreground">{tr('claimed', 'చెప్పినది')}{m.signed_date ? ` · ${te ? dateTe(m.signed_date) : dateShort(m.signed_date)}` : ''}</div>
    </button>
  )
}

/** Signature graphic E: one mark per MoU, grouped by status, outlined by who reported it. */
export function Units({ onOpen }: { onOpen: (m: any) => void }) {
  const C = useTokens()
  const { lang, tr } = useLang()
  const te = lang === 'te'
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
      {STATUSES.map((s) => {
        const ms = MOUS.filter((m) => m.status === s)
        return (
          <div key={s}>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-1.5"><span className="text-[14px] font-semibold">{te ? MOU_STATUS[s].te : MOU_STATUS[s].en}</span><span className="font-heading text-[18px] font-semibold tnum">{ms.length}</span></div>
            <div className="flex flex-wrap gap-2">
              {ms.map((m, i) => (
                <motion.button key={m.id} type="button" title={m.company_name} onClick={() => onOpen(m)}
                  initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                  className="size-9 rounded-lg focus-visible:outline-2"
                  style={m.source_tier === 'government' ? { background: C.fg } : { background: C.bg, border: `2.4px ${m.source_tier === 'press' ? 'dashed' : 'dotted'} ${C.ink2}` }}
                  aria-label={`${m.company_name}, ${te ? KIND_WORDS[m.source_tier].te : KIND_WORDS[m.source_tier].en}`} />
              ))}
              {!ms.length ? <span className="text-[13px] text-muted-foreground">{tr('None', 'ఏమీ లేవు')}</span> : null}
            </div>
          </div>
        )
      })}
      <div className="col-span-full flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-foreground" />{tr('State record', 'రాష్ట్ర రికార్డు')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-dotted border-foreground/60" />{tr('Company says', 'కంపెనీ చెబుతోంది')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-dashed border-foreground/60" />{tr('Newspaper says', 'పత్రిక చెబుతోంది')}</span>
      </div>
    </div>
  )
}
