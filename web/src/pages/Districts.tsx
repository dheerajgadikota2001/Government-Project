import * as React from 'react'
import { Newspaper, ArrowRight, ArrowUpRight, Droplets, FileText, MapPin } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { carvedFrom, districtByName, districtBySlug, helplines, invest, meta, pol, registerPapers, worksIn, type District } from '@/lib/data'
import { clean, crore, croreTe, dateShort, dateTe, num, TYPE_WORDS, MOU_STATUS } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { Blank, KindBadge, PaperChip, Section, StatusWord, Te, Term } from '@/components/kit'
import { InShort, useMyDistrict, DistrictSelect } from '@/components/cards'
import { DistrictPickerMap } from '@/components/DistrictPickerMap'
import { DistrictCompare } from '@/components/DistrictCompare'
import { DistrictFacts, DM, MeasureCompare } from '@/components/DistrictFacts'
import { DistrictHistory } from '@/components/DistrictHistory'
import { DistrictCounts } from './Home'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

const titleOf = (p: { id: number; t: string }) => (p.id === 1 || p.id === 613 ? 'Polavaram Irrigation Project' : clean(p.t))
const linkOf = (p: { id: number }) => href('project-' + (p.id === 1 ? 613 : p.id))
// The helplines file spells one district differently from the register.
const norm = (s: string) => s.replace(/[.\s]/g, '').toLowerCase()
const siteOf = (name: string) => (helplines.districts as any[]).find((d) => norm(d.name) === norm(name))

export default function Districts() {
  const { lang, tr } = useLang()
  const [mine, setMine] = useMyDistrict()
  const d = mine ? [...districtBySlug.values()].find((x) => x.name === mine) : null
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('My district', 'మా జిల్లా')} q={{ en: 'What is happening where I live?', te: 'మా జిల్లాలో ఏం జరుగుతోంది?' }}
        lede={tr('Pick your district from the list, or from the map. The map is only for picking: it is not shaded by the number of records.', 'జాబితా నుంచి గానీ పటం నుంచి గానీ మీ జిల్లాను ఎంచుకోండి. పటం ఎంచుకోవడానికి మాత్రమే; రికార్డుల సంఖ్యతో రంగు వేయలేదు.')} />
      <div className="mt-6 flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <MapPin className="size-5 text-muted-foreground" />
        {d ? (
          <>
            <span className="text-[15.5px]">{tr('Your district: ', 'మీ జిల్లా: ')}<b lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? d.te : d.name}</b></span>
            <a href={href('district-' + d.slug)} className="inline-flex items-center gap-1 text-[15px] font-semibold hover:underline">{tr('Open it', 'తెరవండి')}<ArrowRight className="size-4" /></a>
            <button type="button" onClick={() => setMine(null)} className="ml-auto text-[13px] text-muted-foreground underline underline-offset-4">{tr('Change', 'మార్చండి')}</button>
          </>
        ) : (
          <>
            <span className="text-[15px]">{tr('Pick your district once; the site remembers it on this device only.', 'మీ జిల్లాను ఒక్కసారి ఎంచుకోండి; ఈ పరికరంలో మాత్రమే గుర్తుంటుంది.')}</span>
            <DistrictSelect lang={lang} value={null} onChange={setMine} className="w-full sm:w-72" />
          </>
        )}
      </div>
      <div className="mt-8"><DistrictCounts bare /></div>
      <Section className="mt-16" eyebrow={tr('How the districts compare', 'జిల్లాల పోలిక')} title={lang === 'te' ? <Te>జిల్లాలు పక్కపక్కనే</Te> : 'Districts side by side'}
        lede={tr(`${DM.measures.length} figures the state's Statistical Abstract 2024 prints for every district: people, money, farming, health, schools, welfare, roads, police and more. Pick a subject and a figure; tap a district to light it.`,
          `రాష్ట్ర గణాంక సంక్షిప్తం 2024 ప్రతి జిల్లాకు ముద్రించిన ${DM.measures.length} అంకెలు: ప్రజలు, డబ్బు, వ్యవసాయం, ఆరోగ్యం, బడులు, సంక్షేమం, రోడ్లు, పోలీసు ఇంకా. విషయం, అంకె ఎంచుకోండి; జిల్లాను తాకితే వెలుగుతుంది.`)}>
        <MeasureCompare className="max-w-4xl" />
      </Section>
      <Section className="mt-16" eyebrow={tr('School grading', 'పాఠశాల గ్రేడింగ్')} title={lang === 'te' ? <Te>పాఠశాల గ్రేడింగ్‌లో జిల్లాలు</Te> : 'Districts in school grading'}
        lede={tr('The Union Education Ministry\'s grading of districts for 2025-26. Pick yours and switch the measure: the bars re-sort and your district stays lit.',
          'కేంద్ర విద్యా మంత్రిత్వ శాఖ 2025-26 జిల్లాల గ్రేడింగ్. మీ జిల్లాను ఎంచుకుని కొలమానం మార్చండి: బార్లు మళ్లీ వరుసలో నిలుస్తాయి, మీ జిల్లా వెలుగుతూ ఉంటుంది.')}>
        <DistrictCompare className="max-w-4xl" />
      </Section>
    </Page>
  )
}

