import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { districtByName, pol } from '@/lib/data'
import { dateLong, dateTe, num, yearFrac, TODAY } from '@/lib/format'
import { View3D, Pin } from '@/three/View3D'
import { Dam } from '@/graphics/Dam'
import { Map3D } from '@/graphics/Map3D'
import { CostDots, DeadlineChart, type Deadline } from '@/graphics/PolCharts'
import { RM, useTokens } from '@/graphics/util'
import { mix } from '@/graphics/tokens'
import { polavaramRoad, type Bi, type MeasureRow, type RoadMark, type StoryPic } from '@/data/stories/polavaram'

// The picture beside a story. It changes with the step being read, and it never jumps:
//  - the 3D dam is built once and then glides to each new reading (and back to the plan);
//  - the project road keeps its place and only lights the step's own events;
//  - charts cross-fade.
// Every word on a picture repeats the step or its paper; nothing here is added up or worked out.

const P = pol.papers as Record<string, { short: string; url: string }>
const pick = (lang: string, b: Bi) => (lang === 'te' ? b.te : b.en)

/** The size of an element, kept current. */
export function useBox<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width), h = Math.round(r.height)
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box] as const
}

type DamPic = Extract<StoryPic, { kind: 'dam' }>

export function StoryPicture({ pic, explorable, className }: { pic: StoryPic; explorable?: boolean; className?: string }) {
  const { lang, tr } = useLang()
  const [ref, box] = useBox<HTMLDivElement>()
  // The dam stays built once it has appeared, so the next reading glides in instead of rebuilding.
  const last = React.useRef<DamPic | null>(null)
  if (pic.kind === 'dam') last.current = pic
  const dam = last.current
  const isDam = pic.kind === 'dam'
  const damParams = React.useMemo(() => ({ pct: dam?.pct ?? null }), [dam?.pct])
  const damLabel = dam == null ? '' : dam.pct == null
    ? tr('Polavaram drawn as planned, with nothing drawn as built', 'పోలవరం ప్రణాళిక చిత్రం, ఏ భాగాన్నీ కట్టినట్లు చూపలేదు')
    : tr(`Polavaram drawn ${num(dam.pct)}% solid, as the report prints it`, `నివేదిక చెప్పినట్లు పోలవరాన్ని ${num(dam.pct)}% నిండుగా చూపాం`)

  return (
    <div ref={ref} className={cn('relative isolate overflow-hidden rounded-2xl border border-border bg-card', className)}>
      {dam ? (
        <div className={cn('absolute inset-0 transition-opacity duration-500', isDam ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={!isDam}>
          <View3D explorable={explorable && isDam} paused={!isDam} build={() => import('@/three/scenes/dam')} params={damParams} label={damLabel} className="absolute inset-0"
            fallback={<div className="grid size-full place-items-center p-6"><Dam readings={[{ date: '', pct: dam.pct, spent: null, paper: '' }]} index={0} gauge={false} notes={false} /></div>}>
            {(dam.pins ?? []).map((p, i) => (
              <Pin key={p.at + ':' + p.label.en} id={p.at} priority={10 - i}>
                <span className={cn('rounded-full bg-background/92 px-2.5 py-1 text-[12.5px] font-semibold shadow-sm ring-1 ring-border', p.at === 'gap' && dam.pct != null && 'border border-dashed border-foreground/40 ring-0')}
                  lang={lang === 'te' ? 'te' : undefined}>{pick(lang, p.label)}</span>
              </Pin>
            ))}
          </View3D>
          <AnimatePresence initial={false}>
            {dam.big ? (
              <motion.div key={dam.big.value} className="pointer-events-none absolute bottom-2.5 left-2.5 max-w-[52%] rounded-xl bg-background/90 px-3 py-2 shadow-sm ring-1 ring-border backdrop-blur"
                initial={RM ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.3 }}>
                <div className="font-heading text-[30px] font-semibold leading-none tracking-tight tnum sm:text-[38px]">{dam.big.value}</div>
                <div className="mt-1 text-[12px] leading-snug text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{pick(lang, dam.big.note)}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {!isDam ? (
          <motion.div key={pic.kind} className="absolute inset-0" initial={RM ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <Flat pic={pic} w={box.w} h={box.h} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** One line under a picture: what it shows. */
export function pictureNote(pic: StoryPic, lang: string): string {
  const te = lang === 'te'
  switch (pic.kind) {
    case 'dam': return pic.pct == null
      ? (te ? 'ప్రణాళికలోని డ్యామ్: ఏ భాగాన్నీ కట్టినట్లు చూపలేదు.' : 'The dam as planned: nothing is drawn as built.')
      : (te ? `నివేదిక చెప్పిన ${num(pic.pct)}% మేర నిండుగా చూపాం. ఇది శాతం చిత్రం మాత్రమే, ఏ భాగాలు పూర్తయ్యాయో చూపదు.` : `Drawn ${num(pic.pct)}% solid, as the report prints it. A picture of the share, not of which parts are done.`)
    case 'road': return te ? 'పత్రాలు ఇచ్చిన తేదీలు. వెలిగినవి ఈ అడుగుకు సంబంధించినవి.' : 'Dates as the papers print them. The lit ones belong to this step.'
    case 'cost': return te ? 'ప్రతి గుర్తు ఒక పత్రం ముద్రించిన వ్యయం. వేర్వేరు పరిధులు, కాబట్టి కలపలేదు.' : 'Each mark is a cost as one paper printed it. The scopes differ, so they are not joined.'
    case 'measures': return te ? 'ప్రతి గీత ఒక పత్రం, ఒక కొలత. వాటిని కలపలేదు.' : 'Each bar is one measure in one paper. They are not joined.'
    case 'deadline': return te ? 'ప్రతి చుక్క ఒక ప్రభుత్వ పత్రం ఇచ్చిన పూర్తి తేదీ, ఆ పత్రం తేదీ దగ్గర.' : 'Each dot is a completion date one government paper gave, placed at the date of that paper.'
    case 'families': return te ? 'ఒక్కో ఇల్లు 1,000 కుటుంబాలు. నిండిన ఇళ్లు: 2023 మార్చి నాటికి పునరావాసం పొందినవి.' : 'Each house stands for 1,000 families. Filled: resettled by March 2023.'
    case 'water': return te ? 'రంగు వేసినవి: లోక్‌సభ సమాధానం పేర్కొన్న తొమ్మిది జిల్లాలు. సరిహద్దులు 2024 నాటివి.' : 'Tinted: the nine districts the Lok Sabha answer names. District lines as of 2024.'
  }
}

function Flat({ pic, w, h }: { pic: Exclude<StoryPic, DamPic>; w: number; h: number }) {
  if (!w || !h) return null
  switch (pic.kind) {
    case 'road': return <RoadPic focus={pic.focus} note={pic.note} detail={pic.detail} w={w} h={h} />
    case 'cost': return <CostPic focus={pic.focus} h={h} />
    case 'measures': return <MeasuresPic rows={pic.rows} />
    case 'deadline': return <DeadlinePic h={h} />
    case 'families': return <FamiliesPic w={w} h={h} />
    case 'water': return <WaterPic w={w} h={h} />
  }
}

/* ------------------------------------------------------------- the project road */

const markX = (m: RoadMark) => (m.prec === 'year' ? +m.date.slice(0, 4) + 0.5 : m.prec === 'fy' ? +m.date.slice(0, 4) + 0.79 : yearFrac(m.date))

function RoadPic({ focus, note, detail, w, h }: { focus: string[]; note: Bi; detail?: Bi; w: number; h: number }) {
  const C = useTokens()
  const { lang } = useLang()
  const marks = polavaramRoad
  const l = 22, r = 22
  const x = (v: number) => l + ((v - 2003.4) / (2028.4 - 2003.4)) * (w - l - r)
  const ry = Math.round(h * 0.66), rh = Math.max(12, Math.min(22, h * 0.045))
  const top = ry - rh / 2 - 1
  const on = marks.filter((m) => focus.includes(m.id))
  const xs = on.map((m) => x(markX(m)))
  const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : w / 2
  const cw = Math.min(310, w - 20)
  const cx = Math.max(10 + cw / 2, Math.min(w - 10 - cw / 2, mid))
  const stoneH = Math.round(Math.max(30, Math.min(46, h * 0.075)))
  const fs = w > 560 ? 13 : 12
  const calloutBottom = top - stoneH - 16
  const ticks = [2005, 2010, 2015, 2020, 2025]
  const today = yearFrac(TODAY)
  const spans = marks.filter((m) => m.prec !== 'month')
  return (
    <div className="absolute inset-0">
      <svg width={w} height={h} role="img" aria-label={`${pick(lang, note)}. ${marks.map((m) => pick(lang, m.text)).join('. ')}`} style={{ display: 'block' }}>
        {/* the road, with its centre line */}
        <rect x={l - 12} y={ry - rh / 2} width={w - l - r + 24} height={rh} rx={rh / 2} fill={C.c4} opacity={C.dark ? 0.75 : 0.9} />
        <line x1={l} x2={w - r} y1={ry} y2={ry} stroke={C.bg} strokeWidth={2} strokeDasharray="9 9" opacity={0.85} />
        {/* a year with no month, or a financial year, covers its stretch of road */}
        {spans.map((m) => {
          const a = m.prec === 'fy' ? +m.date + 0.25 : +m.date, b = a + 1
          const lit = focus.includes(m.id)
          return <rect key={m.id} x={x(a)} y={ry - rh / 2} width={x(b) - x(a)} height={rh} fill={lit ? C.brand : C.bg} style={{ opacity: lit ? 0.85 : 0.22, transition: 'opacity .4s, fill .4s' }} />
        })}
        {/* years along the road */}
        {ticks.map((t) => <text key={t} x={x(t)} y={ry + rh / 2 + fs + 5} textAnchor="middle" fill={C.muted} style={{ fontSize: fs, fontFamily: C.font }}>{t}</text>)}
        <g>
          <line x1={x(today)} x2={x(today)} y1={ry + rh / 2 + fs + 10} y2={ry + rh / 2 + fs + 16} stroke={C.muted} />
          <text x={Math.min(x(today), w - 4)} y={ry + rh / 2 + fs + 29} textAnchor="end" fill={C.muted} style={{ fontSize: fs - 0.5, fontWeight: 600, fontFamily: C.font }}>{lang === 'te' ? 'ఈరోజు' : 'Today'}</text>
        </g>
        {/* leader lines from the callout to each lit milestone */}
        {on.map((m, i) => (
          <line key={'l' + m.id} x1={cx + (xs[i] - mid) * 0.25} y1={calloutBottom} x2={xs[i]} y2={top - stoneH - 3} stroke={C.fg} strokeOpacity={0.45} strokeWidth={1.2} />
        ))}
        {/* milestones: a roadside stone for each dated event; the step's own stand tall */}
        {marks.map((m) => {
          const lit = focus.includes(m.id)
          const sw = Math.round(stoneH * 0.54), sh = stoneH, cap = sh * 0.38
          const body = `M${-sw / 2},0 V${-(sh - sw / 2)} A${sw / 2},${sw / 2} 0 0 1 ${sw / 2},${-(sh - sw / 2)} V0 Z`
          const capD = `M${-sw / 2},${-(sh - cap)} V${-(sh - sw / 2)} A${sw / 2},${sw / 2} 0 0 1 ${sw / 2},${-(sh - sw / 2)} V${-(sh - cap)} Z`
          return (
            <g key={m.id} transform={`translate(${x(markX(m))},${top})`}>
              <motion.g initial={false} animate={{ scale: lit ? 1 : 0.55 }} style={{ originX: 0.5, originY: 1 }} transition={RM ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 20 }}>
                <path d={body} fill={m.plan ? 'none' : C.bg} stroke={lit ? C.fg : C.muted} strokeWidth={1.4} strokeDasharray={m.plan ? '3 2.5' : undefined} style={{ transition: 'stroke .4s' }} />
                {m.plan ? null : <path d={capD} style={{ fill: lit ? C.brand : C.c5, transition: 'fill .4s' }} />}
              </motion.g>
            </g>
          )
        })}
      </svg>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={focus.join(',')} className="absolute rounded-xl border border-border bg-background/95 px-3 py-2 shadow-md"
          style={{ left: cx - cw / 2, bottom: h - calloutBottom, width: cw }}
          initial={RM ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
          <div className="text-[15px] font-semibold leading-snug" lang={lang === 'te' ? 'te' : undefined}>{pick(lang, note)}</div>
          {detail ? <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground" lang={lang === 'te' ? 'te' : undefined}>{pick(lang, detail)}</div> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------- the cost */

function CostPic({ focus, h }: { focus: string[]; h: number }) {
  const pts = React.useMemo(() => pol.cost_history.map((c: any) => ({ ...c, paper: P[c.src]?.short })), [])
  return (
    <div className="absolute inset-0 px-3 pb-2 pt-3 sm:px-5 sm:pt-5">
      <CostDots points={pts} focus={focus} height={Math.max(180, h - (h < 360 ? 92 : 80))} />
    </div>
  )
}

/* ------------------------------------------------- measures, each on its own */

function MeasuresPic({ rows }: { rows: MeasureRow[] }) {
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const found = rows.map((r) => ({ ...r, hit: (pol.progress as any[]).find((p) => p.src === r.src && p.date === r.date && p.measure === r.measure) })).filter((r) => r.hit)
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-5 px-4 py-4 sm:gap-7 sm:px-7">
      {found.map((r, i) => {
        const pct = r.hit.pct as number
        return (
          <div key={r.src + r.date} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 text-[14.5px] font-semibold leading-snug" lang={te ? 'te' : undefined}>{pick(lang, r.label)}</div>
              <div className="font-heading text-[22px] font-semibold leading-none tnum">{num(pct)}%</div>
            </div>
            <div className="relative mt-2 h-3 rounded-full bg-muted">
              <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: C.c1 }}
                initial={RM ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.12, ease: 'easeOut' }} />
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground"><span lang={te ? 'te' : undefined}>{te ? dateTe(r.date) : dateLong(r.date)}</span> · <span lang="en">{P[r.src]?.short}</span></div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------- the moving deadline */

function DeadlinePic({ h }: { h: number }) {
  const items: Deadline[] = React.useMemo(() => pol.deadlines.map((d: any) => ({ said: d.said, target: d.target, prec: d.prec, paper: d.paper, kind: 'gov' as const })), [])
  return (
    <div className="absolute inset-0 px-3 pb-2 pt-4 sm:px-5 sm:pt-5">
      <DeadlineChart items={items} height={Math.max(200, h - (h < 360 ? 84 : 72))} />
    </div>
  )
}

/* --------------------------------------------------------------- the families */

const HOUSE = (s: number) => `M${0.5 * s},${0.06 * s} L${0.95 * s},${0.47 * s} H${0.83 * s} V${0.94 * s} H${0.17 * s} V${0.47 * s} H${0.05 * s} Z M${0.41 * s},${0.94 * s} V${0.66 * s} H${0.59 * s} V${0.94 * s} Z`

function FamiliesPic({ w, h }: { w: number; h: number }) {
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const f = pol.families
  const UNIT = 1000
  const n = Math.round(f.total / UNIT)
  const full = Math.floor(f.resettled_by_2023_03 / UNIT), part = f.resettled_by_2023_03 / UNIT - full
  // the two figures sit side by side when they fit, one above the other when they do not:
  // the houses start below them either way
  const [top, topBox] = useBox<HTMLDivElement>()
  const head = (topBox.h || 56) + 16, pad = 16
  const gw = w - pad * 2, gh = h - head - pad - 4
  // the most columns that still give the largest houses
  let best = { cols: 10, s: 0 }
  for (let cols = 6; cols <= 24; cols++) {
    const rows = Math.ceil(n / cols)
    const s = Math.min(gw / cols, gh / rows, 44)
    if (s > best.s + 0.01 || (Math.abs(s - best.s) <= 0.01 && cols > best.cols)) best = { cols, s }
  }
  const { cols, s } = best
  const gap = s * 0.16, hs = s - gap
  const ox = pad + (gw - cols * s) / 2, oy = head
  const uid = React.useId().replace(/:/g, '')
  return (
    <div className="absolute inset-0">
      <div ref={top} className="absolute inset-x-4 top-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="font-heading text-[24px] font-semibold leading-none tnum sm:text-[28px]">{num(f.total, 0)}</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground" lang={te ? 'te' : undefined}>{te ? 'తరలించాల్సిన కుటుంబాలు' : 'families to be moved'}</div>
        </div>
        <div>
          <div className="font-heading text-[24px] font-semibold leading-none tnum sm:text-[28px]" style={{ color: C.c1 }}>{num(f.resettled_by_2023_03, 0)}</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground" lang={te ? 'te' : undefined}>{te ? '2023 మార్చి నాటికి పునరావాసం' : 'resettled by March 2023'}</div>
        </div>
      </div>
      <svg width={w} height={h} className="absolute inset-0" role="img" aria-label={te ? `${num(f.total, 0)} కుటుంబాల్లో ${num(f.resettled_by_2023_03, 0)} కుటుంబాలకు 2023 మార్చి నాటికి పునరావాసం` : `${num(f.total, 0)} families to be moved; ${num(f.resettled_by_2023_03, 0)} resettled by March 2023. Each house is 1,000 families.`}>
        <defs>
          <clipPath id={uid}><rect x={0} y={0} width={hs * part} height={hs} /></clipPath>
        </defs>
        {Array.from({ length: n }, (_, i) => {
          const cx = ox + (i % cols) * s + gap / 2, cy = oy + Math.floor(i / cols) * s + gap / 2
          const done = i < full
          return (
            <g key={i} transform={`translate(${cx},${cy})`}>
              <path d={HOUSE(hs)} fillRule="evenodd" fill={C.c5} opacity={C.dark ? 0.45 : 0.6} />
              {done ? <motion.path d={HOUSE(hs)} fillRule="evenodd" fill={C.c1} initial={RM ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }} /> : null}
              {i === full && part > 0 ? <motion.path d={HOUSE(hs)} fillRule="evenodd" fill={C.c1} clipPath={`url(#${uid})`} initial={RM ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }} /> : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------- the water */

function WaterPic({ w }: { w: number; h: number }) {
  const C = useTokens()
  const { lang } = useLang()
  const te = lang === 'te'
  const tint = mix(C.land, C.brand, C.dark ? 0.45 : 0.3)
  const named = React.useMemo(() => Object.fromEntries(pol.water.rows.map((r: any) => [r.district, tint])), [tint])
  const rows = pol.water.rows as { district: string; paper: string }[]
  // On a small screen the map's own names are too small to read, so the nine are named underneath.
  const [area, size] = useBox<HTMLDivElement>()
  return (
    <div className="absolute inset-0 flex flex-col p-2 sm:p-4">
      <div ref={area} className="relative min-h-0 flex-1">
        {size.h > 40 ? <Map3D compact labels={w >= 560} highlight={named} height={size.h} className="absolute inset-0" /> : null}
      </div>
      <ul className="flex flex-wrap justify-center gap-1.5 px-1 pb-1 pt-2">
        {rows.map((r) => (
          <li key={r.district} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2 py-0.5 text-[12px] font-medium leading-5" lang={te ? 'te' : undefined}>
            <span className="size-2.5 rounded-full" style={{ background: tint, boxShadow: `inset 0 0 0 1px ${C.border}` }} />
            {te ? districtByName.get(r.district)?.te ?? r.paper : r.paper}
          </li>
        ))}
      </ul>
    </div>
  )
}
