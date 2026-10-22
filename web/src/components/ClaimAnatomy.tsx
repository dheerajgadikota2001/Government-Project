import * as React from 'react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { crore, dateShort, lakhCrore, num } from '@/lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (d: string) => (d && d.length >= 7 ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : d)
import { View3D, Pin } from '@/three/View3D'
import { ClaimScale } from '@/graphics/Mini'

// One picture for one claim: each claim is a glass stack, each government record a paper stack,
// all on one scale, with a ruler behind. Where the claim's own words split its figure into parts,
// the glass stack shows those parts, so the reader sees what the claim adds to the record.

// Parts printed in the claim's own words, bottom first. Only what the paper prints; the rest is unlabelled.
const PARTS: Record<string, { label: string; value: number | null }[]> = {
  'ap-debt-june-2024': [
    { label: 'Government debt', value: 438278 },
    { label: 'Corporation debt', value: 248677 },
    { label: 'Unpaid dues and the rest', value: null },
  ],
}

function ticksFor(max: number) {
  const step = max > 800000 ? 250000 : max > 300000 ? 100000 : 50000
  const out: number[] = []
  for (let v = step; v <= max * 1.02; v += step) out.push(v)
  return out
}

const narrowNow = () => typeof window !== 'undefined' && window.innerWidth < 640

export function ClaimAnatomy({ c, className }: { c: any; className?: string }) {
  const { tr } = useLang()
  // On a phone the picture keeps only what it can show without crowding; the parts move to a list below it.
  const narrow = React.useMemo(narrowNow, [])
  const records = c.record.map((r: any, i: number) => ({ id: `r${i}`, value: r.figure, kind: 'actual' as const, r }))
  const theClaims = c.claims.map((cl: any, i: number) => ({ id: `c${i}`, value: cl.figure, kind: 'claim' as const, parts: PARTS[c.slug], cl }))
  const bars = [...records, ...theClaims]
  const max = Math.max(...bars.map((b) => b.value))
  const ticks = narrow ? ticksFor(max).filter((_, i, a) => i === a.length - 1 || i === Math.floor((a.length - 1) / 2)) : ticksFor(max)
  const top = ticks[ticks.length - 1] ?? max
  const chip = 'rounded-full bg-background/92 px-2 py-0.5 text-[12px] font-semibold shadow-sm ring-1 ring-border tnum'
  const baseCls = 'block max-w-[140px] whitespace-normal rounded-lg bg-background/92 px-2 py-1 text-center text-[11px] leading-tight text-muted-foreground shadow-sm ring-1 ring-border'
  const short = (s: string) => {
    const t = s.replace('Government of Andhra Pradesh, audited accounts', 'State accounts').replace('Reserve Bank of India', 'Reserve Bank')
    return narrow ? t.replace('Reserve Bank', 'RBI') : t
  }
  // On a phone every figure is in lakh crore, said once in the corner, so each label stays short.
  const value = (v: number) => (narrow ? num(v / 1e5, 2) : crore(v, 0))
  const tickText = (t: number) => (narrow ? num(t / 1e5, t % 100000 ? 1 : 0) : lakhCrore(t, t % 100000 ? 1 : 0))
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-muted),transparent_70%)]', className)}>
      <div className="relative h-[320px] sm:h-[420px]">
        <View3D build={() => import('@/three/scenes/money')}
          params={{ bars: bars.map(({ id, value, kind, parts }: any) => ({ id, value, kind, parts })), ticks, max: Math.max(top, max), wide: true, rulerSide: 'left', labelRoom: !narrow && theClaims.some((b: any) => b.parts), narrow }}
          label={`${c.question} Each claim is a glass stack and each record a paper stack, on one scale.`} className="size-full"
          fallback={<div className="grid size-full content-center gap-3 px-6">{c.claims.map((cl: any, i: number) => <ClaimScale key={i} claim={{ v: cl.figure, label: 'Claim' }} records={c.record.map((r: any) => ({ v: r.figure, label: r.source }))} height={96} />)}</div>}>
          {narrow ? <div className="absolute left-3 top-2.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{tr('₹ lakh crore', '₹ లక్ష కోట్లు')}</div> : null}
          {ticks.map((t) => <Pin key={t} id={`tick-${t}`} place="left" fixed><span className="text-[11px] text-muted-foreground tnum">{tickText(t)}</span></Pin>)}
          {records.map((b: any) => (
            <React.Fragment key={b.id}>
              <Pin id={`top-${b.id}`} priority={2}><span className={chip}>{value(b.value)}</span></Pin>
              <Pin id={`base-${b.id}`} place="bottom" priority={1}><span className={baseCls}><b className="text-foreground">{tr('Record', 'రికార్డు')}</b><br />{short(b.r.source)}</span></Pin>
            </React.Fragment>
          ))}
          {theClaims.map((b: any) => (
            <React.Fragment key={b.id}>
              <Pin id={`top-${b.id}`} priority={2}><span className={cn(chip, 'border border-dashed border-foreground/45 ring-0')}>{value(b.value)}</span></Pin>
              <Pin id={`base-${b.id}`} place="bottom" priority={1}><span className={baseCls}><b className="text-foreground">{tr('Claim', 'చెప్పినది')}</b><br />{narrow ? monthYear(b.cl.date) : dateShort(b.cl.date)}</span></Pin>
              {narrow ? null : (b.parts ?? []).map((p: any, i: number) => (
                <Pin key={i} id={`part-${b.id}-${i}`} place="right"><span className="block max-w-[130px] whitespace-normal text-[11.5px] font-medium leading-tight">{p.label}{p.value != null ? <><br /><span className="text-muted-foreground tnum">{crore(p.value, 0)}</span></> : null}</span></Pin>
              ))}
            </React.Fragment>
          ))}
        </View3D>
      </div>
      {narrow && theClaims.some((b: any) => b.parts) ? (
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr('Inside the claim, in its own words', 'చెప్పిన మాటలోని భాగాలు')}</div>
          <ul className="mt-1.5 space-y-1 text-[13.5px]">
            {theClaims.flatMap((b: any) => (b.parts ?? []).map((p: any, i: number) => <li key={b.id + i} className="flex justify-between gap-3"><span>{p.label}</span><span className="text-muted-foreground tnum">{p.value != null ? crore(p.value, 0) : tr('no figure printed', 'సంఖ్య లేదు')}</span></li>))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3 rounded-[2px] border border-dashed border-foreground/60 bg-[color-mix(in_oklab,var(--chart-2)_25%,transparent)]" />{tr('Glass: what the claim says', 'గాజు: చెప్పిన మాట')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3 rounded-[2px] bg-foreground/85" />{tr('Paper: what the government books record', 'కాగితం: ప్రభుత్వ లెక్కలు')}</span>
        <span>{tr('All stacks on one scale. The ruler is in lakh crore.', 'అన్నీ ఒకే కొలతలో.')}</span>
      </div>
    </div>
  )
}
