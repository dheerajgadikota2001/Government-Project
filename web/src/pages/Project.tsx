import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { useDesign } from '@/lib/design'
import { href } from '@/lib/route'
import { districtByName, MERGED, type Project } from '@/lib/data'
import { byId, isAmrut, paperOf, placeText, placesOf, worksIn } from '@/lib/data-projects'
import { events } from '@/lib/data-events'
import { PlaceReadings } from '@/components/PlaceReadings'
import { clean, crore, croreTe, dateLong, dateTe, dueGone, num, STATUS_WORDS, TYPE_WORDS, PORTAL_WORDS } from '@/lib/format'
import { Page } from '@/components/shell'
import { BigWorkModel, modelNote } from '@/components/BigWorks'
import { bigWorks } from '@/lib/bigworks'
import { AnswerBox, Blank, PaperChip, Section, StatusWord, Te, Term } from '@/components/kit'
import { RoadBlock, Tiles, type Tile } from '@/components/project-parts'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/badge'
import Polavaram from './Polavaram'
import { projectQuestion as question, projectQuestionTe as questionTe, useTitle } from '@/lib/titles'

export default function ProjectPage({ id }: { id: number }) {
  const real = MERGED[id] ?? id
  const p = byId.get(real)
  const { lang } = useLang()
  useTitle(p ? { en: question(p), te: questionTe(p) } : null, lang)
  if (real === 613) return <Polavaram />
  if (!p) return <Page className="py-24"><Blank kind="notRead">No project record has this number</Blank></Page>
  return <GenericProject p={p} />
}

// A paper that prints a share of work done is a progress reading: it goes on the progress band, in the paper's own words.
const READING = /^([\d.]+)% physical progress/
const SPENT = /₹([\d,]+(?:\.\d+)?) crore spent/
const COST = /cost then stated as ₹([\d,]+(?:\.\d+)?) crore/
const paperName = (doc: string) => (doc in PORTAL_WORDS ? PORTAL_WORDS[doc] : clean(doc))
const toNum = (s: string) => Number(s.replace(/,/g, ''))

// Words a project page may use, shown only when the page uses them.
const PROJECT_WORDS: { test: (p: Project) => boolean; en: string; te: string; plain: { en: string; te: string } }[] = [
  { test: (p) => /Government Orders/.test(p.sp), en: 'Government order (G.O.)', te: 'ప్రభుత్వ ఉత్తర్వు (జీవో)', plain: { en: 'A numbered, dated written order of the state government.', te: 'రాష్ట్ర ప్రభుత్వం సంఖ్య, తేదీతో ఇచ్చే లిఖిత ఉత్తర్వు.' } },
  { test: (p) => p.sp === 'MOSPI_IPMD', en: 'MoSPI report', te: 'ఎంఓఎస్‌పీఐ నివేదిక', plain: { en: 'The central statistics ministry’s monthly report on big central projects, with their cost and progress.', te: 'పెద్ద కేంద్ర ప్రాజెక్టుల ఖర్చు, పురోగతిపై కేంద్ర గణాంకాల శాఖ నెలవారీ నివేదిక.' } },
  { test: (p) => p.sp === 'AMRUT_MoHUA', en: 'AMRUT', te: 'అమృత్', plain: { en: 'A central government programme that pays for town works such as drinking water, sewerage and ponds.', te: 'తాగునీరు, మురుగునీరు, చెరువుల వంటి పట్టణ పనులకు నిధులిచ్చే కేంద్ర ప్రభుత్వ కార్యక్రమం.' } },
  { test: (p) => p.st === 'tendered', en: 'Tender', te: 'టెండర్', plain: { en: 'A public call asking companies to bid for the job, with a closing date.', te: 'పనికి బిడ్లు వేయమని కంపెనీలను పిలిచే బహిరంగ ప్రకటన; దానికి గడువు ఉంటుంది.' } },
  { test: (p) => p.c != null, en: 'Cost as printed', te: 'ముద్రించిన వ్యయం', plain: { en: 'The estimate in that paper, on that date. It is not money spent.', te: 'ఆ పత్రంలో, ఆ తేదీ నాటి అంచనా. ఇది ఖర్చు చేసిన డబ్బు కాదు.' } },
  { test: (p) => p.p != null, en: 'Physical progress', te: 'భౌతిక పురోగతి', plain: { en: 'The share of the building work done, as the paper prints it. It is not the share of money spent.', te: 'నిర్మాణ పనిలో పూర్తయిన భాగం, పత్రం ముద్రించినట్లు. ఖర్చయిన డబ్బులో భాగం కాదు.' } },
]

