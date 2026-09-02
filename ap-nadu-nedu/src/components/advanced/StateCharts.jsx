import { useState } from 'react'
import { useT } from '../../i18n'
import { fmtIN, HBarChart, LineOverlay, VizSection } from './ChartPrimitives'

/**
 * Shared all-states chart components: the same verified RBI / NITI tables the
 * Governments page shows as tables, drawn as charts. Used by the All States
 * page and by the "See this as charts" toggles on the Governments page.
 * Every figure is transcribed verbatim from the cited publication; a missing
 * bar means the Centre published nothing.
 */

export const AGG = 'All States and UTs'
// Series colours for charts that are NOT about governments. Kept separate from the
// tenure palette on purpose: reusing a party colour for "series 2" of an unrelated
// chart is how a reader starts seeing party meaning where none exists.
export const LINE_COLORS = ['#0b57d0', '#b5851b', '#137333', '#a50e0e', '#7b1fa2', '#00838f']

/** "FY 2024-25" for a year that ends in March of `fy`. */
export const fyLabel = (t, fy) => t('states.fyLabel', { from: fy - 1, to: String(fy).slice(2) })

/** RE/BE printed in words; unknown stages fall back to the raw marker. */
export const stageWord = (t, stage) =>
  stage === 'RE' ? t('hero.stage.re') : stage === 'BE' ? t('hero.stage.be') : stage

export function InfoTip({ tip, text }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onClick={e => e.stopPropagation()}>
      <button
        type="button" aria-label={t('states.infoTip.aria')} aria-expanded={open}
        className="w-5 h-5 rounded-full border border-outline-variant text-on-surface-variant text-[11px] leading-none inline-flex items-center justify-center hover:bg-surface-container cursor-help font-serif italic font-bold"
        onMouseEnter={e => !open && tip.show(e, t('states.infoTip.title'), '', text)}
        onMouseMove={e => !open && tip.show(e, t('states.infoTip.title'), '', text)}
        onMouseLeave={tip.hide}
        onClick={e => { e.preventDefault(); tip.hide(); setOpen(o => !o) }}
      >i</button>
      {open && (
        <span role="note" className="absolute start-0 top-7 z-40 w-80 max-w-[80vw] bg-surface border border-outline-variant rounded-xl shadow-lg p-3 text-label-md text-on-surface font-normal not-italic normal-case tracking-normal text-start">
          {text}
          <button type="button" className="block mt-1.5 text-primary text-label-sm" onClick={() => setOpen(false)}>{t('common.close')}</button>
        </span>
      )}
    </span>
  )
}

/** value formatter per metric, for bars and axis ticks */
export const fmtFor = m => (
  m.key === 'per_capita' ? v => fmtIN(Math.round(v))
    : m.key === 'gsdp' ? v => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : fmtIN(Math.round(v)))
      : v => (Math.round(v * 10) / 10).toString()
)
/** The unit sits next to a number on the axis, so it comes from the catalogue. */
export const unitFor = (m, t) => (m.key === 'per_capita' ? '₹' : m.key === 'gsdp' ? t('unit.crore') : '%')

export function niceCeil(v) {
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / mag) * mag
}

