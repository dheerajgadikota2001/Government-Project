import * as React from 'react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { facts } from '@/lib/data-facts'
import { periods } from '@/lib/data-periods'
import { crore, croreTe, num, STAGE_WORDS } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { Blank, ListenButton, NumTable, PaperChip, ReadLine, ShortAnswer, StageTag, Te } from '@/components/kit'
import { Spark } from '@/graphics/Mini'
import { YearBars } from '@/graphics/YearBars'
import { JobsPrices } from '@/components/JobsPrices'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// 83 indicators, each a small card: name, latest value with unit, year, paper,
// a sparkline with estimates marked, and its one-line meaning. Each opens the
// six parts: the question, the short answer, how to read it, the meaning in
// plain words, what it does not tell you, and the paper.

const SOURCES = facts.sources as Record<string, { title: string; url: string }>
const value = (i: any, v: number) => {
  const n = v / (i.div || 1)
  const u = (i.unit || '').replace(/\(no unit printed[^)]*\)/i, '').trim()
  const s = num(n, i.dec ?? 2)
  // the sign goes before the rupee mark, as a reader writes it: -₹1,128, not ₹-1,128
  if (u.startsWith('₹')) return { big: (n < 0 ? '-₹' + s.replace(/^-/, '') : '₹' + s), unit: u.replace(/^₹\s*/, '') }
  return { big: s, unit: u }
}

// Where an older edition's estimate has a newer stage in another RBI paper, the card says so
// rather than showing one year with two figures without a word.
const NEWER: Record<string, { key: string; en: string; te: string }> = {
  capital_outlay: { key: 'capital_outlay', en: 'capital outlay', te: 'మూలధన వ్యయం' },
  social_sector_expenditure: { key: 'social_sector', en: 'social sector spending', te: 'సామాజిక రంగ వ్యయం' },
}
function newerFor(i: any) {
  const n = NEWER[i.key]
  if (!n || !i.latest) return null
  const p = (periods.series[n.key]?.points as any[] | undefined)?.find((x) => x.fy_end === i.latest.fy_end)
  if (!p || p.stage === i.latest.stage) return null
  return { p, n, src: periods.series[n.key].sources[0] }
}

const GROUP_TE: Record<string, string> = { economy: 'ఆర్థిక వ్యవస్థ', fiscal: 'ప్రభుత్వ డబ్బు', social: 'ప్రజలు', industry_infrastructure: 'విద్యుత్, రోడ్లు, కర్మాగారాలు', agriculture: 'వ్యవసాయం', banking: 'బ్యాంకులు, రుణాలు', employment: 'ఉపాధి', prices: 'ధరలు' }

