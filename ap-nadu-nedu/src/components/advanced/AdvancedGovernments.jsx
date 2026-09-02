import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import {
  VizSection, useChartTip, fmtIN, DonutChart, LineOverlay,
} from './ChartPrimitives'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TENURE_TINT } from '../../lib/tenure'

/**
 * Advanced charts for the Governments section. The main page keeps only the
 * essential year-by-year columns; everything comparative and compositional
 * lives here: tenure-aligned line overlays (year 1..5 of each government on
 * one axis), donuts of each tenure's scheme mix (labeled as own claims),
 * education-vs-health slices, and the full data table.
 */


// Units and the "not published" fallback are catalogue strings, so `t` is passed in.
const fmtCr = (t, v) => (v == null
  ? t('common.notPublished')
  : v >= 100000
    ? `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
    : `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`)

export default function AdvancedGovernments({ open, onClose, data }) {
  const { t } = useT()
  const dialogRef = useRef(null)
  const tip = useChartTip()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  if (!data) return null
  const sp = data.spending

  // "TDP 2014–19" — party names come from the data, only "now" is ours.
  const tenureName = ten => `${ten.party} ${ten.from.slice(0, 4)}–${ten.to ? ten.to.slice(2, 4) : t('advGovernments.now')}`

  // Tenure-aligned series: x = year N of the tenure (0-indexed)
  const aligned = key => data.tenures.map(ten => ({
    label: tenureName(ten),
    color: TENURE_TINT[ten.key],
    points: sp[key].points
      .filter(p => p.fy_end >= ten.fy_span[0] && p.fy_end <= ten.fy_span[1])
      .map(p => ({
        x: p.fy_end - ten.fy_span[0],
        value: p.value,
        note: t('advGovernments.fyEndingStage', {
          year: p.fy_end,
          stage: p.stage === 'A' ? t('advGovernments.actual') : p.stage,
        }),
      })),
  }))

  const yearLabels = [1, 2, 3, 4, 5].map(n => t('advGovernments.yearN', { n }))

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-2xl p-0 w-[min(920px,calc(100vw-24px))] max-h-[calc(100vh-48px)] bg-surface backdrop:bg-black/45"
      aria-label={t('advGovernments.dialogAria')}
    >
      <div className="sticky top-0 bg-surface z-10 flex justify-between items-center px-6 pt-5 pb-3 border-b border-surface-variant">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{t('advGovernments.title')}</h2>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wide mt-0.5">
            {t('advGovernments.subtitle')}
          </p>
        </div>
        <button onClick={onClose} aria-label={t('common.close')}
          className="w-9 h-9 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0">✕</button>
      </div>

      <div className="px-6 py-5 flex flex-col gap-5">
        <VizSection
          title={t('advGovernments.viz.capital.title')}
          sub={t('advGovernments.viz.capital.sub')}
          provenance={t('advGovernments.viz.capital.provenance')}
        >
          <LineOverlay tip={tip} xLabels={yearLabels} unit={t('unit.crore')} seriesList={aligned('capital_outlay')} />
        </VizSection>

        <VizSection
          title={t('advGovernments.viz.social.title')}
          sub={t('advGovernments.viz.social.sub')}
          provenance={t('advGovernments.viz.social.provenance')}
        >
          <LineOverlay tip={tip} xLabels={yearLabels} unit={t('unit.crore')} seriesList={aligned('social_sector')} />
        </VizSection>

        <VizSection
          title={t('advGovernments.viz.schemes.title')}
          sub={t('advGovernments.viz.schemes.sub')}
          provenance={t('advGovernments.viz.schemes.provenance')}
        >
          <div className="grid md:grid-cols-2 gap-6">
            {data.tenures.map(ten => {
              const withSpend = ten.schemes.filter(s => s.spend_claim_crore != null)
              if (!withSpend.length) return null
              const top6 = [...withSpend].sort((a, b) => b.spend_claim_crore - a.spend_claim_crore).slice(0, 6)
              const rest = withSpend.slice(6).reduce((s, x) => s + x.spend_claim_crore, 0)
              const slices = top6.map(s => ({ label: s.name, value: s.spend_claim_crore }))
              if (rest > 0) slices.push({ label: t('advGovernments.otherSchemes'), value: rest, color: '#c3c2b7' })
              const total = withSpend.reduce((s, x) => s + x.spend_claim_crore, 0)
              return (
                <div key={ten.key} className="min-w-0">
                  <p className="text-label-md font-bold text-on-surface mb-1">
                    {t('advGovernments.tenureClaimedTotal', { tenure: tenureName(ten), amount: fmtCr(t, total) })}
                  </p>
                  <DonutChart tip={tip} unit={t('unit.crore')} slices={slices} centerLabel={fmtCr(t, total).replace('₹', '')} />
                </div>
              )
            })}
          </div>
          <p className="text-label-sm text-on-surface-variant mt-2 max-w-3xl">
            {t('advGovernments.readWithCare')}
          </p>
        </VizSection>

        <VizSection
          title={t('advGovernments.viz.eduHealth.title')}
          sub={t('advGovernments.viz.eduHealth.sub')}
          provenance={t('advGovernments.viz.eduHealth.provenance')}
        >
          <LineOverlay tip={tip} xLabels={yearLabels} unit="%" height={160}
            seriesList={aligned('education_share').map(s => ({ ...s, label: t('advGovernments.seriesEducation', { label: s.label }) }))} />
          <LineOverlay tip={tip} xLabels={yearLabels} unit="%" height={160}
            seriesList={aligned('health_share').map(s => ({ ...s, label: t('advGovernments.seriesHealth', { label: s.label }) }))} />
        </VizSection>

        <details className="text-label-md">
          <summary className="text-primary cursor-pointer">{t('advGovernments.table.summary')}</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-label-sm">
              <thead>
                <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                  <th className="py-1.5 pe-3">{t('advGovernments.table.fyEnding')}</th>
                  <th className="py-1.5 pe-3 text-end">{t('advGovernments.table.capitalOutlay')}</th>
                  <th className="py-1.5 pe-3 text-end">{t('advGovernments.table.socialSector')}</th>
                  <th className="py-1.5 pe-3 text-end">{t('advGovernments.table.educationPct')}</th>
                  <th className="py-1.5 pe-3 text-end">{t('advGovernments.table.healthPct')}</th>
                  <th className="py-1.5 text-end">{t('advGovernments.table.committedPct')}</th>
                </tr>
              </thead>
              <tbody>
                {sp.capital_outlay.points.map(p => {
                  const g = k => sp[k].points.find(x => x.fy_end === p.fy_end)
                  const cell = pt => (pt ? `${fmtIN(pt.value)}${pt.stage !== 'A' ? ` (${pt.stage})` : ''}` : '—')
                  return (
                    <tr key={p.fy_end} className="border-b border-surface-variant/60">
                      <td className="py-1 pe-3 tabular-nums">{p.fy_end}</td>
                      <td className="py-1 pe-3 text-end tabular-nums">{cell(p)}</td>
                      <td className="py-1 pe-3 text-end tabular-nums">{cell(g('social_sector'))}</td>
                      <td className="py-1 pe-3 text-end tabular-nums">{cell(g('education_share'))}</td>
                      <td className="py-1 pe-3 text-end tabular-nums">{cell(g('health_share'))}</td>
                      <td className="py-1 text-end tabular-nums">{cell(g('committed_pct'))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      {tip.node}
    </dialog>
  )
}
