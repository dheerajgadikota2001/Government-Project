import * as React from 'react'
import { ArrowUpRight, Search, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { C14, CHECKS, rec, type Bi, type StatusKey } from '@/lib/claim-checks'
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


const STATUS: Record<StatusKey, { name: Bi; plain: Bi; cls: string }> = {
  matches: { name: { en: 'Matches', te: 'సరిపోలింది' }, plain: { en: 'The claim agrees with the record.', te: 'చెప్పిన మాట రికార్డుతో సరిపోలుతోంది.' }, cls: 'bg-brand-soft text-brand border-transparent' },
  definition: { name: { en: 'Different definition', te: 'వేరే నిర్వచనం' }, plain: { en: 'Both can be right: they count different things. The page shows what each one counts.', te: 'రెండూ నిజం కావచ్చు: వేర్వేరు వాటిని లెక్కిస్తాయి. ఏది ఏం లెక్కిస్తుందో పేజీ చూపుతుంది.' }, cls: 'bg-secondary text-ink2 border-foreground/25' },
  unverifiable: { name: { en: 'Cannot be checked', te: 'సరిచూడలేము' }, plain: { en: 'No official figure exists for what the claim describes. We say so instead of reaching for a nearby number.', te: 'చెప్పిన దానికి అధికారిక సంఖ్య లేదు. దగ్గరలోని వేరే సంఖ్యను తీసుకోకుండా, ఆ విషయమే చెబుతాం.' }, cls: 'bg-card text-ink2 border-dashed border-foreground/45' },
  differs: { name: { en: 'Differs', te: 'భిన్నంగా ఉంది' }, plain: { en: 'The claim and the record disagree about the same thing. Not used yet.', te: 'ఒకే విషయంపై చెప్పిన మాట, రికార్డు వేరుగా ఉన్నాయి. ఇంకా వాడలేదు.' }, cls: 'bg-foreground text-background border-transparent' },
}

function Chip({ s, lang, className }: { s: StatusKey; lang: 'en' | 'te'; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-semibold', STATUS[s].cls, className)} lang={lang === 'te' ? 'te' : undefined}>{STATUS[s].name[lang]}</span>
}

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
