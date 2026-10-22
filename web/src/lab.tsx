import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DesignProvider } from '@/lib/design'
import { LangProvider } from '@/lib/i18n'
import { View3D, Pin } from '@/three/View3D'
import { districts, drawnDistricts, mapViewBox, MERGED } from '@/lib/data'
import { projects } from '@/lib/data-projects'
import { money } from '@/lib/data-money'
import { claims } from '@/lib/data-claims'
import { lakhCrore } from '@/lib/format'

// A bare page for looking at one model at a time while building it. Not part of the site.
const q = new URLSearchParams(location.search)
const scene = q.get('s') ?? 'dam'
const extra = JSON.parse(q.get('p') ?? '{}')
const h = Number(q.get('h') ?? 520)
const chip = 'rounded-full bg-background/90 px-2 py-0.5 text-[12px] font-medium shadow'

function presets(): { load: () => Promise<{ default: any }>; params: any; pins: React.ReactNode } {
  if (scene === 'debt') {
    const s = money.series.find((x: any) => x.indicator === 'outstanding_liabilities' && x.family === 'RBI')
    const bars = s.points.map((p: any) => ({ id: String(p.fy_end), value: p.value, kind: p.stage === 'A' ? 'actual' : 'estimate' }))
    const marks = [{ after: bars.findIndex((b: any) => b.id === '2019'), id: '2019' }, { after: bars.findIndex((b: any) => b.id === '2024'), id: '2024' }]
    return {
      load: () => import('@/three/scenes/money'),
      params: { bars, marks, ticks: [200000, 400000, 600000], max: 680000, ...extra },
      pins: (<>
        {bars.map((b: any, i: number) => <Pin key={b.id} id={`base-${b.id}`} place="bottom"><span className="text-[11px] text-muted-foreground">{(bars.length - 1 - i) % 2 === 0 ? `Mar ${b.id.slice(2)}` : ''}</span></Pin>)}
        {[200000, 400000, 600000].map((t) => <Pin key={t} id={`tick-${t}`} place="left"><span className="text-[11px] text-muted-foreground">{lakhCrore(t, 0)}</span></Pin>)}
        <Pin id="top-2024"><span className={chip}>{lakhCrore(bars.find((b: any) => b.id === '2024').value, 2)}</span></Pin>
        <Pin id="top-2026"><span className={chip + ' border border-dashed border-foreground/40'}>{lakhCrore(bars.find((b: any) => b.id === '2026').value, 2)} plan</span></Pin>
        <Pin id="mark-2019"><span className="text-[10.5px] text-muted-foreground">30 May 2019</span></Pin>
        <Pin id="mark-2024"><span className="text-[10.5px] text-muted-foreground">12 Jun 2024</span></Pin>
      </>),
    }
  }
  if (scene === 'claim') {
    const c = claims.find((x: any) => x.slug === 'ap-debt-june-2024')
    const bars = [
      { id: 'rbi', value: c.record[0].figure, kind: 'actual' },
      { id: 'ap', value: c.record[1].figure, kind: 'actual' },
      { id: 'claim', value: c.claims[0].figure, kind: 'claim', parts: [{ label: 'Government debt', value: 438278 }, { label: 'Corporation debt', value: 248677 }, { label: 'Unpaid dues and the rest', value: null }] },
    ]
    return {
      load: () => import('@/three/scenes/money'),
      params: { bars, ticks: [200000, 400000, 600000, 800000, 1000000], max: 1000000, wide: true, ...extra },
      pins: (<>
        <Pin id="top-claim"><span className={chip + ' border border-dashed'}>Claim ₹9,74,556 crore</span></Pin>
        <Pin id="top-rbi"><span className={chip}>₹4,92,568 crore</span></Pin>
        <Pin id="top-ap"><span className={chip}>₹4,91,734 crore</span></Pin>
        {[0, 1, 2].map((i) => <Pin key={i} id={`part-claim-${i}`} place="right"><span className="text-[11px]">{['Government debt ₹4,38,278 cr', 'Corporation debt ₹2,48,677 cr', 'Unpaid dues and the rest'][i]}</span></Pin>)}
        {[200000, 400000, 600000, 800000, 1000000].map((t) => <Pin key={t} id={`tick-${t}`} place="left"><span className="text-[11px] text-muted-foreground">{lakhCrore(t, 0)}</span></Pin>)}
      </>),
    }
  }
  if (scene === 'works') {
    return {
      load: () => import('@/three/scenes/works'),
      params: { kind: 'road', pct: 60, ...extra },
      pins: <><Pin id="built"><span className={chip}>Built</span></Pin><Pin id="todo"><span className={chip + ' border border-dashed'}>Still to build</span></Pin></>,
    }
  }
  if (scene === 'city') {
    const works = projects.filter((p) => !MERGED[p.id]).map((p) => ({ id: p.id, kind: p.ty, status: p.st, pct: p.p }))
    const groups = [
      { key: 'towns', kinds: ['urban_development'] }, { key: 'roads', kinds: ['roads'] }, { key: 'water', kinds: ['irrigation'] },
      { key: 'rail', kinds: ['railways'] }, { key: 'power', kinds: ['power'] },
      { key: 'other', kinds: ['industrial', 'infrastructure', 'it_tech', 'education', 'health', 'airports', 'ports'] },
    ]
    return {
      load: () => import('@/three/scenes/cityworks'),
      params: { works, groups, ...extra },
      pins: <>{groups.map((g) => <Pin key={g.key} id={`group-${g.key}`} place="top"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.key}</span></Pin>)}</>,
    }
  }
  if (scene === 'map') {
    return {
      load: () => import('@/three/scenes/apmap'),
      params: { shapes: drawnDistricts.map((d) => ({ name: d.name, shape: d.shape })), viewBox: mapViewBox, selected: 'Eluru', ...extra },
      pins: <><Pin id="label"><span className={chip}>Eluru</span></Pin><Pin id="bay" place="center"><span className="text-[12px] italic tracking-wide text-white/70">Bay of Bengal</span></Pin></>,
    }
  }
  return {
    load: () => import('@/three/scenes/dam'),
    params: { pct: 86.2, ...extra },
    pins: (<>
      <Pin id="spill"><span className={chip}>Spillway</span></Pin>
      <Pin id="ecrf"><span className={chip}>Earth-and-rock dam</span></Pin>
      <Pin id="gap"><span className={chip}>Still to build</span></Pin>
    </>),
  }
}

function Lab() {
  const p = presets()
  return (
    <div style={{ padding: 16 }}>
      <View3D explorable build={p.load} params={p.params} label="lab" style={{ height: h }} className="rounded-2xl border border-border bg-card" interactive>
        {p.pins}
      </View3D>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<DesignProvider><LangProvider><Lab /></LangProvider></DesignProvider>)