function GenericProject({ p }: { p: Project }) {
  const big = bigWorks.find((w) => w.id === p.id)
  const { d } = useDesign()
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const day = (s?: string | null) => (te ? dateTe(s) : dateLong(s))
  const money = (v: number | null | undefined) => (te ? croreTe(v) : crore(v))
  const evs = events[String(p.id)] ?? []
  const paper = paperOf(p)
  const url = p.cu ?? p.su ?? undefined
  const amrut = isAmrut(p)
  const dist = p.d ? districtByName.get(p.d) : null
  const placeName = dist ? (te ? dist.te : dist.name) : p.d
  const status = STATUS_WORDS[p.st]?.en ?? p.st
  const statusTe = STATUS_WORDS[p.st]?.te ?? p.st
  const due = p.due ? p.due.slice(0, 7) : null
  const others = (p.d ? worksIn(p.d) : []).filter((o) => o.id !== p.id).sort((a, b) => (b.c ?? 0) - (a.c ?? 0)).slice(0, 6)
  const notPrinted = <span className="text-[20px] text-muted-foreground">{tr('Not printed', 'ముద్రించలేదు')}</span>

  const tiles: Tile[] = [
    { label: tr('Work done', 'జరిగిన పని'), te: tr('జరిగిన పని', 'Work done'), value: p.p != null ? `${num(p.p)}%` : notPrinted, bar: p.p,
      caption: p.p != null ? tr(<>Progress as printed in the {paper}.</>, <>పత్రం ముద్రించిన పురోగతి.</>) : tr(<>The paper gives no share of work done.</>, <>పత్రం పని శాతం ఇవ్వలేదు.</>), paper: { label: paper, url } },
    { label: tr('Money', 'ఖర్చు'), te: tr('ఖర్చు', 'Money'), value: p.c != null ? money(p.c) : notPrinted,
      caption: p.c != null ? tr(<>The cost the paper prints.</>, <>పత్రం ముద్రించిన వ్యయం.</>) : tr(<>The paper prints no cost for this work.</>, <>ఈ పనికి పత్రం వ్యయం ముద్రించలేదు.</>), paper: p.c != null ? { label: paper, url: p.cu ?? undefined } : undefined },
    { label: p.st === 'completed' ? tr('Completion date given', 'ఇచ్చిన పూర్తి తేదీ') : tr('Due date', 'గడువు'), te: p.st === 'completed' ? tr('ఇచ్చిన పూర్తి తేదీ', 'Completion date given') : tr('గడువు', 'Due date'),
      value: due ? day(due) : notPrinted,
      caption: due
        ? (p.st === 'completed'
          ? tr(<>The date the paper gives for completion.</>, <>పత్రం ఇచ్చిన పూర్తి తేదీ.</>)
          : dueGone(p.due, p.st)
            ? tr(<><b>Due date has passed.</b> The paper still lists it as {status.toLowerCase()}.</>, <><b>గడువు దాటిపోయింది.</b> పత్రం ఇప్పటికీ దీన్ని “{statusTe}” అనే చూపుతోంది.</>)
            : tr(<>A plan, not an event.</>, <>ఇది ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు.</>))
        : tr(<>The paper gives no due date.</>, <>పత్రం గడువు ఇవ్వలేదు.</>),
      paper: due ? { label: paper, url } : undefined },
  ]

  return (
    <Page className="pt-6 md:pt-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href={href('')}>{tr('Home', 'హోమ్')}</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href={href('projects')}>{tr('Projects', 'పనులు')}</BreadcrumbLink></BreadcrumbItem>
          {dist ? (<><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href={href('district-' + dist.slug)}>{placeName}</BreadcrumbLink></BreadcrumbItem></>) : null}
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0 max-w-full"><BreadcrumbPage className="min-w-0 max-w-[40ch] truncate">{p.t}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <StatusWord status={p.st} size="md" />
          <Badge variant="outline">{te ? <Te>{TYPE_WORDS[p.ty]?.te}</Te> : TYPE_WORDS[p.ty]?.en ?? p.ty}</Badge>
          <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">{placeName ?? placeText(p, lang)}</Badge>
        </div>
        <h1 className="mt-4 text-[32px] font-semibold leading-[1.08] tracking-tight [text-wrap:balance] md:text-[46px]" lang={te ? 'te' : undefined}>{te ? questionTe(p) : question(p)}</h1>
        <p className="mt-2 text-[17px] text-muted-foreground" lang={te ? 'en' : 'te'}>{te ? question(p) : questionTe(p)}</p>
        <p className="mt-3 text-[15.5px] text-foreground/80" lang="en">{clean(p.t)}{p.dept ? <span className="text-muted-foreground"> · {clean(p.dept)}</span> : null}</p>
        <AnswerBox className="mt-6">
          {te ? (<>
            <p><b>{statusTe}.</b> {paper} దీన్ని ఇలాగే చూపుతోంది{p.l ? <> ({dateTe(p.l)} నాటి పత్రం)</> : null}.</p>
            {p.p != null
              ? <p>పత్రం ముద్రించిన పురోగతి <b>{num(p.p)}%</b>{p.c != null ? <>; వ్యయం <b>{croreTe(p.c)}</b></> : null}.</p>
              : p.c != null ? <p>పత్రం వ్యయాన్ని <b>{croreTe(p.c)}</b>గా ముద్రించింది; పని శాతం ఇవ్వలేదు.</p> : null}
            {due ? (p.st === 'completed'
              ? <p>పత్రం ఇచ్చిన పూర్తి తేదీ <b>{dateTe(due)}</b>.</p>
              : <p>పత్రం ఇచ్చిన గడువు <b>{dateTe(due)}</b>. {dueGone(p.due, p.st) ? 'గడువు దాటిపోయింది.' : 'ఇది ప్రణాళిక మాత్రమే, జరిగిన సంఘటన కాదు.'}</p>) : null}
          </>) : (<>
            <p><b>{status}.</b> That is how the {paper} lists it{p.l ? <>, in its paper of {dateLong(p.l)}</> : null}.</p>
            {p.p != null ? <p>It prints <b>{num(p.p)}%</b> progress{p.c != null ? <> and a cost of <b>{crore(p.c)}</b></> : null}.</p> : p.c != null ? <p>It prints a cost of <b>{crore(p.c)}</b> and no share of work done.</p> : null}
            {due ? (p.st === 'completed'
              ? <p>The date it gives for completion is <b>{dateLong(due)}</b>.</p>
              : <p>The due date it gives is <b>{dateLong(due)}</b>. {dueGone(p.due, p.st) ? 'Due date has passed.' : 'That is a plan, not an event.'}</p>) : null}
          </>)}
          <div className="pt-1"><PaperChip label={paper} url={url} /></div>
        </AnswerBox>
      </div>

      {big ? (
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-muted),transparent_70%)]">
          <div className="relative h-[300px] sm:h-[400px]"><BigWorkModel w={big} /></div>
          <div className="border-t border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground">{tr(modelNote(big, true).en, modelNote(big, true).te)}{big.id === 2 ? <> <a className="underline underline-offset-4" href="https://aim-india.aai.aero/sites/default/files/aip_supplements/AIPS_2026_80_0.pdf" target="_blank" rel="noreferrer">{tr('AAI AIP Supplement 80/2026', 'ఏఏఐ AIP సప్లిమెంట్ 80/2026')}</a></> : null}</div>
        </div>
      ) : null}

      <div className="mt-10"><Tiles variant={d.tiles} tiles={tiles} /></div>

      {amrut ? (
        <div className="mt-10 max-w-3xl space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="text-[15px] font-semibold">{tr('One record, one paper', 'ఒక రికార్డు, ఒక పత్రం')}</div>
          <p className="text-[15px] text-muted-foreground">{te
            ? <>ఈ పని పట్టణ పనుల <Term term="AMRUT">అమృత్</Term> జాబితా నుంచి వచ్చింది. ఆ జాబితా తన అంకెలకు ఇంకా తేదీ ఇవ్వలేదు, అందుకే పత్రాన్ని తేదీ లేకుండా చూపుతున్నాం. ఈ పత్రం తేదీ ఇంకా నమోదు కాలేదు.</>
            : <>This work comes from the <Term term="AMRUT">AMRUT</Term> list of town works. That list gives no date for its figures yet, so we show the paper without one. Date of this paper not recorded yet.</>}</p>
        </div>
      ) : evs.length ? (
        <Section className="mt-16" eyebrow={tr('The project road', 'ప్రాజెక్టు ప్రయాణం')} title={tr('How it moved, paper by paper', 'పత్రం పత్రానికీ ఎలా కదిలింది')}
          lede={<><b className="text-foreground">{tr('How to read it: ', 'ఎలా చదవాలి: ')}</b>{tr('each step is one government paper, oldest first, with its date. Government changes are marked by date only. ', 'ప్రతి అడుగు ఒక ప్రభుత్వ పత్రం, పాతది ముందు, దాని తేదీతో. ప్రభుత్వ మార్పులను తేదీతో మాత్రమే గుర్తించాం. ')}<b className="text-foreground">{tr('What this does not tell you: ', 'ఇది చెప్పనిది: ')}</b>{tr('what is built on the ground, beyond what a paper prints.', 'పత్రం ముద్రించినదానికి మించి నేలపై ఏం కట్టారో.')}</>}>
          <RoadBlock variant={d.road === 'road' ? (evs.length > 1 ? 'road' : 'origin') : d.road}
            steps={evs.filter((e) => !READING.test(clean(e.title))).map((e) => ({ date: e.date, label: clean(e.title), text: clean(e.title), long: clean(e.title), paper: paperName(e.doc), url: e.url }))}
            readings={evs.filter((e) => READING.test(clean(e.title))).map((e) => {
              const t = clean(e.title), sp = t.match(SPENT), co = t.match(COST)
              const spent = sp ? toNum(sp[1]) : null
              // In Telugu the note is rebuilt from the same figures; the English keeps the paper's own line.
              const noteTe = [spent != null ? `ఇప్పటివరకు ${croreTe(spent)} ఖర్చు` : null, co ? `అప్పటి వ్యయం ${croreTe(toNum(co[1]))}` : null].filter(Boolean).join('; ')
              return { date: e.date, pct: Number(t.match(READING)![1]), paper: paperName(e.doc), url: e.url, spent, note: te ? (noteTe ? noteTe + '.' : undefined) : t }
            })}
            due={due} dueLabel={due ? tr(`Due ${dateLong(due)}`, `గడువు ${dateTe(due)}`) : undefined} duePaper={paper} />
        </Section>
      ) : null}

      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ident">
          <h2 id="ident" className="text-[22px] font-semibold tracking-tight">{tr('The record’s identity', 'రికార్డు వివరాలు')}</h2>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            {[[tr('Department', 'శాఖ'), p.dept ? clean(p.dept) : tr('Not named in the papers', 'పత్రాల్లో పేరు లేదు')],
              [tr('Kind of work', 'పని రకం'), te ? TYPE_WORDS[p.ty]?.te ?? p.ty : TYPE_WORDS[p.ty]?.en ?? p.ty],
              [tr('District', 'జిల్లా'), placeName ?? placeText(p, lang)],
              [tr('Tracked from', 'ఆధారం'), paper],
              [tr('First paper on record', 'రికార్డులో మొదటి పత్రం'), p.f ? day(p.f) : tr('Date not recorded', 'తేదీ నమోదు కాలేదు')],
              [tr('Newest paper on record', 'రికార్డులో తాజా పత్రం'), p.l ? day(p.l) : tr('Date not recorded', 'తేదీ నమోదు కాలేదు')]].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4 px-4 py-2.5 text-[14.5px]"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] text-muted-foreground">{tr('A blank means the government has not published that number, not that nothing is known.', 'ఖాళీ అంటే ప్రభుత్వం ఆ సంఖ్యను ప్రచురించలేదని; ఏమీ తెలియదని కాదు.')}</p>
        </section>
        <section aria-labelledby="pwords">
          <h2 id="pwords" className="text-[22px] font-semibold tracking-tight">{tr('Words to know', 'తెలుసుకోవాల్సిన పదాలు')}</h2>
          <dl className="mt-3 grid gap-2.5">
            {PROJECT_WORDS.filter((w) => w.test(p)).map((w) => (
              <div key={w.en} className="rounded-xl border border-border bg-card px-4 py-3">
                <dt className="flex flex-wrap items-baseline gap-x-2"><span className="text-[15px] font-semibold" lang={te ? 'te' : undefined}>{te ? w.te : w.en}</span><span className="text-[13px] text-muted-foreground" lang={te ? 'en' : 'te'}>{te ? w.en : w.te}</span></dt>
                <dd className="mt-1 text-[14px] leading-snug text-muted-foreground">{w.plain[lang]}</dd>
              </div>
            ))}
          </dl>
          <a href={href('words')} className="mt-3 inline-flex text-[14px] font-medium underline underline-offset-4">{tr('More words', 'మరిన్ని పదాలు')}</a>
        </section>
      </div>

      {placesOf(p.id) ? (
        <Section className="mt-16" eyebrow={tr('Where it is', 'ఎక్కడ ఉంది')} title={tr('What official papers say about its place', 'దీని చోటు గురించి అధికారిక పత్రాలు ఏం చెబుతున్నాయి')}
          lede={tr('Each card is one paper, in its own words. Andhra Pradesh redrew its districts in April 2022 and again in January 2026, so a district is shown as the paper printed it. Today’s district appears beside it only where it can be shown for certain.',
            'ప్రతి కార్డు ఒక పత్రం, దాని సొంత మాటల్లో. ఆంధ్రప్రదేశ్ జిల్లాలను 2022 ఏప్రిల్‌లో, మళ్లీ 2026 జనవరిలో గీశారు; అందుకే జిల్లాను పత్రంలో ఉన్నట్లే చూపాం. నేటి జిల్లాను ఖచ్చితంగా చెప్పగలిగిన చోట మాత్రమే పక్కన చూపాం.')}>
          <PlaceReadings readings={placesOf(p.id)!.readings} />
        </Section>
      ) : null}

      {others.length ? (
        <Section className="mt-16" eyebrow={placeName ?? ''} title={tr(`Other works in ${p.d}`, `${placeName}లో ఇతర పనులు`)}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o) => (
              <a key={o.id} href={href('project-' + o.id)} className="group rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
                <StatusWord status={o.st} />
                <div className="mt-2 line-clamp-2 text-[15px] font-medium leading-snug group-hover:underline" lang="en">{clean(o.t)}</div>
                <div className="mt-2 text-[13px] text-muted-foreground">{o.c != null ? money(o.c) : tr('No cost printed', 'వ్యయం ముద్రించలేదు')} · {te ? TYPE_WORDS[o.ty]?.te : TYPE_WORDS[o.ty]?.en}</div>
              </a>
            ))}
          </div>
          {dist ? <a href={href('district-' + dist.slug)} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium">{tr(`Everything in ${dist.name}`, `${dist.te}లో అన్నీ`)}<ArrowRight className="size-4" /></a> : null}
        </Section>
      ) : null}

      <section className="mt-16 max-w-3xl rounded-2xl border border-border bg-card p-5" aria-labelledby="disc">
        <h2 id="disc" className="text-[19px] font-semibold">{tr('Reader discussion', 'పాఠకుల చర్చ')}</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{tr('Points, questions and local knowledge about this record. Comments never change a figure; only a paper does. House rules: about the data, not about each other; no personal data.', 'ఈ రికార్డు గురించి అభిప్రాయాలు, ప్రశ్నలు, స్థానిక సమాచారం. వ్యాఖ్యలు ఏ అంకెనూ మార్చవు; పత్రం మాత్రమే మారుస్తుంది. నియమాలు: డేటా గురించి, ఒకరిపై ఒకరు కాదు; వ్యక్తిగత సమాచారం వద్దు.')}</p>
        <div className="mt-3 flex flex-wrap gap-3"><a href={href('community')} className="inline-flex items-center gap-1.5 text-[14.5px] font-medium">{tr('Open the discussion', 'చర్చ తెరవండి')}<ArrowRight className="size-4" /></a><a href={href('community')} className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-muted-foreground">{tr('Report a correction', 'సవరణ తెలపండి')}</a></div>
      </section>
    </Page>
  )
}
