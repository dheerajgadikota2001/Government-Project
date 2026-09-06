import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import { TENURE_COLOR, TENURE_HATCHED, TenureDefs, tenureFill } from '../lib/tenure'
import { useChartTip, fmtIN } from '../components/advanced/ChartPrimitives'
import Deferred from '../components/Deferred'
import PageThread from '../components/community/PageThread'

/**
 * Andhra Pradesh, by the numbers.
 *
 * There are card walls of state statistics all over the internet. The three
 * things this one does that they do not:
 *
 *  1. Every number opens into the document it came from — the publication, the
 *     table number, and the agency that originated it, because the Reserve
 *     Bank reprinting a health ministry figure does not make it a Reserve Bank
 *     figure.
 *
 *  2. Every series is split by the government that held office, and the split
 *     is arithmetic on two years the source printed, with both years named. It
 *     is never a rate, an index or a model.
 *
 *  3. An estimate is never drawn as an outcome. A budget estimate and an
 *     audited account are different kinds of statement, and mixing them is how
 *     a chart tells a lie without containing a false number. Estimates are
 *     lighter, carry a stage chip, and any per-government change that leans on
 *     one says so.
 *
 * On colour: an arrow is coloured only where a direction is unambiguously
 * better or worse — infant mortality falling is better, full stop. Where a
 * reasonable person would argue (debt rose; is that bad? it depends what it
 * bought), the arrow is neutral grey and the card says nothing about good or
 * bad. Colour is never the only carrier: every arrow has a glyph and a word.
 */

/* --------------------------------------------------------------- helpers */

const GOOD = '#1c6b3a'
const BAD = '#ba1a1a'
const NEUTRAL = '#43474f'

const fyShort = p => p.fy_label || String(p.fy_end)

/** Present a stored figure in its display unit, without changing the stored value. */
function show(ind, v) {
  if (v == null) return '—'
  const x = v / (ind.display_divisor || 1)
  if (ind.display_unit === '₹ crore') {
    return Math.abs(x) >= 100000
      ? `₹${(x / 100000).toFixed(2)}L cr`
      : `₹${fmtIN(Math.round(x))} cr`
  }
  if (ind.display_unit === '₹') return `₹${fmtIN(Math.round(x))}`
  if (ind.display_unit === '%') return `${x.toFixed(1)}%`
  const dp = ind.decimals ?? 0
  return `${fmtIN(dp ? Number(x.toFixed(dp)) : Math.round(x))}`
}

const unitTail = ind =>
  ['₹ crore', '₹', '%'].includes(ind.display_unit) ? '' : ` ${ind.display_unit}`

/**
 * Is a rise on this indicator an improvement? Returns 'good', 'bad' or null.
 * null means we are not going to tell the reader what to think.
 */
function verdict(ind, change) {
  if (change == null || change === 0) return null
  const dir = ind.direction_of_good
  if (dir !== 'up' && dir !== 'down') return null
  const rising = change > 0
  return (dir === 'up') === rising ? 'good' : 'bad'
}

/* ------------------------------------------------------------- sparkline */

