import * as React from 'react'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHOICES, loadAllPickerFonts, useDesign, type DesignState } from '@/lib/design'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { go } from '@/lib/route'

// The design picker: every choice shows the platform its design came from.
// It changes the page in place, so the owner judges each option on real pages.

const WHERE: Partial<Record<keyof DesignState, string>> = {
  hero: '', questions: '', projectsList: 'projects', road: 'project-613', tiles: 'project-613', story: 'project-613',
}

export function DesignPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { d, set, reset } = useDesign()
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => { if (open) loadAllPickerFonts() }, [open])
  const [text, setText] = React.useState<string | null>(null)
  const summary = () => CHOICES.map((c) => `${c.title}: ${c.options.find((o) => o.id === d[c.key])?.label ?? d[c.key]}`).join('\n')
  const copy = async () => {
    const s = summary()
    try { await navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setText(s) }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="text-xl">Design picker</SheetTitle>
          <SheetDescription>Each option says where it comes from. Most are real components from public libraries, filled with the live record. Pick one in each row and look at the page behind.</SheetDescription>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={copy} className="gap-1.5">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy my picks'}</Button>
            <Button size="sm" variant="outline" onClick={reset} className="gap-1.5"><RotateCcw className="size-4" />Start again</Button>
          </div>
          {text ? <textarea readOnly value={text} className="mt-2 h-28 w-full rounded-md border border-border bg-muted p-2 text-xs" onFocus={(e) => e.currentTarget.select()} /> : null}
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-178px)]">
          <div className="space-y-7 p-5 pb-16">
            {CHOICES.map((c) => (
              <fieldset key={c.key} className="space-y-2.5">
                <legend className="mb-1 flex w-full items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold">{c.title}</span>
                  {WHERE[c.key] !== undefined ? (
                    <button type="button" className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => { go(WHERE[c.key]!); onOpenChange(false) }}>Show me the page</button>
                  ) : <span className="text-[12px] text-muted-foreground">{c.scope}</span>}
                </legend>
                <div className="grid gap-2">
                  {c.options.map((o) => {
                    const on = d[c.key] === o.id
                    return (
                      <button key={o.id} type="button" onClick={() => set(c.key, o.id as never)} aria-pressed={on}
                        className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors', on ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/30')}>
                        <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-foreground bg-foreground text-background' : 'border-foreground/30')}>{on ? <Check className="size-3" strokeWidth={3} /> : null}</span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium" style={c.key === 'sans' || c.key === 'head' ? { fontFamily: fontOf(o.id) } : c.key === 'te' ? { fontFamily: teOf(o.id) } : undefined}>
                            {o.label}{c.key === 'te' ? <span lang="te" className="ml-2">పోలవరం పూర్తయిందా?</span> : null}
                          </span>
                          {o.from ? <span className="block text-[12px] text-muted-foreground">From {o.from}</span> : null}
                          {o.note ? <span className="mt-0.5 block text-[12.5px] text-foreground/75">{o.note}</span> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <Credits />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

const fontOf = (id: string) => ({ geist: 'Geist', inter: 'Inter', plex: 'IBM Plex Sans', dm: 'DM Sans', 'source-serif': 'Source Serif 4', instrument: 'Instrument Serif', baskerville: 'Libre Baskerville' } as Record<string, string>)[id]
const teOf = (id: string) => ({ noto: 'Noto Sans Telugu', hind: 'Hind Guntur', anek: 'Anek Telugu' } as Record<string, string>)[id]

function Credits() {
  const rows = [
    ['shadcn/ui', 'Buttons, cards, tabs, accordion, table, command search, sheet, sidebar, tooltip, popover, breadcrumb, badge', 'MIT'],
    ['tweakcn', 'Theme presets Vercel, Graphite, Modern Minimal, Starry Night, Caffeine', 'Apache-2.0'],
    ['Origin UI (coss.com/origin)', 'Timeline and data table', 'MIT for these components'],
    ['Aceternity UI', 'Year-by-year timeline, hover cards', 'Aceternity licence: fine for websites, but its source files may not be shared on, so a public code repository needs care'],
    ['Magic UI', 'Bento grid, dot and grid patterns, theme switch, blur fade, reading progress bar', 'MIT'],
    ['Kokonut UI', 'Action search bar, scroll index', 'MIT'],
    ['Tremor Raw', 'Progress bar', 'Apache-2.0'],
    ['blocks.so', 'Stat cards layout', 'MIT'],
    ['shadcnui-blocks', 'Stat strip and dated-card timeline layouts', 'MIT'],
    ['Our own', '3D district map, the Polavaram dam, the project road and every chart: built with d3 to the house rules', ''],
  ]
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 text-[14px] font-semibold">Where each part comes from</div>
      <ul className="space-y-2 text-[12.5px]">
        {rows.map(([a, b, c]) => <li key={a}><b className="font-semibold">{a}</b>: {b}{c ? <span className="text-muted-foreground"> ({c})</span> : null}</li>)}
      </ul>
      <p className="mt-3 text-[12px] text-muted-foreground">21st.dev needs a free key to download its components, so the same components were taken from their original authors above. Figma Community blocks automated reading.</p>
    </div>
  )
}
