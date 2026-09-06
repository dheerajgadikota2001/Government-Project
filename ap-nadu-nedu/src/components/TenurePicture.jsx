import { useMemo } from 'react'
import { useT } from '../i18n'
import { TENURE_COLOR, TenureDefs, tenureFill, tenureStroke } from '../lib/tenure'
import { useChartTip } from './advanced/ChartPrimitives'
import { STAGES, TENURES, summarise } from '../lib/tenurePicture'

/**
 * The tenure picture at the top of the project register.
 *
 * WHAT IT IS
 * One row per government: how many of the projects currently in view that
 * government touched, split by where those projects stand today. Beside it,
 * the share of recorded events per government. Both recompute from the
 * filtered list, so with Prakasam selected they describe Prakasam.
 *
 * WHAT IT IS NOT
 * A scorecard. A project is counted under every government it touched, so the
 * rows overlap on purpose, and the caption says so in every language. The
 * alternative, forcing each project into one government's column, would be a
 * verdict this site has no basis to give.
 *
 * The maths lives in src/lib/tenurePicture.js and is unit tested. This file
 * only draws it.
 */

/* Shade ramp for stage, darkest first. Applied as opacity over the term colour
 * so the two TDP terms keep their hatch distinction from the rest of the site. */
const STAGE_ALPHA = { completed: 1, building: 0.72, announced: 0.42, stalled: 0.2 }

/* Legend swatch: flat colour, hatch on the second TDP term, same as everywhere. */
const swatch = g => ({
  background: TENURE_COLOR[g],
  ...(g === 'tdp2' ? { backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.6) 0 3px,transparent 3px 6px)' } : {}),
})

function EventDonut({ rows, totalEvents, t, tip }) {
  if (totalEvents <= 0) return null
  const R = 62, r = 38, C = 80
  let a0 = -Math.PI / 2
  const arcs = rows.filter(x => x.events > 0).map(x => {
    const frac = x.events / totalEvents
    const a1 = a0 + frac * 2 * Math.PI
    const large = a1 - a0 > Math.PI ? 1 : 0
    const d = [
      `M ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)}`,
      `A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}`,
      `L ${C + r * Math.cos(a1)} ${C + r * Math.sin(a1)}`,
      `A ${r} ${r} 0 ${large} 0 ${C + r * Math.cos(a0)} ${C + r * Math.sin(a0)}`, 'Z',
    ].join(' ')
    a0 = a1
    return { ...x, d, pct: Math.round(frac * 1000) / 10 }
  })
  return (
    <div dir="ltr" className="flex flex-col gap-2 items-center lg:items-start">
      <span className="text-label-md font-label-md text-on-surface-variant">{t('register.tenurePicture.eventsTitle')}</span>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label={t('register.tenurePicture.eventsTitle')}>
          <TenureDefs />
          {arcs.map(a => (
            <path key={a.g} d={a.d} fill={tenureFill(a.g)} stroke={tenureStroke(a.g)} strokeWidth="0.75"
              onMouseMove={e => tip.show(e, t(`depts.tenure.${a.g}`), `${a.events.toLocaleString('en-IN')} ${t('register.tenurePicture.eventsUnit')} · ${a.pct}%`)}
              onMouseLeave={tip.hide} />
          ))}
          <text x={C} y={C + 4} textAnchor="middle" fontSize="13" fontWeight="700" className="fill-on-surface">
            {totalEvents.toLocaleString('en-IN')}
          </text>
        </svg>
        <ul className="flex flex-col gap-1 text-label-sm text-on-surface-variant min-w-[200px]">
          {arcs.map(a => (
            <li key={a.g} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={swatch(a.g)} />
              <span className="truncate min-w-0" data-nowrap-en>{t(`depts.tenure.${a.g}`)}</span>
              <span className="ms-auto tabular-nums text-on-surface">{a.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-label-sm text-outline leading-relaxed max-w-[28ch] lg:max-w-[26ch] text-center lg:text-start">
        {t('register.tenurePicture.eventsCaption')}
      </p>
    </div>
  )
}

export default function TenurePicture({ shown, tenure, setTenure }) {
  const { t } = useT()
  const tip = useChartTip()
  const { rows, totalEvents, max } = useMemo(() => summarise(shown), [shown])
  if (!shown?.length) return null
  const pick = g => setTenure(tenure === g ? null : g)

  return (
    <section
      aria-label={t('register.tenurePicture.title', { n: shown.length })}
      className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 sm:p-5 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-title-md font-title-md text-on-surface">
          {t('register.tenurePicture.title', { n: shown.length.toLocaleString('en-IN') })}
        </h3>
        <span className="text-label-sm text-outline">{t('register.tenurePicture.hint')}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="flex flex-col gap-3 min-w-0">
          {rows.map(r => (
            <button
              key={r.g} type="button" onClick={() => pick(r.g)} aria-pressed={tenure === r.g}
              className={`text-start rounded-lg p-2 -m-2 transition-colors ${tenure === r.g ? 'bg-surface-container-high' : 'hover:bg-surface-container'}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={swatch(r.g)} />
                <span className="text-label-md font-label-md text-on-surface">{t(`depts.tenure.${r.g}`)}</span>
                <span className="ms-auto tabular-nums text-label-md font-semibold text-on-surface">{r.total.toLocaleString('en-IN')}</span>
                <span className="text-label-sm text-outline">{t('register.tenurePicture.projects')}</span>
              </div>
              <div dir="ltr" className="h-5 rounded-md overflow-hidden flex bg-surface-container transition-all duration-500"
                style={{ width: `${(r.total / max) * 100}%`, minWidth: r.total ? '3rem' : 0 }}>
                {STAGES.map(s => r.by[s] > 0 && (
                  <span key={s} style={{ flex: r.by[s], background: TENURE_COLOR[r.g], opacity: STAGE_ALPHA[s], transition: 'flex .5s ease' }}
                    onMouseMove={e => tip.show(e, `${t(`register.tenurePicture.stage.${s}`)} · ${t(`depts.tenure.${r.g}`)}`,
                      `${r.by[s].toLocaleString('en-IN')} ${t('register.tenurePicture.projects')}\n${r.names[s].join(' · ')}${r.by[s] > r.names[s].length ? ' …' : ''}`)}
                    onMouseLeave={tip.hide} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-label-sm text-on-surface-variant">
                {STAGES.map(s => r.by[s] > 0 && (
                  <span key={s}>{t(`register.tenurePicture.stage.${s}`)} {r.by[s].toLocaleString('en-IN')}</span>
                ))}
                {r.spanning > 0 && (
                  <span className="text-outline">· {t('register.tenurePicture.spanning', { n: r.spanning.toLocaleString('en-IN') })}</span>
                )}
              </div>
            </button>
          ))}
          <p className="text-label-sm text-outline leading-relaxed mt-1 max-w-[62ch]">
            {t('register.tenurePicture.caption')}
          </p>
        </div>

        <EventDonut rows={rows} totalEvents={totalEvents} t={t} tip={tip} />
      </div>
      {tip.node}
    </section>
  )
}
