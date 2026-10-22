import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { bigWorks, type BigWork } from '@/lib/bigworks'
import { clean, crore, croreTe, dateLong, dateTe, num } from '@/lib/format'
import { PaperChip, StatusWord, Te } from '@/components/kit'
import { View3D, Pin } from '@/three/View3D'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel'
import { Dam } from '@/graphics/Dam'
import { pol } from '@/lib/data-polavaram'

// The first screen's big works: one model at a time, chips to jump, swipe on phones.
// Only the work on screen runs its model; the others wait until they are swiped in.

const loadDam = () => import('@/three/scenes/dam')
const loadWorks = () => import('@/three/scenes/works')
const loadBhogapuram = () => import('@/three/scenes/bhogapuram')
const pinCls = 'rounded-full bg-background/92 px-2.5 py-1 text-[12px] font-semibold shadow-sm ring-1 ring-border backdrop-blur'

/** What the reader should know about how a model was drawn. Hand-made models say what they are built from. */
export function modelNote(w: BigWork, long = false): { en: string; te: string } {
  if (w.id === 2) return long
    ? { en: 'Phase 1 as built, at true scale on the real ground. The ground is a Copernicus Sentinel-2 satellite picture of 28 September 2026; the land’s shape is the Copernicus elevation model, and inside the fence the runway level the AIP publishes (rising 0.544% to the east). The runway, every aircraft stand, the control tower and the approach lights stand at their surveyed points (AAI AIP Supplement 80/2026). Taxiways, aprons, the terminal’s footprint and the 7 boarding bridges follow AAI’s aerodrome chart and are close, not exact. The terminal’s architecture and building heights are not published, so their form is simplified. Parked and moving aircraft show size and use, not real traffic.',
        te: 'మొదటి దశ, నిజమైన నేలపై, అసలు కొలతల్లో. నేల 2026 సెప్టెంబర్ 28 నాటి కోపర్నికస్ సెంటినెల్-2 ఉపగ్రహ చిత్రం; భూమి ఎత్తుపల్లాలు కోపర్నికస్ ఎత్తు నమూనా, కంచె లోపల ఏఏఐ ప్రచురించిన రన్‌వే మట్టం (తూర్పుకు 0.544% ఎగుడు). రన్‌వే, ప్రతి విమాన స్టాండ్, కంట్రోల్ టవర్, అప్రోచ్ లైట్లు సర్వే చేసిన చోట్లలోనే ఉన్నాయి (AIP సప్లిమెంట్ 80/2026). టాక్సీవేలు, ఏప్రాన్లు, టెర్మినల్ ఆకారం, 7 బోర్డింగ్ బ్రిడ్జిలు ఏఏఐ చార్టు ప్రకారం; దగ్గరగా, ఖచ్చితంగా కాదు. టెర్మినల్ నిర్మాణ రూపం, భవనాల ఎత్తులు ప్రచురించలేదు; అందుకే సరళంగా గీశాం. నిలిపిన, కదిలే విమానాలు పరిమాణం, వాడకం చూపడానికే; నిజమైన రాకపోకలు కాదు.' }
    : { en: 'AAI’s surveyed layout on a satellite picture of 28 Sep 2026. True scale.', te: 'ఏఏఐ సర్వే లేఅవుట్, 2026 సెప్టెంబర్ 28 ఉపగ్రహ చిత్రంపై. అసలు కొలతల్లో.' }
  return long
    ? { en: 'Model, not to scale. The solid part is the share of work the latest government paper prints; the faint part is still to build. With no share printed, the whole work is drawn faint: the plan.',
        te: 'నమూనా బొమ్మ, కొలతల ప్రకారం కాదు. తాజా ప్రభుత్వ పత్రం ముద్రించిన పని శాతాన్ని గట్టిగా, ఇంకా కట్టాల్సిన భాగాన్ని లేతగా చూపాం. పని శాతం ముద్రించకపోతే, మొత్తం పనిని లేతగా చూపాం: అది ప్రణాళిక.' }
    : { en: 'Model, not to scale. Solid: the share built. Faint: still to build.', te: 'నమూనా చిత్రం. ఘనం: కట్టింది. లేత: ఇంకా కట్టాలి.' }
}

