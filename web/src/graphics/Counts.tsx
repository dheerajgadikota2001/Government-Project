import * as React from 'react'
import { cn } from '@/lib/utils'
import { num } from '@/lib/format'

// Counts of our own records, drawn plainly: one bar per row on one scale, the
// count printed beside it. Nothing here is money, and nothing is added up.

export type CountRow = { key: string; label: React.ReactNode; n: number; text?: React.ReactNode; hollow?: boolean; onClick?: () => void; active?: boolean }

export function CountBars({ rows, max, className, color = 'var(--chart-1)', labelWidth = '13rem', valueWidth = '3.2rem' }: {
  rows: CountRow[]; max?: number; className?: string; color?: string; labelWidth?: string; valueWidth?: string
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.n))
  // Narrow places stack the label over its bar; wider ones put label, bar and figure on one line.
  const vars = { '--lw': `minmax(0, ${labelWidth})`, '--vw': valueWidth } as React.CSSProperties
  const gridCls = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @md:grid-cols-[var(--lw)_minmax(0,1fr)_var(--vw)]'
  return (
    <ul className={cn('@container space-y-1.5', className)} style={vars}>
      {rows.map((r) => {
        const inner = (
          <>
            <span className="col-span-2 min-w-0 text-[13.5px] leading-snug @md:col-span-1">{r.label}</span>
            <span className="relative h-3.5 rounded-[4px] bg-muted/70">
              <span className={cn('absolute inset-y-0 left-0 rounded-[4px]', r.hollow && 'border-[1.6px] border-dashed')}
                style={{ width: `${Math.max(1.5, (r.n / top) * 100)}%`, background: r.hollow ? 'transparent' : color, borderColor: r.hollow ? color : undefined }} />
            </span>
            <span className="text-right text-[13.5px] font-semibold tnum">{r.text ?? num(r.n, 0)}</span>
          </>
        )
        return (
          <li key={r.key}>
            {r.onClick
              ? <button type="button" onClick={r.onClick} aria-pressed={r.active} className={cn(gridCls, 'w-full rounded-md px-1.5 py-1 text-left hover:bg-accent/70', r.active && 'bg-accent')}>{inner}</button>
              : <div className={cn(gridCls, 'px-1.5 py-1')}>{inner}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/** One column per year on one scale; a hollow column for "no year". */
export function YearColumns({ rows, height = 150, color = 'var(--chart-1)' }: { rows: { label: string; n: number; hollow?: boolean }[]; height?: number; color?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 sm:gap-1.5" style={{ height: height + 44 }}>
        {rows.map((r, i) => (
          <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10.5px] font-semibold tnum sm:text-[11px]">{num(r.n, 0)}</span>
            <span className={cn('block w-full rounded-t-[4px]', r.hollow && 'border-[1.6px] border-b-0 border-dashed')}
              style={{ height: Math.max(2, (r.n / top) * height), background: r.hollow ? 'transparent' : color, borderColor: r.hollow ? 'var(--muted-foreground)' : undefined }} />
            <span className={cn('whitespace-nowrap text-[10.5px] text-muted-foreground', i % 2 === 1 && rows.length > 14 && 'max-sm:invisible')}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
