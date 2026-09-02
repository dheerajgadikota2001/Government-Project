import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import { VizSection, useChartTip } from './advanced/ChartPrimitives'
import AllDemands from './AllDemands'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TINT } from '../lib/tenure'

const TENURES = ['tdp1', 'ysrcp', 'tdp2']

/** Bold markers inside one translated sentence, so translators get whole sentences. */
function rich(str) {
  return String(str)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-bold text-on-surface">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    )
}

/**
 * Capital outlay by year for one demand.
 *
 * Three stages of the same year exist in the volumes and they mean different
 * things, so they are drawn differently rather than blended: the audited actual
 * is solid, the revised estimate is lighter, the budget estimate is an outline.
 * A year with no audited actual yet is not a year with no spending.
 */
function CapitalYears({ rows, tip, t, fmtCr }) {
  const byYear = new Map()
  for (const r of rows) {
    if (r.capital_crore == null) continue
    if (!byYear.has(r.year)) byYear.set(r.year, { year: r.year, tenure: r.tenure })
    byYear.get(r.year)[r.stage] = r
  }
  const years = [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year))
  if (!years.length) return null

  const max = Math.max(
    ...years.flatMap(y => ['Actual', 'RE', 'BE'].map(s => y[s]?.capital_crore || 0)),
    1
  )
  const W = 940
  const H = 300
  const L = 74
  const R = 14
  const T = 22
  const B = 58
  const colW = (W - L - R) / years.length

  const stageStyle = {
    Actual: { fill: null, opacity: 1, dash: null },
    RE: { fill: null, opacity: 0.45, dash: null },
    BE: { fill: 'none', opacity: 1, dash: '3 3' },
  }

  return (
    <div className="overflow-x-auto" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[680px]" role="img"
        aria-label={t('depts.chartAria')}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = T + (H - T - B) * (1 - f)
          return (
            <g key={f}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={L - 8} y={y + 4} textAnchor="end" fontSize="11.5" className="fill-outline"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(max * f).toLocaleString('en-IN')}
              </text>
            </g>
          )
        })}

        {years.map((yr, i) => {
          const x = L + i * colW
          const stages = ['BE', 'RE', 'Actual'].filter(s => yr[s])
          const bw = Math.min(17, (colW - 14) / Math.max(1, stages.length))
          const groupW = bw * stages.length
          const x0 = x + (colW - groupW) / 2
          const tint = TINT[yr.tenure] || '#9b9992'
          return (
            <g key={yr.year}>
              {stages.map((s, j) => {
                const v = yr[s].capital_crore
                const h = Math.max(1.5, ((H - T - B) * v) / max)
                const st = stageStyle[s]
                return (
                  <g key={s}>
                    <rect
                      x={x0 + j * bw} y={H - B - h} width={bw - 2} height={h}
                      fill={st.fill === 'none' ? 'none' : tint}
                      fillOpacity={st.opacity}
                      stroke={st.fill === 'none' ? tint : 'none'}
                      strokeWidth={st.fill === 'none' ? 1.2 : 0}
                      strokeDasharray={st.dash || undefined}
                      rx="2"
                      tabIndex={0}
                      className="cursor-pointer outline-primary"
                      onPointerMove={e =>
                        tip.show(e, `${yr.year} · ${t(`depts.stage.${s.toLowerCase()}`)}`, fmtCr(v),
                          t('depts.tipRevenue', { rev: fmtCr(yr[s].revenue_crore) }))}
                      onPointerLeave={tip.hide}
                      onFocus={e =>
                        tip.show(e, `${yr.year} · ${t(`depts.stage.${s.toLowerCase()}`)}`, fmtCr(v))}
                      onBlur={tip.hide}
                    />
                    {s === 'Actual' && (
                      <text x={x0 + j * bw + (bw - 2) / 2} y={H - B - h - 5} textAnchor="middle"
                        fontSize="10.5" fontWeight="700" className="fill-on-surface"
                        style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(v).toLocaleString('en-IN')}
                      </text>
                    )}
                  </g>
                )
              })}
              <text x={x + colW / 2} y={H - B + 16} textAnchor="middle" fontSize="11"
                className="fill-on-surface-variant" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {yr.year.slice(2)}
              </text>
              <rect x={x + 4} y={H - B + 24} width={colW - 8} height={4} fill={tint} rx="2" opacity="0.7" />
            </g>
          )
        })}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#c3c2b7" strokeWidth="1" />
        <text x={L} y={12} fontSize="11.5" className="fill-on-surface-variant">{t('unit.rupeeCrore')}</text>
      </svg>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2 px-1">
        {['actual', 're', 'be'].map(s => (
          <span key={s} className="inline-flex items-center gap-1.5 text-label-sm text-on-surface-variant">
            <span
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              style={
                s === 'be'
                  ? { border: '1.4px dashed #6b6a63' }
                  : { background: '#6b6a63', opacity: s === 're' ? 0.45 : 1 }
              }
            />
            {t(`depts.stage.${s}`)} — {t(`depts.stageWhat.${s}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Per-government comparison. Terms differ in length, so the average per year leads. */
function TenureCompare({ s, t, fmtCr }) {
  const rows = TENURES.map(k => ({ k, ...s.by_tenure[k] })).filter(r => r.years_with_actual > 0)
  const max = Math.max(...rows.map(r => r.annual_mean_capital_crore || 0), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <div key={r.k} className="flex items-center gap-3">
          <span className="text-label-md text-on-surface w-[30%] min-w-0 shrink-0 break-words"
            style={{ borderInlineStart: `3px solid ${TINT[r.k]}`, paddingInlineStart: '8px' }}>
            {t(`depts.tenure.${r.k}`)}
          </span>
          <span className="flex-1 h-6 bg-surface-container rounded-sm overflow-hidden">
            <span className="block h-full rounded-sm"
              style={{ width: `${Math.max(2, (r.annual_mean_capital_crore / max) * 100)}%`, background: TINT[r.k] }} />
          </span>
          <span className="text-label-md tabular-nums font-bold text-on-surface w-[112px] shrink-0 text-end">
            {fmtCr(r.annual_mean_capital_crore)}
          </span>
        </div>
      ))}
      <p className="text-label-sm text-on-surface-variant">
        {t('depts.perYearNote')}
      </p>
      <ul className="text-label-sm text-on-surface-variant flex flex-col gap-0.5">
        {rows.filter(r => r.years_missing.length > 0).map(r => (
          <li key={r.k}>
            {t('depts.missingYears', {
              tenure: t(`depts.tenure.${r.k}`),
              years: r.years_missing.join(', '),
              have: r.years_with_actual,
              total: r.years_in_tenure,
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Department-wise capital spending.
 *
 * The state-wide capital outlay total says nothing about whether money went
 * into school buildings. The Demands for Grants volumes do, because the budget
 * is voted department by department. This is that detail, with the volume and
 * column behind every figure.
 */
export default function DepartmentSpending() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const tip = useChartTip()

  const fmtCr = v =>
    v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} ${t('unit.crore')}`

  useEffect(() => {
    let alive = true
    apiGet('/finances/departments')
      .then(d => alive && setData(d))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [])

  if (err || !data) return null

  const caveatFor = demand =>
    data.caveats.filter(c => c.applies_to?.includes(demand) && c.severity !== 'low')

  return (
    <section id="departments" className="scroll-mt-20 flex flex-col gap-4">
      {tip.node}

      <header className="flex flex-col gap-2">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">{t('depts.title')}</h2>
        <p className="text-body-md text-on-surface-variant max-w-[70ch]">{t('depts.intro')}</p>
      </header>

      <details className="border border-surface-variant rounded-xl bg-surface-container-lowest">
        <summary className="cursor-pointer px-4 py-3 text-label-md font-bold text-on-surface">
          {data.how_to_read.title}
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <p className="text-body-md text-on-surface-variant max-w-[75ch]">{data.how_to_read.body}</p>
          <p className="text-label-sm text-outline max-w-[75ch]">{data.how_to_read.units_note}</p>
        </div>
      </details>

      {/* Full detail only where an audited outturn exists. The other thirty-eight
          demands are budget estimates alone and are served by the picker below,
          because forty full charts on one page would be unreadable and would also
          imply we know more about those departments than we do. */}
      {data.summary.filter(s => s.has_audited_actuals).map(s => {
        const dept = data.departments.find(d => d.demand_no === s.demand_no)
        const caveats = caveatFor(s.demand_no)
        return (
          <VizSection
            key={s.demand_no}
            id={`demand-${s.demand_no}`}
            title={t('depts.demandTitle', { no: s.demand_no, dept: s.department })}
            sub={t('depts.demandSub')}
            provenance={t('depts.provenance')}
          >
            <TenureCompare s={s} t={t} fmtCr={fmtCr} />

            <div className="mt-5">
              <p className="text-label-md font-bold text-on-surface mb-1">{t('depts.yearByYear')}</p>
              <CapitalYears rows={dept.rows} tip={tip} t={t} fmtCr={fmtCr} />
            </div>

            {caveats.map(c => (
              <div key={c.key} className="mt-4 border border-amber-400/60 bg-amber-50/50 rounded-xl p-4">
                <p className="text-label-md font-bold text-on-surface">{c.title}</p>
                <p className="text-body-md text-on-surface-variant mt-1 max-w-[75ch]">{c.body}</p>
                {c.quote && (
                  <p className="text-body-md text-on-surface-variant italic border-s-2 border-surface-variant ps-3 mt-2">
                    “{c.quote}”
                  </p>
                )}
                {c.source_url && (
                  <a href={c.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-label-sm text-primary hover:underline mt-2 inline-block break-words">
                    {c.source_publisher} →
                  </a>
                )}
              </div>
            ))}

            <details className="mt-4 border border-surface-variant rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-label-md text-on-surface">
                {t('depts.everyRow', { count: dept.rows.length })}
              </summary>
              <div className="px-3 pb-3 overflow-x-auto" dir="ltr">
                <table className="w-full min-w-[560px] text-label-md border-collapse">
                  <thead>
                    <tr className="border-b border-surface-variant text-on-surface-variant">
                      {['year', 'stage', 'revenue', 'capital', 'total'].map(h => (
                        <th key={h} className="py-2 pe-3 text-start font-normal">{t(`depts.col.${h}`)}</th>
                      ))}
                      <th className="py-2 text-start font-normal">{t('common.source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dept.rows.map((r, i) => (
                      <tr key={i} className="border-b border-surface-variant/60">
                        <td className="py-1.5 pe-3 tabular-nums">{r.year}</td>
                        <td className="py-1.5 pe-3">{t(`depts.stage.${r.stage.toLowerCase()}`)}</td>
                        <td className="py-1.5 pe-3 tabular-nums">{r.revenue_crore == null ? '—' : fmtCr(r.revenue_crore)}</td>
                        <td className="py-1.5 pe-3 tabular-nums font-bold">{r.capital_crore == null ? '—' : fmtCr(r.capital_crore)}</td>
                        <td className="py-1.5 pe-3 tabular-nums">{r.total_crore == null ? '—' : fmtCr(r.total_crore)}</td>
                        <td className="py-1.5">
                          {r.source_url ? (
                            <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline text-label-sm">{r.page}</a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </VizSection>
        )
      })}

      <AllDemands
        summary={data.summary}
        departments={data.departments}
        note={data.how_to_read.the_honest_limit}
        fmtCr={fmtCr}
      />

      <details className="border border-surface-variant rounded-xl bg-surface-container-lowest">
        <summary className="cursor-pointer px-4 py-3 text-label-md font-bold text-on-surface">
          {t('depts.allDemands', { count: data.demand_map.length })}
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-3">
          <p className="text-label-sm text-on-surface-variant">{data.demand_map_note}</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {data.demand_map.map(d => (
              <li key={d.demand_no} className="text-label-md text-on-surface-variant flex gap-2">
                <span className="tabular-nums text-outline w-[52px] shrink-0 text-end">{d.demand_no}</span>
                <span className="min-w-0 break-words">{d.department}</span>
              </li>
            ))}
          </ol>
        </div>
      </details>

      <p className="text-label-sm text-on-surface-variant">{rich(t('depts.footer'))}</p>
    </section>
  )
}
