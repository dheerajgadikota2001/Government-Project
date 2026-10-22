import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { districts, meta } from '@/lib/data'
import { largest, paperOf, placeText, projects, todayDistricts } from '@/lib/data-projects'
import { claims } from '@/lib/data-claims'
import { facts } from '@/lib/data-facts'
import { invest } from '@/lib/data-invest'
import { money } from '@/lib/data-money'
import { registerPapers, tenders, updates } from '@/lib/data-papers'
import { clean, crore, croreTe, dateLong, dateShort, dateTe, istDay, num, TODAY } from '@/lib/format'
import { ChartFrame, KindBadge, Section, StatusWord, Te } from '@/components/kit'
import { CardWall } from '@/components/cards'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DistrictPickerMap } from '@/components/DistrictPickerMap'
import { StoryCard } from '@/components/story/StoryCard'
import { ClaimScale } from '@/graphics/Mini'
import { polavaramStory } from '@/data/stories/polavaram'
import polavaramCover from '@/assets/story-polavaram.webp'

// Everything on Home below the hero. It reads the register, tenders, money, facts and the card
// deck, which is most of the site's data, so it arrives as its own files right after the hero
// has painted. The hero (title, search, the voice place) never waits for it.

export default function HomeBelow() {
  return (
    <>
      <OnRecord />
      <CardWall />
      <Stories />
      <DistrictCounts />
      <Largest />
      <LatestClaim />
      <WhatsNew />
    </>
  )
}

/* ---------------------------------------------------- on the record today */
function OnRecord() {
  const { tr, lang } = useLang()
  const open = (tenders.items as any[]).filter((t) => istDay(t.bid_submission_end) >= TODAY).length
  const rows: [string, React.ReactNode, string][] = [
    [num(projects.length, 0), tr('project records', 'ప్రాజెక్టు రికార్డులు'), 'projects'],
    [num(tenders.summary.total, 0), tr(`tenders on record, ${open} open today`, `టెండర్లు, ఈ రోజు ${open} తెరిచి ఉన్నాయి`), 'tenders'],
    [num(invest.mous.length, 0), tr('investment promise records', 'పెట్టుబడి హామీ రికార్డులు'), 'investments'],
    [num(registerPapers.items.length, 0), tr('government papers in the register', 'రిజిస్టర్‌లో ప్రభుత్వ పత్రాలు'), 'papers'],
    [num(facts.indicators.length, 0), tr('state indicators, year by year', 'రాష్ట్ర సూచికలు, ఏడాది వారీగా'), 'state-facts'],
    [num(money.departments.length, 0), tr('department budgets, year by year', 'శాఖల బడ్జెట్లు, ఏడాది వారీగా'), 'money-departments'],
  ]
  return (
    <section aria-labelledby="onrecord">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onrecord" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('On the record today', 'ఈ రోజు రికార్డులో')}</h2>
        <p className="text-[12.5px] text-muted-foreground">{lang === 'te'
          ? <Te>{dateTe(meta.asof)}న మా రిజిస్టర్ నుంచి లెక్కించాం. ఇవి మా రికార్డుల లెక్కలు; ప్రభుత్వ మొత్తాలు కావు.</Te>
          : <>Counted from our register on {dateLong(meta.asof)}. These count our records; they are not government totals.</>}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(([v, l, tk]) => (
          <a key={tk} href={href(tk)} className="group min-w-0 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30">
            <dd className="font-heading text-[26px] font-semibold leading-tight tnum">{v}</dd>
            <dt className="mt-0.5 text-[13px] leading-snug text-muted-foreground group-hover:text-foreground">{l}</dt>
          </a>
        ))}
      </dl>
    </section>
  )
}

/* ---------------------------------------------------------------- stories */
function Stories() {
  const { lang, tr } = useLang()
  return (
    <Section eyebrow={tr('Stories', 'కథలు')} title={lang === 'te' ? <Te>అడుగు అడుగుగా ఒక కథ</Te> : 'A story, step by step'} te={lang === 'te' ? undefined : 'అడుగు అడుగుగా ఒక కథ'}
      lede={tr('Short stories made only from government papers. Each step names its paper.', 'ప్రభుత్వ పత్రాలతో మాత్రమే చెప్పిన చిన్న కథలు. ప్రతి అడుగుకూ దాని పత్రం ఉంది.')}>
      <StoryCard story={polavaramStory} cover={polavaramCover} pageHref={href('project-613')} pageLabel={{ en: 'Read it on the Polavaram page', te: 'పోలవరం పేజీలో చదవండి' }} />
    </Section>
  )
}

