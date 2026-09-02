import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { TENURE_COLOR, TENURE_HATCHED, PATTERN_ID, TenureDefs, tenureFill } from '../lib/tenure'
import { fmtIN } from './advanced/ChartPrimitives'

/**
 * "Did the money the Assembly voted actually get spent?"
 *
 * Every year the Legislative Assembly votes a sum against each demand for
 * grants. Afterwards the Accountant General publishes the Appropriation
 * Accounts: the same grants, with what was voted and what was spent side by
 * side. It is the only document that answers this question, and it is audited.
 *
 * WHY THIS COMPONENT WAS REBUILT
 * It first shipped with two years, and the headline compared them: 83.5% of
 * voted capital spent in 2015-16, 24.4% in 2022-23. Both figures were correct
 * and the sentence was still close to a lie, because two points cannot show a
 * trend and those two happened to sit either side of a change of government.
 * With eight years the picture is different: the fall begins in 2017-18, under
 * the government that also produced the 83.5%, and no government since has
 * spent even half the capital money it voted. That is why the chart below is a
 * series and not a comparison, and why the missing years are drawn as gaps
 * rather than closed up.
 *
 * WHAT A SHORTFALL IS AND IS NOT
 * Money goes unspent when a scheme starts late, a central share does not
 * arrive, land is not acquired, or a tender fails. None of that is wrongdoing.
 * What the number measures is the distance between what was announced in a
 * budget speech and what left the treasury.
 */

const rich = str => String(str).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
  p.startsWith('**') ? <strong key={i} className="text-on-surface">{p.slice(2, -2)}</strong> : p)

const cr = v => (v == null ? '—' : v >= 100000
  ? `₹${(v / 100000).toFixed(2)}L cr`
  : `₹${fmtIN(Math.round(v))} cr`)

/** Which government held office for most of the year ending in fy_end. */
const tenureOf = fy => (fy <= 2019 ? 'tdp1' : fy <= 2024 ? 'ysrcp' : 'tdp2')

/* --------------------------------------------------- the eleven-year strip */

/**
 * One column per financial year since bifurcation — including the years we do
 * not have. A missing year drawn as a gap is the whole difference between a
 * chart that informs and one that flatters: close the gaps up and the eye
 * reads a continuous decline that the record does not actually show.
 */
