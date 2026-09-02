import { useMemo, useState } from 'react'
import { VizSection } from './advanced/ChartPrimitives'
import { useT } from '../i18n'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TINT } from '../lib/tenure'

const TENURES = ['tdp1', 'ysrcp', 'tdp2']

/**
 * All forty demands, as budgeted.
 *
 * Forty full charts on one page would be unreadable, so this is one picker and
 * one department at a time. Everything here is a budget estimate, and the wording
 * says so in every place a figure appears: the audited outturn exists for only two
 * departments and is shown in its own section, never blended into these bars.
 *
 * The capital shading starts in 2017-18 on purpose. Before that the books split
 * each demand into Plan and Non-Plan, which is a different question from Revenue
 * and Capital, so there is nothing to shade and we leave the bar plain rather than
 * invent a split that the source does not contain.
 */
export default function AllDemands({ summary, departments, note, fmtCr }) {
  const { t } = useT()
  const [sel, setSel] = useState(12)

  const ordered = useMemo(
    () => [...summary].sort((a, b) => (a.demand_number || 0) - (b.demand_number || 0)),
    [summary]
  )
  const s = ordered.find(d => d.demand_number === sel) || ordered[0]
  const dept = departments.find(d => d.demand_number === s.demand_number)
  const be = (dept?.rows || []).filter(r => r.stage === 'BE')

  const bars = TENURES.map(k => ({ k, ...s.by_tenure[k] })).filter(r => r.budgeted.years_counted > 0)
  const maxMean = Math.max(...bars.map(r => r.budgeted.annual_mean_crore || 0), 1)
  const maxYear = Math.max(...be.map(r => r.total_crore || 0), 1)

  return (
    <VizSection
      id="all-demands"
      title={t('depts.allTitle')}
      sub={t('depts.allSub')}
      provenance={t('depts.allProvenance')}
    >
      <p className="text-body-md text-on-surface-variant max-w-[75ch] mb-3">{t('depts.allIntro')}</p>

      <label className="flex flex-col gap-1 mb-5">
        <span className="text-label-md text-on-surface-variant">{t('depts.pick')}</span>
        <select
          value={s.demand_number}
          onChange={e => setSel(Number(e.target.value))}
          className="border border-surface-variant rounded-lg bg-surface-container-lowest px-3 py-2 text-label-md text-on-surface max-w-[46ch]"
        >
          {ordered.map(d => (
            <option key={d.demand_number} value={d.demand_number}>
              {d.demand_no} — {d.department}
            </option>
          ))}
        </select>
      </label>

      {/* per-government average, because terms differ in length */}
      <p className="text-label-md font-bold text-on-surface mb-2">{t('depts.perGovBudgeted')}</p>
      <div className="flex flex-col gap-2.5">
        {bars.map(r => (
          <div key={r.k} className="flex items-center gap-3">
            <span
              className="text-label-md text-on-surface w-[30%] min-w-0 shrink-0 break-words"
              style={{ borderInlineStart: `3px solid ${TINT[r.k]}`, paddingInlineStart: '8px' }}
            >
              {t(`depts.tenure.${r.k}`)}
            </span>
            <span className="flex-1 h-6 bg-surface-container rounded-sm overflow-hidden">
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${Math.max(2, ((r.budgeted.annual_mean_crore || 0) / maxMean) * 100)}%`,
                  background: TINT[r.k],
                }}
              />
            </span>
            <span className="text-label-md tabular-nums font-bold text-on-surface w-[112px] shrink-0 text-end">
              {fmtCr(r.budgeted.annual_mean_crore)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-label-sm text-on-surface-variant mt-2">{t('depts.perYearNote')}</p>

      {/* thirteen years, one bar each */}
      <p className="text-label-md font-bold text-on-surface mt-5 mb-1">{t('depts.yearByYearBudgeted')}</p>
      <div className="overflow-x-auto" dir="ltr">
        <svg viewBox="0 0 940 260" className="w-full min-w-[560px]" role="img"
          aria-label={t('depts.yearByYearBudgeted')}>
          {be.map((r, i) => {
            const colW = (940 - 70 - 14) / be.length
            const x = 70 + i * colW
            const h = ((r.total_crore || 0) / maxYear) * 180
            const capH = r.capital_crore != null ? (r.capital_crore / maxYear) * 180 : 0
            return (
              <g key={r.year}>
                <rect x={x + colW * 0.16} y={202 - h} width={colW * 0.68} height={h}
                  fill={TINT[r.tenure]} opacity="0.42" />
                {capH > 0 && (
                  <rect x={x + colW * 0.16} y={202 - capH} width={colW * 0.68} height={capH}
                    fill={TINT[r.tenure]} />
                )}
                <text x={x + colW / 2} y={220} textAnchor="middle"
                  className="fill-on-surface-variant" style={{ fontSize: 10 }}>
                  {r.year.slice(2)}
                </text>
              </g>
            )
          })}
          <line x1="70" y1="202" x2="926" y2="202" stroke="currentColor" opacity="0.25" />
          <text x="70" y="240" className="fill-on-surface-variant" style={{ fontSize: 10 }}>
            {t('depts.capitalLegend')}
          </text>
        </svg>
      </div>
      <p className="text-label-sm text-on-surface-variant">{t('depts.splitStartNote')}</p>

      {!s.has_audited_actuals && (
        <p className="text-label-sm text-on-surface-variant mt-3 border-s-2 border-surface-variant ps-3">
          {t('depts.noAudit')}
        </p>
      )}

      {s.goir_activity && (
        <div className="mt-5">
          <p className="text-label-md font-bold text-on-surface mb-1">{t('depts.ordersTitle')}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {TENURES.map(k => (
              <span key={k} className="text-label-md text-on-surface">
                <span className="text-on-surface-variant">{t(`depts.tenure.${k}`)}: </span>
                <span className="tabular-nums font-bold">
                  {(s.goir_activity.orders_by_tenure[k] || 0).toLocaleString('en-IN')}
                </span>
              </span>
            ))}
          </div>
          <p className="text-label-sm text-on-surface-variant mt-1 max-w-[75ch]">
            {t('depts.ordersNote')}
          </p>
          {s.goir_activity.caveat && (
            <p className="text-label-sm text-on-surface-variant mt-1 max-w-[75ch]">
              {t('depts.sharedNote')}
            </p>
          )}
        </div>
      )}

      {s.name_history && (
        <p className="text-label-sm text-on-surface-variant mt-3">
          {t('depts.renamed', {
            names: s.name_history.map(n => `${n.name} (${n.years})`).join('; '),
          })}
        </p>
      )}

      <details className="mt-4 border border-surface-variant rounded-lg">
        <summary className="cursor-pointer px-3 py-2 text-label-md text-on-surface">
          {t('depts.everyRow', { count: be.length })}
        </summary>
        <div className="px-3 pb-3 overflow-x-auto" dir="ltr">
          <table className="w-full min-w-[560px] text-label-md border-collapse">
            <thead>
              <tr className="border-b border-surface-variant text-on-surface-variant">
                <th className="py-2 pe-3 text-start font-normal">{t('depts.col.year')}</th>
                <th className="py-2 pe-3 text-start font-normal">{t('depts.col.total')}</th>
                <th className="py-2 pe-3 text-start font-normal">{t('depts.col.split')}</th>
                <th className="py-2 text-start font-normal">{t('common.source')}</th>
              </tr>
            </thead>
            <tbody>
              {be.map(r => (
                <tr key={r.year} className="border-b border-surface-variant/60">
                  <td className="py-1.5 pe-3 tabular-nums">{r.year}</td>
                  <td className="py-1.5 pe-3 tabular-nums font-bold">{fmtCr(r.total_crore)}</td>
                  <td className="py-1.5 pe-3 tabular-nums">
                    {r.label_a} {fmtCr(r.a_crore)} · {r.label_b} {fmtCr(r.b_crore)}
                  </td>
                  <td className="py-1.5">
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline text-label-sm">{r.page}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {note && <p className="text-label-sm text-on-surface-variant mt-3 max-w-[75ch]">{note}</p>}
    </VizSection>
  )
}
