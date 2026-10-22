import * as React from 'react'
import { ArrowUpRight, ChevronDown, CloudRain, Droplets, Factory, HandHeart, HardHat, Info, Pause, ShowerHead, Volume2, Waves } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtBySlug, districtByName, districts, MERGED } from '@/lib/data'
import { worksIn, paperOf } from '@/lib/data-projects'
import { href, go } from '@/lib/route'
import { useSpeaker } from '@/lib/speak'
import { DM } from '@/components/DistrictFacts'
import raw from '@/data/editions.json'
import hIndex from '@/data/happenings/index.json'

// మన జిల్లా పత్రిక, Our District Paper.
//
// One paper per district, a new edition only when an official source has something new for that
// district, every edition approved by a person before it goes out. Each item is written to be
// heard as much as read: a plain headline, the printed numbers in one or two sentences, and one
// line on what it means for a family. Every number carries its source and date.
//
// House rules: numbers as printed; no sums, ranks or differences made here (a headline may say
// "less than last year" when both printed numbers say so, never by how much); no party names;
// a district of 2026 reads its parent's figures where the source is on the 2022 map, and says so.

type Src = { label_en?: string; label_te?: string; title: string; by: string; url: string; released?: string | null; page?: string | null; as_on_en: string; as_on_te: string }
type Line = { name: string; name_te: string; served_as: string; en: string; te: string }
type Item = {
  kind: string; live?: boolean; head_en: string; head_te: string; en?: string; te?: string; lines?: Line[]; more?: number
  big?: { value: number | null; unit_en: string; unit_te: string }
  mean_en?: string; mean_te?: string; note_en?: string; note_te?: string; source: Src
  links?: { title: string; cost: number; paper: string; href: string }[]
}
type Doc = { name_te: string; name_en: string; edition: number; date: string; status: string; districts: Record<string, Item[]> }
const ED = raw as unknown as Doc

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  reservoir: Waves, rain: CloudRain, groundwater: Droplets, taps: ShowerHead, economy: Factory, works: HardHat, welfare: HandHeart,
}
const IND = (v: number, dec?: number) => v.toLocaleString('en-IN', { maximumFractionDigits: dec ?? 2 })

/** Items the page adds from data the site already holds: works on the register, and welfare from the 2024 book. */
function siteItems(district: string): Item[] {
  const d = districtByName.get(district)
  const reads = d?.formed ? d.from! : district
  const readsTe = districtByName.get(reads)?.te ?? reads
  const out: Item[] = []

  const works = worksIn(district).filter((p) => !MERGED[p.id])
  if (works.length) {
    const top = works.filter((p) => p.c != null).sort((a, b) => (b.c ?? 0) - (a.c ?? 0)).slice(0, 3)
    out.push({
      kind: 'works', head_en: 'Works on our register in this district', head_te: 'మన జిల్లాలో పనులు',
      big: { value: works.length, unit_en: 'works name this district', unit_te: 'పనుల్లో మన జిల్లా పేరు ఉంది' },
      en: `${works.length} works on our register name this district. The three with the largest cost printed in their papers are listed below; tap one to see where it stands.`,
      te: `మా పనుల జాబితాలో ${works.length} పనుల్లో మన జిల్లా పేరు ఉంది. వాటి పత్రాల్లో ముద్రించిన వ్యయం ప్రకారం పెద్ద మూడు పనులు కింద ఉన్నాయి; ఏది నొక్కినా అది ఎక్కడి వరకు వచ్చిందో చూడవచ్చు.`,
      links: top.map((p) => ({ title: p.t, cost: p.c!, paper: paperOf(p), href: href(`project-${p.id}`) })),
      mean_en: 'The cost is what the paper prints as the estimate or sanction, not money already spent. Each work has its own page with where it stands, paper by paper.',
      mean_te: 'ఇక్కడి వ్యయం పత్రంలో ముద్రించిన అంచనా లేదా మంజూరు మొత్తం; ఇప్పటికే ఖర్చు చేసిన డబ్బు కాదు. ప్రతి పనికీ ఒక పేజీ ఉంది; అది ఎక్కడి వరకు వచ్చిందో పత్రాల వారీగా అక్కడ చూడవచ్చు.',
      source: { label_en: 'AP Fact Check register of works, built from official papers named on each work page', label_te: 'ఏపీ ఫ్యాక్ట్ చెక్ పనుల జాబితా; ప్రతి పని పేజీలో దాని ప్రభుత్వ పత్రం ఉంది', title: 'AP Fact Check register of works', by: 'official papers', url: href(`district-${districtByName.get(district)?.slug}`), as_on_en: '21 October 2026', as_on_te: '21 అక్టోబర్ 2026' },
    })
  }

  const m = (id: string) => DM.measures.find((x) => x.id === id)
  const pen = m('pensions_all_kinds_total'), rc = m('ration_cards_total'), fps = m('fair_price_shops')
  const pv = pen?.values[reads], rv = rc?.values[reads], fv = fps?.values[reads]
  if (pen && rc && fps && pv != null && rv != null && fv != null) {
    const parentEn = reads !== district ? ` These are ${reads} district's figures, which then included ${district}.` : ''
    const parentTe = reads !== district ? ` ఇవి ${readsTe} జిల్లా అంకెలు; అప్పట్లో ${d!.te} అందులోనే ఉంది.` : ''
    out.push({
      kind: 'welfare', head_en: 'Pensions and rations', head_te: 'పింఛన్లు, రేషన్',
      big: { value: pv, unit_en: 'people receiving a pension', unit_te: 'మందికి పింఛను' },
      en: `As on 31 March 2024, ${IND(pv)} people in our district were receiving a social security pension (old age, widow, disabled and others). In 2023-24 the district had ${IND(rv)} ration cards and ${IND(fv)} ration shops.${parentEn}`,
      te: `31 మార్చి 2024 నాటికి మన జిల్లాలో ${IND(pv)} మంది సామాజిక భద్రతా పింఛన్లు (వృద్ధులు, వితంతువులు, దివ్యాంగులు, ఇతరులు) అందుకుంటున్నారు. 2023-24లో జిల్లాలో ${IND(rv)} రేషన్ కార్డులు, ${IND(fv)} రేషన్ దుకాణాలు ఉన్నాయి.${parentTe}`,
      mean_en: 'These are the government\'s own counts for the whole district. If someone eligible in your village is left out, the village or ward secretariat is where to ask.',
      mean_te: 'ఇవి జిల్లా మొత్తానికి ప్రభుత్వ లెక్కలు. మీ ఊరిలో అర్హులైనవారికి అందకపోతే గ్రామ లేదా వార్డు సచివాలయంలో అడగవచ్చు.',
      source: { label_en: `${DM.paper.title}, ${DM.paper.by}`, label_te: `${DM.paper.title_te}, ${DM.paper.by_te}`, title: DM.paper.title, by: DM.paper.by, url: '', page: `Tables ${pen.table} (p. ${pen.page}) and ${rc.table} (p. ${rc.page})`, as_on_en: '2023-24', as_on_te: '2023-24' },
    })
  }
  return out
}

