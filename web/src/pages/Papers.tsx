import * as React from 'react'
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, FileText, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { meta } from '@/lib/data'
import { papers, registerPapers, tenders, updates } from '@/lib/data-papers'
import { clean, dateLong, dateShort, dateTe, istDay, num, TODAY } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { Blank, ChartFrame, ListenButton, PaperChip, Section } from '@/components/kit'
import { CountBars, YearColumns } from '@/graphics/Counts'
import { SourceHealth } from './More'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

/* ================================================================ papers */
// The register, as the live site holds it, less the papers this preview leaves
// out: 218 that look like voter-roll parts and 21 lists that name private people.
const REG = registerPapers.items as { id: number; t: string; k: string; y: number | null; o: string; portal: string; u: string; d: string | null; ref: string | null }[]
const LEFT = registerPapers.left_out as { roll_like: number; roll_like_offices: string[]; name_lists: number }

const KIND: Record<string, { en: string; te: string }> = {
  budget: { en: 'Budget books', te: 'బడ్జెట్ పుస్తకాలు' },
  assembly_bill: { en: 'Assembly bills', te: 'శాసనసభ బిల్లులు' },
  other: { en: 'Other papers (mostly district collectorates)', te: 'ఇతర పత్రాలు (ఎక్కువగా జిల్లా కలెక్టరేట్లు)' },
  audit_report: { en: 'Audit reports', te: 'ఆడిట్ నివేదికలు' },
  policy: { en: 'Policies', te: 'విధానాలు' },
  annual_report: { en: 'Annual reports', te: 'వార్షిక నివేదికలు' },
  press_release: { en: 'Press releases', te: 'పత్రికా ప్రకటనలు' },
  government_order: { en: 'Government orders', te: 'ప్రభుత్వ ఉత్తర్వులు' },
  white_paper: { en: 'White papers', te: 'శ్వేతపత్రాలు' },
}
const office = (o: string) => o
  .replace(/^XV \(2019 - 2024\) Assembly$/, 'Legislative Assembly, 2019 to 2024 (XV)')
  .replace(/^XIV \(2014 - 2019\) Assembly$/, 'Legislative Assembly, 2014 to 2019 (XIV)')
  .replace(/^XVI Assembly$/, 'Legislative Assembly, from 2024 (XVI)')
  .replace(/Comptroller and Auditor General of India/, 'Comptroller and Auditor General')
  .replace(/ District Collectorate$/, ' Collectorate')

const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1])
const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>()
  xs.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const KINDS = count(REG, (p) => p.k)
const YEARS = count(REG, (p) => (p.y == null ? 'none' : String(p.y))).sort((a, b) => (a[0] === 'none' ? 1 : b[0] === 'none' ? -1 : Number(a[0]) - Number(b[0])))
const OFFICES = count(REG, (p) => p.o)