export function BigWorkModel({ w, compact }: { w: BigWork; compact?: boolean }) {
  const { tr, lang } = useLang()
  const planned = w.drawPct == null
  const label = lang === 'te'
    ? `${w.te}: ${planned ? 'పని శాతం ముద్రించలేదు; నమూనా ప్రణాళికను చూపుతుంది' : `పనిలో ${num(w.drawPct!)}% గట్టిగా గీశాం`}`
    : `${w.name}: ${planned ? 'no share of work is printed; the model shows the plan' : `${num(w.drawPct!)}% of the work drawn solid`}`
  const pins = (
    <>
      {!planned && w.drawPct! < 100 ? <Pin id={w.kind === 'dam' ? 'gap' : 'todo'}><span className={cn(pinCls, 'border border-dashed border-foreground/40 ring-0')}>{tr('Still to build', 'ఇంకా కట్టాలి')}</span></Pin> : null}
      {!planned && w.kind !== 'dam' && w.drawPct! > 8 ? <Pin id="built"><span className={pinCls}>{w.drawPct! >= 100 ? tr('Built', 'పూర్తయింది') : tr('Built so far', 'ఇప్పటిదాకా కట్టింది')}</span></Pin> : null}
      {planned ? <Pin id="todo"><span className={cn(pinCls, 'border border-dashed border-foreground/40 ring-0')}>{tr('The plan: no share of work printed', 'ప్రణాళిక మాత్రమే')}</span></Pin> : null}
    </>
  )
  if (w.id === 2) {
    // Bhogapuram: hand-made from AAI's published aerodrome data (see three/scenes/bhogapuram.ts)
    return (
      <View3D explorable build={loadBhogapuram} params={{ compact }} label={lang === 'te'
        ? `${w.te}: మొదటి దశ, ఏఏఐ ప్రచురించిన కొలతల ప్రకారం గీసిన నమూనా`
        : `${w.name}: Phase 1, drawn from the Airports Authority of India's published layout`} className="size-full"
        fallback={<div className="grid size-full place-items-center text-[13px] text-muted-foreground">{lang === 'te' ? w.te : w.name}</div>}>
        <Pin id="runway" priority={3}><span className={pinCls}>{tr('Runway 10/28: 3,800 m', 'రన్‌వే 10/28: 3,800 మీ')}</span></Pin>
        <Pin id="terminal" priority={2}><span className={pinCls}>{tr('Terminal', 'టెర్మినల్')}</span></Pin>
        <Pin id="apron" place="right"><span className={pinCls}>{tr('Apron: 18 stands', 'ఏప్రాన్: 18 స్టాండ్లు')}</span></Pin>
        <Pin id="tower"><span className={pinCls}>{tr('Control tower', 'కంట్రోల్ టవర్')}</span></Pin>
        <Pin id="coast"><span className={pinCls}>{tr('Bay of Bengal', 'బంగాళాఖాతం')}</span></Pin>
      </View3D>
    )
  }
  if (w.kind === 'dam') {
    return (
      <View3D explorable build={loadDam} params={{ pct: w.drawPct, compact }} label={label} className="size-full"
        fallback={<div className="grid size-full place-items-center p-6"><Dam readings={pol.readings} index={pol.readings.length - 1} notes={false} /></div>}>
        {pins}
      </View3D>
    )
  }
  return (
    <View3D explorable build={loadWorks} params={{ kind: w.kind, pct: w.drawPct, compact, seed: w.id % 7 }} label={label} className="size-full"
      fallback={<div className="grid size-full place-items-center text-[13px] text-muted-foreground">{lang === 'te' ? w.te : w.name}</div>}>
      {pins}
    </View3D>
  )
}

// Due dates in these papers are a month, not a day: print them as the paper does.
const monthYear = (d: string) => new Date(d + (d.length === 7 ? '-01' : '')).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