function Spark({ ind, tip, t }) {
  const pts = ind.points
  if (pts.length < 3) return null
  const W = 220, H = 40, GAP = 1.6
  const vals = pts.map(p => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const bw = (W - GAP * (pts.length - 1)) / pts.length
  // Bars are drawn from a floor a little below the minimum, not from zero:
  // for a series like life expectancy every bar would otherwise be the same
  // height. The axis label says so on the expanded view.
  const floor = min - range * 0.12
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={t('facts.sparkAria', { label: ind.label })} preserveAspectRatio="none">
      <TenureDefs />
      {pts.map((p, i) => {
        const h = Math.max(1.5, ((p.value - floor) / (max - floor || 1)) * H)
        const ten = p.undivided ? 'pre' : p.tenure
        const est = Boolean(p.stage) && p.stage !== 'A'
        return (
          <rect key={`${p.fy_end}-${i}`} x={i * (bw + GAP)} y={H - h} width={bw} height={h}
            fill={p.undivided ? '#c3c6d1' : tenureFill(ten)}
            stroke={TENURE_HATCHED.has(ten) && !p.undivided ? TENURE_COLOR[ten] : 'none'}
            strokeWidth="0.5"
            opacity={est ? 0.45 : 1}
            onMouseMove={e => tip.show(e, `${ind.label} · ${fyShort(p)}`,
              `${show(ind, p.value)}${unitTail(ind)}` +
              (p.undivided ? ` · ${t('facts.undividedShort')}` : '') +
              (est ? ` · ${t(`facts.stage.${p.stage}`)}` : ''))}
            onMouseLeave={tip.hide} />
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------- per-government */

function TenureDelta({ ind, tk, t }) {
  const b = ind.by_tenure?.[tk]
  if (!b || b.from == null) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-label-sm text-outline truncate">{t(`depts.tenure.${tk}`)}</span>
        <span className="text-label-md text-outline">{t('facts.notEnoughYears')}</span>
      </div>
    )
  }
  const v = verdict(ind, b.change)
  const color = v === 'good' ? GOOD : v === 'bad' ? BAD : NEUTRAL
  const up = b.change > 0
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-label-sm text-outline truncate inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: TENURE_COLOR[tk] }} />
        {t(`depts.tenure.${tk}`)}
      </span>
      <span className="text-label-lg font-label-lg tabular-nums inline-flex items-center gap-1" style={{ color }} data-numeric>
        <span aria-hidden="true">{up ? '▲' : '▼'}</span>
        {b.pct == null ? '—' : `${Math.abs(b.pct).toFixed(0)}%`}
      </span>
      <span className="text-label-sm text-outline truncate">
        {b.from.fy_label}→{b.to.fy_label}
        {b.any_estimate ? ` · ${t('facts.usesEstimate')}` : ''}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ card */

function IndicatorCard({ ind, sources, tip, t }) {
  const [open, setOpen] = useState(false)
  const src = sources?.[ind.source]
  const latest = ind.latest
  const est = latest?.stage && latest.stage !== 'A'

  return (
    <article className="border border-surface-variant rounded-xl bg-surface-container-lowest flex flex-col">
      <div className="p-4 flex flex-col gap-3">
        <h3 className="text-title-sm font-title-sm text-on-surface leading-snug">{ind.label}</h3>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-headline-md font-headline-md text-on-surface tabular-nums" data-numeric>
            {show(ind, latest?.value)}
          </span>
          <span className="text-label-md text-on-surface-variant">{unitTail(ind).trim()}</span>
          <span className="text-label-sm text-outline">{fyShort(latest || {})}</span>
          {est && (
            <span className="text-label-sm px-1.5 py-0.5 rounded-full border border-outline-variant text-on-surface-variant">
              {t(`facts.stage.${latest.stage}`)}
            </span>
          )}
        </div>

        <div className="text-on-surface-variant"><Spark ind={ind} tip={tip} t={t} /></div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-surface-variant">
          {['tdp1', 'ysrcp', 'tdp2'].map(tk => <TenureDelta key={tk} ind={ind} tk={tk} t={t} />)}
        </div>

        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="text-label-md text-primary font-semibold self-start inline-flex items-center gap-1 hover:underline">
          <span className={`material-symbols-outlined text-[18px] transition-transform ${open ? 'rotate-90' : ''}`}>chevron_right</span>
          {open ? t('facts.hideDetail') : t('facts.showDetail')}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-surface-variant flex flex-col gap-3">
          {ind.what_it_means && (
            <p className="text-body-md text-on-surface leading-relaxed">{ind.what_it_means}</p>
          )}
          {ind.series_note && (
            <p className="text-label-md text-on-surface-variant leading-relaxed">{ind.series_note}</p>
          )}
          {ind.has_undivided_years && (
            <p className="text-label-md text-on-surface-variant leading-relaxed border-s-2 border-outline-variant ps-2.5">
              {t('facts.undividedNote')}
            </p>
          )}

          <div className="overflow-x-auto border border-surface-variant rounded-lg">
            <table className="w-full text-label-md border-collapse">
              <thead className="bg-surface-container">
                <tr className="text-on-surface-variant">
                  <th className="px-3 py-2 text-start font-semibold">{t('facts.col.year')}</th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {ind.display_unit === '₹ crore' ? t('facts.col.valueCr') : t('facts.col.value')}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">{t('facts.col.stage')}</th>
                </tr>
              </thead>
              <tbody>
                {ind.points.slice().reverse().map((p, i) => (
                  <tr key={`${p.fy_end}-${i}`} className="border-t border-surface-variant">
                    <td className="px-3 py-1.5 text-on-surface whitespace-nowrap">
                      {fyShort(p)}
                      {p.undivided && <span className="ms-2 text-label-sm text-outline">{t('facts.undividedShort')}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-on-surface" data-numeric>
                      {show(ind, p.value)}
                    </td>
                    <td className="px-3 py-1.5 text-label-sm text-outline">
                      {p.stage ? t(`facts.stage.${p.stage}`) : ''}
                      {p.stage_as_printed ? ` (${p.stage_as_printed})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 text-label-md text-on-surface-variant leading-relaxed">
            <p>
              <span className="text-on-surface font-semibold">{t('facts.from')}</span>{' '}
              {src ? (
                <a className="text-primary hover:underline" href={src.url} target="_blank" rel="noreferrer">{src.title}</a>
              ) : ind.source}
              {ind.table ? ` — ${ind.table}` : ''}
            </p>
            {ind.originating_agency && (
              <p><span className="text-on-surface font-semibold">{t('facts.originated')}</span> {ind.originating_agency}</p>
            )}
            <p className="text-label-sm text-outline">{t('facts.unitPrinted', { unit: ind.unit_as_printed })}</p>
          </div>
        </div>
      )}
    </article>
  )
}

/* ================================================================== page */

export default function StateFacts() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const tip = useChartTip()

  useEffect(() => {
    apiGet('/state-facts/').then(d => { setData(d); setError(null) }).catch(setError)
  }, [])

  const shown = useMemo(() => {
    if (!data) return []
    const k = q.trim().toLowerCase()
    return data.indicators.filter(i =>
      (group === 'all' || i.group === group) &&
      (!k || i.label.toLowerCase().includes(k) || (i.what_it_means || '').toLowerCase().includes(k)))
  }, [data, group, q])

  if (error) {
    return <div className="max-w-6xl mx-auto px-4 py-10">
      <p className="text-body-md text-on-surface">{t('facts.error', { message: error.message })}</p>
    </div>
  }
  if (!data) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('facts.loading')}</div>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-headline-lg font-headline-lg text-on-surface">{t('facts.title')}</h1>
        <p className="text-body-lg font-body-lg text-on-surface leading-relaxed max-w-3xl">
          {t('facts.intro', { n: data.counts.indicators, points: data.counts.points, sources: data.counts.sources })}
        </p>
        <div className="grid sm:grid-cols-2 gap-3 max-w-4xl">
          {[data.notes.tenure, data.notes.stages].filter(Boolean).map((n, i) => (
            <p key={i} className="text-label-md text-on-surface-variant bg-surface-container rounded-lg px-4 py-3 leading-relaxed">
              {n}
            </p>
          ))}
        </div>
      </header>

      {/* ------------------------------------------------------- controls */}
      <div className="flex flex-col gap-3 sticky top-0 z-20 bg-surface/95 backdrop-blur py-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none">search</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder={t('facts.searchPlaceholder')}
            aria-label={t('facts.searchPlaceholder')}
            className="w-full ps-11 pe-4 py-2.5 rounded-full border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ key: 'all', label: t('facts.allGroups') }, ...data.groups].map(g => (
            <button key={g.key} type="button" onClick={() => setGroup(g.key)}
              aria-pressed={group === g.key}
              className={[
                'text-label-md px-3 py-1.5 rounded-full border transition-colors',
                group === g.key
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
              ].join(' ')}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {group !== 'all' && (
        <p className="text-body-md text-on-surface-variant max-w-3xl -mt-4 leading-relaxed">
          {data.groups.find(g => g.key === group)?.sub}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-xl px-5 py-8 text-center">
          {t('facts.none')}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map(i => (
            <IndicatorCard key={i.key} ind={i} sources={data.sources} tip={tip} t={t} />
          ))}
        </div>
      )}

      {/* ----------------------------------------------- figures with no year */}
      {data.undated_facts?.length > 0 && group === 'all' && !q && (
        <section className="flex flex-col gap-2">
          <h2 className="text-title-md font-title-md text-on-surface">{t('facts.undatedTitle')}</h2>
          <p className="text-label-md text-on-surface-variant max-w-3xl leading-relaxed">{t('facts.undatedSub')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.undated_facts.map(f => (
              <div key={f.key} className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest flex flex-col gap-0.5">
                <span className="text-label-md text-on-surface-variant">{f.label}</span>
                <span className="text-headline-sm font-headline-sm text-on-surface tabular-nums" data-numeric>{fmtIN(f.value)}</span>
                <span className="text-label-sm text-outline">{f.as_of}</span>
                {f.note && <span className="text-label-sm text-outline leading-snug">{f.note}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- the rest */}
      <section className="flex flex-col gap-3 border-t border-surface-variant pt-6">
        <h2 className="text-title-lg font-title-lg text-on-surface">{t('facts.sourcesTitle')}</h2>
        <ul className="text-label-md text-on-surface-variant flex flex-col gap-1.5 leading-relaxed">
          {Object.entries(data.sources).map(([k, s]) => (
            <li key={k}>
              <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
              {s.publisher ? ` — ${s.publisher}` : ''}{s.edition ? `, ${s.edition}` : ''}{s.date ? `, ${s.date}` : ''}
            </li>
          ))}
        </ul>
        <p className="text-label-md text-on-surface-variant max-w-3xl leading-relaxed">{data.notes.bifurcation}</p>
        <p className="text-label-md text-on-surface-variant max-w-3xl leading-relaxed">{data.notes.arithmetic}</p>
        {data.notes.dropped && (
          <p className="text-label-md text-on-surface-variant max-w-3xl leading-relaxed">{data.notes.dropped}</p>
        )}

        {data.unavailable?.length > 0 && (
          <details className="group mt-2">
            <summary className="cursor-pointer text-label-md text-primary font-semibold list-none inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">chevron_right</span>
              {t('facts.missingToggle', { n: data.unavailable.length })}
            </summary>
            <ul className="flex flex-col gap-3 mt-3">
              {data.unavailable.map((u, i) => (
                <li key={i} className="border-s-2 border-outline-variant ps-3 flex flex-col gap-1">
                  <p className="text-label-md text-on-surface leading-relaxed">{u.what}</p>
                  {u.what_a_human_should_do && (
                    <p className="text-label-md text-on-surface-variant leading-relaxed">
                      <span className="text-on-surface font-semibold">{t('facts.toGetIt')}</span> {u.what_a_human_should_do}
                    </p>
                  )}
                  {u.url && (
                    <a className="text-label-sm text-primary hover:underline" href={String(u.url).split(/\s*;\s*/)[0]}
                      target="_blank" rel="noreferrer">{String(u.url).split(/\s*;\s*/)[0]}</a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Deferred minHeight={320}><PageThread pageKey="state-facts" /></Deferred>
      {tip.node}
    </div>
  )
}