export default function Papers() {
  const { lang, tr } = useLang()
  const [q, setQ] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [year, setYear] = React.useState('all')
  const [off, setOff] = React.useState('all')
  const [page, setPage] = React.useState(0)
  const per = 12
  const rows = React.useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return REG.filter((p) => (kind === 'all' || p.k === kind) && (year === 'all' || String(p.y ?? 'none') === year) && (off === 'all' || p.o === off)
      && words.every((w) => (p.t + ' ' + p.o).toLowerCase().includes(w)))
      .sort((a, b) => String(b.d ?? b.y ?? '').localeCompare(String(a.d ?? a.y ?? '')))
  }, [q, kind, year, off])
  React.useEffect(() => setPage(0), [q, kind, year, off])
  const filtered = q || kind !== 'all' || year !== 'all' || off !== 'all'
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const lib = papers.documents as any[]
  const libRead = lib.filter((d) => d.verified).length
  const libKinds = count(lib, (d) => d.doc_type ?? 'Other')
  const top14 = OFFICES.slice(0, 14)
  const rest = OFFICES.slice(14)
  const YRS = YEARS.filter(([y]) => y !== 'none').map(([y]) => Number(y))
  const missingYears: number[] = []
  for (let y = YRS[0]; y <= YRS[YRS.length - 1]; y++) if (!YRS.includes(y)) missingYears.push(y)
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Government papers', 'ప్రభుత్వ పత్రాలు')} q={{ en: 'Every government paper we hold, in one place', te: 'మా దగ్గర ఉన్న ప్రతి ప్రభుత్వ పత్రం, ఒకే చోట' }}
        lede={tr(`${num(REG.length, 0)} papers from ${OFFICES.length} offices. Each one links to the government page it came from. Search by what a paper is about, then narrow by kind, year and office.`,
          `${OFFICES.length} కార్యాలయాల నుంచి ${num(REG.length, 0)} పత్రాలు. ప్రతిదీ అది వచ్చిన ప్రభుత్వ పేజీకి లింకు. పత్రం దేని గురించో వెతకండి, తర్వాత రకం, సంవత్సరం, కార్యాలయంతో తగ్గించండి.`)} />
      <div className="mt-6 max-w-3xl rounded-xl border border-dashed border-foreground/35 bg-card px-4 py-3 text-[14px] leading-relaxed">
        <b>{tr('Preview note: ', 'ప్రివ్యూ గమనిక: ')}</b>{tr(`the live register holds ${num(registerPapers.total_live, 0)} papers. This preview leaves out ${LEFT.roll_like} that look like voter-roll parts (from the ${joinAnd(LEFT.roll_like_offices.map((o) => o.replace(/ District Collectorate$/, '')))} collectorates) and ${LEFT.name_lists} lists that name private people, as the plan recommends. They stay on the live site until you say “go remove”.`,
          `లైవ్ రిజిస్టర్‌లో ${num(registerPapers.total_live, 0)} పత్రాలు ఉన్నాయి. ప్రణాళిక సూచించినట్లు, ఓటర్ల జాబితా భాగాల్లా కనిపించే ${LEFT.roll_like} పత్రాలను, వ్యక్తుల పేర్లున్న ${LEFT.name_lists} జాబితాలను ఈ ప్రివ్యూ చూపదు. మీరు “తీసేయండి” అనే వరకు అవి లైవ్ సైట్‌లో ఉంటాయి.`)}
      </div>

      {/* find a paper */}
      <section className="mt-10" aria-labelledby="find">
        <h2 id="find" className="text-[20px] font-semibold">{tr('Find a paper', 'పత్రం వెతకండి')}</h2>
        <div className="relative mt-3 max-w-2xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('What a paper is about: hospital land, school buildings, drinking water', 'పత్రం దేని గురించి: ఆసుపత్రి భూమి, బడి భవనాలు, తాగునీరు')} className="h-12 pl-11 text-[16px]" aria-label={tr('Search the papers', 'పత్రాలు వెతకండి')} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-10 w-[220px]" aria-label={tr('Kind', 'రకం')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{tr('All kinds', 'అన్ని రకాలు')}</SelectItem>{KINDS.map(([k, n]) => <SelectItem key={k} value={k}>{(KIND[k] ?? { en: k, te: k })[lang]} ({n})</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-10 w-[150px]" aria-label={tr('Year', 'సంవత్సరం')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{tr('All years', 'అన్ని ఏళ్లు')}</SelectItem>{[...YEARS].reverse().map(([y, n]) => <SelectItem key={y} value={y}>{y === 'none' ? tr('No year', 'సంవత్సరం లేదు') : y} ({n})</SelectItem>)}</SelectContent>
          </Select>
          <Select value={off} onValueChange={setOff}>
            <SelectTrigger className="h-10 w-[260px] max-w-full" aria-label={tr('Office', 'కార్యాలయం')}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80"><SelectItem value="all">{tr('All offices', 'అన్ని కార్యాలయాలు')}</SelectItem>{OFFICES.map(([o, n]) => <SelectItem key={o} value={o}>{office(o)} ({n})</SelectItem>)}</SelectContent>
          </Select>
          {filtered ? <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setQ(''); setKind('all'); setYear('all'); setOff('all') }}><X className="size-4" />{tr('Clear', 'తీసేయండి')}</Button> : null}
          <span className="ml-auto text-[13.5px] text-muted-foreground tnum">{tr(`${num(rows.length, 0)} of ${num(REG.length, 0)}`, `${num(REG.length, 0)}లో ${num(rows.length, 0)}`)}</span>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">{tr('Search finds a paper by its subject, not by a scheme’s brand name, so every period’s papers come up together. Newest first.', 'పథకం పేరుతో కాకుండా విషయంతో వెతుకుతుంది; అందుకే అన్ని కాలాల పత్రాలు కలిసి వస్తాయి. కొత్తవి ముందు.')}</p>
        <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
          {rows.slice(page * per, page * per + per).map((p) => (
            <li key={p.id}>
              <a href={p.u} target="_blank" rel="noopener noreferrer" className="flex h-full gap-3 rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="line-clamp-3 text-[14.5px] font-medium leading-snug" lang="en">{clean(p.t)}</span>
                  <span className="mt-1 block text-[12.5px] text-muted-foreground">{(KIND[p.k] ?? { en: p.k, te: p.k })[lang].replace(/ \(.*\)$/, '')} · <span lang="en">{office(p.o)}</span> · {p.d ? (lang === 'te' ? `${dateTe(p.d)}న ప్రచురణ` : `published ${dateShort(p.d)}`) : p.y ? tr(`year ${p.y}`, `సంవత్సరం ${p.y}`) : tr('no year', 'సంవత్సరం లేదు')}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground/80">{tr('Open on ', '')}<span lang="en">{clean(p.portal.replace(/^.*\((.*)\)$/, '$1'))}</span>{tr('', 'లో తెరవండి')}<ArrowUpRight className="size-3.5" /></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {!rows.length ? <Blank kind="notRead" className="mt-4">{tr('Nothing matches that search', 'ఆ వెతుకుకు ఏదీ సరిపోలలేదు')}</Blank> : null}
        {rows.length > per ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((x) => x - 1)} aria-label={tr('Previous page', 'ముందు పేజీ')}><ChevronLeft className="size-4" /></Button>
            <span className="text-[13.5px] text-muted-foreground tnum">{tr(`Page ${page + 1} of ${pages}`, `${pages}లో పేజీ ${page + 1}`)}</span>
            <Button variant="outline" size="icon" disabled={page >= pages - 1} onClick={() => setPage((x) => x + 1)} aria-label={tr('Next page', 'తర్వాతి పేజీ')}><ChevronRight className="size-4" /></Button>
          </div>
        ) : null}
        <p className="mt-4 text-[13px] text-muted-foreground">{tr(`Telugu titles: waiting. No paper has a Telugu title yet. When they come, each is marked as a translation and the original title stays one tap away.`, 'తెలుగు శీర్షికలు: ఇంకా రాలేదు. ఏ పత్రానికీ ఇంకా తెలుగు శీర్షిక లేదు. వచ్చినప్పుడు ప్రతిదాన్నీ అనువాదంగా గుర్తిస్తాం; అసలు శీర్షిక ఒక్క నొక్కుతో కనిపిస్తుంది.')}</p>
      </section>

      {/* the register at a glance */}
      <Section className="mt-16" eyebrow={tr('The papers at a glance', 'పత్రాలు ఒక చూపులో')} title={tr('Counts of papers, not money', 'పత్రాల లెక్కలు, డబ్బు కాదు')}>
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame q={{ en: 'What kinds of papers are in the register?', te: 'రిజిస్టర్‌లో ఏ రకాల పత్రాలు ఉన్నాయి?' }}
            answer={tr(<>The largest groups: budget books ({KINDS.find(([k]) => k === 'budget')?.[1]}), Assembly bills ({KINDS.find(([k]) => k === 'assembly_bill')?.[1]}) and other papers, mostly from district collectorates ({KINDS.find(([k]) => k === 'other')?.[1]}).</>,
              <>పెద్ద వర్గాలు: బడ్జెట్ పుస్తకాలు ({KINDS.find(([k]) => k === 'budget')?.[1]}), శాసనసభ బిల్లులు ({KINDS.find(([k]) => k === 'assembly_bill')?.[1]}), ఇతర పత్రాలు, ఎక్కువగా జిల్లా కలెక్టరేట్ల నుంచి ({KINDS.find(([k]) => k === 'other')?.[1]}).</>)}
            how={tr('Each bar is one kind of paper, on one scale. A longer bar means more papers. Tap a bar to list those papers above.', 'ప్రతి బార్ ఒక రకం పత్రం, ఒకే కొలతపై. పొడవైన బార్ అంటే ఎక్కువ పత్రాలు. బార్‌ను నొక్కితే ఆ పత్రాలు పైన జాబితాలో వస్తాయి.')}
            limits={tr('how much a paper matters. One budget volume and one land notice each count as one.', 'పత్రం ఎంత ముఖ్యమో. ఒక బడ్జెట్ సంపుటం, ఒక భూమి నోటీసు రెండూ ఒక్కొక్కటిగానే లెక్క.')}
            sources={[{ label: tr('Our register of papers', 'మా పత్రాల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars rows={KINDS.map(([k, n]) => ({ key: k, label: <span lang={lang === 'te' ? 'te' : undefined}>{(KIND[k] ?? { en: k, te: k })[lang]}</span>, n, active: kind === k, onClick: () => { setKind(kind === k ? 'all' : k); document.getElementById('find')?.scrollIntoView({ behavior: 'smooth' }) } }))} />
          </ChartFrame>
          <ChartFrame q={{ en: 'Which years do the papers come from?', te: 'పత్రాలు ఏ సంవత్సరాలవి?' }}
            answer={tr(<>Every year from {YRS[0]} to {YRS[YRS.length - 1]}{missingYears.length ? <> except {missingYears.join(', ')}</> : null}. {YRS[YRS.length - 1]} holds {YEARS.find(([y]) => y === String(YRS[YRS.length - 1]))?.[1]} papers.</>,
              <>{YRS[0]} నుంచి {YRS[YRS.length - 1]} వరకు ప్రతి సంవత్సరం{missingYears.length ? <>, {missingYears.join(', ')} తప్ప</> : null}. {YRS[YRS.length - 1]}లో {YEARS.find(([y]) => y === String(YRS[YRS.length - 1]))?.[1]} పత్రాలు.</>)}
            how={tr('Each column is a year; its height is the number of papers carrying that year. The hollow column at the end holds papers with no year.', 'ప్రతి నిలువు వరుస ఒక సంవత్సరం; దాని ఎత్తు ఆ సంవత్సరం ఉన్న పత్రాల సంఖ్య. చివరి ఖాళీ వరుసలో సంవత్సరం లేని పత్రాలు.')}
            limits={tr('when a paper was published. The year is the one the paper carries, often its financial year.', 'పత్రం ఎప్పుడు ప్రచురించారో. ఇది పత్రంలో ఉన్న సంవత్సరం, తరచూ ఆర్థిక సంవత్సరం.')}
            sources={[{ label: tr('Our register of papers', 'మా పత్రాల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <YearColumns rows={YEARS.map(([y, n]) => ({ label: y === 'none' ? tr('None', 'లేదు') : y, n, hollow: y === 'none' }))} />
          </ChartFrame>
          <ChartFrame className="lg:col-span-2" q={{ en: 'Which offices do the papers come from?', te: 'పత్రాలు ఏ కార్యాలయాల నుంచి వచ్చాయి?' }}
            answer={tr(<>{OFFICES.length} offices. The AP Finance Department’s budget books are the largest group ({OFFICES[0][1]}), then the Assembly’s bills, by Assembly term.</>, <>{OFFICES.length} కార్యాలయాలు. ఏపీ ఆర్థిక శాఖ బడ్జెట్ పుస్తకాలు అతి పెద్ద వర్గం ({OFFICES[0][1]}), తర్వాత శాసనసభ బిల్లులు, సభా కాలం వారీగా.</>)}
            how={tr('Sorted from most papers to fewest. The bars share one scale. Tap an office to list its papers above.', 'ఎక్కువ నుంచి తక్కువకు వరుస. బార్లన్నీ ఒకే కొలతపై. కార్యాలయాన్ని నొక్కితే దాని పత్రాలు పైన వస్తాయి.')}
            note={tr(<>{rest.length} more offices hold {Math.min(...rest.map(([, n]) => n))} to {Math.max(...rest.map(([, n]) => n))} papers each.</>, <>మరో {rest.length} కార్యాలయాల్లో ఒక్కొక్కదానిలో {Math.min(...rest.map(([, n]) => n))} నుంచి {Math.max(...rest.map(([, n]) => n))} పత్రాలు.</>)}
            limits={tr('how much an office publishes. It shows what we have collected so far.', 'ఒక కార్యాలయం ఎంత ప్రచురిస్తుందో. ఇప్పటివరకు మేము సేకరించినదే చూపుతుంది.')}
            sources={[{ label: tr('Our register of papers', 'మా పత్రాల రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="16rem" rows={top14.map(([o, n]) => ({ key: o, label: <span lang="en">{office(o)}</span>, n, active: off === o, onClick: () => { setOff(off === o ? 'all' : o); document.getElementById('find')?.scrollIntoView({ behavior: 'smooth' }) } }))} />
          </ChartFrame>
        </div>
      </Section>

      {/* the library */}
      <Section className="mt-16" eyebrow={tr('The library', 'గ్రంథాలయం')} title={tr('Where the rest of the record lives', 'మిగతా రికార్డు ఎక్కడ ఉంది')}
        lede={tr(`${lib.length} official series and portals, listed ${dateLong(papers.updated)}. We opened and read ${libRead} ourselves. ${lib.length - libRead} are official addresses that would not open from our side, and each says why. Most open fine from a browser in India.`,
          `${lib.length} అధికారిక శ్రేణులు, పోర్టళ్లు, ${dateTe(papers.updated)} నాటి జాబితా. వీటిలో ${libRead} మేమే తెరిచి చదివాం. ${lib.length - libRead} మా వైపు నుంచి తెరుచుకోని అధికారిక చిరునామాలు; ప్రతిదానికీ కారణం చెప్పాం. భారతదేశంలోని బ్రౌజర్ నుంచి చాలావరకు తెరుచుకుంటాయి.`)}>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {libKinds.map(([k, n]) => <span key={k} className="rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px]" lang="en">{k} <b className="tnum">{n}</b></span>)}
        </div>
        <ul className="grid gap-2.5 md:grid-cols-2">
          {lib.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex h-full gap-3 rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block text-[15px] font-semibold leading-snug" lang="en">{clean(d.title)}</span>
                  <span className="block text-[12.5px] text-muted-foreground" lang="en">{d.publisher}{d.doc_type ? ` · ${d.doc_type}` : ''}</span>
                  {d.what_it_holds ? <span className="mt-1.5 block text-[13.5px] text-foreground/80" lang="en">{clean(d.what_it_holds)}</span> : null}
                  <span className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold', d.verified ? 'bg-brand-soft text-brand' : 'border border-dashed border-foreground/40 bg-secondary text-ink2')}>
                    {d.verified ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                    {d.verified ? tr(`We read it${d.verified_date ? ` · ${dateShort(d.verified_date)}` : ''}`, `చదివాం${d.verified_date ? ` · ${dateTe(d.verified_date)}` : ''}`) : tr('Would not open from here', 'ఇక్కడి నుంచి తెరుచుకోలేదు')}
                  </span>
                  {d.access_note ? <span className="mt-1.5 block text-[12.5px] text-muted-foreground" lang="en">{clean(d.access_note)}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  )
}

/* ================================================================ tenders */
const OPEN = (tenders.items as any[]).filter((t) => istDay(t.bid_submission_end) >= TODAY).sort((a, b) => String(a.bid_submission_end).localeCompare(String(b.bid_submission_end)))
const ALL_T = [...(tenders.items as any[]), ...(tenders.closed as any[])]
const TKIND: Record<string, { en: string; te: string }> = {
  works: { en: 'Works', te: 'పనులు' }, rfp: { en: 'Request for proposal', te: 'ప్రతిపాదనల అభ్యర్థన' },
  eoi: { en: 'Expression of interest', te: 'ఆసక్తి వ్యక్తీకరణ' }, other: { en: 'Other notices', te: 'ఇతర ప్రకటనలు' },
}
const tTitle = (t: string) => clean(t.replace(/^"|"$/g, '').replace(/"-\s*Estimate Cost/, ' (estimate cost').replace(/\/-$/, ')'))
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_TE = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']

export function TendersList({ limit }: { limit?: number }) {
  const { lang, tr } = useLang()
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {OPEN.slice(0, limit ?? 999).map((t) => (
        <div key={t.id} className="grid gap-1 px-4 py-3.5 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
          <div className="min-w-0">
            <div className="line-clamp-2 text-[15px] font-medium leading-snug" lang="en">{tTitle(t.title)}</div>
            {t.title_telugu ? <div lang="te" className="text-[14px] text-muted-foreground">{t.title_telugu}</div> : null}
            <div className="mt-1 text-[12.5px] text-muted-foreground">{(TKIND[t.tender_type] ?? TKIND.other)[lang]} · <span lang="en">{t.department}</span> · {tr('notice', 'నోటీసు')} <span lang="en">{t.tender_id}</span></div>
          </div>
          <div className="flex items-center gap-2 md:flex-col md:items-end">
            <Badge>{tr('Open', 'తెరిచి ఉంది')}</Badge>
            <span className="text-[12.5px] text-muted-foreground">{lang === 'te' ? `గడువు ${dateTe(istDay(t.bid_submission_end))}, రాత్రి 11:59` : `Closes ${dateShort(istDay(t.bid_submission_end))}, 11:59 pm`}</span>
            <span className="text-[12px] text-muted-foreground">{lang === 'te' ? `ప్రచురణ ${dateTe(istDay(t.published_date))}` : `Published ${dateShort(istDay(t.published_date))}`}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Tenders() {
  const { lang, tr } = useLang()
  const closed = ALL_T.length - OPEN.length
  const kinds = count(ALL_T, (t) => t.tender_type ?? 'other')
  const depts = count(ALL_T, (t) => t.department)
  const byDay = count(OPEN, (t) => istDay(t.bid_submission_end)).sort((a, b) => a[0].localeCompare(b[0]))
  const [busy, busyN] = [...byDay].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const busyVillages = OPEN.filter((t) => istDay(t.bid_submission_end) === busy && t.tender_type === 'works' && /village/i.test(t.title)).length
  const first = istDay(tenders.summary.earliest_published), last = istDay(tenders.summary.latest_published)
  const WORDS = [
    { en: 'Tender', te: 'టెండర్', p: { en: 'A public call asking companies to bid for a job.', te: 'ఒక పనికి బిడ్లు వేయమని కంపెనీలను పిలిచే బహిరంగ ప్రకటన.' } },
    { en: 'Request for proposal', te: 'ప్రతిపాదనల అభ్యర్థన', p: { en: 'A call for detailed proposals, often for a service or a partner.', te: 'వివరమైన ప్రతిపాదనల కోసం పిలుపు; తరచూ ఒక సేవ లేదా భాగస్వామి కోసం.' } },
    { en: 'Expression of interest', te: 'ఆసక్తి వ్యక్తీకరణ', p: { en: 'A first call to see who is interested, before a full tender.', te: 'పూర్తి టెండర్‌కు ముందు, ఎవరికి ఆసక్తి ఉందో చూసే తొలి పిలుపు.' } },
    { en: 'Closing date', te: 'గడువు తేదీ', p: { en: 'The last day to send a bid. After it, the notice shows as closed.', te: 'బిడ్ పంపడానికి చివరి రోజు. ఆ తర్వాత నోటీసు ముగిసినట్లు కనిపిస్తుంది.' } },
  ]
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Tenders', 'టెండర్లు')} q={{ en: 'Which works are out for bids?', te: 'ఏ పనులకు టెండర్లు పిలిచారు?' }}
        lede={tr(`A tender notice is often the first public sign that a work is about to start. We read AP CRDA’s portal every day: ${tenders.summary.total} notices so far, published from ${dateLong(first)} to ${dateLong(last)}. Every date here is India time.`,
          `టెండర్ నోటీసు తరచూ ఒక పని మొదలవబోతోందన్న తొలి బహిరంగ సూచన. ఏపీ సీఆర్డీఏ పోర్టల్‌ను రోజూ చదువుతాం: ఇప్పటివరకు ${tenders.summary.total} నోటీసులు, ${dateTe(first)} నుంచి ${dateTe(last)} మధ్య ప్రచురితమైనవి. ఇక్కడి ప్రతి తేదీ భారత కాలమానంలోనే.`)}>
        <div className="mt-5"><ListenButton /></div>
      </PageHead>
      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {WORDS.map((w) => (
          <div key={w.en} className="rounded-xl border border-border bg-card p-4">
            <dt><span className="block text-[15.5px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? w.te : w.en}</span><span className="block text-[13px] text-muted-foreground" lang={lang === 'te' ? 'en' : 'te'}>{lang === 'te' ? w.en : w.te}</span></dt>
            <dd className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">{w.p[lang]}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <ChartFrame q={{ en: 'How many notices are open for bids now?', te: 'ఇప్పుడు ఎన్ని టెండర్లు తెరిచి ఉన్నాయి?' }}
          answer={tr(<><b>{OPEN.length}</b> open and <b>{closed}</b> closed, on {dateLong(TODAY)}.</>, <>{dateTe(TODAY)}న <b>{OPEN.length}</b> తెరిచి ఉన్నాయి, <b>{closed}</b> ముగిశాయి.</>)}
          how={tr('One bar per status, on one scale. “Closed” means bidding has ended.', 'ప్రతి స్థితికి ఒక బార్, ఒకే కొలతపై. “ముగిసింది” అంటే బిడ్డింగ్ అయిపోయింది.')}
          limits={tr('who won. No notice is marked awarded or cancelled yet on the portal.', 'ఎవరు గెలిచారో. పోర్టల్‌లో ఇంకా ఏ నోటీసూ “ఇచ్చారు” లేదా “రద్దు” అని లేదు.')}
          sources={[{ label: 'AP CRDA tenders portal', date: tr(`read ${dateLong(TODAY)}`, `${dateTe(TODAY)}న చదివాం`) }]}>
          <CountBars rows={[{ key: 'open', label: tr('Open', 'తెరిచి ఉన్నవి'), n: OPEN.length }, { key: 'closed', label: tr('Closed', 'ముగిసినవి'), n: closed }]} labelWidth="8rem" />
        </ChartFrame>
        <ChartFrame q={{ en: 'What kinds of notices are they?', te: 'ఇవి ఏ రకమైన టెండర్లు?' }}
          answer={tr(<>{kinds.map(([k, n], i) => <span key={k}>{i ? (i === kinds.length - 1 ? ' and ' : ', ') : ''}{n} {(TKIND[k] ?? TKIND.other).en.toLowerCase()}</span>)}.</>, <>{kinds.map(([k, n], i) => <span key={k}>{i ? ', ' : ''}{(TKIND[k] ?? TKIND.other).te} {n}</span>)}.</>)}
          how={tr(`All ${ALL_T.length} notices, by the kind the portal gives, on one scale.`, `మొత్తం ${ALL_T.length} నోటీసులు, పోర్టల్ ఇచ్చిన రకం ప్రకారం, ఒకే కొలతపై.`)}
          note={tr(<>{depts.map(([d, n], i) => <span key={d}>{i ? (i === depts.length - 1 ? ' and ' : ', ') : ''}{n} from <span lang="en">{d}</span></span>)}.</>, <>{depts.map(([d, n], i) => <span key={d}>{i ? ', ' : ''}<span lang="en">{d}</span> నుంచి {n}</span>)}.</>)}
          limits={tr('the cost. Most notices print none.', 'ఖర్చు. చాలా నోటీసుల్లో అది ఉండదు.')}
          sources={[{ label: 'AP CRDA tenders portal', date: tr(`read ${dateLong(TODAY)}`, `${dateTe(TODAY)}న చదివాం`) }]}>
          <CountBars rows={kinds.map(([k, n]) => ({ key: k, label: (TKIND[k] ?? TKIND.other)[lang], n }))} labelWidth="11rem" />
        </ChartFrame>
      </div>

      <ChartFrame className="mt-5" q={{ en: 'When do the open notices close?', te: 'తెరిచి ఉన్న టెండర్ల గడువు ఎప్పుడు?' }}
        answer={tr(<><b>{busyN}</b> of the {OPEN.length} close on {dateLong(busy)}.{busyVillages ? <> {busyVillages} of those are works for Amaravati’s villages.</> : null}</>,
          <>{OPEN.length}లో <b>{busyN}</b> {dateTe(busy)}న ముగుస్తాయి.{busyVillages ? <> వాటిలో {busyVillages} అమరావతి గ్రామాల పనులు.</> : null}</>)}
        how={tr('Each box is a closing date, at 11:59 pm India time; the number is how many notices close that day.', 'ప్రతి పెట్టె ఒక గడువు తేదీ, భారత కాలం రాత్రి 11:59కి; సంఖ్య ఆ రోజు ముగిసే నోటీసులు.')}
        sources={[{ label: 'AP CRDA tenders portal', date: tr(`read ${dateLong(TODAY)}`, `${dateTe(TODAY)}న చదివాం`) }]}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {byDay.map(([d, n]) => {
            const dt = new Date(d + 'T00:00:00Z')
            return (
              <div key={d} className={cn('rounded-xl bg-background p-3', n > 5 ? 'border-2 border-foreground' : 'border border-border')}>
                <div className="text-[12px] text-muted-foreground">{lang === 'te' ? DAYS_TE[dt.getUTCDay()] : DAYS[dt.getUTCDay()]}</div>
                <div className="text-[14px] font-semibold">{lang === 'te' ? dateTe(d).replace(/^\d{4} /, '') : dateShort(d).replace(/ \d{4}$/, '')}</div>
                <div className="mt-1 font-heading text-[24px] font-semibold leading-none tnum">{n}</div>
                <div className="text-[12px] text-muted-foreground">{lang === 'te' ? 'నోటీసులు' : n === 1 ? 'notice' : 'notices'}</div>
              </div>
            )
          })}
        </div>
      </ChartFrame>

      <Section className="mt-14" eyebrow={tr('Open notices', 'తెరిచి ఉన్న నోటీసులు')} title={tr('Closing first', 'ముందు ముగిసేవి ముందు')} lede={tr('Titles exactly as the portal prints them.', 'శీర్షికలు పోర్టల్ ముద్రించినట్లే.')}>
        <TendersList />
      </Section>
      <div className="mt-8 max-w-3xl rounded-xl border border-dashed border-foreground/30 bg-card px-4 py-3 text-[14px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">{tr('Only one portal so far. ', 'ఇప్పటివరకు ఒకే పోర్టల్. ')}</b>{tr('All notices come from AP CRDA, so this is Amaravati’s buying, not the whole state’s. The state’s e-procurement portal times out from outside India, so our daily reader cannot open it yet.', 'అన్ని నోటీసులు ఏపీ సీఆర్డీఏ నుంచే; అంటే ఇది అమరావతి కొనుగోళ్లు మాత్రమే, రాష్ట్రమంతటివి కాదు. రాష్ట్ర ఈ-ప్రొక్యూర్‌మెంట్ పోర్టల్ భారతదేశం బయటి నుంచి స్పందించదు; అందుకే మా రోజువారీ రీడర్ దాన్ని ఇంకా తెరవలేదు.')}
      </div>
    </Page>
  )
}

/* ================================================================ what's new */
export function Updates() {
  const { lang, tr } = useLang()
  const runs = (updates.runs as any[]).slice(0, 30)
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr("What's new", 'కొత్తగా ఏముంది')} q={{ en: 'When did each source last update?', te: 'ప్రతి మూలం చివరిగా ఎప్పుడు నవీకరించబడింది?' }}
        lede={tr('Our readers check the government sources on their own. One line per source says when it last ran, when it last worked and how it went. Each check below keeps its own date; checks are never added together.',
          'మా రీడర్లు ప్రభుత్వ మూలాలను తామే తనిఖీ చేస్తాయి. ప్రతి మూలానికి ఒక వరుస: చివరిగా ఎప్పుడు నడిచింది, ఎప్పుడు పని చేసింది, ఎలా సాగింది. కింద ప్రతి తనిఖీకి దాని తేదీ ఉంటుంది; వాటిని కలిపి లెక్కించం.')} />
      <div className="mt-8"><SourceHealth /></div>
      <Section className="mt-14" eyebrow={tr('Day by day', 'రోజు వారీగా')} title={tr('Each time we checked the sources', 'ఎప్పుడెప్పుడు తనిఖీ చేశాం')}>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {runs.map((r) => (
            <div key={r.run_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="w-32 text-[13px] text-muted-foreground tnum">{lang === 'te' ? dateTe(istDay(r.started_at)) : dateShort(istDay(r.started_at))}</span>
              <span className={cn('text-[15px]', r.records_new ? 'font-semibold' : 'text-muted-foreground')}>{r.records_new ? tr(`${r.records_new} new`, `${r.records_new} కొత్తవి`) : tr('Nothing new', 'కొత్తదేమీ లేదు')}</span>
              <span className="text-[13px] text-muted-foreground" lang="en">{r.sources.map((s: any) => s.source).join(', ')}</span>
              {r.sources_failed ? <Badge variant="outline" className="ml-auto">{tr('A source did not open', 'ఒక మూలం తెరుచుకోలేదు')}</Badge> : null}
            </div>
          ))}
        </div>
        <a href={href('sources')} className="mt-4 inline-flex text-[15px] font-medium underline underline-offset-4">{tr('How we read the sources', 'మూలాలను ఎలా చదువుతాం')}</a>
      </Section>
      <div className="hidden"><PaperChip label="" /></div>
    </Page>
  )
}