/** The 1 January 2026 change, said on the pages it touches: the two new districts, and the two
 *  they were cut from. Papers written before 2026 count the new district inside the old one,
 *  so a figure from them is never split between the two here. */
function MapChange({ d }: { d: District }) {
  const { lang } = useLang()
  const te = lang === 'te'
  const parent = d.from ? districtByName.get(d.from) : null
  const kids = carvedFrom(d.name)
  if (!parent && !kids.length) return null
  const teName = (x: District) => <span lang="te">{x.te}</span>
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-[15px] leading-relaxed">
      {parent ? (
        te ? <p><Te>{`${d.te} జిల్లా 2026 జనవరి 1న ${parent.te} జిల్లా నుంచి ఏర్పడింది.`}</Te> <span className="text-muted-foreground"><Te>{`2026కి ముందు పత్రాలు ఈ ప్రాంతాన్ని ${parent.te}లోనే లెక్కిస్తాయి. ఆ అంకెలను మేము రెండుగా విడదీయం; అవి ${parent.te} పేజీలో, ఆ పత్రం గీసిన జిల్లా ప్రకారం ఉంటాయి.`}</Te> </span><a className="font-medium underline underline-offset-4" href={href('district-' + parent.slug)}>{teName(parent)}</a></p>
          : <p>{d.name} district was formed on 1 January 2026 from {parent.name}. <span className="text-muted-foreground">Papers written before 2026 count this area inside {parent.name}. We never split their figures between the two; they stay on the {parent.name} page, on the map that paper used.</span> <a className="font-medium underline underline-offset-4" href={href('district-' + parent.slug)}>Open {parent.name}</a></p>
      ) : (
        te ? <p><Te>{`2026 జనవరి 1న ఈ జిల్లా నుంచి ${kids.map((k) => k.te).join(', ')} జిల్లా ఏర్పడింది. 2022 నుంచి 2025 వరకు పత్రాల్లో ${d.te} అంటే ఆ ప్రాంతం కూడా కలిపి.`}</Te></p>
          : <p>On 1 January 2026, {kids.map((k) => k.name).join(' and ')} district was formed from this one. <span className="text-muted-foreground">In papers from 2022 to 2025, {d.name} includes that area too.</span></p>
      )}
      <p className="mt-1.5 text-[13px] text-muted-foreground">{te ? <Te>{`ఆధారం: ${(parent ? d : kids[0]).order}; రిజర్వ్ బ్యాంక్ సర్క్యులర్ RBI/2026-27/09 (10 ఏప్రిల్ 2026) ఉటంకించింది.`}</Te> : <>Order: {(parent ? d : kids[0]).order}, as cited by RBI circular RBI/2026-27/09 of 10 April 2026.</>}</p>
    </div>
  )
}

