import * as React from 'react'
import { districtByName, type PlaceReading } from '@/lib/data'
import { dateLong, dateTe } from '@/lib/format'
import { useLang } from '@/lib/i18n'
import { PaperChip, Te } from '@/components/kit'

// Where a work is, read from official papers one line at a time. A district is shown as the paper
// printed it, because Andhra Pradesh redrew its districts in April 2022 and January 2026; today's
// district appears beside it only where the backend's rules can show it (app/services/project_places.py).

const MEANING = {
  located: { en: 'Located in', te: 'ఉన్న జిల్లా' },
  route: { en: 'Passes through', te: 'వెళ్లే జిల్లా' },
  served: { en: 'Serves', te: 'లాభం పొందే జిల్లా' },
} as const

const NOTE_TE: Record<string, string> = {
  'Covers the High Level Canal only, not the Low Level Canal.': 'ఎత్తు కాలువకే వర్తిస్తుంది; దిగువ కాలువకు కాదు.',
  'Land taken for one minor canal.': 'ఒక చిన్న కాలువ కోసం తీసుకున్న భూమి.',
  'One notification covers one stretch. Other stretches of the pipeline are not checked yet.': 'ఒక నోటిఫికేషన్ ఒక భాగానికే. పైప్‌లైన్ ఇతర భాగాలను ఇంకా చూడలేదు.',
  'Phase I only.': 'మొదటి దశకు మాత్రమే.',
  'The audit names the districts the project is meant to serve, not where its works stand.': 'ఆడిట్ ప్రాజెక్టు లాభం అందించాల్సిన జిల్లాలను చెబుతుంది; పనులు ఎక్కడ ఉన్నాయో కాదు.',
  'The dam site.': 'ఆనకట్ట ఉన్న చోటు.',
  'The fuel farm is inside the airport; the paper places the airport.': 'ఇంధన నిల్వ విమానాశ్రయంలోనే ఉంది; పత్రం విమానాశ్రయం చోటు చెబుతుంది.',
  'The line also runs through Khammam district in Telangana.': 'ఈ మార్గం తెలంగాణలోని ఖమ్మం జిల్లా గుండా కూడా వెళ్తుంది.',
  'The page describes the whole node. It does not say which site Phase 1 is on.': 'పేజీ మొత్తం పారిశ్రామిక కేంద్రం గురించి చెబుతుంది. మొదటి దశ ఏ చోట ఉందో చెప్పదు.',
  "The page's ayacut table names only two districts.": 'పేజీలోని ఆయకట్టు పట్టిక రెండు జిల్లాల పేర్లే ఇస్తుంది.',
  'The pumping site.': 'పంపింగ్ కేంద్రం ఉన్న చోటు.',
  "The refinery's address. No official page names the tank project itself; the title places it at the refinery.": 'ఇది రిఫైనరీ చిరునామా. ట్యాంకుల పనిని ఏ అధికారిక పేజీ పేర్కొనలేదు; పని పేరే దాన్ని రిఫైనరీలో ఉంచుతుంది.',
  "The refinery's address; the title places the unit at the refinery.": 'ఇది రిఫైనరీ చిరునామా; పని పేరే యూనిట్‌ను రిఫైనరీలో ఉంచుతుంది.',
  'Vijayawada Airport stands at Gannavaram.': 'విజయవాడ విమానాశ్రయం గన్నవరంలో ఉంది.',
}

const STATE_TE: Record<string, string> = { 'Tamil Nadu': 'తమిళనాడు', Karnataka: 'కర్ణాటక', Telangana: 'తెలంగాణ', Odisha: 'ఒడిశా' }

/** Notes in Telugu: the fixed ones from the table, the row references by pattern. */
function noteTe(note: string): string {
  if (NOTE_TE[note]) return NOTE_TE[note]
  const row = note.match(/^Annexure-B row (\d+), page (\d+)\.(?: This district is in ([A-Za-z ]+)\.)?$/)
  if (row) return `అనుబంధం-బి, వరుస ${row[1]}, పేజీ ${row[2]}.${row[3] ? ` ఈ జిల్లా ${STATE_TE[row[3]] ?? row[3]}లో ఉంది.` : ''}`
  return note
}

