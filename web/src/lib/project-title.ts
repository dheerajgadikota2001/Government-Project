// One project's tab title, with every other project's title checked so that no two pages share one.
//
// Why a separate file: titles.ts is read on every page and carries words only. This file needs the
// whole project list, so only the project page and the pre-renderer import it. Both compute the
// same answer from the same list, so the title the pre-render writes into the HTML is the title the
// app sets in the tab, and a search engine that runs the script sees no change.
//
// Two works can share the same keywords (a town has several water supply works). What tells them
// apart is the cost as printed when every work in that group has a different one, because a reader
// can use it. If any two in the group print the same cost (as shown, rounded), or one prints none, the whole group is
// told apart by record number instead, so the rule never gives two pages the same tag.
import { MERGED } from '@/lib/data'
import { projects } from '@/lib/data-projects'
import { projectTabBase, type Bi } from '@/lib/titles'

type Lang = 'en' | 'te'
type Cached = { counts: Record<Lang, Map<string, number>>; byCost: Record<Lang, Map<string, boolean>> }
let cache: Cached | null = null

const costTag = (c: number) => `₹${c >= 100 ? Math.round(c).toLocaleString('en-IN') : Number(c.toFixed(1))} Cr`

function build(): Cached {
  const groups = { en: new Map<string, (number | null)[]>(), te: new Map<string, (number | null)[]>() }
  for (const p of projects) {
    if (MERGED[p.id]) continue
    const b = projectTabBase(p)
    for (const l of ['en', 'te'] as const) groups[l].set(b[l], [...(groups[l].get(b[l]) ?? []), p.c])
  }
  const counts = { en: new Map<string, number>(), te: new Map<string, number>() }
  const byCost = { en: new Map<string, boolean>(), te: new Map<string, boolean>() }
  for (const l of ['en', 'te'] as const) {
    for (const [title, costs] of groups[l]) {
      counts[l].set(title, costs.length)
      const named = costs.filter((c): c is number => c != null)
      byCost[l].set(title, named.length === costs.length && new Set(named.map(costTag)).size === costs.length)
    }
  }
  return { counts, byCost }
}

/** The words before " | AP Fact Check". A title shared with another project gets its cost, or its record number. */
export function projectTab(p: { id: number; t: string; st: string; c?: number | null }): Bi {
  cache ??= build()
  const b = projectTabBase(p)
  const tag = (l: Lang) => {
    if ((cache!.counts[l].get(b[l]) ?? 0) < 2) return b[l]
    if (cache!.byCost[l].get(b[l]) && p.c != null) return `${b[l]} (${costTag(p.c)})`
    return l === 'en' ? `${b[l]} (No. ${p.id})` : `${b[l]} (నం. ${p.id})`
  }
  return { en: tag('en'), te: tag('te') }
}
