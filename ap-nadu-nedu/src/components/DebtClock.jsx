import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { TENURE_COLOR, TENURE_HATCHED, PATTERN_ID, TenureDefs, tenureFill } from '../lib/tenure'

/**
 * The debt clock.
 *
 * WHAT THIS IS AND IS NOT
 * Nothing here is a live measurement. Three official bodies publish Andhra
 * Pradesh's outstanding debt and they do not agree, because they count
 * different things and publish at different times. So the hero shows two
 * numbers, not one: the most recent AUDITED figure, and the most recent
 * figure of any kind. Both are official. The gap between them is the whole
 * argument of the page below, so it belongs at the top rather than buried.
 *
 * The one thing that moves is the interest counter, and it moves because of
 * arithmetic we state in full: the interest provision in the state's own
 * budget for the current year, divided evenly across the year. Interest is
 * not really paid at a constant rate, and the label says so. We would rather
 * show a slower, true number than a fast, invented one.
 *
 * Every figure carries the document it came from. Per-person figures divide
 * a rupee total by a population projection from a different department of a
 * different government, so they are marked as our arithmetic, not as
 * anything either document printed.
 */

/* ---------------------------------------------------------------- helpers */

const CR = 1e7 // one crore, in rupees

/** ₹6.45 lakh crore / ₹4,23,943 crore — whichever reads better at this size. */
function bigMoney(crore, t) {
  if (crore == null) return '—'
  if (crore >= 100000) return `₹${(crore / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  return `₹${Math.round(crore).toLocaleString('en-IN')} ${t('unit.crore')}`
}

const rupees = n => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Latest point in a series, optionally restricted to audited readings. */
function latest(points, { auditedOnly = false } = {}) {
  const rows = (points || []).filter(p => p.value != null && (!auditedOnly || p.stage === 'A'))
  if (!rows.length) return null
  return rows.reduce((a, b) => (b.fy_end > a.fy_end ? b : a))
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/* --------------------------------------------------------- count-up number */

/**
 * Counts once from zero to the value on mount, then holds. It is an entrance,
 * not a simulation — a number that keeps climbing forever would imply we are
 * watching the treasury, and we are not.
 */
function useCountUp(target, ms = 1100) {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0))
  const raf = useRef(0)
  useEffect(() => {
    if (target == null) return
    if (prefersReducedMotion()) { setV(target); return }
    const t0 = performance.now()
    const step = now => {
      const p = Math.min(1, (now - t0) / ms)
      // ease-out cubic: fast first, settles gently on the true figure
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return v
}

/* ------------------------------------------------------- interest counter */

function InterestTicker({ perSecond, note, t }) {
  const t0 = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion() || !perSecond) return
    // Twice a second. Ten times a second reads as a slot machine and costs
    // battery for digits nobody can follow.
    const id = setInterval(() => setElapsed((Date.now() - t0.current) / 1000), 500)
    return () => clearInterval(id)
  }, [perSecond])

  if (!perSecond) return null
  const accrued = perSecond * elapsed

  return (
    <div className="border-t border-dashed border-outline-variant pt-3 mt-4 flex flex-col gap-1">
      <p className="text-body-md text-on-surface">
        {t('finances.clock.tickerLead')}{' '}
        <span className="tabular-nums font-bold text-on-surface" data-numeric>
          {rupees(accrued)}
        </span>
      </p>
      <p className="text-label-sm text-outline max-w-2xl leading-relaxed">
        {t('finances.clock.tickerRate', { rate: rupees(perSecond) })} {note}
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- sparkline */

/**
 * Eleven years of debt, shaded by which government held office for most of
 * each year. No axis: this is a shape, not a reading. The chart below the
 * hero is where the numbers are read.
 */
function DebtSpark({ points, tenureOf, t }) {
  const rows = (points || []).filter(p => p.value != null).sort((a, b) => a.fy_end - b.fy_end)
  if (rows.length < 3) return null
  const W = 560, H = 54, GAP = 3
  const max = Math.max(...rows.map(r => r.value))
  const bw = (W - GAP * (rows.length - 1)) / rows.length

  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full max-w-[560px] h-auto" role="img"
      aria-label={t('finances.clock.sparkAria')}>
      <TenureDefs />
      {rows.map((r, i) => {
        const ten = tenureOf(r.fy_end)
        const h = Math.max(2, (r.value / max) * H)
        const x = i * (bw + GAP)
        return (
          <g key={r.fy_end}>
            <rect x={x} y={H - h} width={bw} height={h} rx="1.5"
              fill={tenureFill(ten)}
              stroke={TENURE_HATCHED.has(ten) ? TENURE_COLOR[ten] : 'none'}
              strokeWidth="0.75"
              opacity={r.stage === 'A' ? 1 : 0.5}>
              <title>{`${r.fy_end - 1}-${String(r.fy_end).slice(2)} · ${Math.round(r.value).toLocaleString('en-IN')} ${t('unit.crore')}${r.stage !== 'A' ? ` (${r.stage})` : ''}`}</title>
            </rect>
            {(i === 0 || i === rows.length - 1) && (
              <text x={i === 0 ? x : x + bw} y={H + 11} textAnchor={i === 0 ? 'start' : 'end'}
                className="text-[9px]" fill="currentColor" fillOpacity="0.5">
                {`${r.fy_end - 1}-${String(r.fy_end).slice(2)}`}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ tile */

function Fact({ label, value, foot, tone = 'plain' }) {
  return (
    <div className={[
      'rounded-xl px-4 py-3 border flex flex-col gap-0.5',
      tone === 'warn'
        ? 'border-outline-variant bg-surface-container'
        : 'border-surface-variant bg-surface-container-lowest',
    ].join(' ')}>
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-headline-sm text-on-surface font-bold tabular-nums" data-numeric>{value}</p>
      {foot && <p className="text-label-sm text-outline leading-snug">{foot}</p>}
    </div>
  )
}

/* ============================================================== the clock */

export default function DebtClock({ data }) {
  const { t } = useT()

  const byKey = useMemo(() => {
    const m = {}
    ;(data?.series || []).forEach(s => { m[`${s.indicator}:${s.source_family}`] = s.points || [] })
    return m
  }, [data])

  const rbi = byKey['outstanding_liabilities:RBI'] || []
  const apb = byKey['outstanding_liabilities:AP_BUDGET'] || []
  const cag = byKey['outstanding_liabilities:CAG'] || []
  const off = byKey['off_budget_borrowings:CAG'] || []
  const gtee = byKey['guarantees:RBI'] || []
  const gsdp = byKey['gsdp:NSO'] || []

  const audited = latest(cag, { auditedOnly: true }) || latest(rbi, { auditedOnly: true })
  const newest = latest(apb) || latest(rbi)
  const offLatest = latest(off)
  const gteeLatest = latest(gtee)

  const committed = data?.committed
  const perSecond = committed?.per_second?.rupees_per_second
  const head = committed?.headline

  // Which government held office for most of the year ending in fy_end.
  const tenureOf = fy => (fy <= 2019 ? 'tdp1' : fy <= 2024 ? 'ysrcp' : 'tdp2')

  // Population is a projection published by a different ministry. The division
  // is ours, and is labelled as ours wherever the result appears.
  const popAt = useMemo(() => {
    const rows = data?.population?.projections || []
    return y => {
      const exact = rows.find(r => r.year === y)
      if (exact) return exact.value
      const under = rows.filter(r => r.year <= y)
      return under.length ? under[under.length - 1].value : null
    }
  }, [data])

  const auditedShown = useCountUp(audited?.value ?? null)
  const newestShown = useCountUp(newest?.value ?? null)

  if (!audited && !newest) return null

  const perPerson = (pt) => {
    if (!pt) return null
    const p = popAt(pt.fy_end)
    return p ? (pt.value * CR) / p : null
  }

  const ratio = (pt) => {
    if (!pt) return null
    const g = gsdp.find(x => x.fy_end === pt.fy_end)
    return g ? (100 * pt.value) / g.value : null
  }

  const auditedPP = perPerson(audited)
  const newestRatio = ratio(newest)

  const fyLabel = pt => (pt ? `${pt.fy_end - 1}-${String(pt.fy_end).slice(2)}` : '')

  return (
    <section aria-labelledby="debt-clock-title"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">

      {/* ------------------------------------------------ the two numbers */}
      <div className="px-5 sm:px-7 pt-6 pb-5 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">
            {t('finances.clock.eyebrow')}
          </p>
          <h2 id="debt-clock-title" className="sr-only">{t('finances.clock.title')}</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 sm:gap-8">
          {/* audited */}
          <div className="flex flex-col gap-1.5">
            <p className="text-display-lg-mobile sm:text-display-lg text-on-surface font-bold tabular-nums leading-none"
              data-numeric>
              {bigMoney(auditedShown, t)}
            </p>
            <p className="text-label-md text-on-surface font-semibold">
              {t('finances.clock.auditedStamp', { fy: fyLabel(audited) })}
            </p>
            <p className="text-label-sm text-outline leading-snug max-w-xs">
              {auditedPP
                ? t('finances.clock.perPerson', { amount: rupees(auditedPP) })
                : ''}
            </p>
          </div>

          {/* newest of any kind */}
          <div className="flex flex-col gap-1.5 sm:border-s sm:border-surface-variant sm:ps-8">
            <p className="text-headline-md sm:text-display-lg-mobile text-on-surface-variant font-bold tabular-nums leading-none"
              data-numeric>
              {bigMoney(newestShown, t)}
            </p>
            <p className="text-label-md text-on-surface-variant font-semibold">
              {t('finances.clock.estimateStamp', { fy: fyLabel(newest), stage: newest?.stage === 'BE' ? t('hero.stage.be') : t('hero.stage.re') })}
            </p>
            <p className="text-label-sm text-outline leading-snug max-w-xs">
              {newestRatio != null
                ? t('finances.clock.ofEconomy', { pct: newestRatio.toFixed(1) })
                : ''}
            </p>
          </div>
        </div>

        <p className="text-body-md text-on-surface leading-relaxed max-w-2xl">
          {t('finances.clock.whyTwo')}
        </p>

        <div className="text-on-surface-variant">
          <DebtSpark points={rbi.length ? rbi : apb} tenureOf={tenureOf} t={t} />
        </div>

        {perSecond && (
          <InterestTicker perSecond={perSecond} t={t}
            note={t('finances.clock.tickerBasis', {
              fy: committed.per_second.fy_label,
              crore: Math.round(committed.per_second.annual_interest_crore).toLocaleString('en-IN'),
            })} />
        )}
      </div>

      {/* ------------------------------------------------- supporting facts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 sm:px-7 pb-6">
        <Fact
          label={t('finances.clock.offLabel')}
          value={bigMoney(offLatest?.value, t)}
          foot={t('finances.clock.offFoot', { fy: fyLabel(offLatest) })}
          tone="warn"
        />
        <Fact
          label={t('finances.clock.gteeLabel')}
          value={bigMoney(gteeLatest?.value, t)}
          foot={t('finances.clock.gteeFoot', { fy: fyLabel(gteeLatest) })}
        />
        <Fact
          label={t('finances.clock.interestLabel')}
          value={head ? `${head.latest_audited.pct}` + ' %' : '—'}
          foot={head ? t('finances.clock.interestFoot', {
            fy: head.latest_audited.fy_label, first: head.first_year.pct, firstFy: head.first_year.fy_label,
          }) : ''}
          tone="warn"
        />
        <Fact
          label={t('finances.clock.popLabel')}
          value={(() => {
            const p = popAt(newest?.fy_end || 2026)
            return p ? `${(p / 1e7).toFixed(2)} ${t('unit.crore')}` : '—'
          })()}
          foot={t('finances.clock.popFoot')}
        />
      </div>

      {/* --------------------------------------------------- where it's from */}
      <div className="px-5 sm:px-7 py-3 bg-surface-container border-t border-surface-variant">
        <p className="text-label-sm text-on-surface-variant leading-relaxed">
          <strong className="text-on-surface">{t('finances.clock.sourcesLead')}</strong>{' '}
          {t('finances.clock.sourcesBody')}
        </p>
      </div>
    </section>
  )
}
