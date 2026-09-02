import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useChartTip, fmtIN, HBarChart } from '../components/advanced/ChartPrimitives'
import AdvancedGovernments from '../components/advanced/AdvancedGovernments'
import { useT } from '../i18n'
import { RankChart, CompareChart, IndexScorecards } from '../components/advanced/StateCharts'
import PageThread from '../components/community/PageThread'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'

/**
 * Governments — the tenure record, organized as collapsed sections that
 * expand on click. The page shows only the essential chart per topic;
 * "Advanced charts" opens the comparative/compositional set. Spending data:
 * RBI/CAG official series. Scheme figures: each government's OWN claims,
 * always labeled. Manifestos: quoted, never judged.
 *
 * Substance comes from the seed JSON through the API — manifesto text, scheme
 * names and figures, timeline and award entries, glossary definitions, source
 * titles, tenure summaries, state names. None of it is keyed. Everything that
 * IS keyed here is chrome the page itself writes: tabs, headings, column
 * headers, empty states and the honesty framing around the numbers.
 */

const TENURE_OF_FY = fy => (fy <= 2019 ? 'tdp1' : fy <= 2024 ? 'ysrcp' : 'tdp2')

/** Unit words and the "not published" gap marker come from the catalogue. */
const fmtCr = (v, t) => {
  if (v == null) return t('common.notPublished')
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  return `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`
}

/** "FY 2024-25" for a financial year ending in March of `fy`. */
const fyLabel = (t, fy) => t('governments.fyLabel', { from: fy - 1, to: String(fy).slice(2) })

/**
 * A sentence is one translation unit, so emphasis travels inside the string:
 * **bold** and *italic* markers become elements here. A translation that drops
 * the markers still renders, just unstyled.
 */
function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function InfoTip({ tip, text }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onClick={e => e.stopPropagation()}>
      <button
        type="button" aria-label={t('governments.infoTip.aria')} aria-expanded={open}
        className="w-5 h-5 rounded-full border border-outline-variant text-on-surface-variant text-[11px] leading-none inline-flex items-center justify-center hover:bg-surface-container cursor-help font-serif italic font-bold"
        onMouseEnter={e => !open && tip.show(e, t('governments.infoTip.title'), '', text)}
        onMouseMove={e => !open && tip.show(e, t('governments.infoTip.title'), '', text)}
        onMouseLeave={tip.hide}
        onClick={e => { e.preventDefault(); tip.hide(); setOpen(o => !o) }}
      >i</button>
      {open && (
        <span role="note" className="absolute end-0 top-7 z-40 w-80 max-w-[80vw] bg-surface border border-outline-variant rounded-xl shadow-lg p-3 text-label-md text-on-surface font-normal not-italic normal-case tracking-normal text-start">
          {text}
          <button type="button" className="block mt-1.5 text-primary text-label-sm" onClick={() => setOpen(false)}>{t('common.close')}</button>
        </span>
      )}
    </span>
  )
}

/** Collapsed card: header shows title + one-line takeaway; click to expand. */
function Collapse({ title, takeaway, info, tint, defaultOpen = false, actionLabel, onAction, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)}
      className="group bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden">
      <summary
        className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-surface-container transition-colors"
        style={tint ? { borderInlineStart: `4px solid ${tint}` } : undefined}
      >
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-body-lg font-bold text-on-surface inline-flex items-center gap-2">{title}{info}</span>
          {takeaway && <span className="text-label-sm text-on-surface-variant">{takeaway}</span>}
        </span>
        {actionLabel && (
          <button
            type="button"
            onClick={e => {
              // The link lives inside the summary row: keep the click from
              // toggling the section closed, and make sure it is open so the
              // charts are visible right away.
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
              onAction?.()
            }}
            className="ms-auto shrink-0 inline-flex items-center gap-1.5 text-label-md font-bold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">monitoring</span>
            {actionLabel}
          </button>
        )}
        <span aria-hidden="true" className={`${actionLabel ? 'ms-3' : 'ms-auto'} text-on-surface-variant transition-transform group-open:rotate-180 shrink-0`}>▾</span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-surface-variant/60">{children}</div>
    </details>
  )
}

function TenureColumns({ points, tip, unit = '', height = 180, onBarClick }) {
  const { t } = useT()
  const W = 780, H = height, PAD_L = 8
  const maxV = Math.max(...points.map(p => p.value))
  const mag = Math.pow(10, Math.floor(Math.log10(maxV)))
  const top = Math.ceil(maxV / mag) * mag
  const groupW = (W - PAD_L) / points.length
  const barW = Math.min(34, groupW - 10)
  const stageWord = s => (s === 'A' ? t('hero.stage.a') : s === 'RE' ? t('hero.stage.re') : t('hero.stage.be'))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="min-w-[640px] w-full" role="img" aria-label={t('governments.chart.tenureColumnsAria')}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W} y1={H - H * f} y2={H - H * f} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
            <text x={PAD_L} y={H - H * f - 3} className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {top >= 10000 ? fmtIN(Math.round((top * f) / 1000) * 1000) : Math.round(top * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const h = Math.max(2, (p.value / top) * (H - 14))
          const x = PAD_L + i * groupW + (groupW - barW) / 2
          return (
            <g key={p.fy_end}>
              <rect x={x} y={H - h} width={barW} height={h} rx="3"
                fill={TENURE_TINT[TENURE_OF_FY(p.fy_end)]} opacity={p.stage === 'A' ? 1 : 0.5}
                className={onBarClick ? 'cursor-pointer' : undefined}
                onClick={onBarClick ? () => onBarClick(p) : undefined}
                onMouseMove={e => tip.show(e, t('governments.chart.fyEndingMarch', { year: p.fy_end }),
                  unit === '%' ? `${p.value}%` : fmtCr(p.value, t),
                  `${stageWord(p.stage)}${p.note ? ` · ${p.note}` : ''}${onBarClick ? ` · ${t('governments.chart.clickForStory')}` : ''}`)}
                onMouseLeave={tip.hide}
              />
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" className="text-[9px]" fill="currentColor" fillOpacity="0.65">{String(p.fy_end).slice(2)}</text>
            </g>
          )
        })}
        <text x={PAD_L} y={H + 24} className="text-[8px]" fill="currentColor" fillOpacity="0.45">
          {t('governments.chart.axisNote')}
        </text>
      </svg>
    </div>
  )
}

function SourceChips({ data, keys }) {
  const { t } = useT()
  if (!keys?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-dashed border-surface-variant">
      <span className="text-label-sm text-on-surface-variant me-1">{t('governments.sources.official')}</span>
      {keys.map(k => {
        const s = data.sources[k]
        if (!s) return null
        return (
          <span key={k} className="inline-flex items-center gap-1 text-label-sm bg-surface-container rounded-full px-2.5 py-1">
            <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer" title={s.title}>{s.short}</a>
            {s.pdf && <a className="text-primary font-bold hover:underline" href={s.pdf} target="_blank" rel="noreferrer" title={t('governments.sources.directPdf', { title: s.title })}>PDF↓</a>}
          </span>
        )
      })}
    </div>
  )
}

