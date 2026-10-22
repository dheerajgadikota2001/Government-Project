import * as React from 'react'
import { BookOpen, Building2, CalendarRange, FileText, Landmark, Layers, MapPin, Phone, Scale, HandCoins, LayoutGrid } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { districts, MERGED } from '@/lib/data'
import { placeText, projects } from '@/lib/data-projects'
import { papers } from '@/lib/data-papers'
import { go } from '@/lib/route'
import { useLang } from '@/lib/i18n'
import { clean, crore, STATUS_WORDS } from '@/lib/format'

// One box for English or Telugu: works, districts, papers and the parts of the site.
// This file carries the works register and the papers list it searches, so it is loaded only when
// a reader shows they want to search (see search.tsx). The keyboard shortcut lives in search.tsx.

const PAGES = [
  { token: 'cards', en: "Today's cards: straight facts, one at a time", te: 'నేటి కార్డులు', icon: Layers, words: 'cards today' },
  { token: 'projects', en: 'Projects: what is being built', te: 'పనులు', icon: Building2, words: 'works construction' },
  { token: 'districts', en: 'My district', te: 'మా జిల్లా', icon: MapPin, words: 'district village town' },
  { token: 'money', en: 'Money: how much does Andhra Pradesh owe?', te: 'డబ్బు, అప్పు', icon: Landmark, words: 'debt loans interest budget' },
  { token: 'money-departments', en: 'What each department planned and spent', te: 'శాఖల వ్యయం', icon: Landmark, words: 'department budget school health' },
  { token: 'governments', en: 'Governments by period', te: 'ప్రభుత్వాల వారీగా', icon: CalendarRange, words: 'period chief minister government' },
  { token: 'state-facts', en: 'State facts: 83 indicators', te: 'రాష్ట్ర గణాంకాలు', icon: LayoutGrid, words: 'income economy population' },
  { token: 'investments', en: 'Investment promises (MoUs)', te: 'పెట్టుబడి హామీలు', icon: HandCoins, words: 'mou company jobs summit' },
  { token: 'claims', en: 'Check a claim', te: 'నిజమేనా?', icon: Scale, words: 'claim true false white paper' },
  { token: 'papers', en: 'Government papers', te: 'ప్రభుత్వ పత్రాలు', icon: FileText, words: 'documents gazette order' },
  { token: 'tenders', en: 'Tenders: what is being bought now', te: 'టెండర్లు', icon: FileText, words: 'tender bid contract' },
  { token: 'helplines', en: 'Helplines: who to call, where to go', te: 'సహాయ నంబర్లు', icon: Phone, words: 'phone call complaint grievance pension ration land police hospital electricity water' },
  { token: 'words', en: 'Words to know', te: 'తెలుసుకోవాల్సిన పదాలు', icon: BookOpen, words: 'meaning glossary' },
]

export default function SearchDialogBody({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { lang } = useLang()
  const [q, setQ] = React.useState('')
  const ql = q.trim().toLowerCase()
  const works = React.useMemo(() => {
    if (ql.length < 2) return projects.filter((p) => [613, 2, 3, 519, 622].includes(p.id))
    return projects.filter((p) => !MERGED[p.id] && (p.t.toLowerCase().includes(ql) || (p.d ?? '').toLowerCase().includes(ql))).slice(0, 12)
  }, [ql])
  const docs = React.useMemo(() => (ql.length < 2 ? [] : papers.documents.filter((d: any) => (d.title + ' ' + d.publisher).toLowerCase().includes(ql)).slice(0, 6)), [ql])
  const pick = (token: string) => { onOpenChange(false); setQ(''); go(token) }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search works, districts and papers">
      <CommandInput placeholder={lang === 'te' ? 'పని, జిల్లా లేదా పత్రం వెతకండి' : 'Search a work, a district or a paper'} value={q} onValueChange={setQ} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing matches. Try a district name, or a word like "dam" or "road".</CommandEmpty>
        <CommandGroup heading={ql.length < 2 ? 'Works people look up' : 'Works'}>
          {works.map((p) => (
            <CommandItem key={p.id} value={`work ${p.id} ${p.t} ${p.d ?? ''}`} onSelect={() => pick(`project-${p.id}`)}>
              <Building2 className="text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{clean(p.t)}</div>
                <div className="text-[12px] text-muted-foreground">{placeText(p, 'en')} · {STATUS_WORDS[p.st]?.en}{p.c ? ` · ${crore(p.c)}` : ''}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Districts">
          {districts.filter((d) => !ql || d.name.toLowerCase().includes(ql) || d.te.includes(q.trim())).slice(0, ql ? 8 : 6).map((d) => (
            <CommandItem key={d.slug} value={`district ${d.name} ${d.te}`} onSelect={() => pick(`district-${d.slug}`)}>
              <MapPin className="text-muted-foreground" />{d.name}<span lang="te" className="ml-2 text-muted-foreground">{d.te}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {docs.length ? (
          <CommandGroup heading="Papers">
            {docs.map((d: any) => (
              <CommandItem key={d.id} value={`paper ${d.title} ${d.publisher}`} onSelect={() => { onOpenChange(false); window.open(d.url, '_blank', 'noopener') }}>
                <FileText className="text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="truncate">{clean(d.title)}</div><div className="text-[12px] text-muted-foreground">{d.publisher}</div></div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Parts of the site">
          {PAGES.filter((p) => !ql || p.en.toLowerCase().includes(ql) || p.te.includes(q.trim()) || ql.split(/\s+/).some((w) => w.length > 2 && p.words.includes(w))).map((p) => (
            <CommandItem key={p.token} value={`page ${p.en} ${p.te} ${p.words}`} onSelect={() => pick(p.token)}>
              <p.icon className="text-muted-foreground" />{lang === 'te' ? <span lang="te">{p.te}</span> : p.en}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