/** Section 1 — every state ranked in a chosen measure and year */
export function RankChart({ lb, tip }) {
  const { t, tn } = useT()
  const [mi, setMi] = useState(0)
  const [fySel, setFySel] = useState(null)
  const m = lb.metrics[mi]
  const years = m.years
  const lastWithData = (() => {
    for (let i = years.length - 1; i >= 0; i--) if (m.rows.some(r => r.values[i] != null)) return years[i]
    return years[years.length - 1]
  })()
  const fy = fySel != null && years.includes(fySel) ? fySel : lastWithData
  const yi = years.indexOf(fy)
  const stage = m.stage_labels?.[String(fy)]

  const col = m.rows.filter(r => r.state !== AGG)
    .map(r => ({ state: r.state, v: r.values[yi] })).filter(r => r.v != null)
  col.sort((a, b) => (m.higher_is === 'lower' ? a.v - b.v : b.v - a.v))
  const missing = m.rows.filter(r => r.state !== AGG && r.values[yi] == null).length

  const rows = col.map((r, i) => ({
    label: `${i + 1}. ${r.state}${r.state === 'Andhra Pradesh' ? ' ◀' : ''}`,
    value: r.v,
    emphasis: r.state === 'Andhra Pradesh',
    tipDetail: t('states.rank.tipDetail', { rank: i + 1, total: col.length, fy: fyLabel(t, fy) })
      + (stage ? ` · ${stageWord(t, stage)}` : ''),
  }))

  return (
    <VizSection
      title={t('states.rank.title')}
      sub={m.higher_is === 'lower' ? t('states.rank.subLowest') : t('states.rank.subHighest')}
      info={<InfoTip tip={tip} text={m.explain} />}
      provenance={`${m.source.title} — ${m.source.publication}. ${m.conversion_note || ''} ${stage ? t('states.rank.stageNote', { stage: stage === 'RE' ? t('hero.stage.re') : t('states.beLong') }) : ''}`}
    >
      <div className="flex flex-wrap gap-1.5 mb-2">
        {lb.metrics.map((x, i) => (
          <button key={x.key} onClick={() => setMi(i)}
            className={`text-label-md px-3 py-1.5 rounded-full border ${i === mi ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {years.map(y => (
          <button key={y} onClick={() => setFySel(y)}
            className={`text-label-sm px-2 py-1 rounded-md border tabular-nums ${y === fy ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {y}{m.stage_labels?.[String(y)] && <sup className="ms-0.5">{m.stage_labels[String(y)]}</sup>}
          </button>
        ))}
      </div>
      <HBarChart rows={rows} maxValue={niceCeil(Math.max(...rows.map(r => r.value)))} unit={unitFor(m, t)} tip={tip} valueFmt={fmtFor(m)} />
      {missing > 0 && (
        <p className="text-label-sm text-outline mt-2">
          {tn('states.rank.missing', missing)}
        </p>
      )}
    </VizSection>
  )
}

/** Section 2 — up to six states compared across every year */
export function CompareChart({ lb, tip }) {
  const { t } = useT()
  const [mi, setMi] = useState(0)
  const [picked, setPicked] = useState(['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu'])
  const m = lb.metrics[mi]
  // RBI tables spell a few states differently between publications
  // ("Jammu & Kashmir" in the Handbook, "Jammu and Kashmir" in State
  // Finances). Compare on a normalised key so one picker chip matches the
  // state in every metric; each chart still prints its own table's spelling
  // in ranks and sources.
  const canonState = s => String(s || '').replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim().toLowerCase()
  const states = (() => {
    const seen = new Map()
    lb.metrics.flatMap(x => x.rows.map(r => r.state)).forEach(s => {
      if (s === AGG || s == null) return
      const k = canonState(s)
      if (!seen.has(k)) seen.set(k, s)
    })
    return [...seen.values()].sort()
  })()

  const toggle = s => setPicked(p =>
    p.includes(s) ? p.filter(x => x !== s) : p.length >= 6 ? p : [...p, s])

  const xLabels = m.years.map(y => `'${String(y).slice(2)}`)
  const seriesList = picked.map((s, i) => {
    const row = m.rows.find(r => canonState(r.state) === canonState(s))
    return {
      label: s,
      color: LINE_COLORS[i % LINE_COLORS.length],
      points: (row?.values || []).map((v, xi) => ({
        x: xi, value: v,
        note: `${fyLabel(t, m.years[xi])}${m.stage_labels?.[String(m.years[xi])] ? ` · ${m.stage_labels[String(m.years[xi])]}` : ''}`,
      })).filter(p => p.value != null),
    }
  }).filter(sr => sr.points.length)

  return (
    <VizSection
      title={t('states.compare.title')}
      sub={t('states.compare.sub')}
      info={<InfoTip tip={tip} text={m.explain} />}
      provenance={`${m.source.title} — ${m.source.publication}. ${t('states.compare.provenance')}`}
    >
      <div className="flex flex-wrap gap-1.5 mb-2">
        {lb.metrics.map((x, i) => (
          <button key={x.key} onClick={() => setMi(i)}
            className={`text-label-md px-3 py-1.5 rounded-full border ${i === mi ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3 max-h-28 overflow-y-auto">
        {states.map(s => (
          <button key={s} onClick={() => toggle(s)}
            className={`text-label-sm px-2 py-1 rounded-full border ${picked.includes(s) ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {s}
          </button>
        ))}
      </div>
      {picked.length === 0
        ? <p className="text-body-md text-on-surface-variant">{t('states.compare.pickOne')}</p>
        : <LineOverlay tip={tip} xLabels={xLabels} unit={unitFor(m, t)} seriesList={seriesList} valueFmt={fmtFor(m)} height={230} />}
      {picked.length >= 6 && <p className="text-label-sm text-outline mt-1">{t('states.compare.maxSix')}</p>}
    </VizSection>
  )
}

/** Section 3 — the Centre's own index scorecards (full all-states tables we hold) */
export function IndexScorecards({ rankings, data, tip }) {
  const { t } = useT()
  const cards = []
  rankings?.indices?.forEach(ix => (ix.editions || []).forEach(ed => {
    if (ed.all_states?.length >= 10) cards.push({ ix, ed })
  }))
  if (!cards.length) return null
  return (
    <VizSection
      title={t('states.scorecards.title')}
      sub={t('states.scorecards.sub')}
      info={<InfoTip tip={tip} text={data.glossary?.rankings} />}
      provenance={t('states.scorecards.provenance')}
    >
      <div className="flex flex-col gap-6">
        {cards.map(({ ix, ed }) => (
          <div key={ix.name + ed.edition}>
            <p className="text-label-md font-bold text-on-surface mb-1">
              {ix.name} — {ed.edition} <span className="font-normal text-on-surface-variant">({ix.publisher})</span>{' '}
              {data.sources[ed.source] && (
                <a className="text-label-sm text-primary font-normal" href={data.sources[ed.source].url} target="_blank" rel="noreferrer">
                  [{data.sources[ed.source].short}]
                </a>
              )}
            </p>
            <HBarChart
              tip={tip}
              rows={ed.all_states.filter(r => r[2] != null).map(([rank, state, score]) => ({
                label: `${rank}. ${state}${state === 'Andhra Pradesh' ? ' ◀' : ''}`,
                value: score,
                emphasis: state === 'Andhra Pradesh',
                tipDetail: t('states.scorecards.tipDetail', { rank, measures: ix.measures }),
              }))}
              maxValue={100}
              unit={t('states.scorecards.unitScore')}
              valueFmt={v => (Math.round(v * 10) / 10).toString()}
            />
            {ed.all_states_note && <p className="text-label-sm text-outline mt-1">{ed.all_states_note}</p>}
          </div>
        ))}
      </div>
    </VizSection>
  )
}

