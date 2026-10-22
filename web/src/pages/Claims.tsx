import * as React from 'react'
import { ArrowUpRight, Search, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { claims } from '@/lib/data'
import { crore, croreTe, dateLong, dateTe } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { ExampleBox, KindBadge, ListenButton, PaperChip, Section, ShortAnswer } from '@/components/kit'
import { ClaimAnatomy } from '@/components/ClaimAnatomy'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// A claim from a government paper beside the record from independent papers,
// with the reason they differ. The status describes the two numbers, never the
// person. Every government's claims go through the same template, in fair turns.
// Gaps are never worked out by us: both figures are printed instead.

type Bi = { en: string; te: string }
type StatusKey = 'matches' | 'definition' | 'unverifiable' | 'differs'

const STATUS: Record<StatusKey, { name: Bi; plain: Bi; cls: string }> = {
  matches: { name: { en: 'Matches', te: 'సరిపోలింది' }, plain: { en: 'The claim agrees with the record.', te: 'చెప్పిన మాట రికార్డుతో సరిపోలుతోంది.' }, cls: 'bg-brand-soft text-brand border-transparent' },
  definition: { name: { en: 'Different definition', te: 'వేరే నిర్వచనం' }, plain: { en: 'Both can be right: they count different things. The page shows what each one counts.', te: 'రెండూ నిజం కావచ్చు: వేర్వేరు వాటిని లెక్కిస్తాయి. ఏది ఏం లెక్కిస్తుందో పేజీ చూపుతుంది.' }, cls: 'bg-secondary text-ink2 border-foreground/25' },
  unverifiable: { name: { en: 'Cannot be checked', te: 'సరిచూడలేము' }, plain: { en: 'No official figure exists for what the claim describes. We say so instead of reaching for a nearby number.', te: 'చెప్పిన దానికి అధికారిక సంఖ్య లేదు. దగ్గరలోని వేరే సంఖ్యను తీసుకోకుండా, ఆ విషయమే చెబుతాం.' }, cls: 'bg-card text-ink2 border-dashed border-foreground/45' },
  differs: { name: { en: 'Differs', te: 'భిన్నంగా ఉంది' }, plain: { en: 'The claim and the record disagree about the same thing. Not used yet.', te: 'ఒకే విషయంపై చెప్పిన మాట, రికార్డు వేరుగా ఉన్నాయి. ఇంకా వాడలేదు.' }, cls: 'bg-foreground text-background border-transparent' },
}

function Chip({ s, lang, className }: { s: StatusKey; lang: 'en' | 'te'; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-semibold', STATUS[s].cls, className)} lang={lang === 'te' ? 'te' : undefined}>{STATUS[s].name[lang]}</span>
}

const GOV_2019: Bi = { en: 'The government of 30 May 2019 to 11 June 2024 (Chief Minister Y.S. Jagan Mohan Reddy), about 8 June 2014 to 29 May 2019', te: '2019 మే 30 నుంచి 2024 జూన్ 11 వరకు ప్రభుత్వం (ముఖ్యమంత్రి వై.ఎస్. జగన్ మోహన్ రెడ్డి), 2014 జూన్ 8 నుంచి 2019 మే 29 కాలం గురించి' }
const GOV_2024: Bi = { en: 'The government from 12 June 2024 (Chief Minister N. Chandrababu Naidu), about 30 May 2019 to 11 June 2024', te: '2024 జూన్ 12 నుంచి ప్రభుత్వం (ముఖ్యమంత్రి ఎన్. చంద్రబాబు నాయుడు), 2019 మే 30 నుంచి 2024 జూన్ 11 కాలం గురించి' }
const DOC_2019: Bi = { en: 'White paper on state finances, 10 July 2019 (press record; the official host is offline)', te: 'రాష్ట్ర ఆర్థిక స్థితిపై శ్వేతపత్రం, 2019 జూలై 10 (పత్రికా రికార్డు; అధికారిక సైట్ పనిచేయడం లేదు)' }
const DOC_2024: Bi = { en: 'White Paper on State Finances, tabled 26 July 2024 (press record of a scanned paper)', te: 'రాష్ట్ర ఆర్థిక స్థితిపై శ్వేతపత్రం, 2024 జూలై 26న సభలో (స్కాన్ చేసిన పత్రానికి పత్రికా రికార్డు)' }

const rec = (slug: string) => claims.find((c: any) => c.slug === slug)
const R = (slug: string, i: number) => rec(slug)?.record[i]?.figure as number
const K = (slug: string, i: number) => rec(slug)?.claims[i]?.figure as number

type Check = {
  slug: string; q: Bi; status: StatusKey | 'two'; answer: Bi
  claims: { said: Bi; doc: Bi; who: Bi; status: StatusKey; prefix?: Bi }[]
  why: Bi; paperNote: Bi; te: string
}

const C19 = 'ap-debt-31-march-2019', C24 = 'ap-debt-june-2024', C14 = 'ap-debt-june-2014'
const CHECKS: Check[] = [
  {
    slug: C19, te: '2019 మార్చి 31 నాటికి రాష్ట్రం అప్పు ఎంత?', q: { en: 'What was Andhra Pradesh’s debt on 31 March 2019?', te: '2019 మార్చి 31 నాటికి రాష్ట్రం అప్పు ఎంత?' }, status: 'two',
    answer: {
      en: `Two white papers, five years apart, give ${crore(K(C19, 0), 0)} and ${crore(K(C19, 1), 0)} for the same day. RBI prints ${crore(R(C19, 0), 0)}, and the state’s audited accounts ${crore(R(C19, 1), 0)}. The difference is what each one counts.`,
      te: `ఐదేళ్ల తేడాతో వచ్చిన రెండు శ్వేతపత్రాలు ఒకే రోజుకు ${croreTe(K(C19, 0), 0)}, ${croreTe(K(C19, 1), 0)} అని చెప్పాయి. ఆర్బీఐ ${croreTe(R(C19, 0), 0)} అని, రాష్ట్ర ఆడిట్ లెక్కలు ${croreTe(R(C19, 1), 0)} అని ముద్రించాయి. తేడా ఒక్కొక్కరు ఏం లెక్కిస్తారన్న దానిలోనే.`,
    },
    claims: [
      { said: { en: 'Debt by the end of 2018-19.', te: '2018-19 చివరికి అప్పు.' }, doc: DOC_2019, who: GOV_2019, status: 'matches', prefix: { en: 'It is the state’s own revised estimate for 2018-19', te: 'ఇది 2018-19కి రాష్ట్ర సొంత సవరించిన అంచనా' } },
      { said: { en: 'Debt on the state’s exchequer as on 31 March 2019.', te: '2019 మార్చి 31 నాటికి రాష్ట్ర ఖజానాపై అప్పు.' }, doc: DOC_2024, who: GOV_2024, status: 'definition' },
    ],
    why: {
      en: 'All four figures describe the same day. The 2019 paper and the audited accounts count the debt the state itself borrowed. RBI counts the same thing with slightly different coverage. The 2024 paper adds two things the others leave out: money borrowed by state corporations with a government guarantee, and bills not yet paid. Those are real obligations, but no auditor publishes a total that includes them.',
      te: 'నాలుగు అంకెలూ ఒకే రోజువి. 2019 పత్రం, ఆడిట్ లెక్కలు రాష్ట్రం స్వయంగా తీసుకున్న అప్పును లెక్కిస్తాయి. ఆర్బీఐ అదే విషయాన్ని కొద్దిగా వేరే పరిధితో లెక్కిస్తుంది. 2024 పత్రం మిగతావి వదిలేసిన రెండింటిని కలుపుతుంది: ప్రభుత్వ హామీతో రాష్ట్ర కార్పొరేషన్లు తీసుకున్న అప్పులు, ఇంకా చెల్లించని బిల్లులు. అవి నిజమైన బాధ్యతలే, కానీ వాటిని కలిపిన మొత్తాన్ని ఏ ఆడిటరూ ప్రచురించరు.',
    },
    paperNote: { en: 'Both governments’ papers are set against the same two records.', te: 'రెండు ప్రభుత్వాల పత్రాలనూ అవే రెండు రికార్డులతో పోల్చాం.' },
  },
  {
    slug: C24, te: 'జూన్ 2024లో రాష్ట్రం అప్పు ₹9,74,556 కోట్లా?', q: { en: 'Was Andhra Pradesh’s debt ₹9,74,556 crore in June 2024?', te: 'జూన్ 2024లో రాష్ట్రం అప్పు ₹9,74,556 కోట్లా?' }, status: 'definition',
    answer: {
      en: `The 2024 white paper gives ${crore(K(C24, 0), 0)} for 12 June 2024. For 31 March 2024, RBI prints ${crore(R(C24, 0), 0)} and the state’s accounts ${crore(R(C24, 1), 0)}. The paper’s own breakup puts government debt at ₹4,38,278 crore; the rest is corporation borrowing and unpaid bills.`,
      te: `2024 శ్వేతపత్రం 2024 జూన్ 12కు ${croreTe(K(C24, 0), 0)} అని చెప్పింది. 2024 మార్చి 31కి ఆర్బీఐ ${croreTe(R(C24, 0), 0)}, రాష్ట్ర లెక్కలు ${croreTe(R(C24, 1), 0)} అని ముద్రించాయి. పత్రంలోని విభజన ప్రకారం ప్రభుత్వ అప్పు ₹4,38,278 కోట్లు; మిగతాది కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు.`,
    },
    claims: [
      { said: { en: 'Debt on 12 June 2024: government debt ₹4,38,278 crore, corporation debt ₹2,48,677 crore, plus unpaid dues.', te: '2024 జూన్ 12 నాటికి అప్పు: ప్రభుత్వ అప్పు ₹4,38,278 కోట్లు, కార్పొరేషన్ల అప్పు ₹2,48,677 కోట్లు, అదనంగా చెల్లించని బకాయిలు.' }, doc: DOC_2024, who: GOV_2024, status: 'definition' },
    ],
    why: {
      en: 'The part of the paper’s total that it calls government debt is ₹4,38,278 crore on 12 June 2024. The headline is reached by adding corporation borrowings and unpaid bills, which no auditor totals. Both facts can be held at once: the wider total is worth watching, and it cannot be compared with RBI’s or the CAG’s debt figure.',
      te: 'పత్రం మొత్తంలో ప్రభుత్వ అప్పు అని చెప్పిన భాగం 2024 జూన్ 12 నాటికి ₹4,38,278 కోట్లు. కార్పొరేషన్ల అప్పులు, చెల్లించని బిల్లులు కలిపితే పెద్ద సంఖ్య వస్తుంది; వాటిని కలిపిన మొత్తాన్ని ఏ ఆడిటరూ ప్రచురించరు. రెండూ నిజమే: విస్తృత మొత్తాన్ని గమనించాలి, కానీ దాన్ని ఆర్బీఐ లేదా కాగ్ అప్పు సంఖ్యతో పోల్చలేం.',
    },
    paperNote: { en: 'The figures in the claim are the paper’s own, read from the press record because the tabled copy is an image-only scan.', te: 'సభలో పెట్టిన ప్రతి స్కాన్ చేసిన బొమ్మ మాత్రమే; అందుకే చెప్పిన అంకెలను పత్రికా రికార్డు నుంచి చదివాం.' },
  },
  {
    slug: C14, te: 'జూన్ 2014లో అప్పు సుమారు ₹97,000 కోట్లా?', q: { en: 'Was the debt about ₹97,000 crore in June 2014?', te: 'జూన్ 2014లో అప్పు సుమారు ₹97,000 కోట్లా?' }, status: 'unverifiable',
    answer: {
      en: `No auditor publishes a debt figure for June 2014. The first year-end figures, for 31 March 2015, are ${crore(R(C14, 0), 0)} (RBI) and ${crore(R(C14, 1), 0)} (the state’s accounts), and they include nine months of the new state’s own borrowing.`,
      te: `2014 జూన్‌కు ఏ ఆడిటరూ అప్పు సంఖ్య ప్రచురించలేదు. మొదటి ఏడాది ముగింపు సంఖ్యలు, 2015 మార్చి 31కి: ${croreTe(R(C14, 0), 0)} (ఆర్బీఐ), ${croreTe(R(C14, 1), 0)} (రాష్ట్ర లెక్కలు). వీటిలో కొత్త రాష్ట్రం తొమ్మిది నెలల్లో తీసుకున్న అప్పు కూడా ఉంది.`,
    },
    claims: [
      { said: { en: 'Debt when the government took office in June 2014.', te: '2014 జూన్‌లో ప్రభుత్వం బాధ్యతలు చేపట్టినప్పుడు అప్పు.' }, doc: DOC_2019, who: GOV_2019, status: 'unverifiable' },
    ],
    why: {
      en: 'The state began on 2 June 2014. Its share of the undivided state’s debt was set by apportionment under the Reorganisation Act, and no auditor published a figure for that day. RBI and the state’s own book print different figures even for March 2015, which shows that every figure depends on what is counted.',
      te: 'రాష్ట్రం 2014 జూన్ 2న మొదలైంది. ఉమ్మడి రాష్ట్ర అప్పులో దాని వాటాను పునర్వ్యవస్థీకరణ చట్టం ప్రకారం పంపకంతో నిర్ణయించారు; ఆ రోజుకు ఏ ఆడిటరూ సంఖ్య ప్రచురించలేదు. 2015 మార్చికి కూడా ఆర్బీఐ, రాష్ట్ర లెక్కలు వేర్వేరు సంఖ్యలు ముద్రించాయి; ప్రతి సంఖ్య ఏం లెక్కిస్తారన్న దానిపై ఆధారపడుతుందని ఇది చూపుతుంది.',
    },
    paperNote: { en: 'We do not reach for a nearby number to call the claim true or false.', te: 'మాటను నిజం లేదా అబద్ధం అనడానికి దగ్గరలోని వేరే సంఖ్యను తీసుకోం.' },
  },
]

export default function Claims({ focus }: { focus?: string }) {
  const { lang, tr } = useLang()
  const [sent, setSent] = React.useState(false)
  const [q, setQ] = React.useState('')
  React.useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById('check-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    return () => clearTimeout(t)
  }, [focus])
  const ql = q.trim().toLowerCase().replace(/[₹,\s]/g, '')
  const hits = ql.length < 2 ? [] : CHECKS.filter((c) => {
    const hay = [c.q.en, c.q.te, c.answer.en, c.answer.te, ...c.claims.map((k) => k.said.en + k.said.te)].join(' ').toLowerCase().replace(/[₹,\s]/g, '')
    const words = ['debt', 'అప్పు', 'loan', 'రుణ']
    return hay.includes(ql) || (words.some((w) => ql.includes(w)))
  })
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Check a claim', 'నిజమేనా?')} q={{ en: 'Is what I heard true?', te: 'నేను విన్నది నిజమేనా?' }}
        lede={tr('A claim from a government paper, set beside the record from independent papers, with the reason they differ. The status describes the two numbers, never the person who made the claim. Every government’s claims are checked with the same template.',
          'ప్రభుత్వ పత్రంలో చెప్పిన మాటను స్వతంత్ర పత్రాల రికార్డు పక్కన పెట్టి, అవి ఎందుకు వేరుగా ఉన్నాయో చెబుతాం. స్థితి రెండు అంకెల గురించే, చెప్పిన వ్యక్తి గురించి కాదు. ప్రతి ప్రభుత్వం మాటలనూ ఒకే పద్ధతిలో సరిచూస్తాం.')}>
        <div className="mt-5"><ListenButton /></div>
      </PageHead>

      {/* check a number */}
      <section className="mt-10 max-w-3xl rounded-2xl border border-border bg-card p-5" aria-labelledby="check-num">
        <h2 id="check-num" className="text-[18px] font-semibold">{tr('Check a number you heard', 'మీరు విన్న అంకెను సరిచూడండి')}</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('A figure, a topic or a few words, for example 9,74,556 or debt', 'ఒక అంకె, విషయం లేదా కొన్ని మాటలు, ఉదా: 9,74,556 లేదా అప్పు')} className="h-12 pl-11 text-[16px]" aria-label={tr('A figure, a topic or a few words', 'ఒక అంకె, విషయం లేదా కొన్ని మాటలు')} />
        </div>
        {ql.length >= 2 ? (
          hits.length ? (
            <ul className="mt-3 space-y-2">
              {hits.map((c) => <li key={c.slug}><a href={href('claim-' + c.slug)} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:border-foreground/30"><span className="text-[15px] font-medium" lang={lang === 'te' ? 'te' : undefined}>{c.q[lang]}</span>{c.status === 'two' ? null : <Chip s={c.status} lang={lang} />}</a></li>)}
            </ul>
          ) : <p className="mt-3 text-[14px] text-muted-foreground">{tr('No check matches yet. Send the claim to us below, from any side.', 'ఇంకా ఏ పరిశీలనా సరిపోలలేదు. ఏ పక్షం మాటైనా కింద మాకు పంపండి.')}</p>
        ) : <p className="mt-2 text-[13.5px] text-muted-foreground">{tr('Finds the checks and the record on that subject. If nothing matches, you can send the claim to us.', 'ఆ విషయంపై పరిశీలనలు, రికార్డు చూపుతుంది. ఏదీ సరిపోలకపోతే మాకు పంపవచ్చు.')}</p>}
      </section>

      {/* statuses */}
      <Section className="mt-14" eyebrow={tr('What each status means', 'ప్రతి స్థితికి అర్థం')} title={tr('The status describes the numbers', 'స్థితి అంకెల గురించే')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(STATUS) as StatusKey[]).map((s) => (
            <div key={s} className="rounded-xl border border-border bg-card p-4"><Chip s={s} lang={lang} /><p className="mt-2 text-[14px] leading-relaxed text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{STATUS[s].plain[lang]}</p></div>
          ))}
        </div>
        <ExampleBox className="mt-4 max-w-3xl" madeUp={false}>{tr('Two people describe one family’s loans. One counts only the family’s own loans. The other adds a loan a relative took for the family, and bills not yet paid. Both can be honest; they counted different things. Most debt claims differ this way.',
          'ఒకే కుటుంబం అప్పుల గురించి ఇద్దరు చెబుతున్నారు. ఒకరు కుటుంబం సొంత అప్పులే లెక్కిస్తారు. ఇంకొకరు కుటుంబం కోసం ఒక బంధువు చేసిన అప్పు, ఇంకా కట్టని బిల్లులు కూడా కలుపుతారు. ఇద్దరూ నిజాయితీగానే ఉండవచ్చు; వారు వేర్వేరు వాటిని లెక్కించారు. అప్పు గురించిన చాలా మాటలు ఇలాగే వేరవుతాయి.')}</ExampleBox>
      </Section>

      {/* the checks */}
      <div className="mt-14 space-y-8">
        {CHECKS.map((c) => {
          const raw = rec(c.slug)
          return (
            <article key={c.slug} id={'check-' + c.slug} className={cn('scroll-mt-32 rounded-2xl border bg-card p-5 md:p-7', focus === c.slug ? 'border-foreground/50 ring-2 ring-brand/30' : 'border-border')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[22px] font-semibold leading-snug tracking-tight md:text-[26px]" lang={lang === 'te' ? 'te' : undefined}>{c.q[lang]}</h2>
                  <p className="text-[14.5px] text-muted-foreground" lang={lang === 'te' ? 'en' : 'te'}>{lang === 'te' ? c.q.en : c.te}</p>
                </div>
                {c.status === 'two'
                  ? <span className="flex flex-wrap gap-1.5"><Chip s="matches" lang={lang} /><Chip s="definition" lang={lang} /></span>
                  : <Chip s={c.status} lang={lang} />}
              </div>
              <ShortAnswer className="mt-4"><span lang={lang === 'te' ? 'te' : undefined}>{c.answer[lang]}</span></ShortAnswer>
              <ClaimAnatomy c={raw} className="mt-5" />
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('The claim', 'చెప్పిన మాట')}</div>
                  {c.claims.map((k, i) => {
                    const cl = raw.claims[i]
                    return (
                      <div key={i} className="rounded-xl border border-dashed border-foreground/30 p-4">
                        <div className="font-heading text-[28px] font-semibold tnum">{(c.slug === C14 ? (lang === 'te' ? 'సుమారు ' : 'About ') : '') + (lang === 'te' ? croreTe(cl.figure, 0) : crore(cl.figure, 0))}</div>
                        <p className="mt-1 text-[15px] leading-snug" lang={lang === 'te' ? 'te' : undefined}>{k.said[lang]}</p>
                        <p className="mt-2 text-[13px] leading-snug text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{k.doc[lang]}</p>
                        <p className="mt-1 text-[13px] leading-snug text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{k.who[lang]}</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Chip s={k.status} lang={lang} />
                          {k.prefix ? <span className="text-[12.5px] text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{k.prefix[lang]}</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <KindBadge kind="press" />
                          <a href={cl.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground/80 hover:text-foreground">{tr('The press record of the paper', 'పత్రానికి పత్రికా రికార్డు')}<ArrowUpRight className="size-3.5" /></a>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="space-y-3">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('The record', 'రికార్డు')}</div>
                  <div className="rounded-xl bg-secondary p-4">
                    <KindBadge kind="government" />
                    {raw.record.map((r: any) => (
                      <div key={r.document} className="mt-3">
                        <div className="font-heading text-[24px] font-semibold tnum">{lang === 'te' ? croreTe(r.figure, 0) : crore(r.figure, 0)}</div>
                        <div className="text-[13.5px] text-muted-foreground">{lang === 'te' ? r.measure_te ?? r.measure : r.measure}</div>
                        <div className="mt-1.5"><PaperChip label={`${r.source.replace('Government of Andhra Pradesh, audited accounts', 'AP Finance Department')}: ${r.document}`} url={r.document_url} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-xl border-l-[3px] border-foreground/30 bg-muted/40 px-4 py-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('Why they differ', 'ఎందుకు వేరుగా ఉన్నాయి')}</div>
                <p className="mt-1 max-w-[75ch] text-[15.5px] leading-relaxed" lang={lang === 'te' ? 'te' : undefined}>{c.why[lang]}</p>
                <p className="mt-2 text-[13px] text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{c.paperNote[lang]} {tr('The status describes the numbers, not the people.', 'స్థితి అంకెల గురించే, మనుషుల గురించి కాదు.')}</p>
              </div>
            </article>
          )
        })}
      </div>

      <Section className="mt-16" eyebrow={tr('Fair turns', 'వంతుల వారీగా')} title={tr('Each government’s papers, checked the same way', 'ప్రతి ప్రభుత్వ పత్రాలూ ఒకే విధంగా')}>
        <div className="max-w-3xl space-y-2 text-[15.5px] leading-relaxed text-foreground/85">
          <p>{tr(`So far: 2 claims from the white paper of ${dateLong('2019-07-10')} and 2 from the white paper of ${dateLong('2024-07-26')}, all about debt. Each government is named by its dates and Chief Minister, never by party.`,
            `ఇప్పటివరకు: ${dateTe('2019-07-10')} శ్వేతపత్రం నుంచి 2 మాటలు, ${dateTe('2024-07-26')} శ్వేతపత్రం నుంచి 2 మాటలు, అన్నీ అప్పు గురించే. ప్రతి ప్రభుత్వాన్ని తేదీలు, ముఖ్యమంత్రి పేరుతో చెబుతాం; పార్టీ పేరుతో ఎప్పుడూ కాదు.`)}</p>
          <p className="text-[14px] text-muted-foreground">{tr('Where an official copy is offline or only a scan, the check cites the press record of it and says so. A newspaper is never the source of the record’s figures.', 'అధికారిక ప్రతి అందుబాటులో లేకపోతే లేదా స్కాన్ మాత్రమే ఉంటే, దాని పత్రికా రికార్డును చూపి ఆ విషయం చెబుతాం. రికార్డు అంకెలకు పత్రిక ఎప్పుడూ ఆధారం కాదు.')}</p>
        </div>
      </Section>

      <Section className="mt-16" eyebrow={tr('Do it yourself', 'మీరే చేయండి')} title={tr('How to check a claim in three steps', 'మూడు అడుగుల్లో మాటను సరిచూడడం')}>
        <ol className="grid gap-4 md:grid-cols-3">
          {[[tr('Find the date', 'తేదీ కనుక్కోండి'), tr('A figure is always about a day or a year. Ask: on which date?', 'ప్రతి అంకె ఒక రోజు లేదా ఏడాది గురించే. అడగండి: ఏ తేదీకి?')],
            [tr('Find the paper', 'పత్రం కనుక్కోండి'), tr('Look for a government paper for that date: an audit, a budget book or a ministry report.', 'ఆ తేదీకి ప్రభుత్వ పత్రం చూడండి: ఆడిట్, బడ్జెట్ పుస్తకం లేదా మంత్రిత్వ శాఖ నివేదిక.')],
            [tr('Compare the same thing', 'ఒకే విషయాన్ని పోల్చండి'), tr('Check that both figures count the same thing. Many claims add things the paper leaves out.', 'రెండు అంకెలూ ఒకే విషయాన్ని లెక్కిస్తున్నాయో చూడండి. చాలా మాటలు పత్రం వదిలేసినవి కూడా కలుపుతాయి.')]].map(([a, b], i) => (
            <li key={i} className="rounded-xl border border-border bg-card p-5"><div className="font-heading text-[34px] font-semibold text-muted-foreground tnum">{i + 1}</div><div className="mt-1 text-[17px] font-semibold">{a}</div><p className="mt-1 text-[14.5px] text-muted-foreground">{b}</p></li>
          ))}
        </ol>
      </Section>

      <Section className="mt-16" eyebrow={tr('Heard a claim?', 'ఏదైనా విన్నారా?')} title={tr('Send it to us, from any side', 'ఏ పక్షం మాటైనా మాకు పంపండి')}>
        <form className="grid max-w-2xl gap-4 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); setSent(true) }}>
          <div className="grid gap-2"><Label htmlFor="cl">{tr('What did you hear?', 'మీరు ఏం విన్నారు?')}</Label><Textarea id="cl" placeholder={tr('For example: the debt was this much in this year', 'ఉదా: ఈ ఏడాది అప్పు ఇంత')} /></div>
          <div className="grid gap-2"><Label htmlFor="wh">{tr('Where did you hear it?', 'ఎక్కడ విన్నారు?')}</Label><Input id="wh" placeholder={tr('A speech, a TV debate, a forwarded message', 'ప్రసంగం, టీవీ చర్చ, ఫార్వర్డ్ సందేశం')} /></div>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" className="gap-1.5"><Send className="size-4" />{tr('Send', 'పంపండి')}</Button>{sent ? <span className="text-[14px] text-muted-foreground">{tr('Preview: not sent. The real form connects when this design goes live.', 'ప్రివ్యూ: పంపలేదు. ఈ డిజైన్ లైవ్‌కు వచ్చినప్పుడు అసలు ఫారం కలుస్తుంది.')}</span> : null}</div>
        </form>
      </Section>
    </Page>
  )
}
