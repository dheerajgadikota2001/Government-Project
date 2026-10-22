import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { districtByName, districts, newIn2026 } from '@/lib/data'
import { useLang } from '@/lib/i18n'
import { go, href } from '@/lib/route'
import { Map3D } from '@/graphics/Map3D'

// The district picker: the raised relief map with every district named.
// Dheeraj preferred this map to the 3D model on the stand (18 Oct 2026), so every place a reader
// picks or sees their district uses it. It is only a picker: it is never shaded by a count.
//
// The map draws the lines of April 2022. Markapuram and Polavaram were formed on 1 January 2026
// and no official boundary file we can use draws them yet, so they are named under the map, and
// on their own pages the district they were cut from is lit, with that said in words.
export function DistrictPickerMap({ selected = null, hover = null, compact, className }: {
  selected?: string | null; hover?: string | null; compact?: boolean; className?: string
}) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const sel = selected ? districtByName.get(selected) : null
  const lit = sel?.formed ? sel.from! : selected
  return (
    <div className={cn('p-3 sm:p-5', className)}>
      <Map3D selected={lit} hover={hover} compact={compact}
        onPick={(n) => { const d = districts.find((x) => x.name === n); if (d) go('district-' + d.slug) }} />
      <div className="mt-3 border-t border-border pt-3 text-[13px] leading-snug text-muted-foreground">
        {sel?.formed ? (
          <p className="mb-2 text-foreground">{te
            ? `${sel.te} జిల్లా 2026 జనవరి 1న ${districtByName.get(sel.from!)?.te ?? sel.from} నుంచి ఏర్పడింది. దాని సరిహద్దు ఇంకా గీయలేదు; అది ఈ పటంలో వెలిగిన జిల్లా లోపల ఉంది.`
            : `${sel.name} was formed on 1 January 2026 from ${sel.from}. Its line is not drawn yet; it lies inside the lit district.`}</p>
        ) : null}
        <p>{tr('Lines as drawn in April 2022. Two districts formed on 1 January 2026 are not drawn yet:', '2022 ఏప్రిల్ నాటి సరిహద్దులు. 2026 జనవరి 1న ఏర్పడిన రెండు జిల్లాల సరిహద్దులు ఇంకా గీయలేదు:')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {newIn2026.map((d) => (
            <a key={d.slug} href={href('district-' + d.slug)} aria-current={selected === d.name ? 'page' : undefined}
              className={cn('inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13.5px] font-medium text-foreground hover:bg-accent', selected === d.name && 'bg-secondary')}>
              <MapPin className="size-3.5" />
              <span lang={te ? 'te' : undefined}>{te ? d.te : d.name}</span>
              <span className="font-normal text-muted-foreground">{te ? `(${districtByName.get(d.from!)?.te ?? d.from} నుంచి)` : `(from ${d.from === 'Alluri Sitharama Raju' ? 'ASR' : d.from})`}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
