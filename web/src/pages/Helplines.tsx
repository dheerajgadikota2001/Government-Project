import * as React from 'react'
import { ArrowUpRight, Check, Copy, Phone, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { helplines } from '@/lib/data'
import { dateLong, dateTe } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { PaperChip, Section } from '@/components/kit'
import { Input } from '@/components/ui/input'

/** Hours as the source pages give them, in Telugu where the wording is ours. */
const HOURS_TE: Record<string, string> = { 'not published on source page': 'మూల పేజీలో ప్రచురించలేదు', '24x7': 'రోజంతా, ప్రతి రోజూ (24x7)', '8AM to 8PM': 'ఉదయం 8 నుంచి రాత్రి 8 వరకు', '24x7 (not stated on source page)': '24x7 (మూల పేజీలో చెప్పలేదు)' }

// Who to call and where to go. Every number and address was read off a
// government page; what could not be confirmed is said to be unconfirmed.
// A wrong number is worse than a missing one.

const H = helplines as any
const FETCHED = H.fetched as string

// Spaced hyphens in the source read as dashes; the page uses a colon instead.
const tidy = (t?: string | null) => (t ?? '').replace(/\s+[-\u2013\u2014]\s+/g, ': ').replace(/\bhistoric\b/g, 'earlier')
const host = (u?: string | null) => (u ? u.split(/\s*;\s*/)[0].replace(/^https?:\/\//, '').replace(/\/$/, '') : '')
const firstUrl = (u?: string | null) => (u ? u.split(/\s*;\s*/)[0] : undefined)

/** A number you can read, select and copy. Tapping it may also dial, on a phone. */
function Num({ n, big }: { n: string; big?: boolean }) {
  const [done, setDone] = React.useState(false)
  const copy = () => {
    try { navigator.clipboard.writeText(n).then(() => { setDone(true); setTimeout(() => setDone(false), 1800) }, () => {}) } catch { /* the number stays selectable */ }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={`tel:${n.replace(/[^\d+]/g, '')}`} className={cn('select-all font-heading font-semibold tnum hover:underline', big ? 'text-[56px] leading-none tracking-tight' : 'text-[19px]')}>{n}</a>
      <button type="button" onClick={copy} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Copy ${n}`}>
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  )
}

const PROBLEMS: { en: string; te: string }[] = [
  { en: 'Land record error, mutation, or a boundary or title dispute', te: 'భూమి రికార్డులో తప్పు, మ్యుటేషన్, సరిహద్దు లేదా హక్కు వివాదం' },
  { en: 'Ration card: new card, a member added or removed, a correction, or a dealer refusing grain', te: 'రేషన్ కార్డు: కొత్త కార్డు, సభ్యుల చేర్పు, తొలగింపు, సవరణ, లేదా డీలర్ బియ్యం ఇవ్వకపోవడం' },
  { en: 'Pension not received (old age, widow, disability)', te: 'పింఛను రాలేదు (వృద్ధాప్య, వితంతు, దివ్యాంగ)' },
  { en: 'Electricity: new connection, wrong bill or outage', te: 'కరెంటు: కొత్త కనెక్షన్, తప్పు బిల్లు, లేదా కరెంటు పోవడం' },
  { en: 'Drinking water and sanitation', te: 'తాగునీరు, పారిశుధ్యం' },
  { en: 'A road or civic work not done', te: 'రోడ్డు లేదా ఇతర పౌర పని జరగలేదు' },
  { en: 'A government school complaint', te: 'ప్రభుత్వ పాఠశాలపై ఫిర్యాదు' },
  { en: 'A government hospital complaint, or a denied health-scheme entitlement', te: 'ప్రభుత్వ ఆసుపత్రిపై ఫిర్యాదు, లేదా ఆరోగ్య పథకం లబ్ధి నిరాకరణ' },
  { en: 'Police: filing an FIR, and what to do if a station refuses', te: 'పోలీసు: ఎఫ్‌ఐఆర్ నమోదు, స్టేషన్ నిరాకరిస్తే ఏం చేయాలి' },
  { en: 'A consumer complaint against a business', te: 'వ్యాపారంపై వినియోగదారుడి ఫిర్యాదు' },
]

// Departments are found by what they do, not by a scheme's brand name.
const FUNCTIONS: { en: string; te: string; match: RegExp }[] = [
  { en: 'Land records', te: 'భూమి రికార్డులు', match: /land|revenue|ccla/i },
  { en: 'Pensions', te: 'పింఛన్లు', match: /pension/i },
  { en: 'Police', te: 'పోలీసు', match: /police|prohibition/i },
  { en: 'Electricity', te: 'కరెంటు', match: /energy|power|electric/i },
  { en: 'Water', te: 'నీరు', match: /water/i },
  { en: 'Schools and colleges', te: 'బడులు, కళాశాలలు', match: /school|education/i },
  { en: 'Hospitals and health', te: 'ఆసుపత్రులు, ఆరోగ్యం', match: /health|medical|ayush|drugs/i },
  { en: 'Ration and food', te: 'రేషన్, ఆహారం', match: /civil supplies|consumer|legal metrology/i },
  { en: 'Farming', te: 'వ్యవసాయం', match: /agricult|horticult|animal|fisher|marketing|co-operation/i },
  { en: 'Jobs and skills', te: 'ఉద్యోగాలు, నైపుణ్యాలు', match: /employment|labour|skill|construction workers/i },
  { en: 'Roads and buses', te: 'రోడ్లు, బస్సులు', match: /road|transport|apsrtc/i },
  { en: 'Welfare', te: 'సంక్షేమం', match: /welfare|minorit|differently|women|tribal|backward|mepma/i },
]

// Two department entries carry a scheme's brand in their names; we list them by what they do.
const RENAME: Record<string, string> = {
  'Dr. YSR Aarogyasri Health Care Trust (state health scheme)': 'State health scheme trust',
  'Social security pensions (NTR Bharosa Pension)': 'Social security pensions',
}

export default function Helplines() {
  const { lang, tr } = useLang()
  const [prob, setProb] = React.useState(2)
  const [q, setQ] = React.useState('')
  const [fn, setFn] = React.useState<number | null>(null)
  const [allUnknown, setAllUnknown] = React.useState(false)
  const emergency = (H.emergency as any[]).filter((e) => e.number !== '112')
  const e112 = (H.emergency as any[]).find((e) => e.number === '112')
  const lines = H.helplines as any[]
  const state = lines.filter((l) => l.scope === 'state')
  const national = lines.filter((l) => l.scope !== 'state')
  const ladder = (H.escalations as any[])[prob]
  const deps = (H.departments as any[]).map((d) => ({ ...d, shown: RENAME[d.name] ?? d.name }))
    .filter((d) => (fn == null || FUNCTIONS[fn].match.test(d.name)) && (!q.trim() || d.shown.toLowerCase().includes(q.trim().toLowerCase()) || d.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => a.shown.localeCompare(b.shown))
  const unknown = H.unavailable as any[]
  const checkFirst = lines.filter((l) => l.check_first).map((l) => l.number)
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Helplines', 'సహాయ నంబర్లు')} q={{ en: 'Who to call, and where to go', te: 'ఎవరికి ఫోన్ చేయాలి, ఎక్కడికి వెళ్లాలి' }}
        lede={tr(`Every number and address here was read off a government page in our check of ${dateLong(FETCHED)}, and each one names that page. A wrong number is worse than a missing one, so what we could not confirm is marked as not confirmed.`,
          `ఇక్కడి ప్రతి నంబరు, చిరునామా ${dateTe(FETCHED)} నాటి మా తనిఖీలో ప్రభుత్వ పేజీ నుంచి చదివినవే; ప్రతిదానికీ ఆ పేజీ పేరు ఉంది. తప్పు నంబరు కంటే నంబరు లేకపోవడమే మేలు; అందుకే నిర్ధారించలేనివి అలాగే గుర్తించాం.`)} />

      {/* 1. emergency */}
      <section className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.6fr]" aria-labelledby="emerg">
        <div className="rounded-2xl border-2 border-foreground bg-card p-5">
          <div id="emerg" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('If this is an emergency', 'అత్యవసరమైతే')}</div>
          <div className="mt-2"><Num n="112" big /></div>
          <p className="mt-2 text-[15px] leading-snug">{tr('One number for police, fire and ambulance, anywhere in India.', 'పోలీసు, అగ్నిమాపక, అంబులెన్స్‌కు ఒకే నంబరు, భారతదేశంలో ఎక్కడైనా.')}</p>
          <div className="mt-1 text-[13px] text-muted-foreground">{tr('All India · 24 hours', 'దేశమంతటా · 24 గంటలు')}</div>
          {e112 ? <div className="mt-3"><PaperChip label={host(e112.source_url)} url={firstUrl(e112.source_url)} /></div> : null}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {emergency.map((e) => (
            <li key={e.number} className="rounded-xl border border-border bg-card px-4 py-3">
              <Num n={e.number} />
              <div className="text-[14px] font-medium leading-snug" lang="en">{tidy(e.name)}</div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{e.scope === 'state' ? tr('Andhra Pradesh', 'ఆంధ్రప్రదేశ్') : tr('All India', 'దేశమంతటా')} · {lang === 'te' && HOURS_TE[e.hours] ? HOURS_TE[e.hours] : <span lang="en">{e.hours}</span>}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. where to start */}
      <Section className="mt-16" eyebrow={tr('Step by step', 'అడుగు అడుగుగా')} title={tr('I have a problem. Where do I start?', 'నాకు సమస్య ఉంది. ఎక్కడ మొదలుపెట్టాలి?')}
        lede={tr('Pick your problem. Go up one step at a time, and take what each step asks for.', 'మీ సమస్యను ఎంచుకోండి. ఒక్కో మెట్టు పైకి వెళ్లండి; ప్రతి మెట్టుకు చెప్పినవి తీసుకెళ్లండి.')}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <ul className="overflow-hidden rounded-2xl border border-border bg-card" role="listbox" aria-label={tr('Problems', 'సమస్యలు')}>
            {PROBLEMS.map((p, i) => (
              <li key={i} role="option" aria-selected={i === prob}>
                <button type="button" onClick={() => setProb(i)} lang={lang === 'te' ? 'te' : undefined}
                  className={cn('w-full border-b border-border px-4 py-3 text-left text-[14.5px] leading-snug last:border-0', i === prob ? 'border-l-4 border-l-brand bg-brand-soft font-semibold' : 'hover:bg-accent/60')}>
                  {lang === 'te' ? p.te : p.en}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-[17px] font-semibold leading-snug" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? PROBLEMS[prob].te : PROBLEMS[prob].en}</h3>
            <ol className="mt-4 space-y-4">
              {ladder.steps.map((s: any) => (
                <li key={s.rung} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className={cn('grid size-8 place-items-center rounded-full text-[13px] font-bold', s.unconfirmed ? 'border-[1.5px] border-dashed border-foreground/50 text-foreground/80' : 'bg-foreground text-background')}>{s.rung}</span>
                  <div className={cn('min-w-0', s.unconfirmed && 'rounded-xl border border-dashed border-foreground/30 px-3 py-2')}>
                    <div className="text-[15px] font-semibold leading-snug" lang="en">{tidy(s.office)}</div>
                    {s.what_to_bring ? <div className="mt-1 text-[13.5px] leading-snug text-foreground/85"><b>{tr('Bring: ', 'తీసుకెళ్లండి: ')}</b><span lang="en">{tidy(s.what_to_bring)}</span></div> : null}
                    {s.unconfirmed ? <div className="mt-1 text-[13px] font-medium text-muted-foreground">{tr('Not confirmed: the usual next office, but no government page we read states it.', 'నిర్ధారణ కాలేదు: సాధారణంగా తర్వాతి కార్యాలయం ఇదే, కానీ మేము చదివిన ఏ ప్రభుత్వ పేజీ ఇది చెప్పలేదు.')}</div> : null}
                    {s.portal ? <div className="mt-1.5 flex flex-wrap gap-1.5">{String(s.portal).split(/\s*;\s*/).filter((u: string) => /^https?:/.test(u)).map((u: string) => <PaperChip key={u} label={host(u)} url={u} />)}</div> : null}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">{tr('The AP Public Services Delivery Guarantee Act, 2017 lets the government notify a time limit for each service. We could not find that notification on a government page, so no step shows a legal time limit yet.',
              'ఏపీ ప్రజా సేవల హామీ చట్టం, 2017 ప్రకారం ప్రతి సేవకు గడువును ప్రభుత్వం నోటిఫై చేయవచ్చు. ఆ నోటిఫికేషన్ ఏ ప్రభుత్వ పేజీలోనూ మాకు దొరకలేదు; అందుకే ఏ మెట్టుకూ చట్టపరమైన గడువు చూపలేదు.')}</p>
          </div>
        </div>
      </Section>

      {/* 3. how to complain */}
      <Section className="mt-16" eyebrow={tr('Complaints', 'ఫిర్యాదులు')} title={tr('How do I complain to the government?', 'ప్రభుత్వానికి ఫిర్యాదు ఎలా చేయాలి?')}>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(H.grievance as any[]).map((g) => (
            <li key={g.name} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="text-[15.5px] font-semibold leading-snug" lang="en">{tidy(g.name.replace(/ - Andhra Pradesh Public Grievance Redressal System/, ''))}</div>
              <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground" lang="en">{tidy(g.what_for)}</p>
              {g.url ? <div className="mt-auto pt-3"><PaperChip label={host(g.url)} url={firstUrl(g.url)} /></div> : null}
            </li>
          ))}
        </ul>
      </Section>

      {/* 4. helplines */}
      <Section className="mt-16" eyebrow={tr('Helplines', 'సహాయ నంబర్లు')} title={tr('Every helpline we could confirm', 'మేము నిర్ధారించిన ప్రతి సహాయ నంబరు')}
        lede={tr(`“Check first” marks a number whose own entry says to dial-test it before publishing: ${checkFirst.join(', ')}. Dial them yourself before you rely on them.`,
          `“ముందు సరిచూడండి” అని ఉన్న నంబర్లను ప్రచురించే ముందు డయల్ చేసి చూడాలని వాటి నమోదులోనే ఉంది: ${checkFirst.join(', ')}. వాటిపై ఆధారపడే ముందు మీరే డయల్ చేసి చూడండి.`)}>
        <div className="grid gap-4 lg:grid-cols-2">
          {[{ t: tr('Andhra Pradesh', 'ఆంధ్రప్రదేశ్'), rows: state }, { t: tr('All India', 'దేశమంతటా'), rows: national }].map((col) => (
            <div key={col.t} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{col.t}</div>
              <ul className="divide-y divide-border">
                {col.rows.map((l: any) => (
                  <li key={l.number} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                    <span className="min-w-0 text-[14px] leading-snug" lang="en">{tidy(l.name)}</span>
                    <span className="flex items-center gap-2">
                      {l.check_first ? <span className="whitespace-nowrap rounded-full border border-dashed border-foreground/45 bg-secondary px-2 py-0.5 text-[11.5px] font-semibold">{tr('Check first', 'ముందు సరిచూడండి')}</span> : null}
                      <Num n={l.number} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. departments */}
      <Section className="mt-16" eyebrow={tr('Departments', 'శాఖలు')} title={tr('Every department, and its website', 'ప్రతి శాఖ, దాని వెబ్‌సైట్')}
        lede={tr(`${(H.departments as any[]).length} departments, from the Government of India’s IGOD directory, because the state portal’s own directory would not open from here. Find one by what it does.`,
          `${(H.departments as any[]).length} శాఖలు, భారత ప్రభుత్వ ఐజీఓడీ డైరెక్టరీ నుంచి; రాష్ట్ర పోర్టల్ సొంత డైరెక్టరీ ఇక్కడి నుంచి తెరుచుకోలేదు. శాఖ చేసే పని ఆధారంగా వెతకండి.`)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search a department', 'శాఖను వెతకండి')} className="h-10 pl-9" aria-label={tr('Search a department', 'శాఖను వెతకండి')} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FUNCTIONS.map((f, i) => (
            <button key={f.en} type="button" onClick={() => setFn(fn === i ? null : i)} aria-pressed={fn === i} lang={lang === 'te' ? 'te' : undefined}
              className={cn('rounded-full border px-3 py-1.5 text-[13px]', fn === i ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/30')}>{lang === 'te' ? f.te : f.en}</button>
          ))}
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {deps.map((d) => (
            <li key={d.name} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-[14.5px] font-medium leading-snug" lang="en">{tidy(d.shown)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {d.website ? <PaperChip label={host(d.website)} url={d.website} /> : <span className="text-[12.5px] text-muted-foreground">{tr('No website we could confirm', 'నిర్ధారించిన వెబ్‌సైట్ లేదు')}</span>}
                {d.citizen_portal && d.citizen_portal !== d.website ? <PaperChip label={tr('Citizen portal', 'పౌర పోర్టల్')} url={d.citizen_portal} /> : null}
              </div>
              {d.phone ? <div className="mt-1.5 text-[13px] text-muted-foreground" lang="en"><Phone className="mr-1 inline size-3.5" />{d.phone}</div> : null}
            </li>
          ))}
        </ul>
        {!deps.length ? <p className="mt-3 text-[14px] text-muted-foreground">{tr('No department matches. Try another word.', 'ఏ శాఖా సరిపోలలేదు. ఇంకో పదం ప్రయత్నించండి.')}</p> : null}
      </Section>

      {/* 6. districts */}
      <Section className="mt-16" eyebrow={tr('Districts', 'జిల్లాలు')} title={tr('Your district’s website', 'మీ జిల్లా వెబ్‌సైట్')}
        lede={tr('No district publishes its collectorate’s phone number on a page we could reach. Markapuram and Polavaram were formed on 1 January 2026 (G.O.Ms.No.524 and No.517 of 30 December 2025). Markapuram’s own site is markapuram.ap.gov.in; we could not open it from outside India to check it. No site for Polavaram is confirmed yet, so use Alluri Sitharama Raju’s for now.',
          'ఏ జిల్లా కూడా కలెక్టరేట్ ఫోన్ నంబరును మేము తెరవగలిగిన పేజీలో ప్రచురించలేదు. మార్కాపురం, పోలవరం జిల్లాలు 2026 జనవరి 1న ఏర్పడ్డాయి (2025 డిసెంబర్ 30 నాటి జీఓ ఎంఎస్ నం. 524, నం. 517). మార్కాపురం సొంత సైట్ markapuram.ap.gov.in; భారత్ బయట నుంచి మేము దాన్ని తెరిచి సరిచూడలేకపోయాం. పోలవరానికి సైట్ ఇంకా ధ్రువీకరించలేదు; ప్రస్తుతానికి అల్లూరి సీతారామరాజు సైట్ వాడండి.')}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(H.districts as any[]).map((d) => (
            <li key={d.name}>
              <a href={d.website} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[14px] hover:border-foreground/30" lang="en">
                <span className="min-w-0 truncate font-medium">{d.name}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </Section>

      {/* 7. unconfirmed */}
      <Section className="mt-16" eyebrow={tr('Gaps', 'ఖాళీలు')} title={tr('What we could not confirm, and what you can do', 'మేము నిర్ధారించలేనివి, మీరు చేయగలిగేది')}
        lede={tr(`${unknown.length} items. Each says which page a person in Andhra Pradesh should open to fill the gap.`, `${unknown.length} అంశాలు. ప్రతిదానికీ, ఆంధ్రప్రదేశ్‌లో ఉన్నవారు ఏ పేజీ తెరిస్తే ఆ ఖాళీ నిండుతుందో చెప్పాం.`)}>
        <ul className="space-y-2">
          {(allUnknown ? unknown : unknown.slice(0, 6)).map((u, i) => (
            <li key={i} className="rounded-xl border border-dashed border-foreground/25 bg-card px-4 py-3">
              <div className="text-[14.5px] font-medium leading-snug [overflow-wrap:anywhere]" lang="en">{tidy(u.what)}</div>
              <div className="mt-1 text-[13.5px] leading-snug text-muted-foreground" lang="en"><b className="text-foreground/80">{tr('What you can do: ', 'మీరు చేయగలిగేది: ')}</b>{tidy(u.what_a_human_should_do)}</div>
            </li>
          ))}
        </ul>
        {unknown.length > 6 ? <button type="button" onClick={() => setAllUnknown((x) => !x)} className="mt-3 text-[14px] font-medium underline underline-offset-4">{allUnknown ? tr('Show fewer', 'తక్కువ చూపండి') : tr(`Show all ${unknown.length}`, `మొత్తం ${unknown.length} చూపండి`)}</button> : null}
      </Section>
    </Page>
  )
}