function TenureBody({ t: tenure, data, tip, records }) {
  const { t } = useT()
  const [tab, setTab] = useState('schemes')
  const projRec = records?.projects?.tenures?.find(x => x.key === tenure.key)
  const mouRec = records?.mous?.tenures?.find(x => x.key === tenure.key)
  const withSpend = tenure.schemes.filter(s => s.spend_claim_crore != null)
  const maxSpend = Math.max(...withSpend.map(s => s.spend_claim_crore), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(maxSpend)))
  const TABS = [
    ['schemes', 'governments.tabs.schemes'],
    ['timeline', 'governments.tabs.timeline'],
    ['manifesto', 'governments.tabs.manifesto'],
    ['record', 'governments.tabs.record'],
  ]
  return (
    <div>
      <p className="text-body-md text-on-surface leading-relaxed max-w-4xl">{tenure.summary}</p>
      <div className="mt-3 flex gap-1 border-b border-surface-variant">
        {TABS.map(([k, labelKey]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-label-md rounded-t-lg border border-b-0 ${tab === k ? 'bg-surface border-surface-variant font-bold text-on-surface' : 'border-transparent text-on-surface-variant hover:bg-surface-container'}`}>
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="py-4">
        {tab === 'schemes' && (
          <div className="flex flex-col gap-3">
            <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl">{tenure.schemes_note}</p>
            {withSpend.length > 0 && (
              <HBarChart tip={tip} unit={t('unit.crore')} maxValue={Math.ceil(maxSpend / mag) * mag}
                rows={[...withSpend].sort((a, b) => b.spend_claim_crore - a.spend_claim_crore).map(sch => ({
                  label: sch.name, value: sch.spend_claim_crore,
                  tipDetail: t('governments.schemes.claimedBy', { beneficiaries: sch.beneficiaries }),
                }))} />
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-label-md">
                <thead>
                  <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                    <th className="py-1.5 pe-3">{t('governments.schemes.th.scheme')}</th><th className="py-1.5 pe-3">{t('governments.schemes.th.gives')}</th>
                    <th className="py-1.5 pe-3 text-end">{t('governments.schemes.th.spendClaim')}</th><th className="py-1.5">{t('governments.schemes.th.received')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenure.schemes.map(sch => (
                    <tr key={sch.name} className="border-b border-surface-variant/60 align-top">
                      <td className="py-2 pe-3 font-semibold text-on-surface">{sch.name}</td>
                      <td className="py-2 pe-3 text-on-surface-variant max-w-[280px]">{sch.gives}{sch.note ? ` (${sch.note})` : ''}</td>
                      <td className="py-2 pe-3 text-end tabular-nums text-on-surface">{fmtCr(sch.spend_claim_crore, t)}</td>
                      <td className="py-2 text-on-surface-variant max-w-[260px]">{sch.beneficiaries} · {sch.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SourceChips data={data} keys={[...new Set(tenure.schemes.map(s => s.source))]} />
          </div>
        )}
        {tab === 'timeline' && (
          <ol className="flex flex-col gap-2.5 max-w-4xl">
            {tenure.timeline.map(ev => (
              <li key={ev.date + ev.text.slice(0, 12)} className="flex gap-3">
                <span className="text-label-sm tabular-nums text-on-surface-variant whitespace-nowrap pt-0.5 w-24">{ev.date}</span>
                <span className="text-body-md text-on-surface min-w-0">
                  {ev.text}{' '}
                  <a className="text-label-sm text-primary" href={data.sources[ev.source]?.url} target="_blank" rel="noreferrer">[{ev.source_name}]</a>
                  {data.sources[ev.source]?.pdf && (
                    <a className="text-label-sm text-primary font-bold ms-1" href={data.sources[ev.source].pdf} target="_blank" rel="noreferrer">PDF↓</a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {tab === 'manifesto' && (
          <div className="max-w-4xl flex flex-col gap-2">
            <h4 className="text-title-md font-bold text-on-surface">{tenure.manifesto.title}</h4>
            <p className="text-label-sm text-on-surface-variant">{tenure.manifesto.caveat}</p>
            <ul className="list-disc ps-5 text-body-md text-on-surface flex flex-col gap-1.5">
              {tenure.manifesto.promises.map((pr, i) => <li key={i}>{pr}</li>)}
            </ul>
            {tenure.manifesto.sources?.length
              ? <SourceChips data={data} keys={tenure.manifesto.sources} />
              : <a className="text-label-sm text-primary" href={data.sources[tenure.manifesto.source]?.url} target="_blank" rel="noreferrer">{t('governments.manifesto.sourceRecord')}</a>}
          </div>
        )}

        {tab === 'record' && (
          <div className="max-w-4xl flex flex-col gap-4">
            {projRec || mouRec ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {projRec && (
                    <>
                      <div className="border border-surface-variant rounded-xl px-3 py-2.5 bg-surface-container-lowest">
                        <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t('governments.record.projectsAnnounced')}</p>
                        <p className="text-title-md font-bold text-on-surface mt-0.5">{projRec.announced_count.toLocaleString('en-IN')}</p>
                        {projRec.announced_cost_crore > 0 && <p className="text-label-sm text-on-surface-variant">{t('governments.record.estimated', { amount: fmtCr(projRec.announced_cost_crore, t) })}</p>}
                      </div>
                      <div className="border border-surface-variant rounded-xl px-3 py-2.5 bg-surface-container-lowest">
                        <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t('governments.record.completedInTenure')}</p>
                        <p className="text-title-md font-bold text-on-surface mt-0.5">{projRec.completed_count.toLocaleString('en-IN')}</p>
                        {projRec.started_count > 0 && <p className="text-label-sm text-on-surface-variant">{t('projects.tenure.worksBegun', { count: projRec.started_count })}</p>}
                      </div>
                    </>
                  )}
                  {mouRec && (
                    <>
                      <div className="border border-surface-variant rounded-xl px-3 py-2.5 bg-surface-container-lowest">
                        <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t('governments.record.mousSigned')}</p>
                        <p className="text-title-md font-bold text-on-surface mt-0.5">{mouRec.signed_count.toLocaleString('en-IN')}</p>
                        {mouRec.investment_crore > 0 && <p className="text-label-sm text-on-surface-variant">{t('governments.record.promised', { amount: fmtCr(mouRec.investment_crore, t) })}</p>}
                      </div>
                      <div className="border border-surface-variant rounded-xl px-3 py-2.5 bg-surface-container-lowest">
                        <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t('governments.record.ofThoseOperational')}</p>
                        <p className="text-title-md font-bold text-on-surface mt-0.5">{mouRec.operational_count.toLocaleString('en-IN')}</p>
                        {mouRec.expected_jobs > 0 && <p className="text-label-sm text-on-surface-variant">{t('governments.record.jobsPromised', { jobs: mouRec.expected_jobs.toLocaleString('en-IN') })}</p>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className="text-label-md text-primary font-bold" to={`/projects?tenure=${tenure.key}`}>
                    {t('governments.record.openProjects')}
                  </Link>
                  <Link className="text-label-md text-primary font-bold" to={`/investments?tenure=${tenure.key}`}>
                    {t('governments.record.openMous')}
                  </Link>
                  <Link className="text-label-md text-primary" to="/sources">{t('common.dataSources')}</Link>
                </div>
                <p className="text-label-sm text-on-surface-variant">
                  {t('governments.record.note')}
                </p>
              </>
            ) : (
              <p className="text-body-md text-on-surface-variant">{t('governments.record.loading')}</p>
            )}
          </div>
        )}
      </div>
      {tenure.capital_outlay_note && <p className="text-label-sm text-outline">{tenure.capital_outlay_note}</p>}
    </div>
  )
}

/**
 * One ranking index: edition picker (year buttons) + the full all-states
 * table where the source prints one, with AP's row highlighted.
 */
function IndexCard({ ix, data }) {
  const { t } = useT()
  const [ei, setEi] = useState(ix.editions.length - 1)
  const ed = ix.editions[ei]
  return (
    <div className="border border-surface-variant rounded-xl p-4">
      <p className="text-title-md font-bold text-on-surface">{ix.name}</p>
      <p className="text-label-sm text-on-surface-variant mb-2">{ix.publisher} · {t('governments.index.measures')} <strong>{ix.measures}</strong></p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {ix.editions.map((e, i) => (
          <button key={e.edition} onClick={() => setEi(i)}
            className={`text-label-sm px-2.5 py-1 rounded-full border ${i === ei ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {e.edition.split(' ')[0]}
          </button>
        ))}
      </div>
      <p className="text-label-md text-on-surface">
        <strong>{t('governments.index.ap')}</strong> {ed.result}{' '}
        <a className="text-label-sm text-primary" href={data.sources[ed.source]?.url} target="_blank" rel="noreferrer">[{data.sources[ed.source]?.short}]</a>
        {data.sources[ed.source]?.pdf && <a className="text-label-sm text-primary font-bold ms-1" href={data.sources[ed.source].pdf} target="_blank" rel="noreferrer">PDF↓</a>}
      </p>
      {ed.caveat && <p className="text-label-sm text-outline mt-1">{ed.caveat}</p>}
      {ed.all_states && (
        <div className="overflow-x-auto mt-2 max-h-72 overflow-y-auto border border-surface-variant/60 rounded-lg">
          <table className="w-full text-label-sm">
            <thead className="sticky top-0 bg-surface-container">
              <tr className="text-start text-on-surface-variant">
                <th className="py-1 px-2">#</th><th className="py-1 px-2">{t('governments.index.th.state')}</th><th className="py-1 px-2 text-end">{t('governments.index.th.score')}</th>
              </tr>
            </thead>
            <tbody>
              {ed.all_states.map(([rank, state, score]) => (
                <tr key={state} className={`border-t border-surface-variant/40 ${state === 'Andhra Pradesh' ? 'bg-primary/10 font-bold text-on-surface' : 'text-on-surface-variant'}`}>
                  <td className="py-1 px-2 tabular-nums">{rank}</td>
                  <td className="py-1 px-2">{state}{state === 'Andhra Pradesh' ? ' ◀' : ''}</td>
                  <td className="py-1 px-2 text-end tabular-nums">{score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ed.all_states_note && <p className="text-label-sm text-outline mt-1">{ed.all_states_note}</p>}
    </div>
  )
}


/**
 * Head to head — what each government said, beside what the record shows.
 * Claims (manifesto promises, the government's own scheme figures, MoU
 * promises) are kept visually and verbally apart from audited/documented
 * facts. Tenure lengths differ, so every total carries a per-year figure,
 * and the COVID year inside the YSRCP tenure is flagged wherever it lands.
 */
function HeadToHead({ data, records, tip }) {
  const { t, tn } = useT()
  // Which government the phone layout shows; desktop ignores this and shows all three.
  const [picked, setPicked] = useState(data.tenures?.[data.tenures.length - 1]?.key)
  const hh = data.head_to_head
  if (!hh) return null
  const sp = data.spending

  const inSpan = (pts, span) => (pts || []).filter(p => p.fy_end >= span[0] && p.fy_end <= span[1])
  const sum = a => a.reduce((s, x) => s + (x.value || 0), 0)
  const avg = a => (a.length ? sum(a) / a.length : null)
  const audited = a => a.filter(p => p.stage === 'A')

  const rows = data.tenures.map(tenure => {
    const span = tenure.fy_span
    const cap = inSpan(sp.capital_outlay.points, span)
    const soc = inSpan(sp.social_sector.points, span)
    const edu = inSpan(sp.education_share.points, span)
    const hea = inSpan(sp.health_share.points, span)
    const com = inSpan(sp.committed_pct.points, span)
    const pc  = inSpan(data.economy?.per_capita_nsdp?.points, span)
    const proj = records?.projects?.tenures?.find(x => x.key === tenure.key)
    const mou  = records?.mous?.tenures?.find(x => x.key === tenure.key)
    const claimed = tenure.schemes.filter(x => x.spend_claim_crore != null)
    const years = cap.length || (span[1] - span[0] + 1)
    const covid = hh.covid_years?.filter(y => y >= span[0] && y <= span[1]) || []
    return {
      t: tenure, years, covid,
      said: {
        promises: tenure.manifesto?.promises?.length || 0,
        schemes: claimed.length,
        schemeClaim: claimed.reduce((s, x) => s + x.spend_claim_crore, 0),
        mouCount: mou?.signed_count ?? null,
        mouCrore: mou?.investment_crore ?? null,
        mouJobs: mou?.expected_jobs ?? null,
      },
      did: {
        capTotal: sum(cap), capAudited: audited(cap).length, capStages: cap.length,
        socTotal: sum(soc),
        eduAvg: avg(edu), heaAvg: avg(hea), comAvg: avg(com),
        pcStart: pc[0]?.value ?? null, pcEnd: pc[pc.length - 1]?.value ?? null,
        projAnnounced: proj?.announced_count ?? null,
        projCompleted: proj?.completed_count ?? null,
        mouOperational: mou?.operational_count ?? null,
      },
    }
  })

  const pct = v => (v == null ? '—' : `${v.toFixed(1)}%`)
  const perYear = (v, y) => (v && y ? t('governments.headToHead.perYear', { amount: fmtCr(v / y, t) }) : null)

  return (
    <Collapse
      title={t('governments.headToHead.title')}
      takeaway={t('governments.headToHead.takeaway')}
      info={<InfoTip tip={tip} text={`${data.glossary?.verify || ''} ${data.glossary?.schemes || ''}`} />}
    >
      <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl mb-4">
        {hh.intro}
      </p>

      {/* Phone: one government at a time (segmented control); desktop: all three side by side. */}
      <div className="lg:hidden flex bg-surface-container rounded-xl p-1 mb-3" role="tablist" aria-label={t('governments.headToHead.title')}>
        {rows.map(r => (
          <button key={r.t.key} type="button" role="tab" aria-selected={picked === r.t.key}
            onClick={() => setPicked(r.t.key)}
            className={[
              'flex-1 min-w-0 rounded-lg px-1.5 py-2 text-label-sm font-bold leading-tight transition-colors [overflow-wrap:anywhere]',
              picked === r.t.key ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant',
            ].join(' ')}
            style={{ borderBottom: `3px solid ${picked === r.t.key ? TENURE_TINT[r.t.key] : 'transparent'}` }}>
            {r.t.party} · {r.t.from.slice(2, 4)}–{r.t.to ? r.t.to.slice(2, 4) : t('governments.headToHead.now')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {rows.map(r => (
          <div key={r.t.key} className={`${picked === r.t.key ? 'flex' : 'hidden lg:flex'} border border-surface-variant rounded-xl overflow-hidden flex-col`}
            style={{ borderTop: `4px solid ${TENURE_TINT[r.t.key]}` }}>
            <div className="px-4 py-3 bg-surface-container-lowest">
              <p className="text-title-md font-bold text-on-surface">{r.t.party}</p>
              <p className="text-label-sm text-on-surface-variant">
                {r.t.cm} · {r.t.from.slice(0, 4)}–{r.t.to ? r.t.to.slice(0, 4) : t('governments.headToHead.now')} · {tn('governments.headToHead.fyOnRecord', r.years)}
              </p>
              {r.covid.length > 0 && (
                <p className="text-label-sm text-on-surface mt-1.5 border border-dashed border-outline-variant rounded px-2 py-1">
                  {t('governments.headToHead.covid', { years: `FY${r.covid.join(', FY')}`, note: hh.covid_note })}
                </p>
              )}
              {r.t.key === 'tdp2' && (
                <p className="text-label-sm text-on-surface mt-1.5 border border-dashed border-outline-variant rounded px-2 py-1">
                  {t('governments.headToHead.stillRunning')}
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-surface-variant">
              <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                {t('governments.headToHead.saidTitle')} <span className="font-normal normal-case">{t('governments.headToHead.saidSub')}</span>
              </p>
              <dl className="flex flex-col gap-1.5 text-label-md">
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.promises')}</dt><dd className="font-bold tabular-nums">{r.said.promises}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.schemesClaimed')}</dt><dd className="font-bold tabular-nums">{r.said.schemes}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.schemeSpend')}</dt><dd className="font-bold tabular-nums">{fmtCr(r.said.schemeClaim, t)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.mousSigned')}</dt><dd className="font-bold tabular-nums">{r.said.mouCount ?? '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.investmentPromised')}</dt><dd className="font-bold tabular-nums">{r.said.mouCrore ? fmtCr(r.said.mouCrore, t) : '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.jobsPromised')}</dt><dd className="font-bold tabular-nums">{r.said.mouJobs ? fmtIN(r.said.mouJobs) : '—'}</dd></div>
              </dl>
            </div>

            <div className="px-4 py-3 border-t border-surface-variant bg-surface-container-lowest flex-grow">
              <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                {t('governments.headToHead.didTitle')} <span className="font-normal normal-case">{t('governments.headToHead.didSub')}</span>
              </p>
              <dl className="flex flex-col gap-1.5 text-label-md">
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.capital')}</dt>
                  <dd className="text-end"><span className="font-bold tabular-nums">{fmtCr(r.did.capTotal, t)}</span>
                    <span className="block text-label-sm text-on-surface-variant tabular-nums">{perYear(r.did.capTotal, r.years)}</span></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.social')}</dt>
                  <dd className="text-end"><span className="font-bold tabular-nums">{fmtCr(r.did.socTotal, t)}</span>
                    <span className="block text-label-sm text-on-surface-variant tabular-nums">{perYear(r.did.socTotal, r.years)}</span></dd>
                </div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.education')}</dt><dd className="font-bold tabular-nums">{pct(r.did.eduAvg)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.health')}</dt><dd className="font-bold tabular-nums">{pct(r.did.heaAvg)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.committed')}</dt><dd className="font-bold tabular-nums">{pct(r.did.comAvg)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.projAnnounced')}</dt><dd className="font-bold tabular-nums">{r.did.projAnnounced ?? '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.projCompleted')}</dt><dd className="font-bold tabular-nums">{r.did.projCompleted ?? '—'}</dd></div>
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.mousOperational')}</dt>
                  <dd className="font-bold tabular-nums">{r.did.mouOperational != null && r.said.mouCount ? `${r.did.mouOperational} ${t('common.of')} ${r.said.mouCount}` : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant min-w-0">{t('governments.headToHead.rows.perCapita')}</dt>
                  <dd className="text-end font-bold tabular-nums">
                    {r.did.pcStart && r.did.pcEnd ? `₹${fmtIN(r.did.pcStart)} → ₹${fmtIN(r.did.pcEnd)}` : '—'}
                  </dd>
                </div>
              </dl>
              <p className="text-label-sm text-on-surface-variant mt-2 pt-2 border-t border-dashed border-surface-variant">
                {t('governments.headToHead.auditedNote', { audited: r.did.capAudited, total: r.did.capStages })}
              </p>
              <div className="flex flex-wrap gap-3 mt-2">
                <Link className="text-label-sm text-primary font-bold" to={`/projects?tenure=${r.t.key}`}>{t('governments.headToHead.itsProjects')}</Link>
                <Link className="text-label-sm text-primary font-bold" to={`/investments?tenure=${r.t.key}`}>{t('governments.headToHead.itsMous')}</Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-label-md font-bold text-on-surface mb-1">{t('governments.headToHead.readFairly')}</p>
        <ul className="list-disc ps-5 flex flex-col gap-1.5 text-label-md text-on-surface-variant max-w-4xl">
          {hh.fair_comparison.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <p className="text-label-sm text-on-surface-variant mt-2">
          <Link className="text-primary underline" to="/sources">{t('governments.headToHead.sourceDocs')}</Link>
        </p>
      </div>
    </Collapse>
  )
}

/**
 * All states, every year — the Centre's own tables (RBI/NSO), ranked as
 * published. Metric picker + year picker + full ranked table with AP marked,
 * plus AP's rank in every year as clickable chips. Nothing is computed
 * beyond sorting a published column; a dash is a gap the Centre left.
 */
/**
 * "See this as charts" — an inline reveal that draws the same verified table
 * as charts. Nothing new is asserted: the chart components read the exact
 * rows the table shows.
 */
function ChartsPanel({ open, children }) {
  if (!open) return null
  return <div className="mb-4 flex flex-col gap-4">{children}</div>
}

function StateLeaderboard({ lb, tip }) {
  const { t, tn } = useT()
  const [mi, setMi] = useState(0)
  const [fySel, setFySel] = useState(null)
  const metric = lb.metrics[mi]
  const years = metric.years

  const lastWithData = (() => {
    for (let i = years.length - 1; i >= 0; i--) {
      if (metric.rows.some(r => r.values[i] != null)) return years[i]
    }
    return years[years.length - 1]
  })()
  const fy = fySel != null && years.includes(fySel) ? fySel : lastWithData
  const yi = years.indexOf(fy)

  const AGG = 'All States and UTs'
  const fmtVal = v => (v == null ? '—'
    : metric.key === 'per_capita' ? `₹${fmtIN(v)}`
      : metric.key === 'gsdp' ? fmtCr(v, t)
        : `${v}%`)

  const ranked = metric.rows
    .filter(r => r.state !== AGG)
    .map(r => ({ state: r.state, v: r.values[yi] }))
    .filter(r => r.v != null)
    .sort((a, b) => (metric.higher_is === 'lower' ? a.v - b.v : b.v - a.v))
  const missing = metric.rows.filter(r => r.state !== AGG && r.values[yi] == null).length
  const aggRow = metric.rows.find(r => r.state === AGG)
  const apRank = ranked.findIndex(r => r.state === 'Andhra Pradesh') + 1
  const apVal = ranked.find(r => r.state === 'Andhra Pradesh')?.v

  const apRankOf = i => {
    const col = metric.rows.filter(r => r.state !== AGG).map(r => ({ s: r.state, v: r.values[i] })).filter(r => r.v != null)
    col.sort((a, b) => (metric.higher_is === 'lower' ? a.v - b.v : b.v - a.v))
    const k = col.findIndex(r => r.s === 'Andhra Pradesh')
    return k < 0 ? null : { rank: k + 1, of: col.length, v: col[k].v }
  }

  const stage = y => metric.stage_labels?.[String(y)]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('governments.leaderboard.pickMeasure')}>
        {lb.metrics.map((m, i) => (
          <button key={m.key} role="tab" aria-selected={i === mi} onClick={() => setMi(i)}
            className={`text-label-md px-3 py-1.5 rounded-full border ${i === mi ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-label-sm text-on-surface-variant max-w-4xl">
        <InfoTip tip={tip} text={metric.explain} />
        <span className="min-w-0">
          <strong className="text-on-surface">{metric.label}</strong> · {metric.unit} ·{' '}
          {metric.higher_is === 'lower' ? t('governments.leaderboard.rankedLowest') : t('governments.leaderboard.rankedHighest')}
          {metric.conversion_note ? ` · ${metric.conversion_note}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-1" aria-label={t('governments.leaderboard.pickYear')}>
        {years.map(y => (
          <button key={y} onClick={() => setFySel(y)}
            title={`${fyLabel(t, y)}${stage(y) ? ` · ${stage(y) === 'RE' ? t('hero.stage.re') : t('hero.stage.be')}` : ''}`}
            className={`text-label-sm px-2 py-1 rounded-md border tabular-nums ${y === fy ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {y}{stage(y) && <sup className="ms-0.5">{stage(y)}</sup>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label-md bg-primary/10 text-on-surface font-bold rounded-full px-3 py-1.5">
          {t('governments.leaderboard.apInFy', { fy: fyLabel(t, fy) })}{' '}
          {apRank > 0
            ? `${t('governments.leaderboard.rankOf', { rank: apRank, total: ranked.length })} · ${fmtVal(apVal)}`
            : t('common.notPublished')}
          {stage(fy) ? ` (${stage(fy) === 'RE' ? t('hero.stage.re') : t('governments.leaderboard.beLong')})` : ''}
        </span>
        {aggRow?.values[yi] != null && (
          <span className="text-label-sm text-on-surface-variant">
            {t('governments.leaderboard.allStatesTogether', { value: fmtVal(aggRow.values[yi]) })}
            {metric.key === 'debt_gsdp' ? ` ${t('governments.leaderboard.ofGdp')}` : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto border border-surface-variant/60 rounded-lg">
        <table className="w-full text-label-sm">
          <thead className="sticky top-0 bg-surface-container">
            <tr className="text-start text-on-surface-variant">
              <th className="py-1.5 px-2">#</th>
              <th className="py-1.5 px-2">{t('governments.leaderboard.th.stateUt')}</th>
              <th className="py-1.5 px-2 text-end">{metric.unit}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.state} className={`border-t border-surface-variant/40 ${r.state === 'Andhra Pradesh' ? 'bg-primary/10 font-bold text-on-surface' : 'text-on-surface-variant'}`}>
                <td className="py-1 px-2 tabular-nums">{i + 1}</td>
                <td className="py-1 px-2">{r.state}{r.state === 'Andhra Pradesh' ? ' ◀' : ''}</td>
                <td className="py-1 px-2 text-end tabular-nums">{fmtVal(r.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing > 0 && (
        <p className="text-label-sm text-outline -mt-1">
          {tn('governments.leaderboard.missing', missing)}
        </p>
      )}

      <div>
        <p className="text-label-md font-bold text-on-surface mb-1">{t('governments.leaderboard.apRankEveryYear')} <span className="font-normal text-on-surface-variant">{t('governments.leaderboard.clickYear')}</span></p>
        <div className="flex flex-wrap gap-1">
          {years.map((y, i) => {
            const r = apRankOf(i)
            return (
              <button key={y} onClick={() => setFySel(y)} disabled={!r}
                title={r
                  ? t('governments.leaderboard.yearRankTitle', { fy: fyLabel(t, y), rank: r.rank, total: r.of, value: fmtVal(r.v) })
                  : t('common.notPublished')}
                className={`text-label-sm px-2 py-1 rounded-md border tabular-nums ${y === fy ? 'border-primary text-primary font-bold' : 'border-outline-variant text-on-surface-variant'} ${!r ? 'opacity-40' : 'hover:bg-surface-container'}`}>
                {String(y).slice(2)}:{r ? `#${r.rank}` : '—'}
              </button>
            )
          })}
        </div>
      </div>

      {metric.anomaly_note && <p className="text-label-sm text-outline max-w-4xl">{metric.anomaly_note}</p>}
      <p className="text-label-sm text-on-surface-variant max-w-4xl">{lb.backseries_note}</p>
      <p className="text-label-sm pt-2 border-t border-dashed border-surface-variant">
        <span className="text-on-surface-variant">{t('governments.leaderboard.officialTable')} </span>
        <a className="text-primary" href={metric.source.url} target="_blank" rel="noreferrer">{metric.source.title} ↗</a>
        <span className="text-on-surface-variant"> — {metric.source.publication}</span>
      </p>
    </div>
  )
}

/**
 * One state's full report card: pick any state, see every year of its
 * income / GSDP / debt with its rank among the states that published, plus
 * every score the Centre's own institutions gave it in the index tables we
 * hold. Pure re-arrangement of the same verified tables — nothing new is
 * asserted, and a dash stays a dash.
 */
function StateProfile({ lb, rankings, data, tip }) {
  const { t } = useT()
  const AGG = 'All States and UTs'
  const [st, setSt] = useState('Andhra Pradesh')

  const states = [...new Set(lb.metrics.flatMap(m => m.rows.map(r => r.state)))]
    .filter(s => s !== AGG).sort()

  // value + rank of `state` for metric m in its year-index i
  const cellOf = (m, state, i) => {
    const col = m.rows.filter(r => r.state !== AGG)
      .map(r => ({ s: r.state, v: r.values[i] })).filter(r => r.v != null)
    col.sort((a, b) => (m.higher_is === 'lower' ? a.v - b.v : b.v - a.v))
    const k = col.findIndex(r => r.s === state)
    return k < 0 ? null : { v: col[k].v, rank: k + 1, of: col.length }
  }
  const fmtM = (m, v) => (m.key === 'per_capita' ? `₹${fmtIN(v)}` : m.key === 'gsdp' ? fmtCr(v, t) : `${v}%`)

  const allYears = [...new Set(lb.metrics.flatMap(m => m.years))].sort((a, b) => b - a)
  const rows = allYears.map(y => ({
    y,
    cells: lb.metrics.map(m => {
      const i = m.years.indexOf(y)
      return i < 0 ? null : { m, cell: cellOf(m, st, i), stage: m.stage_labels?.[String(y)] }
    }),
  }))

  const latest = lb.metrics.map(m => {
    for (let i = m.years.length - 1; i >= 0; i--) {
      const c = cellOf(m, st, i)
      if (c) return { m, y: m.years[i], c, stage: m.stage_labels?.[String(m.years[i])] }
    }
    return null
  }).filter(Boolean)

  // Every score the Centre's index tables give this state
  const scores = []
  rankings?.indices?.forEach(ix => (ix.editions || []).forEach(ed => {
    const row = ed.all_states?.find(r => r[1] === st)
    if (row) scores.push({ index: ix.name, publisher: ix.publisher, edition: ed.edition, rank: row[0], score: row[2], source: ed.source })
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="sp-state" className="text-label-md font-bold text-on-surface">{t('governments.profile.stateUt')}</label>
        <select id="sp-state" value={st} onChange={e => setSt(e.target.value)}
          className="rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface text-body-md py-1.5 px-3 focus:border-primary outline-none">
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {latest.map(({ m, y, c, stage }) => (
          <div key={m.key} className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{m.label}</p>
            <p className="text-title-md font-bold text-on-surface mt-0.5">{fmtM(m, c.v)}</p>
            <p className="text-label-sm text-on-surface-variant mt-0.5">
              {t('governments.leaderboard.rankOf', { rank: c.rank, total: c.of })} · {fyLabel(t, y)}{stage ? ` (${stage})` : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto border border-surface-variant/60 rounded-lg">
        <table className="w-full text-label-sm">
          <thead className="sticky top-0 bg-surface-container">
            <tr className="text-start text-on-surface-variant">
              <th className="py-1.5 px-2">{t('governments.profile.thFyEnding')}</th>
              {lb.metrics.map(m => <th key={m.key} className="py-1.5 px-2 text-end">{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.y} className="border-t border-surface-variant/40 text-on-surface-variant">
                <td className="py-1 px-2 tabular-nums">{r.y}{r.cells.some(c => c?.stage) ? <sup className="ms-0.5">{r.cells.find(c => c?.stage)?.stage}</sup> : ''}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className="py-1 px-2 text-end tabular-nums">
                    {c?.cell ? <>{fmtM(c.m, c.cell.v)} <span className="text-outline">#{c.cell.rank}</span></> : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-label-sm text-on-surface-variant -mt-2">
        {t('governments.profile.rankNote')}
      </p>

      <div>
        <p className="text-label-md font-bold text-on-surface mb-1">{t('governments.profile.scoredHeading', { state: st })}</p>
        {scores.length ? (
          <ul className="flex flex-col gap-1.5 max-w-4xl">
            {scores.map((s, i) => (
              <li key={i} className="text-body-md text-on-surface">
                {s.index} ({s.publisher}), {s.edition}: {t('governments.profile.rankWord')} <strong>#{s.rank}</strong>{s.score != null ? <> · {t('governments.profile.scoreWord')} {s.score}</> : null}{' '}
                {data.sources[s.source] && (
                  <a className="text-label-sm text-primary" href={data.sources[s.source].url} target="_blank" rel="noreferrer">[{data.sources[s.source].short}]</a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-md text-on-surface-variant max-w-4xl">
            {t('governments.profile.noScores', { state: st })}
          </p>
        )}
        <p className="text-label-sm text-on-surface-variant max-w-4xl mt-2 bg-surface-container rounded-lg px-3 py-2">
          {t('governments.profile.cabinetNote')}
        </p>
      </div>
    </div>
  )
}

/**
 * Drill-down for one financial year: asks first, then shows the documented
 * story — the figure's verification stage and every dated event on record.
 */
function YearStory({ point, data, onClose }) {
  const { t } = useT()
  const [confirmed, setConfirmed] = useState(false)
  const notes = data.year_notes?.years?.[String(point.fy_end)]
  const stageChain = [
    { key: 'BE', labelKey: 'governments.yearStory.stage.be' },
    { key: 'RE', labelKey: 'governments.yearStory.stage.re' },
    { key: 'A', labelKey: 'governments.yearStory.stage.a' },
  ]
  if (!confirmed) {
    return (
      <div className="mt-2 border border-outline-variant rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 bg-surface-container">
        <span className="text-body-md text-on-surface">{t('governments.yearStory.openQuestion', { fy: fyLabel(t, point.fy_end) })}</span>
        <button className="rounded-full bg-primary text-on-primary px-4 py-1.5 text-label-md" onClick={() => setConfirmed(true)}>{t('governments.yearStory.yes')}</button>
        <button className="rounded-full border border-outline-variant px-4 py-1.5 text-label-md text-on-surface-variant" onClick={onClose}>{t('governments.yearStory.notNow')}</button>
      </div>
    )
  }
  return (
    <div className="mt-2 border border-outline-variant rounded-xl p-4 bg-surface-container flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h4 className="text-title-md font-bold text-on-surface min-w-0">{t('governments.yearStory.heading', { fy: fyLabel(t, point.fy_end), amount: fmtCr(point.value, t) })}</h4>
        <button onClick={onClose} aria-label={t('common.close')} className="ms-auto w-7 h-7 rounded-full border border-outline-variant text-on-surface-variant shrink-0">✕</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {stageChain.map(sc => (
          <span key={sc.key} className={`text-label-sm px-2.5 py-1 rounded-full border ${point.stage === sc.key ? 'bg-primary text-on-primary border-primary font-bold' : 'border-outline-variant text-on-surface-variant'}`}>
            {t(sc.labelKey)}
          </span>
        ))}
      </div>
      <p className="text-label-sm text-on-surface-variant max-w-3xl">
        {point.stage === 'A'
          ? t('governments.yearStory.explain.a')
          : point.stage === 'RE'
            ? t('governments.yearStory.explain.re')
            : t('governments.yearStory.explain.be')}
      </p>
      <div>
        <p className="text-label-md font-bold text-on-surface mb-1">{t('governments.yearStory.onRecord')}</p>
        {notes?.events?.length ? (
          <ul className="flex flex-col gap-1.5">
            {notes.events.map((ev, i) => (
              <li key={i} className="text-body-md text-on-surface">
                {ev.text}{' '}
                <a className="text-label-sm text-primary" href={data.sources[ev.source]?.url} target="_blank" rel="noreferrer">
                  [{data.sources[ev.source]?.short || t('common.source')}]
                </a>
                {data.sources[ev.source]?.pdf && (
                  <a className="text-label-sm text-primary font-bold ms-1" href={data.sources[ev.source].pdf} target="_blank" rel="noreferrer">PDF↓</a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-md text-on-surface-variant">
            {t('governments.yearStory.noExplanation')}
          </p>
        )}
      </div>
    </div>
  )
}

export default function Governments() {
  const { t } = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  // Four views of the same subject, kept in the URL like the Projects and
  // Investments pages: /governments (overview), ?view=tenures (each
  // government's record), ?view=states (AP among states), ?view=sources.
  const view = ['tenures', 'states', 'sources'].includes(searchParams.get('view'))
    ? searchParams.get('view')
    : 'overview'
  const setView = next => {
    const q = new URLSearchParams(searchParams)
    if (next === 'overview') q.delete('view')
    else q.set('view', next)
    setSearchParams(q)
  }
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)  // phone-only intro clamp
  const [yearPoint, setYearPoint] = useState(null)
  const [records, setRecords] = useState(null)
  const tip = useChartTip()
  // Which sections are currently showing their chart view (toggled from the header link)
  const [charts, setCharts] = useState({})
  const flipCharts = k => setCharts(c => ({ ...c, [k]: !c[k] }))

  useEffect(() => {
    apiGet('/governments/').then(d => { setData(d); setError(null) }).catch(setError)
    Promise.all([apiGet('/projects/by-tenure'), apiGet('/mous/by-tenure')])
      .then(([p, m]) => setRecords({ projects: p, mous: m }))
      .catch(() => setRecords({}))
  }, [])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10"><p className="text-body-md text-on-surface">{t('governments.errorServer', { message: error.message })}</p></div>
  if (!data) return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('governments.loading')}</div>

  const sp = data.spending

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-4">
      <header className="flex flex-col gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface min-w-0">{t('governments.title')}</h1>
          <button
            onClick={() => setAdvancedOpen(true)}
            className="ms-auto inline-flex items-center gap-2 rounded-full border border-outline-variant px-4 py-2 text-label-md text-primary hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">insights</span>
            {t('governments.advancedCharts')}
          </button>
        </div>
        <p className={`text-body-md text-on-surface leading-relaxed max-w-3xl ${introOpen ? '' : 'line-clamp-2 lg:line-clamp-none'}`}>
          {t('governments.intro')}
        </p>
        <button type="button" onClick={() => setIntroOpen(o => !o)}
          className="lg:hidden self-start -mt-2 text-label-md font-bold text-primary" aria-expanded={introOpen}>
          {introOpen ? t('common.showLess') : t('common.readMore')} {introOpen ? '▴' : '▾'}
        </button>
        <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-4 py-2.5 max-w-3xl">
          <span className="inline-block w-3 h-3 rounded-sm me-1 align-middle" style={{ background: TENURE_TINT.tdp1 }} /> {t('governments.legend.tdp1')} ·
          <span className="inline-block w-3 h-3 rounded-sm mx-1 align-middle" style={{ background: TENURE_TINT.ysrcp }} /> {t('governments.legend.ysrcp')} ·
          <span className="inline-block w-3 h-3 rounded-sm mx-1 align-middle" style={{ background: TENURE_TINT.tdp2 }} /> {t('governments.legend.tdp2')}
          {' '}{data.boundary_note}
        </p>
      </header>

      <nav className="border-b border-surface-variant sticky top-16 z-30 bg-surface -mx-4 px-4 lg:static lg:mx-0 lg:px-0 relative" aria-label={t('governments.views.aria')}>
        {/* fade hint: the fourth tab sits off-screen on phones */}
        <div className="lg:hidden pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" />
        <div className="flex gap-1 overflow-x-auto">
          {[
            { k: 'overview', label: t('governments.views.overview') },
            { k: 'tenures', label: t('governments.views.tenures') },
            { k: 'states', label: t('governments.views.states') },
            { k: 'sources', label: t('governments.views.sources') },
          ].map(tab => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setView(tab.k)}
              aria-current={view === tab.k ? 'page' : undefined}
              className={[
                'px-4 py-3 text-label-lg font-label-lg border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                view === tab.k
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {view === 'overview' && (
        <>
      <HeadToHead data={data} records={records} tip={tip} />

      <Collapse
        title={t('governments.sections.capital.title')}
        takeaway={t('governments.sections.capital.takeaway')}
        info={<InfoTip tip={tip} text={`${data.glossary?.capital} ${data.glossary?.verify || ''}`} />}
        defaultOpen
      >
        <TenureColumns tip={tip} points={sp.capital_outlay.points} onBarClick={p => setYearPoint(p)} />
        {yearPoint && <YearStory point={yearPoint} data={data} onClose={() => setYearPoint(null)} />}
        <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">
          {rich(t('governments.sections.capital.note'))}
        </p>
        <SourceChips data={data} keys={sp.capital_outlay.sources} />
      </Collapse>

      <Collapse
        title={t('governments.sections.social.title')}
        takeaway={t('governments.sections.social.takeaway')}
        info={<InfoTip tip={tip} text={data.glossary?.schemes} />}
      >
        <TenureColumns tip={tip} points={sp.social_sector.points} />
        <SourceChips data={data} keys={sp.social_sector.sources} />
      </Collapse>

      <Collapse
        title={t('governments.sections.eduHealth.title')}
        takeaway={t('governments.sections.eduHealth.takeaway')}
        info={<InfoTip tip={tip} text={data.glossary?.sector} />}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div><p className="text-label-md font-bold text-on-surface mb-1">{t('governments.sections.eduHealth.education')}</p>
            <TenureColumns tip={tip} points={sp.education_share.points} unit="%" height={130} /></div>
          <div><p className="text-label-md font-bold text-on-surface mb-1">{t('governments.sections.eduHealth.health')}</p>
            <TenureColumns tip={tip} points={sp.health_share.points} unit="%" height={130} /></div>
        </div>
        <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">
          {t('governments.sections.eduHealth.note')}
        </p>
        <SourceChips data={data} keys={[...sp.education_share.sources, ...sp.health_share.sources]} />
      </Collapse>

      <Collapse
        title={t('governments.sections.committed.title')}
        takeaway={t('governments.sections.committed.takeaway')}
        info={<InfoTip tip={tip} text={data.glossary?.committed} />}
      >
        <TenureColumns tip={tip} points={sp.committed_pct.points} unit="%" height={140} />
        <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">
          {t('governments.sections.committed.note')}
        </p>
        <SourceChips data={data} keys={sp.committed_pct.sources} />
      </Collapse>
      {data.economy?.per_capita_nsdp && (
        <Collapse
          title={t('governments.sections.economy.title')}
          takeaway={t('governments.sections.economy.takeaway')}
          info={<InfoTip tip={tip} text={data.glossary?.economy} />}
        >
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-label-md font-bold text-on-surface mb-1">{data.economy.per_capita_nsdp.label}</p>
              <TenureColumns tip={tip} points={data.economy.per_capita_nsdp.points} unit="₹" height={150} />
              <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">{data.economy.per_capita_nsdp.note}</p>
              <SourceChips data={data} keys={data.economy.per_capita_nsdp.sources} />
            </div>
            <div>
              <p className="text-label-md font-bold text-on-surface mb-1">{data.economy.revenue_receipts.label}</p>
              <TenureColumns tip={tip} points={data.economy.revenue_receipts.points} height={150} />
              <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">{data.economy.revenue_receipts.note}</p>
              <SourceChips data={data} keys={data.economy.revenue_receipts.sources} />
            </div>
            <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl">{data.economy.own_tax_note}</p>
          </div>
        </Collapse>
      )}
        </>
      )}

      {view === 'tenures' && (
        <>
      <h2 className="text-headline-sm font-headline-sm font-bold text-on-surface inline-flex items-center gap-2 mt-3">
        {t('governments.eachGovernment')} <InfoTip tip={tip} text={data.glossary?.tenure} />
      </h2>

      {data.tenures.map(tenure => (
        <Collapse
          key={tenure.key}
          tint={TENURE_TINT[tenure.key]}
          title={`${tenure.party} — ${tenure.cm}`}
          takeaway={t('governments.tenure.takeaway', {
            from: tenure.from,
            to: tenure.to || t('governments.tenure.today'),
            capital: tenure.capital_outlay_total != null ? fmtCr(tenure.capital_outlay_total, t) : t('governments.tenure.auditPending'),
          })}
        >
          <TenureBody t={tenure} data={data} tip={tip} records={records} />
        </Collapse>
      ))}
      {data.awards?.items?.length > 0 && (
        <Collapse
          title={t('governments.sections.awards.title')}
          takeaway={t('governments.sections.awards.takeaway', { count: data.awards.items.length })}
          info={<InfoTip tip={tip} text={data.glossary?.awards_g} />}
        >
          <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl mb-3">{data.awards.intro}</p>
          <ol className="flex flex-col gap-2.5 max-w-4xl">
            {[...data.awards.items].sort((a, b) => b.date.localeCompare(a.date)).map(aw => (
              <li key={aw.date + aw.text.slice(0, 16)} className="flex gap-3">
                <span className="text-label-sm tabular-nums text-on-surface-variant whitespace-nowrap pt-0.5 w-24">{aw.date}</span>
                <span className="text-body-md text-on-surface min-w-0">
                  {aw.text}{' '}
                  <a className="text-label-sm text-primary" href={aw.url} target="_blank" rel="noreferrer">[{aw.publisher}]</a>
                </span>
              </li>
            ))}
          </ol>
        </Collapse>
      )}
        </>
      )}

      {view === 'states' && (
        <>
      {data.rankings?.indices?.length > 0 && (
        <Collapse
          title={t('governments.sections.rankings.title')}
          takeaway={t('governments.sections.rankings.takeaway')}
          info={<InfoTip tip={tip} text={data.glossary?.rankings} />}
          actionLabel={charts.rankings ? t('common.hideCharts') : t('common.seeCharts')}
          onAction={() => flipCharts('rankings')}
        >
          <ChartsPanel open={charts.rankings}>
            <IndexScorecards rankings={data.rankings} data={data} tip={tip} />
          </ChartsPanel>
          <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl mb-3">{data.rankings.intro}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {data.rankings.indices.map(ix => <IndexCard key={ix.name} ix={ix} data={data} />)}
          </div>

        </Collapse>
      )}

      {data.state_leaderboards?.metrics?.length > 0 && (
        <Collapse
          title={t('governments.sections.leaderboards.title')}
          takeaway={t('governments.sections.leaderboards.takeaway')}
          info={<InfoTip tip={tip} text={data.glossary?.leaderboards} />}
          actionLabel={charts.leaderboards ? t('common.hideCharts') : t('common.seeCharts')}
          onAction={() => flipCharts('leaderboards')}
        >
          <ChartsPanel open={charts.leaderboards}>
            <RankChart lb={data.state_leaderboards} tip={tip} />
            <CompareChart lb={data.state_leaderboards} tip={tip} />
          </ChartsPanel>
          <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 max-w-4xl mb-3">
            {data.state_leaderboards.intro}
          </p>
          <StateLeaderboard lb={data.state_leaderboards} tip={tip} />

        </Collapse>
      )}

      {data.state_leaderboards?.metrics?.length > 0 && (
        <Collapse
          title={t('governments.sections.profile.title')}
          takeaway={t('governments.sections.profile.takeaway')}
          info={<InfoTip tip={tip} text={data.glossary?.leaderboards} />}
          actionLabel={charts.profile ? t('common.hideCharts') : t('common.seeCharts')}
          onAction={() => flipCharts('profile')}
        >
          <ChartsPanel open={charts.profile}>
            <CompareChart lb={data.state_leaderboards} tip={tip} />
          </ChartsPanel>
          <StateProfile lb={data.state_leaderboards} rankings={data.rankings} data={data} tip={tip} />

        </Collapse>
      )}
        </>
      )}

      {view === 'sources' && (
        <>
      <Collapse title={t('governments.sources.allTitle')} takeaway={t('governments.sources.takeaway', { count: Object.keys(data.sources).length })}>
        <ul className="text-label-sm text-on-surface-variant flex flex-col gap-1">
          {Object.entries(data.sources).map(([k, s]) => (
            <li key={k}>
              <a className="text-primary" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
              {' '}— {s.publisher}, {s.date}{s.pdf && <> · <a className="text-primary font-bold" href={s.pdf} target="_blank" rel="noreferrer">PDF↓</a></>}
            </li>
          ))}
        </ul>
        <p className="text-label-sm text-on-surface-variant max-w-3xl mt-2">{t('governments.sources.correction')}</p>
      </Collapse>
        </>
      )}

      <PageThread pageKey="governments" />

      <AdvancedGovernments open={advancedOpen} onClose={() => setAdvancedOpen(false)} data={data} />
      {tip.node}
    </div>
  )
}