function speakText(it: Item, te: boolean): string {
  const head = te ? it.head_te : it.head_en
  const body = it.lines ? it.lines.map((l) => (te ? l.te : l.en)).join(' ') : (te ? it.te : it.en) ?? ''
  const mean = te ? it.mean_te : it.mean_en
  return [head + '.', body, mean ?? ''].join(' ')
}

function Story({ it, idx, te, speaking, onListen, extra }: { it: Item; idx: number; te: boolean; speaking: boolean; onListen: () => void; extra?: React.ReactNode }) {
  const { tr } = useLang()
  const Icon = ICON[it.kind] ?? Info
  return (
    <article data-idx={idx} className={cn('rounded-2xl border bg-card p-5 transition-shadow md:p-7', speaking ? 'border-[var(--chart-1)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--chart-1)_25%,transparent)]' : 'border-border')}>
      <div className="flex items-start gap-3">
        <span className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--chart-1)_12%,transparent)] text-[var(--chart-1)]"><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            {it.live ? <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">{tr('Live reading', 'తాజా రీడింగ్')}</span> : null}
            <span lang={te ? 'te' : undefined}>{te ? it.source.as_on_te : it.source.as_on_en}</span>
          </div>
          <h2 className="mt-1 text-[22px] font-semibold leading-snug [text-wrap:balance] md:text-[26px]" lang={te ? 'te' : undefined}>{te ? it.head_te : it.head_en}</h2>
        </div>
      </div>

      {it.big && it.big.value != null ? (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[40px] font-semibold leading-none tracking-tight tnum md:text-[48px]">{IND(it.big.value)}</span>
          <span className="text-[15px] text-muted-foreground" lang={te ? 'te' : undefined}>{te ? it.big.unit_te : it.big.unit_en}</span>
        </p>
      ) : null}

      {it.lines ? (
        <ul className="mt-4 space-y-3">
          {it.lines.map((l) => (
            <li key={l.served_as} className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-[17.5px] leading-relaxed md:text-[18.5px]" lang={te ? 'te' : undefined}>{te ? l.te : l.en}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{tr('Served as', 'మూలంలో పేరు')}: {l.served_as}</p>
            </li>
          ))}
          {it.more ? <li className="text-[13px] text-muted-foreground">{tr(`${it.more} more reservoirs in the district on the water department's site.`, `జిల్లాలో ఇంకా ${it.more} జలాశయాలు నీటి పారుదల శాఖ సైట్‌లో ఉన్నాయి.`)}</li> : null}
        </ul>
      ) : (
        <p className="mt-4 text-[17.5px] leading-relaxed md:text-[18.5px]" lang={te ? 'te' : undefined}>{te ? it.te : it.en}</p>
      )}
      {it.links ? (
        <ul className="mt-3 space-y-2">
          {it.links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="block rounded-xl bg-muted/50 px-4 py-3 hover:bg-muted">
                <span className="line-clamp-2 text-[15.5px] font-medium leading-snug" lang="en">{l.title}</span>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
                  <b className="text-[16px] font-semibold text-foreground tnum">₹{IND(l.cost)} {te ? 'కోట్లు' : 'crore'}</b>
                  <span lang="en">{l.paper}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {extra}
      {it.mean_te ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr('What it means for you', 'మీకు దీని అర్థం')}</p>
          <p className="mt-1 text-[16px] leading-relaxed" lang={te ? 'te' : undefined}>{te ? it.mean_te : it.mean_en}</p>
        </div>
      ) : null}
      {it.note_te ? <p className="mt-3 text-[13px] leading-snug text-muted-foreground" lang={te ? 'te' : undefined}>{te ? it.note_te : it.note_en}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="min-w-0 text-[12.5px] leading-snug text-muted-foreground">
          {tr('Source', 'మూలం')}:{' '}
          {(() => {
            const label = (te ? it.source.label_te : it.source.label_en) ?? `${it.source.title}, ${it.source.by}`
            return it.source.url && it.source.url.startsWith('http')
              ? <a href={it.source.url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline" lang={te ? 'te' : undefined}>{label}<ArrowUpRight className="ml-0.5 inline size-3.5" /></a>
              : <span className="font-medium text-foreground" lang={te ? 'te' : undefined}>{label}</span>
          })()}
          {it.source.page ? <span className="block text-[11.5px]">{it.source.page}</span> : null}
        </p>
        <button type="button" onClick={onListen} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[14px] font-medium hover:border-foreground/40">
          {speaking ? <Pause className="size-4" /> : <Volume2 className="size-4" />}{speaking ? tr('Stop', 'ఆపండి') : tr('Listen', 'వినండి')}
        </button>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------------------------
// Pages 1 to 3: what is happening (scripts/build_district_happenings.py, board 11).
// One file per district, loaded only when that district's paper opens, so the site does not
// carry 28 districts of notices on every visit.

type Lead = {
  id: string; kicker_en: string; kicker_te: string; head_en: string; head_te: string; en: string; te: string
  mean_en?: string; mean_te?: string; date: string; source_en: string; source_te: string; url: string
}
type Std = Lead & { kind: string }
type TapsJuly = { date: string; rural: number; with_tap: number; yet: number; reads: string; source_en: string; source_te: string; url: string; note_en: string; note_te: string }
type Row = { date: string; title: string; url: string }
type Job = Row & { date_end?: string | null; posts: { label: string; value: number }[]; after_ban: boolean }
type Pib = Row & { ministry?: string | null; places: string[] }
type Ans = Row & { starred: boolean; no: string; subject: string }
type Happen = {
  lead: Lead[]
  standard: { houses: Std; health: Std; intern: Std; taps_july: TapsJuly }
  feed: { jobs: Job[]; tenders: Row[]; announcements: Row[]; press: Row[]; events: Row[]; lists: Row[]; pib: Pib[]; parliament: Ans[] }
  counts: { site: number; pib: number; parliament: number; lists: number }
  thin: boolean; none_reason_en?: string | null; none_reason_te?: string | null; host: string
}
const HIDX = hIndex as unknown as { window: { from_en: string; to_en: string; from_te: string; to_te: string }; ban: { from: string; memo: string } }
const LOADERS = import.meta.glob<{ default: Happen }>(['../data/happenings/*.json', '!../data/happenings/index.json'])

function useHappen(slug: string): Happen | null {
  const [h, setH] = React.useState<Happen | null>(null)
  React.useEffect(() => {
    let live = true
    setH(null)
    const load = LOADERS[`../data/happenings/${slug}.json`]
    if (load) load().then((m) => { if (live) setH(m.default) })
    return () => { live = false }
  }, [slug])
  return h
}

const dEn = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const MT = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
const dTe = (d: string) => { const x = new Date(d + 'T00:00:00'); return `${x.getDate()} ${MT[x.getMonth()]} ${x.getFullYear()}` }

function Band({ id, n, title }: { id: string; n: number; title: string }) {
  const { tr, lang } = useLang()
  return (
    <div id={id} className="mt-10 scroll-mt-20 border-t-4 border-double border-foreground/80 pt-3">
      <div className="flex items-baseline justify-between gap-3 rounded-md bg-foreground px-3 py-2 text-background">
        <h2 className="font-serif text-[19px] font-bold leading-snug md:text-[22px]" lang={lang === 'te' ? 'te' : undefined}>{n}. {title}</h2>
        <span className="shrink-0 text-[12px]">{tr(`Page ${n}`, `పేజీ ${n}`)}</span>
      </div>
    </div>
  )
}

function LeadStory({ it, te, speaking, onListen, big }: { it: Lead; te: boolean; speaking: boolean; onListen: () => void; big?: boolean }) {
  const { tr } = useLang()
  const L = te ? 'te' : undefined
  return (
    <article id={`lead-${it.id}`} className={cn('scroll-mt-24 border-b border-border py-5', speaking && 'rounded-xl bg-[color-mix(in_oklab,var(--chart-1)_8%,transparent)] px-3')}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--chart-1)]" lang={L}>{te ? it.kicker_te : it.kicker_en}</p>
      <h3 className={cn('mt-1 font-serif font-bold leading-snug [text-wrap:balance]', big ? 'text-[26px] md:text-[32px]' : 'text-[21px] md:text-[24px]')} lang={L}>{te ? it.head_te : it.head_en}</h3>
      <p className="mt-2 text-[17px] leading-relaxed md:text-[18px]" lang={L}>{te ? it.te : it.en}</p>
      {(te ? it.mean_te : it.mean_en) ? <p className="mt-2 border-l-4 border-[var(--chart-1)] pl-3 text-[15.5px] leading-relaxed text-foreground/85" lang={L}>{te ? it.mean_te : it.mean_en}</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <a href={it.url} target="_blank" rel="noreferrer" className="min-w-0 text-[12.5px] leading-snug text-muted-foreground underline-offset-4 hover:underline" lang={L}>
          {tr('Source', 'మూలం')}: {te ? it.source_te : it.source_en}<ArrowUpRight className="ml-0.5 inline size-3.5" />
        </a>
        <button type="button" onClick={onListen} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[14px] font-medium hover:border-foreground/40">
          {speaking ? <Pause className="size-4" /> : <Volume2 className="size-4" />}{speaking ? tr('Stop', 'ఆపండి') : tr('Listen', 'వినండి')}
        </button>
      </div>
    </article>
  )
}

function Collapse<T>({ rows, first = 5, render }: { rows: T[]; first?: number; render: (r: T, i: number) => React.ReactNode }) {
  const { tr } = useLang()
  const [all, setAll] = React.useState(false)
  const shown = all ? rows : rows.slice(0, first)
  return (
    <>
      <ul className="divide-y divide-border">{shown.map(render)}</ul>
      {rows.length > first ? (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 inline-flex h-10 items-center gap-1 rounded-full border border-border px-4 text-[14px] font-medium">
          <ChevronDown className={cn('size-4 transition-transform', all && 'rotate-180')} />
          {all ? tr('Show fewer', 'తక్కువ చూపించు') : tr(`Show all ${rows.length}`, `మొత్తం ${rows.length} చూపించు`)}
        </button>
      ) : null}
    </>
  )
}

function NoticeRow({ r, te, extra }: { r: Row; te: boolean; extra?: React.ReactNode }) {
  const teTitle = /[ఀ-౿]/.test(r.title)
  return (
    <li className="flex gap-3 py-3">
      <span className="w-[76px] shrink-0 pt-0.5 text-[12.5px] font-semibold text-[var(--chart-1)]" lang={te ? 'te' : undefined}>{te ? dTe(r.date) : dEn(r.date)}</span>
      <span className="min-w-0 flex-1">
        <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-3 text-[15px] leading-snug underline-offset-4 hover:underline" lang={teTitle ? 'te' : 'en'}>{r.title}</a>
        {extra}
      </span>
    </li>
  )
}

function SubHead({ en, te: teText, n }: { en: string; te: string; n: number }) {
  const { lang } = useLang()
  return <h3 className="mt-6 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--chart-1)]" lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? teText : en} <span className="text-muted-foreground">({n})</span></h3>
}

function Notices({ h, d, te }: { h: Happen; d: { name: string; te: string }; te: boolean }) {
  const { tr } = useLang()
  const f = h.feed
  const L = te ? 'te' : undefined
  const anyBan = f.jobs.some((j) => j.after_ban)
  const site = `https://${h.host}`
  return (
    <section className="mt-4">
      <p className="text-[16.5px] leading-relaxed" lang={L}>
        {h.counts.site === 0
          ? (te ? `${HIDX.window.from_te} నుంచి ${HIDX.window.to_te} వరకు ${d.te} కలెక్టరేట్ వెబ్‌సైట్‌లో కొత్త నోటీసు ఏదీ రాలేదు.` : `From ${HIDX.window.from_en} to ${HIDX.window.to_en}, the ${d.name} collectorate website posted no new notice.`)
          : te
            ? `${HIDX.window.from_te} నుంచి ${HIDX.window.to_te} వరకు ${d.te} కలెక్టరేట్ వెబ్‌సైట్‌లో ${h.counts.site} నోటీసులు వచ్చాయి.${f.press.length ? '' : ' ఈ కాలంలో పత్రికా ప్రకటన ఒక్కటీ లేదు.'}`
            : `From ${HIDX.window.from_en} to ${HIDX.window.to_en}, the ${d.name} collectorate website posted ${h.counts.site} notices.${f.press.length ? '' : ' It posted no press release in this period.'}`}
      </p>
      {h.counts.site ? <p className="mt-1 text-[13px] text-muted-foreground" lang={L}>{tr('Titles are shown exactly as the office printed them.', 'శీర్షికలు కార్యాలయం ముద్రించినట్టే (చాలావరకు ఆంగ్లంలో) ఉంచాం.')}</p> : null}

      {f.press.length ? <><SubHead en="Press releases" te="పత్రికా ప్రకటనలు" n={f.press.length} /><Collapse rows={f.press} render={(r, i) => <NoticeRow key={i} r={r} te={te} />} /></> : null}

      {f.jobs.length ? (
        <>
          <SubHead en="Job notifications" te="ఉద్యోగ నోటిఫికేషన్లు" n={f.jobs.length} />
          <Collapse rows={f.jobs} render={(r, i) => (
            <NoticeRow key={i} r={r} te={te} extra={r.posts.length ? (
              <span className="mt-1 flex flex-wrap gap-1.5">{r.posts.map((p) => <span key={p.label} className="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px]"><span lang="en">{p.label}</span>: <b className="tnum">{IND(p.value)}</b> {tr('posts', 'పోస్టులు')}</span>)}</span>
            ) : undefined} />
          )} />
          <div className="mt-3 rounded-r-lg border-l-4 border-[var(--chart-1)] bg-muted/60 px-4 py-3 text-[14.5px] leading-relaxed" lang={L}>
            <b>{tr('Before you apply: ', 'దరఖాస్తు చేసే ముందు: ')}</b>
            {te ? 'ఇవి గడువు దాటిన పాత నోటీసులు కావచ్చు. ఏ పోస్టు ఇప్పుడు తెరిచి ఉందో కార్యాలయంలో అడిగి తెలుసుకోండి.' : 'These may be old notices whose dates have passed. Ask the office which posts are open today.'}
            {anyBan ? (te
              ? ' అలాగే 13 జూలై 2026 నుంచి కొత్త నియామకాలు, పదోన్నతులు, బదిలీలు ఆపాలని రాష్ట్ర ఆర్థిక శాఖ 6 జూలై 2026న మెమో ఇచ్చింది (NTR జిల్లా వైద్య ఆరోగ్య అధికారి సైట్‌లో ఉంది).'
              : ' Also, a state Finance memo of 6 July 2026 stops fresh recruitment, promotions and transfers from 13 July 2026 (posted on the NTR district health office site).') : null}
          </div>
        </>
      ) : null}

      {f.lists.length ? (
        <>
          <SubHead en="Merit and selection lists" te="ఎంపిక, మెరిట్ జాబితాలు" n={f.lists.length} />
          <p className="mt-2 text-[15.5px] leading-relaxed" lang={L}>
            {te
              ? `${f.lists.length} జాబితాలు ప్రచురించారు. వాటిలో వ్యక్తుల పేర్లు ఉంటాయి కాబట్టి ఇక్కడ చూపడం లేదు. తాజాది ${dTe(f.lists[0].date)}.`
              : `${f.lists.length} lists were published. They carry people's names, so we do not show them here. The newest is dated ${dEn(f.lists[0].date)}.`}{' '}
            <a href={f.lists[0].url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{tr('Open the newest on the collectorate site', 'తాజా జాబితా కలెక్టరేట్ సైట్‌లో చూడండి')}</a>
          </p>
        </>
      ) : null}

      {f.tenders.length ? <><SubHead en="Tenders" te="టెండర్లు" n={f.tenders.length} /><Collapse rows={f.tenders} render={(r, i) => <NoticeRow key={i} r={r} te={te} />} /></> : null}
      {f.announcements.length ? <><SubHead en="Announcements" te="ప్రకటనలు" n={f.announcements.length} /><Collapse rows={f.announcements} render={(r, i) => <NoticeRow key={i} r={r} te={te} />} /></> : null}
      {f.events.length ? <><SubHead en="Events" te="కార్యక్రమాలు" n={f.events.length} /><Collapse rows={f.events} render={(r, i) => <NoticeRow key={i} r={r} te={te} />} /></> : null}

      <p className="mt-3 text-[12.5px] text-muted-foreground">{tr('Source', 'మూలం')}: <a href={site} target="_blank" rel="noreferrer" className="underline underline-offset-4">{site.replace('https://', '')}</a>{tr(', read on 21 October 2026', ', 21 అక్టోబర్ 2026న చదివాం')}</p>
    </section>
  )
}

function Parliament({ h, d, te }: { h: Happen; d: { name: string; te: string }; te: boolean }) {
  const { tr } = useLang()
  const f = h.feed
  const L = te ? 'te' : undefined
  return (
    <section className="mt-4">
      <p className="text-[16.5px] leading-relaxed" lang={L}>
        {te
          ? `20 జూలై నుంచి 12 ఆగస్టు 2026 వరకు జరిగిన లోక్‌సభ సమావేశాల్లో ${h.counts.parliament} జవాబుల్లో ${d.te} పేరు వచ్చింది. పేజీ 1లోని చాలా వార్తలు వీటి నుంచే. ప్రశ్న అడిగిన సభ్యుల పేర్లు ఇక్కడ వేయడం లేదు.`
          : `In the Lok Sabha session from 20 July to 12 August 2026, ${h.counts.parliament} answers named ${d.name}. Many stories on page 1 come from them. We do not print the names of the members who asked.`}
      </p>
      <SubHead en="Lok Sabha answers" te="లోక్‌సభ జవాబులు" n={f.parliament.length} />
      <Collapse rows={f.parliament} first={6} render={(r, i) => (
        <li key={i} className="flex gap-3 py-3">
          <span className="w-[76px] shrink-0 pt-0.5 text-[12.5px] font-semibold text-[var(--chart-1)]" lang={L}>{te ? dTe(r.date) : dEn(r.date)}</span>
          <span className="min-w-0 flex-1">
            <a href={r.url} target="_blank" rel="noreferrer" className="text-[15px] leading-snug underline-offset-4 hover:underline" lang="en">{r.subject}</a>
            <span className="block text-[12px] text-muted-foreground" lang={L}>{te ? `${r.starred ? 'నక్షత్ర ప్రశ్న' : 'ప్రశ్న'} ${r.no}` : `${r.starred ? 'Starred' : 'Unstarred'} question ${r.no}`}</span>
          </span>
        </li>
      )} />

      {f.pib.length ? (
        <>
          <SubHead en="Central government releases that name us" te="మన జిల్లా పేరు ఉన్న కేంద్ర ప్రకటనలు" n={f.pib.length} />
          <Collapse rows={f.pib} render={(r, i) => (
            <NoticeRow key={i} r={r} te={te} extra={<span className="block text-[12px] text-muted-foreground" lang="en">{[r.ministry, r.places.length ? `names ${r.places.join(', ')}` : null].filter(Boolean).join(' · ')}</span>} />
          )} />
          <p className="mt-2 text-[12.5px] text-muted-foreground" lang={L}>{tr('Press Information Bureau. A release that lists many towns may only name our district once.', 'పత్రికా సమాచార కార్యాలయం (PIB). చాలా ఊళ్ల పేర్లు ఉన్న ప్రకటనలో మన జిల్లా పేరు ఒక్కసారే ఉండవచ్చు.')}</p>
        </>
      ) : null}
    </section>
  )
}

function TapsExtra({ t, oct, te, district }: { t: TapsJuly; oct: number | null; te: boolean; district: string }) {
  const { tr } = useLang()
  const L = te ? 'te' : undefined
  return (
    <div className="mt-4">
      <p className="text-[14px] font-medium" lang={L}>{tr('Village homes with a tap, on two dates', 'రెండు తేదీల్లో నల్లా ఉన్న గ్రామీణ ఇళ్లు')}</p>
      <table className="mt-2 w-full border-collapse text-[15px]">
        <thead><tr className="border-b border-foreground/70 text-left"><th className="py-1.5 font-semibold">{tr('Date', 'తేదీ')}</th><th className="py-1.5 text-right font-semibold">{tr('Homes with a tap', 'నల్లా ఉన్న ఇళ్లు')}</th><th className="py-1.5 text-right font-semibold">{tr('Source', 'మూలం')}</th></tr></thead>
        <tbody>
          <tr className="border-b border-border"><td className="py-2" lang={L}>{te ? dTe(t.date) : dEn(t.date)}</td><td className="text-right tnum">{IND(t.with_tap)}</td><td className="text-right text-[12.5px]"><a href={t.url} target="_blank" rel="noreferrer" className="underline underline-offset-4" lang={L}>{tr('Lok Sabha', 'లోక్‌సభ')}</a></td></tr>
          {oct != null ? <tr><td className="py-2" lang={L}>{te ? '20 అక్టోబర్ 2026' : '20 Oct 2026'}</td><td className="text-right font-semibold tnum">{IND(oct)}</td><td className="text-right text-[12.5px]" lang={L}>{tr('Jal Jeevan Mission', 'జల్ జీవన్ మిషన్')}</td></tr> : null}
        </tbody>
      </table>
      {t.reads !== district ? <p className="mt-2 text-[12.5px] text-muted-foreground" lang={L}>{te ? t.note_te : t.note_en}</p> : null}
    </div>
  )
}

const leadSpeech = (it: Lead, te: boolean) => [(te ? it.head_te : it.head_en) + '.', te ? it.te : it.en, (te ? it.mean_te : it.mean_en) ?? ''].join(' ')

export default function Paper({ slug }: { slug: string }) {
  const { lang, tr, setLang } = useLang()
  const te = lang === 'te'
  const L = te ? 'te' : undefined
  const d = districtBySlug.get(slug) ?? districts[0]
  const h = useHappen(d.slug)
  const all = React.useMemo(() => [...(ED.districts[d.name] ?? []), ...siteItems(d.name)], [d.name])
  const { taps, water, money } = React.useMemo(() => ({
    taps: all.find((x) => x.kind === 'taps'),
    water: all.filter((x) => ['reservoir', 'rain', 'groundwater'].includes(x.kind)),
    money: all.filter((x) => ['economy', 'works', 'welfare'].includes(x.kind)),
  }), [all])
  const std = React.useMemo(() => (h ? [h.standard.houses, h.standard.health, h.standard.intern] : []), [h])
  const sp = useSpeaker()
  const voiceOk = te ? sp.voices.te : sp.voices.en

  const queue = React.useCallback((): { id: string; text: string }[] => {
    const q: { id: string; text: string }[] = [{ id: 'mast', text: te ? `${ED.name_te}. ${d.te} జిల్లా. సంచిక ${ED.edition}.` : `${ED.name_en}. ${d.name} district. Edition ${ED.edition}.` }]
    if (h) {
      h.lead.forEach((it) => q.push({ id: `lead-${it.id}`, text: leadSpeech(it, te) }))
      std.forEach((it) => q.push({ id: `lead-${it.id ?? it.kind}`, text: leadSpeech(it, te) }))
    }
    if (taps) q.push({ id: 'item-taps', text: speakText(taps, te) })
    if (h) {
      q.push({ id: 'p2', text: te
        ? `కలెక్టరేట్ నోటీసులు. ఈ కాలంలో ${h.counts.site} నోటీసులు వచ్చాయి. ఉద్యోగాలు ${h.feed.jobs.length}, టెండర్లు ${h.feed.tenders.length}. వివరాలు పేజీ 2లో.`
        : `Collectorate notices. ${h.counts.site} notices in this period: ${h.feed.jobs.length} job notifications and ${h.feed.tenders.length} tenders. Details are on page 2.` })
    }
    water.forEach((it) => q.push({ id: `item-${it.kind}`, text: speakText(it, te) }))
    money.forEach((it) => q.push({ id: `item-${it.kind}`, text: speakText(it, te) }))
    return q
  }, [h, te, d, taps, water, money, std])

  const playAll = () => (sp.playing ? sp.stop() : sp.play(queue(), te ? 'te' : 'en'))
  React.useEffect(() => {
    if (sp.playing && sp.playing !== 'mast') document.getElementById(sp.playing)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [sp.playing])
  React.useEffect(() => () => sp.stop(), [slug]) // eslint-disable-line react-hooks/exhaustive-deps
  const one = (id: string, text: string) => (sp.playing === id ? sp.stop() : sp.play([{ id, text }], te ? 'te' : 'en'))
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const date = new Date(ED.date + 'T00:00:00')
  const dateEn = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const dateTe = `${date.getDate()} ${MT[date.getMonth()]} ${date.getFullYear()}`
  const pages: { id: string; en: string; te: string; n?: string }[] = [
    { id: 'page-1', en: 'What is happening in our district', te: 'మన జిల్లాలో జరుగుతున్నవి', n: h ? String(h.lead.length + std.length + (taps ? 1 : 0)) : undefined },
    { id: 'page-2', en: 'Collectorate notices: jobs, tenders', te: 'కలెక్టరేట్ నోటీసులు: ఉద్యోగాలు, టెండర్లు', n: h ? String(h.counts.site) : undefined },
    { id: 'page-3', en: 'Parliament and the Centre on our district', te: 'పార్లమెంటు, కేంద్రం మాటల్లో మన జిల్లా', n: h ? String(h.counts.parliament + h.counts.pib) : undefined },
    { id: 'page-4', en: 'Water and rain', te: 'నీరు, వాన' },
    { id: 'page-5', en: 'Money, works, welfare', te: 'డబ్బు, పనులు, సంక్షేమం' },
  ]
  const story = (it: Item, extra?: React.ReactNode) => (
    <div key={it.kind} id={`item-${it.kind}`} className="scroll-mt-24">
      <Story it={it} idx={0} te={te} speaking={sp.playing === `item-${it.kind}`} onListen={() => one(`item-${it.kind}`, speakText(it, te))} extra={extra} />
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 md:pt-10">
      {ED.status === 'draft' ? (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13.5px] leading-snug text-amber-900 dark:text-amber-200" lang={L}>
          {tr('Draft edition, waiting for approval. It is shown here so the owner can check it. Readers will see it only after it is approved.',
            'ఇది ముసాయిదా సంచిక; ఆమోదం కోసం వేచి ఉంది. యజమాని పరిశీలించడానికి మాత్రమే ఇక్కడ చూపుతున్నాం. ఆమోదించాకే పాఠకులకు కనిపిస్తుంది.')}
        </p>
      ) : null}

      <header className="border-b-4 border-double border-foreground/80 pb-4 text-center">
        <div className="flex justify-between border-b border-foreground/70 pb-1.5 text-[12px] text-muted-foreground" lang={L}>
          <span>{te ? `సంచిక ${ED.edition} · ${dateTe}` : `Edition ${ED.edition} · ${dateEn}`}</span>
          <span>{te ? `${d.te} జిల్లా` : `${d.name} district`}</span>
        </div>
        <h1 className="mt-2 font-serif text-[40px] font-bold leading-tight md:text-[56px]" lang="te">{ED.name_te}</h1>
        <p className="text-[13px] text-muted-foreground" lang={L}>
          {te ? `ప్రభుత్వ పత్రాలే, అభిప్రాయాలు కాదు. ${HIDX.window.from_te} నుంచి ${HIDX.window.to_te} వరకు.` : `Government papers only, no opinions. ${HIDX.window.from_en} to ${HIDX.window.to_en}.`}
        </p>
        <label className="mt-3 inline-flex items-center gap-2">
          <span className="sr-only">{tr('District', 'జిల్లా')}</span>
          <select value={d.slug} onChange={(e) => go(`paper-${e.target.value}`)} className="h-11 rounded-lg border border-border bg-background px-3 text-[16px] font-semibold" lang={L}>
            {districts.map((x) => <option key={x.slug} value={x.slug}>{te ? x.te : x.name}</option>)}
          </select>
        </label>
      </header>

      {sp.supported && !voiceOk ? (
        <p className="mt-3 rounded-xl bg-muted/60 px-4 py-2.5 text-[13.5px] leading-snug" lang={L}>
          {te
            ? 'ఈ పరికరంలో తెలుగు గొంతు దొరకలేదు. ఆండ్రాయిడ్ ఫోన్‌లో: సెట్టింగ్స్ > భాష > టెక్స్ట్-టు-స్పీచ్ > గూగుల్ > తెలుగు వాయిస్ డౌన్‌లోడ్ చేయండి. అసలు పత్రికలో ప్రతి సంచికకు రికార్డ్ చేసిన తెలుగు ఆడియో ఉంటుంది.'
            : 'No English voice was found on this device. The live paper will carry a recorded audio file for every edition.'}
        </p>
      ) : null}

      <nav className="mt-5 rounded-xl border-2 border-foreground/80 px-4 py-3" aria-label={tr('In this edition', 'ఈ సంచికలో')}>
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em]" lang={L}>{tr('In this edition', 'ఈ సంచికలో')}</p>
        <ol className="mt-1.5 space-y-0.5">
          {pages.map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => jump(p.id)} className="flex min-h-10 w-full items-baseline gap-2 text-left text-[15.5px] underline-offset-4 hover:underline" lang={L}>
                <span className="w-5 shrink-0 font-semibold">{i + 1}.</span><span className="flex-1">{te ? p.te : p.en}</span>
                {p.n ? <span className="text-[13px] text-muted-foreground tnum">{p.n}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Band id="page-1" n={1} title={te ? pages[0].te : pages[0].en} />
      {!h ? <p className="mt-6 text-center text-muted-foreground">{tr('Loading the paper…', 'పత్రిక వస్తోంది…')}</p> : (
        <>
          {h.thin ? (
            <p className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-[14.5px] leading-relaxed" lang={L}>
              {te
                ? `${d.te} కలెక్టరేట్ సైట్‌లో ఈ కాలంలో ${h.counts.site} నోటీసులు మాత్రమే వచ్చాయి. అందుకే ఈ పేజీ ఎక్కువగా లోక్‌సభ జవాబులు, కేంద్ర ప్రకటనలు, ప్రభుత్వ లెక్కల మీద ఆధారపడింది.`
                : `The ${d.name} collectorate site posted only ${h.counts.site} notices in this period, so this page leans on Lok Sabha answers, central releases and official figures.`}
            </p>
          ) : null}
          {h.lead.length === 0 && (te ? h.none_reason_te : h.none_reason_en) ? <p className="mt-4 text-[15px]" lang={L}>{te ? h.none_reason_te : h.none_reason_en}</p> : null}
          <div>
            {h.lead.map((it, i) => <LeadStory key={it.id} it={it} te={te} big={i === 0} speaking={sp.playing === `lead-${it.id}`} onListen={() => one(`lead-${it.id}`, leadSpeech(it, te))} />)}
            {std.map((it) => <LeadStory key={it.kind} it={{ ...it, id: it.kind }} te={te} speaking={sp.playing === `lead-${it.kind}`} onListen={() => one(`lead-${it.kind}`, leadSpeech(it, te))} />)}
          </div>
          {taps ? <div className="mt-5">{story(taps, <TapsExtra t={h.standard.taps_july} oct={taps.big?.value ?? null} te={te} district={d.name} />)}</div> : null}

          <Band id="page-2" n={2} title={te ? pages[1].te : pages[1].en} />
          <Notices h={h} d={d} te={te} />

          <Band id="page-3" n={3} title={te ? pages[2].te : pages[2].en} />
          <Parliament h={h} d={d} te={te} />
        </>
      )}

      <Band id="page-4" n={4} title={te ? pages[3].te : pages[3].en} />
      <div className="mt-4 space-y-5">{water.map((it) => story(it))}</div>

      <Band id="page-5" n={5} title={te ? pages[4].te : pages[4].en} />
      <div className="mt-4 space-y-5">{money.map((it) => story(it))}</div>

      <div className="mt-10 rounded-xl bg-muted/60 px-4 py-3" lang={L}>
        <p className="text-[13.5px] font-bold">{tr('Not in this edition, and why', 'ఈ సంచికలో లేనివి, ఎందుకు')}</p>
        <p className="mt-1 text-[14px] leading-relaxed">
          {te
            ? 'రాష్ట్ర G.O.లు, గెజిట్ సైట్లు ప్రస్తుతం తెరుచుకోవడం లేదు. రాష్ట్ర శాఖల సైట్లు, రాజ్యసభ జవాబులు తరువాతి సంచికలో. వార్తాపత్రికల కథనాలు వేస్తే, అవి "పత్రికల్లో వచ్చిన మాట" అని గుర్తు పెట్టి వేస్తాం.'
            : 'The state G.O. and gazette sites are not opening right now. State department sites and Rajya Sabha answers come in a later edition. If we ever carry a newspaper report, it will be marked as a newspaper claim.'}
        </p>
      </div>

      <footer className="mt-8 space-y-2 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground" lang={L}>
        <p>{te
          ? 'ఈ పత్రిక ప్రతి రోజు రాదు. ప్రభుత్వ మూలం మన జిల్లాకు కొత్త సమాచారం ప్రచురించినప్పుడే కొత్త సంచిక వస్తుంది. పాత సంచికలు ఇక్కడే ఉంటాయి.'
          : 'This paper does not come out every day. A new edition comes only when an official source publishes something new for the district. Old editions stay readable here.'}</p>
        <p>{te
          ? 'ఇందులో ఏ పార్టీ పేరూ, అభిప్రాయమూ ఉండవు. ప్రభుత్వం ముద్రించిన అంకెలు, వాటి అర్థం మాత్రమే. ఏదైనా తప్పుగా అనిపిస్తే మాకు తెలపండి.'
          : 'No party names and no opinions: only the figures the government printed, and what they mean. If anything looks wrong, tell us.'}{' '}
          <a href={href('community')} className="font-medium text-foreground underline underline-offset-4">{tr('Tell us', 'మాకు చెప్పండి')}</a></p>
      </footer>

      <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 rounded-full border border-border bg-background/95 p-2 shadow-lg backdrop-blur md:bottom-6 md:left-1/2 md:right-auto md:w-[460px] md:-translate-x-1/2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button type="button" onClick={playAll} disabled={!sp.supported}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[16px] font-semibold text-background disabled:opacity-50">
            {sp.playing ? <Pause className="size-5" /> : <Volume2 className="size-5" />}
            <span lang={L}>{sp.playing ? tr('Stop', 'ఆపండి') : tr('Listen to the whole paper', 'పత్రిక మొత్తం వినండి')}</span>
          </button>
          <button type="button" onClick={() => { sp.stop(); setLang(te ? 'en' : 'te') }} className="h-12 rounded-full border border-border px-4 text-[14px] font-medium">
            {te ? 'English' : 'తెలుగు'}
          </button>
        </div>
      </div>
    </div>
  )
}
