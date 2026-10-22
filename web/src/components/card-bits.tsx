import * as React from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, type Lang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { districts, districtByName } from '@/lib/data'
import type { BiS } from '@/lib/cards'

// The light half of the card system: the reader's district and card language, the district
// select, the language switch and the "In short" row. Pages such as My district, Money and
// Projects use only these. They live apart from cards.tsx because that file builds the full
// card deck, which reads almost every data file on the site; importing a select box from it
// used to pull the whole deck into those pages.

/* ------------------------------------------------------------ shared state */
const DISTRICT_KEY = 'apfc-district'
const CARDS_LANG_KEY = 'apfc-cards-lang'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, v: string | null) {
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v) } catch { /* private mode: keep it for this visit only */ }
}

/** The reader's district, picked once and kept on this device only. */
export function useMyDistrict(): [string | null, (name: string | null) => void] {
  const [d, setD] = React.useState<string | null>(() => {
    const v = read(DISTRICT_KEY)
    return v && districtByName.has(v) ? v : null
  })
  React.useEffect(() => {
    const on = (e: Event) => setD((e as CustomEvent<string | null>).detail)
    window.addEventListener('apfc-district', on)
    return () => window.removeEventListener('apfc-district', on)
  }, [])
  const set = React.useCallback((name: string | null) => {
    write(DISTRICT_KEY, name)
    setD(name)
    window.dispatchEvent(new CustomEvent('apfc-district', { detail: name }))
  }, [])
  return [d, set]
}

/**
 * The cards' own language. Cards open in the site's language (English unless the
 * reader chose Telugu); the small A | అ switch at the top of a cards section turns
 * every card at once. A choice made there is kept on this device.
 */
export function useCardsLang(): [Lang, (l: Lang) => void] {
  const { lang } = useLang()
  const [own, setOwn] = React.useState<Lang | null>(() => {
    const v = read(CARDS_LANG_KEY)
    return v === 'en' || v === 'te' ? v : null
  })
  React.useEffect(() => {
    const on = (e: Event) => setOwn((e as CustomEvent<Lang>).detail)
    window.addEventListener('apfc-cards-lang', on)
    return () => window.removeEventListener('apfc-cards-lang', on)
  }, [])
  const set = React.useCallback((l: Lang) => {
    write(CARDS_LANG_KEY, l)
    setOwn(l)
    window.dispatchEvent(new CustomEvent('apfc-cards-lang', { detail: l }))
  }, [])
  return [own ?? lang, set]
}

export const W = {
  fullPicture: { en: 'Full picture', te: 'పూర్తి వివరాలు' },
  listen: { en: 'Listen', te: 'వినండి' },
  share: { en: 'Share', te: 'పంచుకోండి' },
  claim: { en: 'Claim', te: 'చెప్పిన మాట' },
  record: { en: 'Record', te: 'రికార్డు' },
  dashed: { en: 'Dashed box: a provisional figure, which may still change.', te: 'గీతల పెట్టె: తాత్కాలిక సంఖ్య, ఇంకా మారవచ్చు.' },
  example: { en: 'An everyday example, made-up numbers', te: 'ఒక ఉదాహరణ, ఊహించిన అంకెలు' },
  pick: { en: 'Choose a district', te: 'జిల్లాను ఎంచుకోండి' },
  change: { en: 'Change district', te: 'జిల్లా మార్చండి' },
  voiceSoon: { en: 'The voice assistant connects here. It is not switched on yet.', te: 'వాయిస్ సహాయకుడు ఇక్కడ కలుస్తాడు. ఇంకా మొదలు కాలేదు.' },
  emergency: { en: 'Emergency', te: 'అత్యవసరం' },
  ambulance: { en: 'Ambulance', te: 'అంబులెన్స్' },
} satisfies Record<string, BiS>

/* --------------------------------------------------------- language switch */
export function CardsLangSwitch({ value, onChange, className }: { value: Lang; onChange: (l: Lang) => void; className?: string }) {
  return (
    <div role="group" aria-label="Language of the cards" className={cn('inline-flex h-8 shrink-0 items-center rounded-full border border-border bg-card p-0.5 text-[13px] font-semibold', className)}>
      <button type="button" lang="en" aria-pressed={value === 'en'} aria-label="Cards in English" onClick={() => onChange('en')}
        className={cn('h-7 min-w-8 rounded-full px-2.5 transition-colors', value === 'en' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>A</button>
      <button type="button" lang="te" aria-pressed={value === 'te'} aria-label="కార్డులు తెలుగులో" onClick={() => onChange('te')}
        className={cn('h-7 min-w-8 rounded-full px-2.5 text-[15px] leading-none transition-colors', value === 'te' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>అ</button>
    </div>
  )
}

export function DistrictSelect({ lang, value, onChange, className }: { lang: Lang; value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const te = lang === 'te'
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{te ? W.pick.te : W.pick.en}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
        className="h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="">{te ? W.pick.te : W.pick.en}</option>
        {[...districts].sort((a, b) => (te ? (a.te ?? a.name).localeCompare(b.te ?? b.name, 'te') : a.name.localeCompare(b.name))).map((d) => (
          <option key={d.slug} value={d.name}>{te && d.te ? `${d.te} (${d.name})` : d.name}</option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------- "In short" row */
export type ShortItem = { value: React.ReactNode; label: React.ReactNode; paper: React.ReactNode; href?: string }

/** A row of short facts at the top of a page; the explained charts follow below. It speaks the page's language. */
export function InShort({ items, className, note }: { items: ShortItem[]; className?: string; note?: React.ReactNode }) {
  const { tr } = useLang()
  return (
    <section className={cn('min-w-0', className)} aria-label={tr('In short', 'క్లుప్తంగా')}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{tr('In short', 'క్లుప్తంగా')}</span>
        <span className="text-[12.5px] text-muted-foreground">{note ?? tr('The explained charts follow below.', 'వివరించిన చార్టులు కింద ఉన్నాయి.')}</span>
      </div>
      <div className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => {
          const body = (
            <>
              <div className="font-heading text-[28px] font-semibold leading-none tracking-tight tnum">{it.value}</div>
              <div className="mt-2 text-[14px] leading-snug">{it.label}</div>
              <div className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] text-muted-foreground"><FileText className="size-3.5 shrink-0 opacity-70" aria-hidden /><span className="min-w-0">{it.paper}</span></div>
            </>
          )
          const cls = 'flex min-h-[132px] w-[72vw] max-w-[260px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-card p-4 md:w-auto md:max-w-none'
          return it.href
            ? <a key={i} href={it.href.startsWith('#') ? it.href : href(it.href)} className={cn(cls, 'transition-colors hover:border-foreground/30')}>{body}</a>
            : <div key={i} className={cls}>{body}</div>
        })}
      </div>
    </section>
  )
}
