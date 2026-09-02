import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { TENURE_COLOR, TENURE_HATCHED, TenureDefs, tenureFill } from '../lib/tenure'
import { fmtIN } from './advanced/ChartPrimitives'

/**
 * "Where does the money go before anything gets built?"
 *
 * A state's revenue receipts are what it earns in a year — its own taxes, its
 * share of central taxes, grants. Interest on debt already taken is the first
 * claim on that money: it is paid whether or not a single new thing is built.
 * So the share of revenue that interest takes is the clearest single measure
 * of how much room a government has left to decide anything.
 *
 * Both charts here come from one table — Form F-1, "Government Finances", in
 * Andhra Pradesh's own Statement of Fiscal Policy, published every year under
 * the state's FRBM Act. Every year is the Accounts (audited) reading except
 * the last, which is a Revised Estimate and is drawn lighter and labelled.
 *
 * The one arithmetic step we take is division: interest ÷ revenue receipts,
 * both printed in the same table of the same book. Nothing is indexed,
 * deflated or adjusted.
 */

const rich = str => String(str).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
  p.startsWith('**') ? <strong key={i} className="text-on-surface">{p.slice(2, -2)}</strong> : p)

const fyShort = fy => `${String(fy - 1).slice(2)}-${String(fy).slice(2)}`

/* ---------------------------------------------- chart 1: interest squeeze */

function InterestShare({ years, tip, t }) {
  const rows = years.filter(y => y.interest_pct_of_revenue != null)
  if (rows.length < 3) return null

  const W = 760, H = 180, PAD_L = 26, PAD_B = 30
  const top = Math.ceil(Math.max(...rows.map(r => r.interest_pct_of_revenue)) / 5) * 5
  const slot = (W - PAD_L) / rows.length
  const bw = Math.min(34, slot - 8)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="min-w-[620px] w-full" role="img"
        aria-label={t('finances.committed.share.aria')}>
        <TenureDefs />
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W} y1={H - H * f} y2={H - H * f}
              stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
            <text x={0} y={H - H * f + 3} className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {Math.round(top * f)}%
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const pct = r.interest_pct_of_revenue
          const h = Math.max(2, (pct / top) * (H - 16))
          const x = PAD_L + i * slot + (slot - bw) / 2
          const est = r.stage !== 'A'
          return (
            <g key={r.fy_end}>
              <rect x={x} y={H - h} width={bw} height={h} rx="2"
                fill={tenureFill(r.tenure)}
                stroke={TENURE_HATCHED.has(r.tenure) ? TENURE_COLOR[r.tenure] : 'none'}
                strokeWidth="1"
                opacity={est ? 0.55 : 1}
                onMouseMove={e => tip.show(e,
                  t('finances.committed.share.tipTitle', { fy: r.fy_label }),
                  t('finances.committed.share.tipBody', {
                    pct: pct.toFixed(1),
                    interest: fmtIN(Math.round(r.interest_payments)),
                    revenue: fmtIN(Math.round(r.revenue_receipts)),
                    stage: est ? ` (${r.stage})` : '',
                  }))}
                onMouseLeave={tip.hide} />
              <text x={x + bw / 2} y={H - h - 5} textAnchor="middle"
                className="text-[10px] font-semibold" fill="currentColor" fillOpacity="0.85">
                {pct.toFixed(0)}
              </text>
              <text x={x + bw / 2} y={H + 13} textAnchor="middle"
                className="text-[9px]" fill="currentColor" fillOpacity="0.6">
                {fyShort(r.fy_end)}
              </text>
            </g>
          )
        })}
        <text x={PAD_L} y={H + PAD_B - 3} className="text-[8px]" fill="currentColor" fillOpacity="0.45">
          {t('finances.committed.share.axisNote')}
        </text>
      </svg>
    </div>
  )
}

/* ------------------------------------------ chart 2: earned vs spent on running */

