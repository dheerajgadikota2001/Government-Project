import projectsRaw from '@/data/projects.json'
import eventsRaw from '@/data/events.json'
import districtsRaw from '@/data/districts.json'
import polavaramRaw from '@/data/polavaram.json'
import moneyRaw from '@/data/money.json'
import factsRaw from '@/data/statefacts.json'
import investRaw from '@/data/investments.json'
import claimsRaw from '@/data/claims.json'
import papersRaw from '@/data/papers.json'
import tendersRaw from '@/data/tenders.json'
import updatesRaw from '@/data/updates.json'
import metaRaw from '@/data/meta.json'
import registerRaw from '@/data/register_papers.json'
import helplinesRaw from '@/data/helplines.json'
import periodsRaw from '@/data/periods.json'
import communityRaw from '@/data/community.json'
import legalRaw from '@/data/legal.json'
import placesRaw from '@/data/places.json'

export type Project = {
  id: number; t: string; ty: string; st: string; d: string | null; dept: string | null
  c: number | null; cu: string | null; ct: string | null; p: number | null; due: string | null
  sp: string; su: string | null; f: string | null; l: string | null; n: number
}
export type Event = { date: string; pre: boolean; title: string; doc: string; url: string; tier: string; kind: string }
export type District = {
  name: string; slug: string; hq: string | null; te: string
  /** The outline on the picker map, drawn on the 2022 lines. Empty for the two districts of 2026. */
  shape: string
  /** Set only for the two districts formed on 1 January 2026: when, from which district, by which order. */
  formed?: string; from?: string; order?: string
}

export const projects = projectsRaw as Project[]
export const events = eventsRaw as unknown as Record<string, Event[]>
export const districts = (districtsRaw as { viewBox: string; items: District[] }).items
export const mapViewBox = (districtsRaw as { viewBox: string }).viewBox
/** The districts the picker map can draw: the 26 lines of April 2022. */
export const drawnDistricts = districts.filter((d) => d.shape)
/** Markapuram and Polavaram, formed on 1 January 2026, keyed by the district each was cut from. */
export const newIn2026 = districts.filter((d) => d.formed)
export const carvedFrom = (name: string) => newIn2026.filter((d) => d.from === name)
export const pol = polavaramRaw as any
export const money = moneyRaw as any
export const facts = factsRaw as any
export const invest = investRaw as any
export const claims = claimsRaw as any[]
export const papers = papersRaw as any
export const tenders = tendersRaw as any
export const updates = updatesRaw as any
export const meta = metaRaw as any
/** The papers register, without the voter-roll-like papers and the lists of names (pending the owner's go). */
export const registerPapers = registerRaw as any
export const helplines = helplinesRaw as any
export const periods = periodsRaw as any
export const community = communityRaw as any[]
export const legal = legalRaw as any

export const byId = new Map(projects.map((p) => [p.id, p]))
export const districtBySlug = new Map(districts.map((d) => [d.slug, d]))
export const districtByName = new Map(districts.map((d) => [d.name, d]))

// One real work with two government records is shown once, under its main record.
export const MERGED: Record<number, number> = { 1: 613 }

export type PlaceReading = {
  district_as_printed: string; meaning: 'located' | 'route' | 'served'
  places_as_printed: { kind: string; name: string }[]
  source: { url: string; title: string; date: string | null; date_note: string | null }
  quote: string; note: string | null
  today: { district: string | null; how: string | null; why: string }
}
/** Where other official papers place a project: as printed, with today's district where it can be shown.
 *  Built from the backend's seed and rules (scripts/build_places.py), so the two never disagree. */
export const places = placesRaw as unknown as Record<string, { summary: { as_printed: string[]; today: string[]; readings: number }; readings: PlaceReading[] }>
export const placesOf = (id: number) => places[String(id)]
/** Today's districts for a record: its own district, or the ones official papers place it in. */
export const todayDistricts = (p: Project): string[] => (p.d ? [p.d] : placesOf(p.id)?.summary.today ?? [])

/** Records in a district (or in none). Counted as records: the two Polavaram records are one
 *  work, but one names Eluru and the other names no district, so each list shows the one that fits. */
export const worksIn = (name: string | null) =>
  projects.filter((p) => (name ? todayDistricts(p).includes(name) : todayDistricts(p).length === 0))

export const largest = (n = 8) =>
  projects.filter((p) => p.c != null && !MERGED[p.id]).sort((a, b) => (b.c ?? 0) - (a.c ?? 0)).slice(0, n)

export const isAmrut = (p: Project) => p.sp === 'AMRUT_MoHUA'

/** The paper a project's figure comes from, in words. */
export function paperOf(p: Project): string {
  if (p.id === 613) return 'MoSPI report, August 2026'
  if (p.sp === 'MOSPI_IPMD') return p.l ? `MoSPI report, ${new Date(p.l).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : 'MoSPI report'
  if (p.sp === 'AMRUT_MoHUA') return 'AMRUT list, Union Housing and Urban Affairs Ministry'
  if (p.sp.startsWith('AP Socio-Economic Survey')) {
    const m = (p.cu || p.su || '').match(/Survey[_-]?(\d{4})[_-](\d{2})/i)
    return m ? `Socio-Economic Survey ${m[1]}-${m[2]}` : 'Socio-Economic Survey'
  }
  if (p.sp.startsWith('PIB · CAG')) return 'PIB, CAG and Government Orders'
  if (/^(PIB|Press Information Bureau)/.test(p.sp)) return 'Press Information Bureau release'
  if (p.sp.startsWith('AP Government Orders')) return 'Government Order, ' + p.sp.split('·')[1]?.trim()
  return p.sp
}

/** The short place line a list or a badge shows. Never "not named in the paper": either today's
 *  districts, or the names an older paper prints (said as such), or that the check is still going on. */
export function placeText(p: Project, lang: 'en' | 'te'): string {
  const te = lang === 'te'
  const today = todayDistricts(p)
  if (today.length) return today.map((n) => (te ? districtByName.get(n)?.te ?? n : n)).join(', ')
  const pl = placesOf(p.id)
  if (pl) return te ? `${pl.summary.as_printed.join(', ')} (పాత పత్రంలో పేరు)` : `${pl.summary.as_printed.join(', ')} (as an older paper names it)`
  return te ? 'జిల్లా: అధికారిక పత్రాల్లో ఇంకా సరిచూస్తున్నాం' : 'District: still being checked in official papers'
}
