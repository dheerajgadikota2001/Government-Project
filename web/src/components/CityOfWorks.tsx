import * as React from 'react'
import { ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { meta, MERGED } from '@/lib/data'
import { byId, projects } from '@/lib/data-projects'
import { events } from '@/lib/data-events'
import { clean, crore, dateLong, dateShort, num, STATUS_WORDS, TYPE_WORDS } from '@/lib/format'
import { StatusWord } from '@/components/kit'
import { View3D, Pin } from '@/three/View3D'

// The register as a city: one building per work, built up to its latest printed share.

const GROUPS = [
  { key: 'towns', kinds: ['urban_development'], en: 'Town works (AMRUT)', te: 'పట్టణ పనులు' },
  { key: 'roads', kinds: ['roads'], en: 'Roads', te: 'రోడ్లు' },
  { key: 'water', kinds: ['irrigation'], en: 'Water and irrigation', te: 'సాగునీరు' },
  { key: 'rail', kinds: ['railways'], en: 'Railways', te: 'రైల్వే' },
  { key: 'power', kinds: ['power'], en: 'Power', te: 'విద్యుత్' },
  { key: 'other', kinds: ['industrial', 'infrastructure', 'it_tech', 'education', 'health', 'airports', 'ports'], en: 'Industry, ports, airports, others', short: 'Industry and others', te: 'ఇతర పనులు' },
]
const works = projects.filter((p) => !MERGED[p.id]).map((p) => ({ id: p.id, kind: p.ty, status: p.st, pct: p.p }))
const counts = Object.fromEntries(GROUPS.map((g) => [g.key, works.filter((w) => g.kinds.includes(w.kind)).length]))

export function CityOfWorks({ className }: { className?: string }) {
  const { lang, tr } = useLang()
  const [picked, setPicked] = React.useState<number | null>(null)
  const [hover, setHover] = React.useState<number | null>(null)
  const shown = hover ?? picked
  const portrait = React.useMemo(() => typeof window !== 'undefined' && window.innerWidth < 640, [])
  const p = shown != null ? byId.get(shown) : null
  const lastEv = p ? (events[String(p.id)] ?? []).filter((e) => e.tier === 'government').slice(-1)[0] : null
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-5 pb-0 md:p-6 md:pb-0">
        <div className="text-[17px] font-semibold">{tr('Every work, as a city', 'ప్రతి పని, ఒక నగరంలా')}</div>
        <div className="text-[12.5px] text-muted-foreground">{tr(`One building for each of ${num(works.length, 0)} records in our register, updated ${dateShort(meta.register_updated)}.`, `మా రిజిస్టర్‌లోని ప్రతి పనికి ఒక భవనం.`)}</div>
      </div>
      <div className="relative h-[520px] sm:h-[460px] lg:h-[520px]">
        <View3D explorable build={() => import('@/three/scenes/cityworks')} params={{ works, groups: GROUPS.map(({ key, kinds }) => ({ key, kinds })), onPick: setPicked, onHover: setHover, selected: picked, portrait }}
          label="Every work in the register as a building; the solid part is the share built" className="size-full" interactive
          fallback={<div className="grid size-full place-items-center text-[13px] text-muted-foreground">{tr('The 3D city needs a newer browser. The table below lists every work.', 'పట్టిక క్రింద ఉంది')}</div>}>
          {GROUPS.map((g) => (
            <Pin key={g.key} id={`group-${g.key}`} place="top">
              <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11.5px] font-semibold shadow-sm ring-1 ring-border">{lang === 'te' ? <span lang="te">{g.te}</span> : portrait && 'short' in g ? g.short : g.en} <span className="text-muted-foreground tnum">{num(counts[g.key], 0)}</span></span>
            </Pin>
          ))}
        </View3D>
        {p ? (
          <div className="absolute inset-x-3 bottom-3 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:left-4 sm:w-[380px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground"><StatusWord status={p.st} /><span>{TYPE_WORDS[p.ty]?.en}</span></div>
                <a href={href('project-' + p.id)} className="mt-1 line-clamp-2 text-[15.5px] font-semibold leading-snug hover:underline">{p.id === 613 ? 'Polavaram Irrigation Project' : clean(p.t)}</a>
              </div>
              {picked != null ? <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-accent"><X className="size-4" /></button> : null}
            </div>
            <div className="mt-2 text-[13.5px] text-foreground/85">
              {p.p != null ? <><b className="tnum">{num(p.p)}%</b> {tr('of the work done', 'పని పూర్తి')}</> : p.st === 'completed' ? tr('Finished', 'పూర్తయింది') : tr('No share of work printed', 'పని శాతం ప్రచురించలేదు')}
              {p.c != null ? <> · {crore(p.c)}</> : null}
              {lastEv ? <div className="mt-1 text-[12.5px] text-muted-foreground">{clean(lastEv.doc)}, {dateLong(lastEv.date)}</div> : null}
            </div>
            <a href={href('project-' + p.id)} className="mt-2 inline-flex items-center gap-1 text-[13.5px] font-medium">{tr('Open this work', 'ఈ పని చూడండి')}<ArrowRight className="size-4" /></a>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border p-4 text-[12.5px] text-muted-foreground md:px-6">
        <span className="inline-flex items-center gap-2"><span className="inline-block h-4 w-3 rounded-[2px] bg-foreground/85" />{tr('Solid: the share built, as the latest paper prints it', 'ఘనం: కట్టిన భాగం')}</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-4 w-3 rounded-[2px] border border-foreground/50" />{tr('Outline: still to build, or no share printed', 'రేఖ: ఇంకా కట్టాల్సినది')}</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-4 w-3 rounded-[2px] bg-[#9D988F]" />{tr('Grey: work stopped', 'బూడిద: పని ఆగింది')}</span>
        <span>{tr('Tap a building to see the work.', 'పని కోసం భవనాన్ని తాకండి.')}</span>
      </div>
      <div className="hidden">{STATUS_WORDS.completed?.en}</div>
    </div>
  )
}