function Reading({ w }: { w: BigWork }) {
  const { tr, lang } = useLang()
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusWord status={w.status} size="md" />
        {w.place ? <span className="text-[13px] text-muted-foreground">{w.place}</span> : null}
      </div>
      <a href={href('project-' + w.id)} className="mt-1 block font-heading text-[24px] font-semibold leading-tight tracking-tight hover:underline md:text-[28px]">
        {lang === 'te' ? <Te>{w.te}</Te> : w.name}
      </a>
      <div lang={lang === 'te' ? 'en' : 'te'} className="text-[14px] text-muted-foreground">{lang === 'te' ? w.name : w.te}</div>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        {w.pct != null ? (
          <div>
            <div className="font-heading text-[44px] font-semibold leading-none tracking-tight tnum md:text-[52px]">{num(w.pct)}%</div>
            <div className="mt-1 text-[13.5px] text-muted-foreground">{tr('of the work done, as the paper prints it', 'పని పూర్తయింది, పత్రం ప్రకారం')}</div>
          </div>
        ) : w.status === 'completed' ? (
          <div>
            <div className="font-heading text-[30px] font-semibold leading-tight">{tr('Finished and open', 'పూర్తయి ప్రారంభమైంది')}</div>
            <div className="mt-1 text-[13.5px] text-muted-foreground">{tr('No paper prints a share; the work is in use', 'పనిలో ఉంది')}</div>
          </div>
        ) : (
          <div className="max-w-md">
            <div className="text-[15px] font-semibold">{tr('No share of work printed yet', 'పని శాతం ఇంకా ప్రచురించలేదు')}</div>
            {w.step ? <div className="mt-1 line-clamp-3 text-[14px] leading-snug text-foreground/85">{clean(w.step)}</div> : null}
          </div>
        )}
        {w.cost != null ? (
          <div>
            <div className="font-heading text-[22px] font-semibold leading-none tnum">{lang === 'te' ? croreTe(w.cost) : crore(w.cost)}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">{tr('cost as printed', 'ముద్రించిన వ్యయం')}</div>
          </div>
        ) : null}
        {w.due && w.status !== 'completed' ? (
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/45 px-2.5 py-0.5 text-[13px] font-semibold">{lang === 'te' ? `గడువు ${dateTe(w.due.slice(0, 7))}` : `Due ${monthYear(w.due)}`}</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">{tr('a plan, not an event', 'ప్రణాళిక మాత్రమే')}</div>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {w.paper ? <PaperChip label={`${clean(w.paper)}${w.date && !/\b(19|20)\d\d\b/.test(w.paper) ? `, ${dateLong(w.date)}` : ''}`} url={w.url ?? undefined} /> : null}
        <a href={href('project-' + w.id)} className="inline-flex items-center gap-1 text-[14px] font-medium underline-offset-4 hover:underline">{tr('The full story', 'పూర్తి కథ')}<ArrowRight className="size-4" /></a>
      </div>
    </div>
  )
}

export function BigWorks({ className }: { className?: string }) {
  const { tr, lang } = useLang()
  const [api, setApi] = React.useState<CarouselApi>()
  const [active, setActive] = React.useState(0)
  const chipsRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!api) return
    const on = () => setActive(api.selectedScrollSnap())
    api.on('select', on); on()
    return () => { api.off('select', on) }
  }, [api])
  // keep the chosen chip in view
  React.useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tr('Big works, latest reading', 'పెద్ద పనులు, తాజా సమాచారం')}</div>
        <div className="text-[12.5px] text-muted-foreground tnum">{active + 1} / {bigWorks.length}</div>
      </div>
      <div ref={chipsRef} className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tr('Choose a big work', 'పనిని ఎంచుకోండి')}>
        {bigWorks.map((w, i) => (
          <button key={w.id} data-i={i} type="button" role="tab" aria-selected={i === active} onClick={() => api?.scrollTo(i)}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
              i === active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground/80 hover:border-foreground/40')}>
            {lang === 'te' ? <span lang="te">{w.te}</span> : w.name}
          </button>
        ))}
      </div>
      <Carousel setApi={setApi} opts={{ align: 'start', loop: false }} className="mt-1">
        <CarouselContent>
          {bigWorks.map((w, i) => (
            <CarouselItem key={w.id}>
              <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_48px_-28px_rgba(0,0,0,.35)]" aria-roledescription="slide" aria-label={lang === 'te' ? `${bigWorks.length}లో ${i + 1}: ${w.te}` : `${i + 1} of ${bigWorks.length}: ${w.name}`}>
                <div className="relative h-[260px] bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-muted),transparent_70%)] sm:h-[320px] lg:h-[340px]">
                  {Math.abs(i - active) <= 0 ? <BigWorkModel w={w} /> : <div className="grid size-full place-items-center text-[13px] text-muted-foreground">{lang === 'te' ? w.te : w.name}</div>}
                  <div className="pointer-events-none absolute bottom-2.5 left-3 right-[9.75rem] text-[11px] leading-snug text-muted-foreground">{tr(modelNote(w).en, modelNote(w).te)}</div>
                </div>
                <div className="p-5 md:p-6"><Reading w={w} /></div>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
        {bigWorks.map((w, i) => <span key={w.id} className={cn('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-foreground' : 'w-1.5 bg-foreground/25')} />)}
      </div>
    </div>
  )
}