/** The reason in Telugu, read from the same rule the backend applied. */
function whyTe(r: PlaceReading): string {
  const w = r.today.why
  const y = w.match(/from (\d{4}), before/)
  if (r.today.how === 'paper_after_2026') return 'ఈ పత్రం నేటి జిల్లాల ప్రకారమే రాశారు.'
  if (r.today.how === 'paper_uses_2022_map') return 'ఈ పత్రం 2022లో గీసిన జిల్లాలను వాడింది; ఈ జిల్లా 2026లో మారలేదు.'
  if (r.today.how === 'place_directory') {
    const m = w.match(/puts (.+) in (.+) district\.(?: The paper itself says (.+)\.)?$/)
    const d = m ? (districtByName.get(m[2])?.te ?? m[2]) : ''
    return m ? `ప్రభుత్వ స్థలాల జాబితా (ఎల్‌జీడీ) ప్రకారం ${m[1]} ${d} జిల్లాలో ఉంది.${m[3] ? ` పత్రం మాత్రం ${m[3]} అంటుంది.` : ''}` : 'ప్రభుత్వ స్థలాల జాబితా ప్రకారం.'
  }
  const out = w.match(/is in ([A-Za-z ]+), outside Andhra Pradesh/)
  if (out) return `ఈ జిల్లా ${STATE_TE[out[1]] ?? out[1]}లో ఉంది; ఆంధ్రప్రదేశ్ బయట.`
  if (y) return `ఈ పత్రం ${y[1]} నాటిది; జిల్లాలను 2022 ఏప్రిల్‌లో మళ్లీ గీశారు.`
  if (w.includes('undated')) return 'పత్రంపై తేదీ లేదు; ఏ జిల్లాల పటం ప్రకారమో చెప్పలేం.'
  if (w.includes('split in January 2026')) return 'ఈ జిల్లాను 2026 జనవరిలో విభజించారు; ఈ పత్రం అంతకు ముందుది.'
  if (w.includes('spelling')) return 'ఈ పేరు పాత లేదా స్థానిక పేరు; మేము సొంతంగా మార్చం.'
  return 'పత్రం 2022 ముందు నుంచీ ఉన్న పేర్లే వాడింది; ఏ పటం ప్రకారమో ఖచ్చితంగా చెప్పలేం.'
}

export function PlaceReadings({ readings }: { readings: PlaceReading[] }) {
  const { tr, lang } = useLang()
  const te = lang === 'te'
  // one card per paper, in the order the seed lists them
  const papers: { url: string; rows: PlaceReading[] }[] = []
  for (const r of readings) {
    const g = papers.find((x) => x.url === r.source.url)
    if (g) g.rows.push(r)
    else papers.push({ url: r.source.url, rows: [r] })
  }
  const when = (s: PlaceReading['source']) => (s.date ? (te ? dateTe(s.date) : dateLong(s.date)) : null)
  return (
    <div className="space-y-3">
      {papers.map(({ url, rows }) => {
        const s = rows[0].source
        return (
          <article key={url} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PaperChip label={`${s.title}${when(s) ? `, ${when(s)}` : ''}`} url={url === 'title' ? undefined : url} />
              {!s.date ? <span className="text-[12.5px] text-muted-foreground">{tr('Undated', 'తేదీ లేదు')}</span> : null}
            </div>
            {[...new Set(rows.map((r) => r.quote))].map((q) => (
              <p key={q} className="mt-3 border-l-2 border-border pl-3 text-[14px] italic leading-snug text-foreground/85" lang="en">“{q}”</p>
            ))}
            <ul className="mt-3 divide-y divide-border">
              {rows.map((r, i) => {
                const today = r.today.district
                const todayName = today ? (te ? districtByName.get(today)?.te ?? today : today) : null
                return (
                  <li key={i} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-4">
                    <span className="text-[13px] font-medium text-muted-foreground" lang={te ? 'te' : undefined}>{MEANING[r.meaning][lang]}</span>
                    <span className="min-w-0">
                      <span className="text-[15px]"><b lang="en">{r.district_as_printed}</b> <span className="text-[13px] text-muted-foreground">{tr('as the paper prints it', 'పత్రంలో ఉన్నట్లు')}</span></span>
                      {r.places_as_printed.length ? (
                        <span className="block text-[13px] text-muted-foreground"><span lang="en">{r.places_as_printed.map((p) => p.name).join(', ')}</span></span>
                      ) : null}
                      <span className="mt-1 block text-[13.5px]">
                        {todayName
                          ? <><b>{tr('Today: ', 'నేడు: ')}{todayName}{tr(' district', ' జిల్లా')}.</b> <span className="text-muted-foreground">{te ? <Te>{whyTe(r)}</Te> : r.today.why}</span></>
                          : <span className="text-muted-foreground">{tr('Not placed on today’s districts. ', 'నేటి జిల్లాలపై చూపలేదు. ')}{te ? <Te>{whyTe(r)}</Te> : r.today.why}</span>}
                      </span>
                      {r.note ? <span className="mt-1 block text-[13px] text-muted-foreground">{te ? <Te>{noteTe(r.note)}</Te> : r.note}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </article>
        )
      })}
    </div>
  )
}
