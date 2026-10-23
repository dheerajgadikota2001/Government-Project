// One project's tab title, with every other project's title checked so that no two pages share one.
//
// Why a separate file: titles.ts is read on every page and carries words only. This file needs the
// whole project list, so only the project page and the pre-renderer import it. Both compute the
// same answer from the same list, so the title the pre-render writes into the HTML is the title the
// app sets in the tab, and a search engine that runs the script sees no change.
import { MERGED } from '@/lib/data'
import { projects } from '@/lib/data-projects'
import { projectTabBase, type Bi } from '@/lib/titles'

type Lang = 'en' | 'te'
let counts: Record<Lang, Map<string, number>> | null = null

function countAll() {
  const c = { en: new Map<string, number>(), te: new Map<string, number>() }
  for (const p of projects) {
    if (MERGED[p.id]) continue
    const b = projectTabBase(p)
    for (const l of ['en', 'te'] as const) c[l].set(b[l], (c[l].get(b[l]) ?? 0) + 1)
  }
  return c
}

/** The words before " | AP Fact Check". A title shared with another project gets the record number. */
export function projectTab(p: { id: number; t: string; st: string }): Bi {
  counts ??= countAll()
  const b = projectTabBase(p)
  return {
    en: (counts.en.get(b.en) ?? 0) > 1 ? `${b.en} (No. ${p.id})` : b.en,
    te: (counts.te.get(b.te) ?? 0) > 1 ? `${b.te} (నం. ${p.id})` : b.te,
  }
}
