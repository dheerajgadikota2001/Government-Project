import districtsRaw from '@/data/districts.json'
import metaRaw from '@/data/meta.json'

// The data layer is split by subject so the first screen downloads only what it shows.
//
// This file is the core: district names and the record's dates. The shell and almost every
// page need these, and together they are about 40 KB, so they ride in the main script.
// Everything else lives in its own module next to this one (data-projects, data-papers and
// so on). A page imports only the subjects it uses, so its data arrives with the page's own
// code, and each data file is its own cached file: a daily rebuild that changes the tenders
// list does not make a returning reader download the projects register again.
//
// Rule for new code: never add a large import here. Add a data-<subject>.ts module instead.

export type Project = {
  id: number; t: string; ty: string; st: string; d: string | null; dept: string | null
  c: number | null; cu: string | null; ct: string | null; p: number | null; due: string | null
  sp: string; su: string | null; f: string | null; l: string | null; n: number
  /** Only when another project has the same title: what tells the two apart (the cost as printed). */
  dn?: string
}
export type Event = { date: string; pre: boolean; title: string; doc: string; url: string; tier: string; kind: string }
export type District = {
  name: string; slug: string; hq: string | null; te: string
  /** The outline on the picker map, drawn on the 2022 lines. Empty for the two districts of 2026. */
  shape: string
  /** Set only for the two districts formed on 1 January 2026: when, from which district, by which order. */
  formed?: string; from?: string; order?: string
}
export type PlaceReading = {
  district_as_printed: string; meaning: 'located' | 'route' | 'served'
  places_as_printed: { kind: string; name: string }[]
  source: { url: string; title: string; date: string | null; date_note: string | null }
  quote: string; note: string | null
  today: { district: string | null; how: string | null; why: string }
}

export const districts = (districtsRaw as { viewBox: string; items: District[] }).items
export const mapViewBox = (districtsRaw as { viewBox: string }).viewBox
/** The districts the picker map can draw: the 26 lines of April 2022. */
export const drawnDistricts = districts.filter((d) => d.shape)
/** Markapuram and Polavaram, formed on 1 January 2026, keyed by the district each was cut from. */
export const newIn2026 = districts.filter((d) => d.formed)
export const carvedFrom = (name: string) => newIn2026.filter((d) => d.from === name)
export const meta = metaRaw as any

export const districtBySlug = new Map(districts.map((d) => [d.slug, d]))
export const districtByName = new Map(districts.map((d) => [d.name, d]))

// One real work with two government records is shown once, under its main record.
export const MERGED: Record<number, number> = { 1: 613 }