/* ------------------------------------------------- districts, counted */
// Records, not works: each record names at most one district. The two Polavaram
// records are one work; one of them names Eluru and the other names none.
const DIST_COUNTS = districts.map((d) => ({ d, n: projects.filter((p) => todayDistricts(p).includes(d.name)).length })).sort((a, b) => b.n - a.n || a.d.name.localeCompare(b.d.name))
const NO_DISTRICT = projects.filter((p) => todayDistricts(p).length === 0)
const NO_D_CENTRAL = NO_DISTRICT.filter((p) => p.sp === 'MOSPI_IPMD').length

export function DistrictCounts({ bare }: { bare?: boolean } = {}) {
  const { lang, tr } = useLang()
  const [hover, setHover] = React.useState<string | null>(null)
  const [view, setView] = React.useState<'list' | 'map'>('list')
  const top = DIST_COUNTS[0], last = DIST_COUNTS[DIST_COUNTS.length - 1]
  const max = top.n
  const toggle = <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as 'list' | 'map')} variant="outline" className="lg:hidden"><ToggleGroupItem value="list">{tr('List', 'జాబితా')}</ToggleGroupItem><ToggleGroupItem value="map">{tr('Map', 'పటం')}</ToggleGroupItem></ToggleGroup>
  const frame = (
      <ChartFrame
        q={{ en: 'How many project records name your district?', te: 'మీ జిల్లా పేరుతో ఎన్ని ప్రాజెక్టు రికార్డులు ఉన్నాయి?' }}
        answer={tr(<>From <b>{top.n}</b> records naming {top.d.name} to {last.n ? <b>{last.n}</b> : 'none yet'} for {last.d.name}. Pick a district to see its works, papers and helplines.</>,
          <Te>{top.d.te}కు <b>{top.n}</b> రికార్డుల నుంచి {last.d.te}కు {last.n ? <b>{last.n}</b> : 'ఇంకా ఒక్కటీ లేని'} వరకు. జిల్లాను ఎంచుకుంటే దాని పనులు, పత్రాలు, సహాయ నంబర్లు కనిపిస్తాయి.</Te>)}
        how={tr('The map is only for picking. Each line in the list is a district and the number of project records that name it, from most to fewest. The bars share one scale.',
          'పటం ఎంచుకోవడానికి మాత్రమే. జాబితాలో ప్రతి వరుస ఒక జిల్లా, దాని పేరు ఉన్న ప్రాజెక్టు రికార్డుల సంఖ్య, ఎక్కువ నుంచి తక్కువకు. బార్లన్నీ ఒకే కొలతపై.')}
        note={tr(<>{num(NO_DISTRICT.length, 0)} records name no single district: {NO_D_CENTRAL} are works the central government’s monthly report follows state-wide, and {NO_DISTRICT.length - NO_D_CENTRAL} come from papers that print no district. <a className="underline underline-offset-4" href={href('district-none')}>See them</a>.</>,
          <Te>{num(NO_DISTRICT.length, 0)} రికార్డుల్లో ఏ జిల్లా పేరూ లేదు: {NO_D_CENTRAL} కేంద్ర నెలవారీ నివేదిక రాష్ట్రమంతటికీ చూపే పనులు, {NO_DISTRICT.length - NO_D_CENTRAL} జిల్లా పేరు లేని పత్రాల నుంచి. <a className="underline underline-offset-4" href={href('district-none')}>అవి చూడండి</a>.</Te>)}
        limits={tr('how much is being built in a district. The largest works often name no district, and a count says nothing about cost or size.', 'జిల్లాలో ఎంత పని జరుగుతోందో. పెద్ద పనులకు చాలాసార్లు జిల్లా పేరు ఉండదు; లెక్క ఖర్చు గురించి గానీ పరిమాణం గురించి గానీ చెప్పదు.')}
        sources={[{ label: tr(`Our register of ${num(projects.length, 0)} project records`, `మా ${num(projects.length, 0)} ప్రాజెక్టు రికార్డుల రిజిస్టర్`), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <div className={cn(view === 'list' && 'hidden lg:block')}>
            <DistrictPickerMap hover={hover} className="rounded-xl border border-border bg-background" />
          </div>
          <div className={cn('@container min-w-0', view === 'map' && 'hidden lg:block')}>
            <ol className="gap-x-5 @lg:columns-2">
              {DIST_COUNTS.map(({ d, n }) => (
                <li key={d.slug} className="break-inside-avoid">
                  <a href={href('district-' + d.slug)} onPointerEnter={() => setHover(d.name)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(d.name)}
                    className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border py-1.5 hover:bg-accent/60">
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium leading-snug" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? d.te : d.name}</span>
                      <span className="mt-1 block h-1.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground/55" style={{ width: `${(n / max) * 100}%` }} /></span>
                    </span>
                    <span className="text-[14px] font-semibold tnum">{n || <span className="text-[12.5px] font-normal text-muted-foreground">{tr('none yet', 'ఇంకా లేవు')}</span>}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </ChartFrame>
  )
  if (bare) return <div className="space-y-3"><div className="flex justify-end lg:hidden">{toggle}</div>{frame}</div>
  return (
    <Section eyebrow={tr('My district', 'మా జిల్లా')} title={tr('Pick your district', 'మీ జిల్లాను ఎంచుకోండి')} te={lang === 'te' ? undefined : 'మీ జిల్లాను ఎంచుకోండి'} actions={toggle}>
      {frame}
    </Section>
  )
}

/* ----------------------------------------------------------------- largest */
function Largest() {
  const { tr, lang } = useLang()
  const rows = largest(6)
  const p0 = rows[0]
  return (
    <Section eyebrow={tr('Projects', 'పనులు')} title={tr('The biggest works on paper', 'కాగితంపై అతి పెద్ద పనులు')}>
      <ChartFrame
        q={{ en: 'Which works carry the largest cost in their papers?', te: 'ఏ పనుల ఖర్చు వాటి పత్రాల్లో అత్యధికంగా ఉంది?' }}
        answer={tr(<>The Polavaram Irrigation Project, at <b>{crore(p0.c)}</b> in {paperOf(p0)}.</>, <Te>పోలవరం సాగునీటి ప్రాజెక్టు: {paperOf(p0)}లో <b>{croreTe(p0.c)}</b>.</Te>)}
        how={tr('Each card is one work, sorted by the cost its own paper prints. The costs come from different papers and years, so they are never added up. One work recorded twice is shown once.',
          'ప్రతి కార్డు ఒక పని; దాని పత్రం ముద్రించిన వ్యయం ప్రకారం వరుసలో ఉంది. వ్యయాలు వేర్వేరు పత్రాలు, ఏళ్లవి; అందుకే వాటిని ఎప్పుడూ కలపం. రెండుసార్లు నమోదైన పని ఒక్కసారే కనిపిస్తుంది.')}
        limits={tr('how much has been spent so far. A printed cost is the estimate in that paper, on that date.', 'ఇప్పటివరకు ఎంత ఖర్చయిందో. ముద్రించిన వ్యయం ఆ పత్రంలో, ఆ తేదీ నాటి అంచనా.')}
        sources={[{ label: tr('Each card names its own paper', 'ప్రతి కార్డు తన పత్రాన్ని చూపుతుంది') }]}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <a key={p.id} href={href(`project-${p.id}`)} className="group flex h-full flex-col rounded-xl border border-border bg-background p-4 transition-colors hover:border-foreground/30">
              <div className="flex items-start justify-between gap-3">
                <StatusWord status={p.st} />
                <span className="text-right text-[12.5px] text-muted-foreground">{placeText(p, lang)}</span>
              </div>
              <div className="mt-3 font-heading text-[18px] font-semibold leading-snug group-hover:underline group-hover:underline-offset-4" lang="en">{p.id === 613 ? 'Polavaram Irrigation Project' : clean(p.t)}</div>
              <div className="mt-auto pt-4">
                <div className="font-heading text-[24px] font-semibold tnum">{lang === 'te' ? croreTe(p.c) : crore(p.c)}</div>
                <div className="text-[13px] text-muted-foreground">{tr('Cost as printed', 'ముద్రించిన వ్యయం')}{p.p != null ? tr(` · ${num(p.p)}% progress printed`, ` · ${num(p.p)}% పురోగతి ముద్రించారు`) : ''}</div>
                <div className="mt-2 text-[12.5px] text-muted-foreground" lang="en">{paperOf(p)}{p.l && !/\d{4}/.test(paperOf(p)) ? `, ${dateShort(p.l)}` : ''}</div>
              </div>
            </a>
          ))}
        </div>
        <a href={href('projects')} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr(`All ${num(projects.length, 0)} project records`, `అన్ని ${num(projects.length, 0)} ప్రాజెక్టు రికార్డులు`)}<ArrowRight className="size-4" /></a>
      </ChartFrame>
    </Section>
  )
}

/* --------------------------------------------------------- latest claim */
function LatestClaim() {
  const { tr, lang } = useLang()
  const c = claims.find((x: any) => x.slug === 'ap-debt-june-2024')
  const claim = c.claims[0]
  const qTe = `జూన్ 2024లో రాష్ట్రం అప్పు ₹${num(claim.figure, 0)} కోట్లా?`
  return (
    <Section eyebrow={tr('Check a claim', 'నిజమేనా?')} title={lang === 'te' ? <Te>{qTe}</Te> : c.question} te={lang === 'te' ? c.question : qTe}>
      <div className="grid gap-6 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_1.2fr] md:p-7">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-foreground/30 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr('The claim', 'చెప్పిన మాట')}</div>
            <div className="font-heading text-[30px] font-semibold tnum">{lang === 'te' ? croreTe(claim.figure, 0) : crore(claim.figure, 0)}</div>
            <div className="text-[13.5px] text-muted-foreground">{tr('White Paper on State Finances, tabled 26 July 2024, for 12 June 2024', 'శ్వేతపత్రం, 2024 జూలై 26న సభలో, 2024 జూన్ 12 నాటికి')}</div>
          </div>
          <div className="rounded-xl bg-secondary p-4">
            <KindBadge kind="government" className="mb-2" />
            {c.record.map((r: any) => (
              <div key={r.document} className="mt-1"><span className="font-heading text-[22px] font-semibold tnum">{lang === 'te' ? croreTe(r.figure, 0) : crore(r.figure, 0)}</span> <span className="text-[13px] text-muted-foreground">{lang === 'te' ? `${r.measure_te}. ${r.source_te}` : `${r.measure}. ${r.source}`}</span></div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <ClaimScale claim={{ v: claim.figure, label: 'Claim' }} records={c.record.map((r: any) => ({ v: r.figure, label: r.source }))} height={110} />
          <div className="mt-2 text-[13.5px] text-muted-foreground">{tr('Both on one scale. The white paper’s figure also counts loans taken by state corporations and bills not yet paid; the records count the government’s own debt.',
            'రెండూ ఒకే కొలతపై. శ్వేతపత్రం సంఖ్యలో కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు కూడా ఉన్నాయి; రికార్డులు ప్రభుత్వ సొంత అప్పును మాత్రమే లెక్కిస్తాయి.')}</div>
          <div className="mt-3 inline-flex self-start rounded-full border border-foreground/25 px-2.5 py-1 text-[12.5px] font-semibold">{tr('Different definition', 'వేరే నిర్వచనం')}</div>
          <a href={href('claim-ap-debt-june-2024')} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr('Read the full check', 'పూర్తి పరిశీలన చదవండి')}<ArrowRight className="size-4" /></a>
        </div>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------ what's new */
function WhatsNew() {
  const { tr, lang } = useLang()
  const runs = updates.runs.filter((r: any) => r.records_new > 0).slice(0, 5)
  return (
    <Section eyebrow={tr("What's new", 'కొత్తగా ఏముంది')} title={tr('New in the record', 'కొత్తగా చేర్చినవి')} te={tr('కొత్తగా చేర్చినవి', undefined)}
      lede={tr('Each day the sources are checked automatically. Each check keeps its own date; checks are never added together.', 'ప్రతి రోజు మూలాలను ఆటోమేటిక్‌గా తనిఖీ చేస్తాం. ప్రతి తనిఖీకి దాని తేదీ ఉంటుంది; వాటిని కలిపి లెక్కించం.')}>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {runs.map((r: any) => (
          <div key={r.run_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="w-28 text-[13px] text-muted-foreground tnum">{lang === 'te' ? dateTe(istDay(r.started_at)) : dateShort(istDay(r.started_at))}</span>
            <span className="text-[15px] font-medium">{tr(`${r.records_new} new ${r.records_new === 1 ? 'record' : 'records'}`, `${r.records_new} కొత్త రికార్డులు`)}</span>
            <span className="text-[13.5px] text-muted-foreground" lang="en">from {r.sources.filter((s: any) => s.records_new > 0).map((s: any) => s.source).join(', ')}</span>
            <Badge variant="outline" className="ml-auto">{tr('Checked automatically', 'ఆటోమేటిక్ తనిఖీ')}</Badge>
          </div>
        ))}
      </div>
      <a href={href('updates')} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr('Every check, day by day', 'ప్రతి తనిఖీ, రోజు వారీగా')}<ArrowRight className="size-4" /></a>
    </Section>
  )
}