function EarnedVsRunning({ years, tip, t }) {
  const rows = years.filter(y => y.revenue_receipts != null && y.revenue_expenditure != null)
  if (rows.length < 3) return null

  const W = 760, H = 190, PAD_L = 40, PAD_B = 30
  const maxV = Math.max(...rows.flatMap(r => [r.revenue_receipts, r.revenue_expenditure]))
  const top = Math.ceil(maxV / 50000) * 50000
  const slot = (W - PAD_L) / rows.length
  const bw = Math.min(13, (slot - 10) / 2)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="min-w-[620px] w-full" role="img"
        aria-label={t('finances.committed.gap.aria')}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W} y1={H - H * f} y2={H - H * f}
              stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
            <text x={0} y={H - H * f + 3} className="text-[9px]" fill="currentColor" fillOpacity="0.55">
              {fmtIN(Math.round(top * f / 1000) * 1000)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = PAD_L + i * slot + (slot - bw * 2 - 3) / 2
          const hIn = Math.max(2, (r.revenue_receipts / top) * (H - 14))
          const hOut = Math.max(2, (r.revenue_expenditure / top) * (H - 14))
          const est = r.stage !== 'A'
          const gap = r.revenue_expenditure - r.revenue_receipts
          return (
            <g key={r.fy_end}
              onMouseMove={e => tip.show(e,
                t('finances.committed.gap.tipTitle', { fy: r.fy_label }),
                t('finances.committed.gap.tipBody', {
                  earned: fmtIN(Math.round(r.revenue_receipts)),
                  spent: fmtIN(Math.round(r.revenue_expenditure)),
                  gap: fmtIN(Math.round(Math.abs(gap))),
                  stage: est ? ` (${r.stage})` : '',
                }))}
              onMouseLeave={tip.hide}>
              {/* the shortfall, drawn as the space between the two bars */}
              <rect x={x0} y={H - hOut} width={bw * 2 + 3} height={hOut - hIn}
                fill="currentColor" opacity="0.07" />
              <rect x={x0} y={H - hIn} width={bw} height={hIn} rx="1.5"
                fill="#2f6bb5" opacity={est ? 0.5 : 0.9} />
              <rect x={x0 + bw + 3} y={H - hOut} width={bw} height={hOut} rx="1.5"
                fill="#8f4e00" opacity={est ? 0.5 : 0.9} />
              <text x={x0 + bw + 1.5} y={H + 13} textAnchor="middle"
                className="text-[9px]" fill="currentColor" fillOpacity="0.6">
                {fyShort(r.fy_end)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ table */

function FullTable({ years, sources, t }) {
  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer text-label-md text-primary font-semibold list-none inline-flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">chevron_right</span>
        {t('finances.committed.tableToggle')}
      </summary>
      <div className="overflow-x-auto mt-3 border border-surface-variant rounded-lg">
        <table className="w-full text-label-md border-collapse min-w-[720px]">
          <thead className="bg-surface-container">
            <tr className="text-on-surface-variant">
              <th className="px-3 py-2 text-start font-semibold">{t('finances.committed.col.year')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('finances.committed.col.earned')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('finances.committed.col.interest')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('finances.committed.col.share')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('finances.committed.col.running')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('finances.committed.col.capital')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('finances.committed.col.source')}</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => (
              <tr key={`${y.fy_end}-${y.stage}`} className="border-t border-surface-variant">
                <td className="px-3 py-2 text-on-surface whitespace-nowrap">
                  {y.fy_label}
                  {y.stage !== 'A' && <span className="ms-1.5 text-label-sm text-outline">{y.stage}</span>}
                </td>
                <td className="px-3 py-2 text-end tabular-nums text-on-surface" data-numeric>{fmtIN(Math.round(y.revenue_receipts))}</td>
                <td className="px-3 py-2 text-end tabular-nums text-on-surface" data-numeric>{fmtIN(Math.round(y.interest_payments))}</td>
                <td className="px-3 py-2 text-end tabular-nums font-semibold text-on-surface" data-numeric>{y.interest_pct_of_revenue}%</td>
                <td className="px-3 py-2 text-end tabular-nums text-on-surface-variant" data-numeric>{fmtIN(Math.round(y.revenue_expenditure))}</td>
                <td className="px-3 py-2 text-end tabular-nums text-on-surface-variant" data-numeric>{y.capital_expenditure != null ? fmtIN(Math.round(y.capital_expenditure)) : '—'}</td>
                <td className="px-3 py-2 text-label-sm text-outline">
                  {sources?.[y.source]?.short || y.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-label-sm text-outline mt-2">{t('finances.committed.tableNote')}</p>
    </details>
  )
}

/* ================================================================ section */

export default function CommittedSpending({ data, tip }) {
  const { t } = useT()
  const c = data?.committed
  const [tab, setTab] = useState('share')

  const years = useMemo(() => (c?.years || []).slice().sort((a, b) => a.fy_end - b.fy_end), [c])
  if (!years.length) return null

  const first = c.headline?.first_year
  const last = c.headline?.latest_audited
  const worstGap = years.reduce((a, b) =>
    (b.revenue_gap ?? 0) < (a.revenue_gap ?? 0) ? b : a, years[0])
  const everyYearShort = years.every(y => (y.revenue_gap ?? 0) < 0)

  const TABS = [
    { k: 'share', label: t('finances.committed.tab.share') },
    { k: 'gap', label: t('finances.committed.tab.gap') },
  ]

  return (
    <section id="committed" className="scroll-mt-20 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-headline-md text-on-surface font-bold">
          {t('finances.committed.title')}
        </h2>
        {/* the thirty-second answer */}
        <p className="text-body-lg text-on-surface leading-relaxed max-w-3xl">
          {rich(t('finances.committed.headline', {
            firstPct: first?.pct, firstFy: first?.fy_label,
            lastPct: last?.pct, lastFy: last?.fy_label,
          }))}
        </p>
      </header>

      <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map(x => (
            <button key={x.k} type="button" onClick={() => setTab(x.k)}
              aria-pressed={tab === x.k}
              className={[
                'text-label-md px-3 py-1.5 rounded-full border transition-colors',
                tab === x.k
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
              ].join(' ')}>
              {x.label}
            </button>
          ))}
        </div>

        {tab === 'share' ? (
          <>
            <p className="text-label-md text-on-surface-variant max-w-3xl">{t('finances.committed.share.sub')}</p>
            <InterestShare years={years} tip={tip} t={t} />
            <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">
              {rich(t('finances.committed.share.body'))}
            </p>
          </>
        ) : (
          <>
            <p className="text-label-md text-on-surface-variant max-w-3xl">{t('finances.committed.gap.sub')}</p>
            <div className="flex flex-wrap gap-4 text-label-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#2f6bb5' }} />
                {t('finances.committed.gap.legendIn')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#8f4e00' }} />
                {t('finances.committed.gap.legendOut')}
              </span>
            </div>
            <EarnedVsRunning years={years} tip={tip} t={t} />
            <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">
              {rich(t(everyYearShort ? 'finances.committed.gap.bodyAll' : 'finances.committed.gap.body', {
                fy: worstGap.fy_label,
                gap: fmtIN(Math.round(Math.abs(worstGap.revenue_gap))),
              }))}
            </p>
          </>
        )}

        <FullTable years={years} sources={data.sources} t={t} />

        <div className="border-t border-dashed border-surface-variant pt-3 mt-1 flex flex-col gap-1.5">
          {c.residuary_2014_15 && (
            <p className="text-label-sm text-on-surface-variant leading-relaxed max-w-3xl">
              <strong className="text-on-surface">{t('finances.committed.splitYear')}</strong>{' '}
              {c.residuary_2014_15.note}
            </p>
          )}
          <ul className="text-label-sm text-outline flex flex-col gap-1 list-disc ps-5 max-w-3xl">
            {(c.caveats || []).map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}
