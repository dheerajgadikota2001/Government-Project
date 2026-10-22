import projectsRaw from '@/data/projects.json'
import placesRaw from '@/data/places.json'
import { districtByName, MERGED, type PlaceReading, type Project } from '@/lib/data'

// The projects register and where official papers place each work (about 540 KB raw).
// Loaded with the pages that list or open works, never with the first screen.

export const projects = projectsRaw as Project[]
export const byId = new Map(projects.map((p) => [p.id, p]))

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

/** The facts behind the "In short" rows, so a row and a card never disagree. */
export const shortFacts = {
  projects: () => ({
    records: projects.length,
    works: projects.filter((p) => !MERGED[p.id]).length,
    done: projects.filter((p) => p.st === 'completed').length,
    building: projects.filter((p) => p.st === 'under_construction').length,
  }),
}
