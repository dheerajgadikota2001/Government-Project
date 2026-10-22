import { byId } from '@/lib/data-projects'
import { events } from '@/lib/data-events'
import { pol } from '@/lib/data-polavaram'
import type { WorkKind } from '@/three/scenes/works'

// The big works on the first screen: the eight flagships we follow closely, and every other
// ongoing work whose paper prints ₹5,000 crore or more and whose newest government paper is the
// latest edition of its source. Readings come only from government papers; a newspaper item is
// never used as a reading here.

export type BigWork = {
  id: number
  name: string
  te: string
  kind: WorkKind | 'dam'
  /** The share of work the latest government paper prints, or null when none prints one. */
  pct: number | null
  /** What the model draws: the printed share, or the whole work once it is finished and open. */
  drawPct: number | null
  date: string | null
  paper: string | null
  url: string | null
  /** When no share is printed: the newest dated step the papers record. */
  step: string | null
  cost: number | null
  status: string
  due: string | null
  place: string | null
}

const LIST: { id: number; name: string; te: string; kind: BigWork['kind'] }[] = [
  { id: 613, name: 'Polavaram dam', te: 'పోలవరం', kind: 'dam' },
  { id: 4, name: 'Amaravati capital', te: 'అమరావతి రాజధాని', kind: 'city' },
  { id: 3, name: 'Visakhapatnam Metro', te: 'విశాఖ మెట్రో', kind: 'metro' },
  { id: 2, name: 'Bhogapuram airport', te: 'భోగాపురం విమానాశ్రయం', kind: 'airport' },
  { id: 519, name: 'KG basin gas field', te: 'కేజీ బేసిన్ గ్యాస్', kind: 'gas' },
  { id: 5, name: 'Ramayapatnam port', te: 'రామాయపట్నం ఓడరేవు', kind: 'port' },
  { id: 6, name: 'Machilipatnam port', te: 'మచిలీపట్నం ఓడరేవు', kind: 'port' },
  { id: 7, name: 'Mulapeta port', te: 'మూలపేట ఓడరేవు', kind: 'port' },
  { id: 8, name: 'Kadapa steel plant', te: 'కడప ఉక్కు కర్మాగారం', kind: 'steel' },
  { id: 619, name: 'Uttarandhra Sujala Sravanthi', te: 'ఉత్తరాంధ్ర సుజల స్రవంతి', kind: 'canal' },
  { id: 627, name: 'Telugu Ganga', te: 'తెలుగు గంగ', kind: 'canal' },
  { id: 628, name: 'Galeru Nagari', te: 'గాలేరు నగరి', kind: 'canal' },
  { id: 622, name: 'Veligonda', te: 'వెలిగొండ', kind: 'canal' },
  { id: 531, name: 'Nadikudi to Srikalahasti rail line', te: 'నడికుడి శ్రీకాళహస్తి రైలు మార్గం', kind: 'rail' },
  { id: 528, name: 'Kurnool green power line', te: 'కర్నూలు విద్యుత్ లైన్', kind: 'power' },
]

const PCT = /([\d.]+)% physical progress/

export const bigWorks: BigWork[] = LIST.flatMap((w) => {
  const p = byId.get(w.id)
  if (!p) return []
  const ev = events[String(w.id)] ?? []
  let pct: number | null = null, date: string | null = null, paper: string | null = null, url: string | null = null, step: string | null = null
  if (w.id === 613) {
    const r = pol.readings[pol.readings.length - 1]
    pct = r.pct; date = r.date; paper = r.paper; url = r.url
  } else {
    const gov = ev.filter((e) => e.tier === 'government')
    const reading = [...gov].reverse().find((e) => e.kind === 'reading' && PCT.test(e.title))
    if (reading) {
      pct = Number(reading.title.match(PCT)![1]); date = reading.date; paper = reading.doc; url = reading.url
    } else {
      const last = gov[gov.length - 1] ?? ev[ev.length - 1]
      if (last) { date = last.date; paper = last.doc; url = last.url; step = last.title }
    }
  }
  // a finished and opened work is drawn whole, though no paper prints a share for it
  const drawPct = pct ?? (p.st === 'completed' ? 100 : null)
  return [{ id: w.id, name: w.name, te: w.te, kind: w.kind, pct, drawPct, date, paper, url, step, cost: p.c, status: p.st, due: p.due, place: p.d }]
})