export default function StateFacts() {
  const { lang, tr } = useLang()
  const [g, setG] = React.useState('all')
  const [open, setOpen] = React.useState<any>(null)
  const list = facts.indicators.filter((i: any) => g === 'all' || i.group === g)
  const withEst = facts.indicators.filter((i: any) => i.points.some((p: any) => p.stage && STAGE_WORDS[p.stage]?.est) || (i.latest?.stage && STAGE_WORDS[i.latest.stage]?.est)).length
  const yearly = facts.indicators.reduce((s: number, i: any) => s + i.points.length, 0)
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('State facts', 'రాష్ట్ర గణాంకాలు')} q={{ en: 'Andhra Pradesh, by the numbers', te: 'అంకెల్లో ఆంధ్రప్రదేశ్' }}
        lede={tr(`${facts.indicators.length} indicators in ${facts.groups.length} groups, ${num(yearly, 0)} yearly figures, each copied as printed. ${withEst} indicators include estimates, drawn hollow. Tap a card for its full series, explained.`,
          `${facts.groups.length} వర్గాల్లో ${facts.indicators.length} సూచికలు, ${num(yearly, 0)} వార్షిక సంఖ్యలు, ప్రతిదీ ముద్రించినట్లే. ${withEst} సూచికల్లో అంచనాలు ఉన్నాయి; వాటిని ఖాళీగా చూపాం. పూర్తి వరుస, వివరణ కోసం కార్డును నొక్కండి.`)}>
        <div className="mt-5"><ListenButton /></div>
      </PageHead>
      <section className="mt-8">
        <h2 className="text-[22px] font-semibold tracking-tight">{tr('Newest: work and prices', 'తాజా: పని, ధరలు')}</h2>
        <p className="mt-1 text-[14.5px] text-muted-foreground">{tr('Every quarter and every month, from the national statistics office (MoSPI).', 'ప్రతి త్రైమాసికం, ప్రతి నెల, జాతీయ గణాంక కార్యాలయం (మోస్పి) నుంచి.')}</p>
        <JobsPrices className="mt-4" />
      </section>
      <Tabs value={g} onValueChange={setG} className="mt-10">
        <TabsList className="h-auto flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="all">{tr('All', 'అన్నీ')}</TabsTrigger>
          {facts.groups.map((x: any) => <TabsTrigger key={x.key} value={x.key}>{lang === 'te' ? <Te>{GROUP_TE[x.key] ?? x.label}</Te> : x.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i: any) => {
          const l = i.latest
          const v = l ? value(i, l.value) : null
          const nw = newerFor(i)
          return (
            <button key={i.key} type="button" onClick={() => setOpen(i)} className="flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30">
              <div className="line-clamp-2 min-h-[2.6em] text-[14.5px] font-medium leading-snug" lang="en">{i.label}</div>
              {v ? (
                <>
                  <div className="mt-2 flex items-baseline gap-1.5"><span className="font-heading text-[26px] font-semibold tnum">{v.big}</span><span className="text-[12.5px] text-muted-foreground" lang="en">{v.unit}</span></div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">{l.fy_label}{l.stage ? <StageTag stage={l.stage} /> : null}</div>
                </>
              ) : <div className="mt-2"><Blank>{tr('No figure', 'సంఖ్య లేదు')}</Blank></div>}
              <div className="mt-3"><Spark height={46} showLast points={i.points.map((p: any) => ({ x: p.fy_end, v: p.value, stage: p.stage }))} /></div>
              {i.points.length > 1 ? (
                // the line's two ends, named, so the shape has a start and a finish the reader can read
                <div className="mt-1 flex items-start justify-between gap-3 text-[11.5px] leading-tight text-muted-foreground tnum">
                  <span>{i.points[0].fy_label}<br /><b className="font-semibold text-foreground/80">{value(i, i.points[0].value).big}</b></span>
                  <span className="text-right">{i.points[i.points.length - 1].fy_label}<br /><b className="font-semibold text-foreground/80">{value(i, i.points[i.points.length - 1].value).big}</b></span>
                </div>
              ) : null}
              <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground" lang="en">{i.what}</p>
              {nw ? <p className="mt-2 rounded-md border border-dashed border-foreground/30 px-2 py-1 text-[12px] text-muted-foreground">{tr(`A newer stage exists: ${crore(nw.p.value, 1)} for ${l.fy_label}, a ${STAGE_WORDS[nw.p.stage]?.en.toLowerCase()} in RBI State Finances 2025-26.`, `కొత్త దశ ఉంది: ${l.fy_label}కు ${croreTe(nw.p.value, 1)}, ఆర్బీఐ స్టేట్ ఫైనాన్సెస్ 2025-26లో ${STAGE_WORDS[nw.p.stage]?.te}.`)}</p> : null}
            </button>
          )
        })}
      </div>

      <div className="mt-16 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-[24px] font-semibold tracking-tight">{tr('Read honestly', 'నిజాయితీగా చదవండి')}</h2>
          <ul className="mt-3 space-y-2.5">
            {[[tr('The 2014 split. ', '2014 విభజన. '), tr('Some tables print the undivided state for earlier years. Those years are marked and never compared with later ones.', 'కొన్ని పట్టికలు పాత ఏళ్లకు ఉమ్మడి రాష్ట్రాన్ని ముద్రిస్తాయి. ఆ ఏళ్లను గుర్తించాం; తర్వాతి ఏళ్లతో ఎప్పుడూ పోల్చం.')],
              [tr('Estimates look different. ', 'అంచనాలు వేరుగా. '), tr('Revised, budget and provisional figures are drawn hollow and named, and never set against an audited figure without saying so.', 'సవరించిన, బడ్జెట్, తాత్కాలిక సంఖ్యలను ఖాళీగా, పేరుతో చూపుతాం; చెప్పకుండా ఆడిట్ సంఖ్యతో ఎప్పుడూ పోల్చం.')],
              [tr('Part-year points are dropped. ', 'పాక్షిక సంవత్సరాలు తీసేశాం. '), tr('Figures that covered only part of a year are left off rather than drawn as a fall.', 'ఏడాదిలో కొంత భాగానికే ఉన్న సంఖ్యలను తగ్గుదలలా చూపకుండా వదిలేశాం.')]].map(([t, b], k) => (
              <li key={k} className="rounded-xl border border-border bg-card px-4 py-3 text-[14.5px] leading-relaxed"><b>{t}</b><span className="text-muted-foreground">{b}</span></li>
            ))}
          </ul>
          <a href={href('money-states')} className="mt-4 inline-flex text-[15px] font-medium underline underline-offset-4">{tr('Where Andhra Pradesh stands among the states', 'రాష్ట్రాల మధ్య ఆంధ్రప్రదేశ్ ఎక్కడ')}</a>
        </div>
        <div>
          <h2 className="text-[24px] font-semibold tracking-tight">{tr('What the papers do not give', 'పత్రాలు ఇవ్వనివి')}</h2>
          <p className="mt-2 text-[15px] text-muted-foreground">{tr('Measures people ask for. Each says where the figure lives and what a reader can do.', 'ప్రజలు అడిగే కొలమానాలు. ప్రతిదానికీ సంఖ్య ఎక్కడ ఉంటుందో, పాఠకుడు ఏం చేయవచ్చో చెప్పాం.')}</p>
          <div className="mt-4 space-y-3">
            {facts.unavailable.map((u: any, k: number) => (
              <Blank key={k} kind="notPublished"><span className="text-foreground/85" lang="en">{u.what}</span></Blank>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          {open ? <Explained i={open} /> : null}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function Explained({ i }: { i: any }) {
  const { tr } = useLang()
  const pts = i.points as any[]
  const first = pts[0], last = i.latest ?? pts[pts.length - 1]
  const fv = value(i, first.value), lv = value(i, last.value)
  const stage = last.stage ? STAGE_WORDS[last.stage] : null
  const nw = newerFor(i)
  const src = SOURCES[i.source]
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl" lang="en">{i.label}</DialogTitle>
        <DialogDescription lang="en">{i.unit.replace(/\(no unit printed[^)]*\)/i, 'Count')}</DialogDescription>
      </DialogHeader>
      <ShortAnswer>{tr(<><b>{lv.big}</b> {lv.unit} in {last.fy_label}{stage ? `, a ${stage.en.toLowerCase()}` : ''}. In {first.fy_label}, the first year in the paper, it was {fv.big}.</>,
        <>{last.fy_label}లో <b>{lv.big}</b> {lv.unit}{stage ? ` (${stage.te})` : ''}. పత్రంలో మొదటి ఏడాది {first.fy_label}లో {fv.big}.</>)}</ShortAnswer>
      <ReadLine kind="how">{tr('Each row is one year, oldest at the top. The longer the bar, the bigger the figure, and the figure is printed at the end of the row. Striped bars are estimates, which may still change; each one says which kind.', 'ప్రతి వరుస ఒక ఏడాది, పాతది పైన. బార్ ఎంత పొడవైతే అంకె అంత పెద్దది; వరుస చివర అంకె ఉంది. చారల బార్లు అంచనాలు, ఇంకా మారవచ్చు; ఏ రకమో ప్రతిదానిపై రాశాం.')}</ReadLine>
      <div className="rounded-lg border border-dashed border-[color-mix(in_oklab,var(--chart-3)_45%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,var(--card))] px-3.5 py-2.5 text-[14px] leading-relaxed"><b>{tr('In plain words: ', 'తేలిక మాటల్లో: ')}</b><span lang="en">{i.what}</span></div>
      <YearBars rows={pts.map((p: any) => ({ fyEnd: p.fy_end, year: p.fy_label, v: p.value, stage: p.stage }))}
        value={(v) => value(i, v).big} tick={(v) => { const n = v / (i.div || 1); return num(n, Number.isInteger(n) ? 0 : 1) }}
        unit={<span lang="en">{i.unit.replace(/\(no unit printed[^)]*\)/i, 'Count')}</span>} label={`${i.label}, by year`} />
      {nw ? <p className="text-[13.5px] text-muted-foreground">{tr(`Note: RBI State Finances 2025-26 prints a newer stage for ${last.fy_label}: ${crore(nw.p.value, 1)}, a ${STAGE_WORDS[nw.p.stage]?.en.toLowerCase()}. This card shows the Handbook’s own figure, as printed.`, `గమనిక: ఆర్బీఐ స్టేట్ ఫైనాన్సెస్ 2025-26 ${last.fy_label}కు కొత్త దశ ముద్రించింది: ${crore(nw.p.value, 1)} (${STAGE_WORDS[nw.p.stage]?.te}). ఈ కార్డు హ్యాండ్‌బుక్ సంఖ్యనే చూపుతుంది.`)}</p> : null}
      <ReadLine kind="limits">{tr('why it changed, or how districts differ. It is one state-wide figure from its paper.', 'ఎందుకు మారిందో, జిల్లాల మధ్య తేడాలు. ఇది పత్రంలోని ఒకే రాష్ట్రస్థాయి సంఖ్య.')}</ReadLine>
      <details className="group rounded-lg border border-border">
        <summary className="cursor-pointer px-3 py-2 text-[14px] font-medium">{tr('See the numbers as a table', 'అంకెలను పట్టికగా చూడండి')}</summary>
        <div className="border-t border-border p-2"><NumTable head={[tr('Year', 'సంవత్సరం'), i.unit, tr('Stage', 'దశ')]} rows={pts.map((p: any) => [p.fy_label, value(i, p.value).big, p.stage ? STAGE_WORDS[p.stage]?.en ?? p.stage : tr('As printed', 'ముద్రించినట్లే')])} /></div>
      </details>
      <div className="flex flex-wrap gap-2"><PaperChip label={`${src?.title ?? i.source}${i.table ? ', ' + i.table : ''}`} url={src?.url} /></div>
    </>
  )
}