function SpentSeries({ years, section, tip, t }) {
  const ALL = []
  for (let fy = 2015; fy <= 2025; fy++) ALL.push(fy)

  const byFy = new Map(years.map(y => [y.fy_end, y]))
  const W = 880, H = 210, PAD_L = 34, PAD_B = 40
  const slot = (W - PAD_L) / ALL.length
  const bw = Math.min(46, slot - 12)
  const top = 110 // percent; the 100% line has to sit inside the plot

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="min-w-[680px] w-full" role="img"
        aria-label={t('finances.promised.seriesAria')}>
        <TenureDefs />
        {[25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W} y1={H - (v / top) * H} y2={H - (v / top) * H}
              stroke="currentColor" strokeOpacity={v === 100 ? 0.35 : 0.1}
              strokeWidth="1" strokeDasharray={v === 100 ? '4 3' : undefined} />
            <text x={0} y={H - (v / top) * H + 3} className="text-[10px]"
              fill="currentColor" fillOpacity="0.5">{v}%</text>
          </g>
        ))}
        {ALL.map((fy, i) => {
          const x = PAD_L + i * slot + (slot - bw) / 2
          const label = `${fy - 1}-${String(fy).slice(2)}`
          const y = byFy.get(fy)
          const b = y?.blocks?.find(z => z.section === section && z.voted_or_charged === 'Voted')
          if (!b) {
            // A year the Accountant General has published but we cannot read,
            // drawn as an empty slot so the gap is visible rather than closed up.
            return (
              <g key={fy}>
                <rect x={x} y={H - 14} width={bw} height={14} rx="2"
                  fill={`url(#${PATTERN_ID.unchecked})`} stroke="currentColor" strokeOpacity="0.2"
                  strokeWidth="1" strokeDasharray="2 2" className="cursor-help"
                  onMouseMove={e => tip.show(e, label, t('finances.promised.notHeld'))}
                  onMouseLeave={tip.hide} />
                <text x={x + bw / 2} y={H + 15} textAnchor="middle" className="text-[10px]"
                  fill="currentColor" fillOpacity="0.4">{String(fy).slice(2)}</text>
              </g>
            )
          }
          const ten = tenureOf(fy)
          const pct = b.pct_spent ?? 0
          const h = Math.max(3, Math.min(pct, top) / top * H)
          const partial = !y.grants_complete
          return (
            <g key={fy}>
              <rect x={x} y={H - h} width={bw} height={h} rx="3"
                fill={tenureFill(ten)}
                stroke={TENURE_HATCHED.has(ten) ? TENURE_COLOR[ten] : 'none'} strokeWidth="1"
                opacity={partial ? 0.62 : 1}
                onMouseMove={e => tip.show(e, `${label} · ${t(`depts.tenure.${ten}`)}`,
                  t('finances.promised.seriesTip', {
                    pct: pct.toFixed(1),
                    promised: fmtIN(Math.round(b.promised)),
                    spent: fmtIN(Math.round(b.spent)),
                  }) + (partial ? `<br>${t('finances.promised.totalsOnly')}` : ''))}
                onMouseLeave={tip.hide} />
              <text x={x + bw / 2} y={H - h - 6} textAnchor="middle"
                className="text-[11px] font-bold" fill="currentColor" fillOpacity="0.9">
                {Math.round(pct)}
              </text>
              <text x={x + bw / 2} y={H + 15} textAnchor="middle" className="text-[10px]"
                fill="currentColor" fillOpacity="0.65">{String(fy).slice(2)}</text>
            </g>
          )
        })}
        <text x={PAD_L} y={H + PAD_B - 6} className="text-[9px]" fill="currentColor" fillOpacity="0.45">
          {t('finances.promised.seriesAxis')}
        </text>
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------- fill bar */

function FillBar({ label, promised, spent, pct, tenure, tip, t }) {
  const over = pct != null && pct > 100
  const w = Math.min(100, pct ?? 0)
  return (
    <div className="flex flex-col gap-1"
      onMouseMove={e => tip?.show(e, label, t('finances.promised.tip', {
        promised: fmtIN(Math.round(promised)),
        spent: spent == null ? '—' : fmtIN(Math.round(spent)),
        pct: pct == null ? '—' : pct.toFixed(1),
      }))}
      onMouseLeave={tip?.hide}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label-md text-on-surface truncate" title={label}>{label}</span>
        <span className={[
          'text-label-md font-bold tabular-nums shrink-0',
          over ? 'text-error' : pct != null && pct < 50 ? 'text-secondary' : 'text-on-surface',
        ].join(' ')} data-numeric>{pct == null ? '—' : `${pct.toFixed(0)}%`}</span>
      </div>
      <div className="relative h-3 rounded-full bg-surface-container-high">
        <div className="absolute inset-y-0 start-0 rounded-full"
          style={{ width: `${w}%`, background: over ? '#ba1a1a' : TENURE_COLOR[tenure] || '#43474f' }} />
        {over && <div className="absolute inset-y-0 end-0 translate-x-1 w-1.5 rounded-full bg-error" />}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-label-sm text-outline tabular-nums" data-numeric>
        <span>{t('finances.promised.voted')} {cr(promised)}</span>
        <span>{t('finances.promised.spent')} {cr(spent)}</span>
      </div>
    </div>
  )
}

/* ================================================================ section */

