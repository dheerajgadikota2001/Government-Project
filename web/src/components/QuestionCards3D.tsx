import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { go, href } from '@/lib/route'
import { claims, districts, drawnDistricts, mapViewBox, money, pol } from '@/lib/data'
import { lakhCrore } from '@/lib/format'
import { Te } from '@/components/kit'
import { View3D, Pin } from '@/three/View3D'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel'
import { Ring, Spark, ClaimScale } from '@/graphics/Mini'
import type { MoneyBar } from '@/three/scenes/money'

// The four questions as cards with a real model each. Phones swipe through them; wide screens see all four.

type Q = { key: string; token: string; title: string; te: string; body: React.ReactNode }

const rbi = money.series.find((s: any) => s.indicator === 'outstanding_liabilities' && s.family === 'RBI')
const debtBars: MoneyBar[] = rbi.points.map((p: any) => ({ id: String(p.fy_end), value: p.value, kind: p.stage === 'A' ? 'actual' : 'estimate' }))
const lastActual = [...debtBars].reverse().find((b) => b.kind === 'actual') ?? debtBars[0]
const june = claims.find((c: any) => c.slug === 'ap-debt-june-2024')
const claimBars: MoneyBar[] = [
  { id: 'rbi', value: june.record[0].figure, kind: 'actual' },
  { id: 'claim', value: june.claims[0].figure, kind: 'claim', parts: [{ label: 'Government debt', value: 438278 }, { label: 'Corporation debt', value: 248677 }, { label: 'Unpaid dues and the rest', value: null }] },
]
const latest = pol.readings[pol.readings.length - 1]
const chip = 'rounded-full bg-background/92 px-2 py-0.5 text-[11.5px] font-semibold shadow-sm ring-1 ring-border'

function Visual({ k }: { k: string }) {
  const { tr } = useLang()
  if (k === 'pol') return (
    <View3D build={() => import('@/three/scenes/dam')} params={{ pct: latest.pct, compact: true }} label={`Polavaram: ${latest.pct}% of the work drawn solid`} className="size-full"
      fallback={<div className="grid size-full place-items-center"><Ring pct={latest.pct} size={130} label="physical progress" /></div>}>
      <Pin id="gap"><span className={cn(chip, 'border border-dashed border-foreground/40 ring-0')}>{tr('Still to build', 'ఇంకా కట్టాలి')}</span></Pin>
    </View3D>
  )
  if (k === 'dist') return <DistrictModel />
  if (k === 'debt') return (
    <View3D build={() => import('@/three/scenes/money')} params={{ bars: debtBars, ticks: [200000, 400000, 600000], max: 680000, compact: true }}
      label="Stacks of money, one for each year's debt; glass stacks are estimates" className="size-full"
      fallback={<div className="px-6 pt-8"><Spark height={96} points={rbi.points.map((p: any) => ({ x: p.fy_end, v: p.value, stage: p.stage }))} /></div>}>
      <Pin id={`top-${lastActual.id}`} place="left"><span className={chip}>{lakhCrore(lastActual.value, 2)}, Mar {lastActual.id.slice(2)}</span></Pin>
    </View3D>
  )
  return (
    <View3D build={() => import('@/three/scenes/money')} params={{ bars: claimBars, ticks: [250000, 500000, 750000, 1000000], max: 1000000, wide: true, compact: true }}
      label="The claim as a glass stack beside the record as a paper stack, on one scale" className="size-full"
      fallback={<div className="px-6 pt-10"><ClaimScale compact claim={{ v: 974556, label: 'Claim' }} records={[{ v: 492568, label: 'RBI' }]} /></div>}>
      <Pin id="top-claim" place="left"><span className={cn(chip, 'border border-dashed border-foreground/40 ring-0')}>{tr('Claim', 'చెప్పినది')} {lakhCrore(june.claims[0].figure, 2)}</span></Pin>
      <Pin id="top-rbi"><span className={chip}>{tr('Record', 'రికార్డు')} {lakhCrore(june.record[0].figure, 2)}</span></Pin>
    </View3D>
  )
}

const shapes = drawnDistricts.map((d) => ({ name: d.name, shape: d.shape }))
function DistrictModel() {
  const [name, setName] = React.useState<string | null>(null)
  return (
    <View3D build={() => import('@/three/scenes/apmap')} params={{ shapes, viewBox: mapViewBox, selected: null, compact: true, onHover: setName, onPick: (n: string) => go('district-' + districts.find((d) => d.name === n)!.slug) }}
      label="A model of Andhra Pradesh's districts; tap one to open it" className="size-full" interactive
      fallback={<div className="grid size-full place-items-center text-[13px] text-muted-foreground">Map</div>}>
      <Pin id="label"><span className={chip}>{name ?? ''}</span></Pin>
    </View3D>
  )
}

export function QuestionCards3D({ items }: { items: Q[] }) {
  const { lang, tr } = useLang()
  const [api, setApi] = React.useState<CarouselApi>()
  const [active, setActive] = React.useState(0)
  React.useEffect(() => {
    if (!api) return
    const on = () => setActive(api.selectedScrollSnap())
    api.on('select', on); on()
    return () => { api.off('select', on) }
  }, [api])
  return (
    <div>
      <Carousel setApi={setApi} opts={{ align: 'start' }}>
        <CarouselContent>
          {items.map((q) => (
            <CarouselItem key={q.key} className="basis-[86%] sm:basis-1/2 lg:basis-1/4">
              <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/30">
                <div className="relative h-[220px] bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-muted),transparent_70%)]"><Visual k={q.key} /></div>
                <a href={href(q.token)} className="flex flex-1 flex-col p-5">
                  <div className="font-heading text-[19px] font-semibold leading-snug">{lang === 'te' ? <Te>{q.te}</Te> : q.title}</div>
                  <div lang={lang === 'te' ? 'en' : 'te'} className="mt-0.5 text-[14px] text-muted-foreground">{lang === 'te' ? q.title : q.te}</div>
                  <div className="mt-2 text-[14.5px] leading-relaxed text-foreground/85">{q.body}</div>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[14px] font-medium">{tr('See the answer', 'జవాబు చూడండి')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                </a>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="mt-3 flex items-center justify-center gap-1.5 lg:hidden" aria-hidden>
        {items.map((q, i) => <span key={q.key} className={cn('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-foreground' : 'w-1.5 bg-foreground/25')} />)}
      </div>
    </div>
  )
}