export function DistrictPage({ slug }: { slug: string }) {
  const { lang, tr } = useLang()
  const [mine, setMine] = useMyDistrict()
  const none = slug === 'none'
  const d = districtBySlug.get(slug)
  if (!d && !none) return <Page className="py-24"><Blank>{tr('No district has this name', 'ఈ పేరుతో జిల్లా లేదు')}</Blank></Page>
  const works = worksIn(none ? null : d!.name)
  const byType = new Map<string, typeof works>()
  works.forEach((w) => { if (!byType.has(w.ty)) byType.set(w.ty, []); byType.get(w.ty)!.push(w) })
  const types = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)
  const amrut = works.filter((w) => w.sp === 'AMRUT_MoHUA').length
  const mous = none ? [] : (invest.mous as any[]).filter((m) => m.district === d!.name)
  const water = none ? null : pol.water.rows.find((r: any) => r.district === d!.name)
  const docs = none ? [] : (registerPapers.items as any[]).filter((x) => x.o === `${d!.name} District Collectorate`).sort((a, b) => String(b.d ?? b.y ?? '').localeCompare(String(a.d ?? a.y ?? '')))
  const site = none ? null : siteOf(d!.name)
  const name = none ? tr('Works whose paper names no district', 'జిల్లా పేరు లేని పనులు') : lang === 'te' ? d!.te : d!.name
  const isMine = d && mine === d.name
  return (
    <Page className="pt-6 md:pt-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href={href('')}>{tr('Home', 'హోమ్')}</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href={href('districts')}>{tr('My district', 'మా జిల్లా')}</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <h1 className="text-[36px] font-semibold leading-[1.06] tracking-tight md:text-[52px]" lang={lang === 'te' && d ? 'te' : undefined}>{name}</h1>
          {d ? <p className="mt-2 text-[18px] text-muted-foreground"><span lang={lang === 'te' ? 'en' : 'te'}>{lang === 'te' ? d.name : d.te}</span>{d.hq ? <span className="ml-3 text-[15px]">{tr('Headquarters: ', 'కేంద్రం: ')}{lang === 'te' && d.hq === d.name ? d.te : <span lang="en">{d.hq}</span>}</span> : null}</p> : null}
          {d ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isMine
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[13.5px] font-medium"><MapPin className="size-4" />{tr('Your district', 'మీ జిల్లా')}</span>
                : <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setMine(d.name)}><MapPin className="size-4" />{tr('Make this my district', 'ఇది నా జిల్లా')}</Button>}
              {site?.website ? <PaperChip label={site.website.replace(/^https?:\/\//, '')} url={site.website} /> : null}
            </div>
          ) : null}
          {d ? <MapChange d={d} /> : null}
          {d ? (
            <a href={href(`paper-${d.slug}`)} className="mt-5 flex items-center gap-4 rounded-2xl border-2 border-foreground/80 bg-card p-4 hover:bg-accent/40">
              <Newspaper className="size-8 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[20px] font-bold leading-tight" lang="te">మన జిల్లా పత్రిక</span>
                <span className="block text-[14px] text-muted-foreground">{tr(`Read or listen: what is happening in ${d.name}, in plain words`, `${d.te}లో ఏం జరుగుతోందో, సులభమైన మాటల్లో; చదవండి లేదా వినండి`)}</span>
              </span>
            </a>
          ) : null}
          <InShort className="mt-6" items={[
            { value: num(works.length, 0), label: none ? tr('project records name no district', 'ప్రాజెక్టు రికార్డుల్లో జిల్లా పేరు లేదు') : tr(`project records name ${d!.name}`, `ప్రాజెక్టు రికార్డుల్లో ${d!.te} పేరు`), paper: tr(`Our register, ${dateShort(meta.asof)}`, `మా రిజిస్టర్, ${dateTe(meta.asof)}`) },
            ...(none ? [] : [{ value: num(docs.length, 0), label: tr('papers from its collectorate', 'దాని కలెక్టరేట్ నుంచి పత్రాలు'), paper: tr(`Our register, ${dateShort(meta.asof)}`, `మా రిజిస్టర్, ${dateTe(meta.asof)}`) }]),
            ...(water ? [{ value: `${num(water.tmc)} TMC`, label: tr('of Polavaram water, once complete', 'పోలవరం పూర్తయ్యాక నీరు'), paper: <span lang="en">Lok Sabha answer, 1 Aug 2024</span>, href: 'project-613' }] : []),
            ...(none ? [] : [{ value: '112 · 108', label: tr('emergency and ambulance', 'అత్యవసరం, అంబులెన్స్'), paper: tr('All helplines', 'అన్ని సహాయ నంబర్లు'), href: 'helplines' }]),
          ]} note={tr('Counts of records; the lists follow below.', 'రికార్డుల లెక్కలు; జాబితాలు కింద.')} />
          <div className="mt-5 rounded-2xl border border-border bg-card p-5 text-[16px] leading-relaxed">
            {works.length ? (
              <>
                <p>{types.slice(0, 4).map(([t, w], i) => <span key={t}>{i ? ', ' : ''}{w.length} {lang === 'te' ? TYPE_WORDS[t]?.te : (TYPE_WORDS[t]?.en ?? t).toLowerCase()}</span>)}{types.length > 4 ? tr(' and more', ' ఇంకా') : ''}.</p>
                {amrut > works.length / 2 ? <p className="mt-2 text-[15px] text-muted-foreground">{tr<React.ReactNode>(<>Most of them are town works from the <Term term="AMRUT" /> list.</>, 'వీటిలో ఎక్కువ అమృత్ జాబితాలోని పట్టణ పనులు.')}</p> : null}
                {!none ? <p className="mt-2 text-[15px] text-muted-foreground">{tr('Large works whose papers name no district do not appear here.', 'జిల్లా పేరు లేని పెద్ద పనులు ఇక్కడ కనిపించవు.')} <a href={href('district-none')} className="underline">{tr('See them', 'అవి చూడండి')}</a>.</p> : null}
              </>
            ) : d?.formed
              ? <Blank kind="newDistrict">{tr(`No paper in our register is written on the 2026 map yet. Works in this area are listed under ${d.from}, as their papers print it`, `మా రిజిస్టర్‌లో 2026 పటం ప్రకారం రాసిన పత్రం ఇంకా లేదు. ఈ ప్రాంతపు పనులు వాటి పత్రాల్లో ఉన్నట్లే ${districtByName.get(d.from!)?.te ?? d.from} కింద ఉన్నాయి`)}</Blank>
              : <Blank>{tr('No project record names this district yet', 'ఈ జిల్లా పేరుతో ఇంకా ప్రాజెక్టు రికార్డు లేదు')}</Blank>}
          </div>
          {water ? (
            <a href={href('project-613')} className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-card p-5 hover:border-foreground/30">
              <Droplets className="mt-1 size-5 shrink-0" />
              <span className="text-[15.5px] leading-relaxed">{tr(<>Polavaram is to give {d!.name} <b className="tnum">{num(water.tmc)} TMC</b> of water once it is complete, a Lok Sabha answer of 1 August 2024 says. <span className="font-medium underline underline-offset-4">Is Polavaram finished?</span></>,
                <>పోలవరం పూర్తయ్యాక {d!.te}కు <b className="tnum">{num(water.tmc)} టీఎంసీ</b> నీరు అందుతుందని 2024 ఆగస్టు 1 నాటి లోక్‌సభ సమాధానం చెబుతోంది. <span className="font-medium underline underline-offset-4">పోలవరం పూర్తయిందా?</span></>)}</span>
            </a>
          ) : null}
        </div>
        {d ? <DistrictPickerMap selected={d.name} compact className="rounded-2xl border border-border bg-card" /> : null}
      </div>

      {d ? (
        <Section className="mt-14" eyebrow={tr('Everything in one place', 'అన్నీ ఒకే చోట')}
          title={lang === 'te' ? <Te>{`${d.te}: ప్రభుత్వ పుస్తకం ఏం చెబుతోంది`}</Te> : `${d.name}: what the government's own book says`}
          lede={tr(`${DM.measures.length} figures, from people and farming to schools, hospitals, pensions, roads and police, as the state's Statistical Abstract 2024 prints them for this district.`,
            `ప్రజలు, వ్యవసాయం నుంచి బడులు, ఆసుపత్రులు, పింఛన్లు, రోడ్లు, పోలీసు వరకు ${DM.measures.length} అంకెలు, రాష్ట్ర గణాంక సంక్షిప్తం 2024 ఈ జిల్లాకు ముద్రించినట్లే.`)}>
          <DistrictFacts district={d.name} />
        </Section>
      ) : null}

      {d ? (
        <Section className="mt-14" eyebrow={tr('Since 2014', '2014 నుంచి')}
          title={lang === 'te' ? <Te>{`${d.te}: ఏడాది వారీగా అంకెలు`}</Te> : `${d.name}: the figures, year by year`}
          lede={tr('The same figures from every yearly edition of the Statistical Abstract since the state was formed in 2014, so you can see how each one moved.',
            '2014లో రాష్ట్రం ఏర్పడినప్పటి నుంచి గణాంక సంక్షిప్తం ప్రతి ఏటి సంచికలోని అవే అంకెలు; ఒక్కోటి ఎలా మారిందో చూడవచ్చు.')}>
          <DistrictHistory district={d.name} />
        </Section>
      ) : null}

      {types.length ? (
        <Section className="mt-14" eyebrow={tr('Works', 'పనులు')} title={tr('Works, by kind', 'పనులు, రకాల వారీగా')} lede={tr('Sorted by the cost each paper prints. Costs are never added up.', 'ప్రతి పత్రం ముద్రించిన వ్యయం ప్రకారం వరుస. వ్యయాలను ఎప్పుడూ కలపం.')}>
          <Tabs defaultValue={types[0][0]}>
            <TabsList className="h-auto flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
              {types.map(([t, w]) => <TabsTrigger key={t} value={t} className="gap-1.5"><span lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? TYPE_WORDS[t]?.te : TYPE_WORDS[t]?.en ?? t}</span><span className="text-muted-foreground tnum">{w.length}</span></TabsTrigger>)}
            </TabsList>
            {types.map(([t, w]) => (
              <TabsContent key={t} value={t} className="mt-4">
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {[...w].sort((a, b) => (b.c ?? -1) - (a.c ?? -1)).slice(0, 60).map((p) => (
                    <a key={p.id} href={linkOf(p)} className="grid gap-1 px-4 py-3 hover:bg-accent/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                      <span className="min-w-0"><span className="line-clamp-2 text-[15px] font-medium leading-snug" lang="en">{titleOf(p)}</span><StatusWord status={p.st} className="mt-1" /></span>
                      <span className="text-[13.5px] text-muted-foreground sm:text-right"><span className="font-medium text-foreground tnum">{p.c != null ? (lang === 'te' ? croreTe(p.c) : crore(p.c)) : tr('No cost printed', 'వ్యయం ముద్రించలేదు')}</span><br className="hidden sm:block" />{p.l ? <span> {lang === 'te' ? dateTe(p.l) : dateShort(p.l)}</span> : null}</span>
                    </a>
                  ))}
                </div>
                {w.length > 60 ? <p className="mt-3 text-[13px] text-muted-foreground">{tr('Showing the 60 with the largest printed cost.', 'అత్యధిక ముద్రిత వ్యయం ఉన్న 60 చూపుతున్నాం.')} <a className="underline" href={href('projects')}>{tr('All projects', 'అన్ని పనులు')}</a></p> : null}
              </TabsContent>
            ))}
          </Tabs>
        </Section>
      ) : null}

      {docs.length ? (
        <Section className="mt-14" eyebrow={tr('Papers', 'పత్రాలు')} title={tr('Newest papers from its collectorate', 'కలెక్టరేట్ నుంచి తాజా పత్రాలు')}>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {docs.slice(0, 6).map((x) => (
              <li key={x.id}><a href={x.u} target="_blank" rel="noopener noreferrer" className="flex h-full gap-3 rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0"><span className="line-clamp-2 text-[14.5px] font-medium leading-snug" lang="en">{clean(x.t)}</span><span className="mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">{x.d ? dateShort(x.d) : x.y}<ArrowUpRight className="size-3.5" /></span></span>
              </a></li>
            ))}
          </ul>
          {docs.length > 6 ? <a href={href('papers')} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr(`All ${docs.length} papers, on the Papers page`, `మొత్తం ${docs.length} పత్రాలు, పత్రాల పేజీలో`)}<ArrowRight className="size-4" /></a> : null}
        </Section>
      ) : null}

      {mous.length ? (
        <Section className="mt-14" eyebrow={tr('Investment promises', 'పెట్టుబడి హామీలు')} title={tr(`Promises that name ${d!.name}`, `${d!.te} పేరున్న హామీలు`)} lede={tr('A promise is not money spent. Each card says who reported it.', 'హామీ అంటే ఖర్చు చేసిన డబ్బు కాదు. ఎవరు చెప్పారో ప్రతి కార్డులో ఉంది.')}>
          <div className="grid gap-3 md:grid-cols-2">
            {mous.map((m: any) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2"><KindBadge kind={m.source_tier} /><span className="text-[13px] text-muted-foreground">{(MOU_STATUS[m.status] ?? { en: m.status, te: m.status })[lang]}</span></div>
                <div className="mt-2 text-[16px] font-semibold" lang="en">{m.company_name}</div>
                <div className="text-[13.5px] text-muted-foreground">{m.investment_crore != null ? tr(`${crore(m.investment_crore)} claimed`, `${croreTe(m.investment_crore)} అని చెప్పారు`) : tr('No figure', 'సంఖ్య లేదు')}{m.signed_date ? ` · ${lang === 'te' ? dateTe(m.signed_date) : dateShort(m.signed_date)}` : ''}</div>
              </div>
            ))}
          </div>
          <a href={href('investments')} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr('All investment promises', 'అన్ని పెట్టుబడి హామీలు')}<ArrowRight className="size-4" /></a>
        </Section>
      ) : null}
      {d ? (
        <Section className="mt-16" eyebrow={tr('How the districts compare', 'జిల్లాల పోలిక')} title={lang === 'te' ? <Te>{`${d.te}, మిగతా జిల్లాలతో పక్కపక్కనే`}</Te> : `${d.name} beside the other districts`}
          lede={tr('School grading by the Union Education Ministry, 2025-26. Every other district figure is in the section above; open "See all 26 districts" under any of them.',
            'కేంద్ర విద్యా మంత్రిత్వ శాఖ పాఠశాల గ్రేడింగ్, 2025-26. మిగతా జిల్లా అంకెలన్నీ పై విభాగంలో ఉన్నాయి; దేని కిందైనా "26 జిల్లాలూ చూడండి" తెరవండి.')}>
          <DistrictCompare district={d.name} className="max-w-4xl" />
        </Section>
      ) : null}
    </Page>
  )
}