export default function PromisedVsSpent({ data, tip }) {
  const { t } = useT()
  const p = data?.promised_vs_spent
  const years = useMemo(
    () => (p?.years || []).slice().sort((a, b) => a.fy_end - b.fy_end), [p])
  const withGrants = useMemo(
    () => years.filter(y => (p?.grants?.[y.fy_label]?.capital_voted || []).length
                          || (p?.grants?.[y.fy_label]?.revenue_voted || []).length), [years, p])

  const [section, setSection] = useState('Capital')
  const [year, setYear] = useState(() => withGrants.at(-1)?.fy_label || years.at(-1)?.fy_label || '')
  const [grantSec, setGrantSec] = useState('capital_voted')

  const grants = useMemo(() => {
    const rows = p?.grants?.[year]?.[grantSec] || []
    return rows.filter(r => r.promised > 0)
  }, [p, year, grantSec])
  const yearMeta = years.find(y => y.fy_label === year)

  if (!years.length) return null

  // The headline is read off the series, never off a chosen pair of years.
  const capOf = y => y.blocks?.find(b => b.section === 'Capital' && b.voted_or_charged === 'Voted')
  const capYears = years.map(y => ({ y, b: capOf(y) })).filter(x => x.b?.pct_spent != null)
  const best = capYears.reduce((a, b) => (b.b.pct_spent > a.b.pct_spent ? b : a), capYears[0])
  const since = capYears.filter(x => x.y.fy_end > best.y.fy_end)
  const worstSince = since.length
    ? since.reduce((a, b) => (b.b.pct_spent < a.b.pct_spent ? b : a), since[0]) : null
  const highestSince = since.length
    ? since.reduce((a, b) => (b.b.pct_spent > a.b.pct_spent ? b : a), since[0]) : null

  const SECTIONS = [
    { k: 'Capital', label: t('finances.promised.filter.capital') },
    { k: 'Revenue', label: t('finances.promised.filter.revenue') },
  ]

  return (
    <section id="promised" className="scroll-mt-20 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-headline-md font-headline-md text-on-surface">{t('finances.promised.title')}</h2>
        {capYears.length >= 4 && worstSince && highestSince ? (
          <p className="text-body-lg font-body-lg text-on-surface leading-relaxed max-w-3xl">
            {rich(t('finances.promised.headlineSeries', {
              bestFy: best.y.fy_label, bestPct: best.b.pct_spent,
              lowFy: worstSince.y.fy_label, lowPct: worstSince.b.pct_spent,
              highPct: highestSince.b.pct_spent, n: since.length,
            }))}
          </p>
        ) : (
          <p className="text-body-lg font-body-lg text-on-surface leading-relaxed max-w-3xl">
            {t('finances.promised.headlineFallback')}
          </p>
        )}
      </header>

      {/* ------------------------------------------------ the whole series */}
      <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SECTIONS.map(s => (
            <button key={s.k} type="button" onClick={() => setSection(s.k)} aria-pressed={section === s.k}
              className={[
                'text-label-md px-3 py-1.5 rounded-full border transition-colors',
                section === s.k
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
              ].join(' ')}>{s.label}</button>
          ))}
        </div>
        <p className="text-label-md text-on-surface-variant max-w-3xl">
          {t(section === 'Capital' ? 'finances.promised.seriesSubCapital' : 'finances.promised.seriesSubRevenue')}
        </p>
        <SpentSeries years={years} section={section} tip={tip} t={t} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-label-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: TENURE_COLOR.tdp1 }} />
            {t('depts.tenure.tdp1')}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: TENURE_COLOR.ysrcp }} />
            {t('depts.tenure.ysrcp')}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{
              background: TENURE_COLOR.tdp2,
              backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.6) 0 2px,transparent 2px 4px)' }} />
            {t('depts.tenure.tdp2')}</span>
          <span className="inline-flex items-center gap-1.5 text-outline">
            <span className="w-3 h-3 rounded-sm inline-block border border-dashed border-outline-variant" />
            {t('finances.promised.legendMissing')}</span>
          <span className="inline-flex items-center gap-1.5 text-outline">
            <span className="w-3 h-3 rounded-sm inline-block opacity-60" style={{ background: TENURE_COLOR.ysrcp }} />
            {t('finances.promised.legendTotalsOnly')}</span>
        </div>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl mt-1">
          {t('finances.promised.seriesBody')}
        </p>
      </div>

      {/* ------------------------------------------------ one year, in detail */}
      <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-title-md font-title-md text-on-surface">{t('finances.promised.yearTitle')}</h3>
          <p className="text-label-md text-on-surface-variant max-w-3xl">{t('finances.promised.yearSub')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {years.map(y => (
            <button key={y.fy_label} type="button" onClick={() => setYear(y.fy_label)}
              aria-pressed={year === y.fy_label}
              className={[
                'text-label-md px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5',
                year === y.fy_label
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
              ].join(' ')}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: TENURE_COLOR[y.tenure] }} />
              {y.fy_label}
            </button>
          ))}
        </div>

        {yearMeta && (
          <>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
              {yearMeta.blocks.map(b => (
                <FillBar key={`${b.section}-${b.voted_or_charged}`} label={b.label}
                  promised={b.promised} spent={b.spent} pct={b.pct_spent}
                  tenure={yearMeta.tenure} tip={tip} t={t} />
              ))}
            </div>
            {yearMeta.grand_total && (
              <p className="text-label-md text-on-surface-variant border-t border-dashed border-surface-variant pt-3">
                {t('finances.promised.grandTotal', {
                  promised: cr(yearMeta.grand_total.promised), spent: cr(yearMeta.grand_total.spent),
                })}
              </p>
            )}
          </>
        )}

        {grants.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2 border-t border-surface-variant pt-4">
              {[{ k: 'capital_voted', label: t('finances.promised.filter.capital') },
                { k: 'revenue_voted', label: t('finances.promised.filter.revenue') }].map(s => (
                <button key={s.k} type="button" onClick={() => setGrantSec(s.k)} aria-pressed={grantSec === s.k}
                  className={[
                    'text-label-md px-3 py-1.5 rounded-full border transition-colors',
                    grantSec === s.k
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
                  ].join(' ')}>{s.label}</button>
              ))}
            </div>
            <p className="text-label-md text-on-surface-variant max-w-3xl">{t('finances.promised.grantSub')}</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
              {grants.slice(0, 14).map(g => (
                <FillBar key={g.grant_no} label={`${g.grant_no}. ${g.grant_name}`}
                  promised={g.promised} spent={g.spent} pct={g.pct_spent}
                  tenure={yearMeta?.tenure} tip={tip} t={t} />
              ))}
            </div>
            {grants.length > 14 && (
              <details className="group">
                <summary className="cursor-pointer text-label-md text-primary font-semibold list-none inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">chevron_right</span>
                  {t('finances.promised.showRest', { n: grants.length - 14 })}
                </summary>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 mt-4">
                  {grants.slice(14).map(g => (
                    <FillBar key={g.grant_no} label={`${g.grant_no}. ${g.grant_name}`}
                      promised={g.promised} spent={g.spent} pct={g.pct_spent}
                      tenure={yearMeta?.tenure} tip={tip} t={t} />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-body-md text-on-surface-variant border-t border-surface-variant pt-4">
            {t('finances.promised.noGrants')}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- the caveats */}
      <div className="border border-outline-variant rounded-xl p-5 bg-surface-container flex flex-col gap-3">
        <h3 className="text-title-md font-title-md text-on-surface inline-flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-secondary">info</span>
          {t('finances.promised.gapsTitle')}
        </h3>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{p.coverage_note}</p>
        <ul className="text-label-md text-on-surface-variant flex flex-col gap-1.5">
          {(p.missing || []).map(m => (
            <li key={m.fy} className="flex gap-2">
              <span className="font-semibold text-on-surface shrink-0 tabular-nums" data-numeric>{m.fy}</span>
              <span>{m.why}</span>
            </li>
          ))}
        </ul>
        {p._units_note && (
          <p className="text-label-sm text-outline leading-relaxed max-w-3xl">{p._units_note}</p>
        )}
        <p className="text-label-sm text-on-surface-variant leading-relaxed max-w-3xl border-t border-dashed border-outline-variant pt-3">
          <strong className="text-on-surface">{t('finances.promised.checkedLead')}</strong> {p.validation}
        </p>
        <p className="text-label-sm text-on-surface-variant leading-relaxed max-w-3xl">
          <strong className="text-on-surface">{t('finances.promised.helpLead')}</strong> {p.how_to_help}
        </p>
        <p className="text-label-sm text-outline leading-relaxed max-w-3xl">{t('finances.promised.notScandal')}</p>
      </div>
    </section>
  )
}
