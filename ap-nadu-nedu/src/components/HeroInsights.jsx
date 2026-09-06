import { useEffect, useRef, useState } from 'react'
import { SEQ, fmtIN } from './advanced/ChartPrimitives'
import { useT } from '../i18n'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'

/**
 * Hero insight strip — the three or four pictures that answer "what is in
 * here?" before a reader touches a filter. Deliberately small and uniform:
 * one row of equal cards, one chart each, one plain-language line under each.
 * Every mark has a hover readout with the real figures; nothing is estimated,
 * and gaps are shown as gaps.
 */

/**
 * Unit words come from the catalogue, so `t` is passed in rather than looked
 * up with a hook — this is called from render bodies and from row builders.
 * Without `t` it falls back to English, which keeps old callers working.
 */
export const fmtCr = (v, t) => {
  const lakhCr = t ? t('unit.lakhCrore') : 'lakh Cr'
  const cr = t ? t('unit.crore') : 'Cr'
  return v == null ? '—' : v >= 100000 ? `₹${(v / 100000).toFixed(2)} ${lakhCr}`
    : v >= 1000 ? `₹${fmtIN(Math.round(v))} ${cr}` : `₹${Math.round(v)} ${cr}`
}

const title = s => (s ? String(s).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : s)

/**
 * A readout is one sentence, so it is one translation unit: the catalogue
 * string carries **bold** (and *italic*) markers and this turns them into
 * elements. A translation that drops the markers still renders, unstyled.
 */
function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

/** Audit stage codes as they are printed on the source documents. */
const STAGE_KEY = { A: 'hero.stage.a', RE: 'hero.stage.re', BE: 'hero.stage.be' }
export const stageWord = (t, code) => (STAGE_KEY[code] ? t(STAGE_KEY[code]) : code)

/** Shared hover readout, anchored to the card so it never escapes the strip. */
function useReadout(fallback) {
  const [hot, setHot] = useState(null)
  return { hot, setHot, shown: hot || fallback }
}

/** The expanded view of one chart: same data, more room, plus the numbers. */
function Expanded({ open, onClose, label, unit, note, rows, chart, children }) {
  const { t } = useT()
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose}
      className="rounded-2xl p-0 w-[min(860px,calc(100vw-24px))] max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain bg-surface backdrop:bg-black/45">
      <div className="sticky top-0 bg-surface z-10 flex justify-between items-start px-6 pt-5 pb-3 border-b border-surface-variant gap-3">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold">{label}</h2>
          {note && <p className="text-label-sm text-on-surface-variant mt-0.5 max-w-xl">{note}</p>}
        </div>
        <button onClick={onClose} aria-label={t('common.close')}
          className="w-9 h-9 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container shrink-0">✕</button>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">
        <div className="text-[1.25rem]">{chart || children}</div>
        {rows?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-label-md">
              <thead>
                <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                  <th className="py-2 pe-3">{t('common.item')}</th>
                  <th className="py-2 pe-3 text-end">{unit || t('common.value')}</th>
                  <th className="py-2 text-end">{t('common.share')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} className="border-b border-surface-variant/60">
                    <td className="py-1.5 pe-3 text-on-surface">{r.label}</td>
                    <td className="py-1.5 pe-3 text-end tabular-nums font-bold">{r.display}</td>
                    <td className="py-1.5 text-end tabular-nums text-on-surface-variant">{r.share}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </dialog>
  )
}

function Card({ label, children, readout, footer, expand }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide min-w-0">{label}</p>
        {expand && (
          <button onClick={() => setOpen(true)} title={t('common.openChartLarger')}
            aria-label={t('common.openNamedLarger', { label })}
            className="shrink-0 w-6 h-6 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container text-[13px] leading-none">
            ⤢
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={expand ? () => setOpen(true) : undefined}
        className={`min-h-[112px] flex items-center w-full text-start ${expand ? 'cursor-zoom-in' : 'cursor-default'}`}>
        {children}
      </button>
      <div className="border-t border-dashed border-surface-variant pt-2 flex flex-col gap-1 flex-grow">
        <p className="text-body-md text-on-surface leading-snug">{readout}</p>
        {footer && <p className="text-label-sm text-on-surface-variant">{footer}</p>}
        {expand && (
          <button onClick={() => setOpen(true)}
            className="text-label-sm text-primary font-semibold mt-auto pt-1 text-start hover:underline">
            {t('common.openLarger')}
          </button>
        )}
      </div>
      {expand && (
        <Expanded open={open} onClose={() => setOpen(false)} label={label} {...expand}>
          {children}
        </Expanded>
      )}
    </section>
  )
}

/** Horizontal share bars — top N rows, each hoverable. */
function ShareBars({ rows, onHover, valueOf, max, fmt, wide = false, showShare = false, total }) {
  // Compact, the label column is clipped so the bars keep their length. Wide is
  // for the expanded view, where the reader opened the chart to read the labels:
  // nothing is truncated, each bar carries its value and, optionally, its share.
  return (
    <div className={`w-full flex flex-col ${wide ? 'gap-2.5' : 'gap-1.5'}`} onMouseLeave={() => onHover?.(null)}>
      {rows.map((r, i) => {
        const v = valueOf(r)
        return (
          <div key={r.key} className="flex items-center gap-2 cursor-default"
            onMouseEnter={() => onHover?.(r)} tabIndex={0} onFocus={() => onHover?.(r)}>
            <span
              className={
                wide
                  ? 'text-label-md text-on-surface w-[38%] shrink-0 break-words leading-snug'
                  : 'text-label-sm text-on-surface-variant w-[92px] shrink-0 truncate'
              }
              data-nowrap-en={wide ? undefined : ''}
              title={r.label}
            >
              {r.label}
            </span>
            <span className={`flex-1 ${wide ? 'h-6' : 'h-3.5'} bg-surface-container rounded-sm overflow-hidden`}>
              <span className="block h-full rounded-sm transition-all"
                style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: SEQ[Math.min(i, SEQ.length - 3)] }} />
            </span>
            {fmt && (
              <span className={`text-label-${wide ? 'md' : 'sm'} tabular-nums font-${wide ? 'bold' : 'normal'} text-on-surface${wide ? '' : '-variant'} ${wide ? 'w-[104px]' : 'w-[74px]'} shrink-0 text-end`}>
                {fmt(v)}
              </span>
            )}
            {showShare && total > 0 && (
              <span className="text-label-sm tabular-nums text-on-surface-variant w-[52px] shrink-0 text-end">
                {((v / total) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One stacked strip showing a part-to-whole split. */
function SplitStrip({ parts, total, onHover }) {
  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full h-9 rounded-lg overflow-hidden flex gap-[2px]" onMouseLeave={() => onHover(null)}>
        {parts.map((p, i) => (
          <div key={p.key} className="h-full cursor-default transition-opacity hover:opacity-80"
            style={{ width: `${(p.value / total) * 100}%`, background: p.color || SEQ[Math.min(i, SEQ.length - 2)] }}
            onMouseEnter={() => onHover(p)} tabIndex={0} onFocus={() => onHover(p)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p, i) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 text-label-sm text-on-surface-variant min-w-0">
            <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.color || SEQ[Math.min(i, SEQ.length - 2)] }} />
            {p.label} <span className="tabular-nums font-bold text-on-surface">{fmtIN(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Columns, one per government tenure. */
function TenureBars({ items, onHover, valueOf, fmt }) {
  const max = Math.max(...items.map(valueOf), 1)
  return (
    <div data-flex-h className="w-full flex items-end gap-3 h-[108px]" onMouseLeave={() => onHover(null)}>
      {items.map(it => (
        <div key={it.key} className="flex-1 min-w-0 flex flex-col items-center gap-1 cursor-default h-full justify-end"
          onMouseEnter={() => onHover(it)} tabIndex={0} onFocus={() => onHover(it)}>
          {fmt && (
            <span className="text-label-sm tabular-nums text-on-surface font-bold whitespace-nowrap">
              {fmt(valueOf(it))}
            </span>
          )}
          <span className="w-full rounded-t-md transition-all"
            style={{ height: `${Math.max(4, (valueOf(it) / max) * 74)}%`, background: it.color }} />
          <span data-nowrap-en className="text-label-sm text-on-surface-variant whitespace-nowrap">{it.short}</span>
        </div>
      ))}
    </div>
  )
}

const STATUS_COLOR = {
  completed: '#137333', under_construction: '#2a78d6', tendered: '#86b6ef',
  approved: '#a8cbf5', announced: '#9a9890', delayed: '#a50e0e',
  suspended: '#ec835a', cancelled: '#6b6a64',
  operational: '#137333', investment_started: '#2a78d6', signed: '#86b6ef',
  stalled: '#a50e0e',
}

/* ------------------------------------------------------------------ */
/* PROJECTS                                                            */
/* ------------------------------------------------------------------ */
export function ProjectsHero({ insights, byTenure }) {
  const { t, tn } = useT()
  const st = useReadout(null)
  const ty = useReadout(null)
  const di = useReadout(null)
  const te = useReadout(null)
  if (!insights) return null

  const cr = v => fmtCr(v, t)
  const total = insights.total || 1
  const statusParts = insights.by_status
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(s => ({
      key: s.status, label: title(s.status), value: s.count,
      color: STATUS_COLOR[s.status] || '#9a9890', cost: s.cost_crore,
    }))
  const built = insights.by_status.find(s => s.status === 'completed')?.count || 0

  const types = insights.by_type.filter(x => x.cost_crore > 0).slice(0, 5).map(x => ({
    key: x.type, label: title(x.type), cost: x.cost_crore, count: x.count,
  }))
  const typeMax = Math.max(...types.map(x => x.cost), 1)

  const districts = insights.by_district.slice(0, 5).map(d => ({
    key: d.district, label: d.district, count: d.count, cost: d.cost_crore,
  }))
  const distMax = Math.max(...districts.map(d => d.count), 1)

  const tenures = (byTenure?.tenures || []).map(x => ({
    key: x.key, short: x.party.replace('TDP-led ', ''), label: x.label,
    count: x.announced_count, cost: x.announced_cost_crore, color: TENURE_TINT[x.key],
  }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card
        label={t('hero.projects.status.label')}
        readout={st.hot
          ? rich(t('hero.projects.status.hot', {
            count: fmtIN(st.hot.value), status: st.hot.label.toLowerCase(), cost: cr(st.hot.cost),
          }))
          : rich(t('hero.projects.status.readout', {
            built: fmtIN(built), total: fmtIN(insights.total),
          }))}
        footer={st.hot ? null : t('hero.projects.status.footer')}
        expand={{
          unit: t('hero.unit.projects'), note: t('hero.projects.status.note'),
          rows: statusParts.map(p => ({ label: p.label, display: fmtIN(p.value), share: `${((p.value / total) * 100).toFixed(1)}%` })),
        }}
      >
        <SplitStrip parts={statusParts} total={total} onHover={st.setHot} />
      </Card>

      <Card
        label={t('hero.projects.type.label')}
        readout={ty.hot
          ? rich(t('hero.projects.type.hot', {
            type: ty.hot.label, cost: cr(ty.hot.cost), count: fmtIN(ty.hot.count),
          }))
          : types[0]
            ? rich(t('hero.projects.type.readout', { type: types[0].label, cost: cr(types[0].cost) }))
            : t('hero.projects.type.empty')}
        footer={ty.hot ? null : t('hero.projects.type.footer')}
        expand={{
          unit: t('hero.unit.publishedCost'), note: t('hero.projects.type.note'),
          rows: insights.by_type.filter(x => x.cost_crore > 0).map(x => ({
            label: title(x.type), display: cr(x.cost_crore),
            share: tn('hero.projects.nProjects', x.count, { count: fmtIN(x.count) }),
          })),
        }}
      >
        <ShareBars rows={types} onHover={ty.setHot} valueOf={r => r.cost} max={typeMax} fmt={cr} />
      </Card>

      <Card
        label={t('hero.projects.district.label')}
        readout={di.hot
          ? rich(t('hero.projects.district.hot', {
            district: di.hot.label, count: fmtIN(di.hot.count), cost: cr(di.hot.cost),
          }))
          : districts[0]
            ? rich(t('hero.projects.district.readout', {
              district: districts[0].label, count: fmtIN(districts[0].count),
            }))
            : t('hero.projects.district.empty')}
        footer={di.hot ? null : t('hero.projects.district.footer', { count: fmtIN(insights.statewide_count) })}
        expand={{
          unit: t('hero.unit.projects'),
          note: t('hero.projects.district.note', { count: fmtIN(insights.statewide_count) }),
          rows: insights.by_district.map(d => ({
            label: d.district, display: fmtIN(d.count), share: cr(d.cost_crore),
          })),
        }}
      >
        <ShareBars rows={districts} onHover={di.setHot} valueOf={r => r.count} max={distMax} fmt={v => fmtIN(Math.round(v))} />
      </Card>

      <Card
        label={t('hero.projects.tenure.label')}
        readout={te.hot
          ? rich(t('hero.projects.tenure.hot', {
            tenure: te.hot.label, count: fmtIN(te.hot.count), cost: cr(te.hot.cost),
          }))
          : t('hero.projects.tenure.readout')}
        footer={te.hot ? null : byTenure?.unattributed_count
          ? t('hero.projects.tenure.footer', { count: fmtIN(byTenure.unattributed_count) })
          : null}
        expand={{
          unit: t('hero.unit.announced'), note: t('hero.projects.tenure.note'),
          rows: tenures.map(x => ({ label: x.label, display: fmtIN(x.count), share: cr(x.cost) })),
        }}
      >
        {tenures.length > 0
          ? <TenureBars items={tenures} onHover={te.setHot} valueOf={x => x.count} fmt={v => fmtIN(Math.round(v))} />
          : <p className="text-label-md text-on-surface-variant">{t('common.loading')}</p>}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* INVESTMENTS                                                         */
/* ------------------------------------------------------------------ */
export function InvestmentsHero({ insights, byTenure, stats }) {
  const { t, tn } = useT()
  const se = useReadout(null)
  const st = useReadout(null)
  const di = useReadout(null)
  const te = useReadout(null)
  if (!insights) return null

  const cr = v => fmtCr(v, t)
  const total = insights.total || 1
  const sectors = insights.by_sector.filter(s => s.investment_crore > 0).slice(0, 5).map(s => ({
    key: s.sector, label: title(s.sector), cost: s.investment_crore, count: s.count, jobs: s.jobs,
  }))
  const secMax = Math.max(...sectors.map(s => s.cost), 1)

  const ORDER = ['operational', 'investment_started', 'signed', 'stalled', 'cancelled']
  const statusParts = ORDER
    .map(k => insights.by_status.find(s => s.status === k))
    .filter(s => s && s.count > 0)
    .map(s => ({
      key: s.status, label: title(s.status), value: s.count,
      color: STATUS_COLOR[s.status] || '#9a9890', cost: s.investment_crore,
    }))
  const operational = insights.by_status.find(s => s.status === 'operational')?.count || 0

  const districts = insights.by_district.slice(0, 5).map(d => ({
    key: d.district, label: d.district, cost: d.investment_crore, count: d.count,
  }))
  const distMax = Math.max(...districts.map(d => d.cost), 1)

  const tenures = (byTenure?.tenures || []).map(x => ({
    key: x.key, short: x.party.replace('TDP-led ', ''), label: x.label,
    count: x.signed_count, cost: x.investment_crore, jobs: x.expected_jobs,
    operational: x.operational_count, color: TENURE_TINT[x.key],
  }))

  const jobsTail = n => (n ? ` · ${t('hero.investments.nJobs', { jobs: fmtIN(n) })}` : '')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card
        label={t('hero.investments.sector.label')}
        readout={se.hot
          ? rich(t('hero.investments.sector.hot', {
            sector: se.hot.label, cost: cr(se.hot.cost), count: fmtIN(se.hot.count),
          }) + jobsTail(se.hot.jobs))
          : sectors[0]
            ? rich(t('hero.investments.sector.readout', { sector: sectors[0].label, cost: cr(sectors[0].cost) }))
            : t('hero.investments.sector.empty')}
        footer={se.hot ? null : t('hero.investments.sector.footer')}
        expand={{
          unit: t('hero.unit.promised'), note: t('hero.investments.sector.note'),
          rows: insights.by_sector.filter(s => s.investment_crore > 0).map(s => ({
            label: title(s.sector), display: cr(s.investment_crore),
            share: tn('hero.investments.nMous', s.count, { count: fmtIN(s.count) }) + jobsTail(s.jobs),
          })),
        }}
      >
        <ShareBars rows={sectors} onHover={se.setHot} valueOf={r => r.cost} max={secMax} fmt={cr} />
      </Card>

      <Card
        label={t('hero.investments.status.label')}
        readout={st.hot
          ? rich(t('hero.investments.status.hot', {
            count: fmtIN(st.hot.value), status: st.hot.label.toLowerCase(), cost: cr(st.hot.cost),
          }))
          : rich(t('hero.investments.status.readout', {
            operational: fmtIN(operational), total: fmtIN(insights.total),
          }))}
        footer={st.hot ? null : t('hero.investments.status.footer')}
        expand={{
          unit: t('hero.unit.mous'), note: t('hero.investments.status.note'),
          rows: statusParts.map(p => ({ label: p.label, display: fmtIN(p.value), share: cr(p.cost) })),
        }}
      >
        <SplitStrip parts={statusParts} total={total} onHover={st.setHot} />
      </Card>

      <Card
        label={t('hero.investments.district.label')}
        readout={di.hot
          ? rich(t('hero.investments.district.hot', {
            district: di.hot.label, cost: cr(di.hot.cost), count: fmtIN(di.hot.count),
          }))
          : districts[0]
            ? rich(t('hero.investments.district.readout', { district: districts[0].label, cost: cr(districts[0].cost) }))
            : t('hero.investments.district.empty')}
        footer={di.hot ? null : insights.no_district_count
          ? t('hero.investments.district.footer', { count: fmtIN(insights.no_district_count) })
          : null}
        expand={{
          unit: t('hero.unit.promised'),
          note: t('hero.investments.district.note', { count: fmtIN(insights.no_district_count) }),
          rows: insights.by_district.map(d => ({
            label: d.district, display: cr(d.investment_crore),
            share: tn('hero.investments.nMous', d.count, { count: fmtIN(d.count) }),
          })),
        }}
      >
        <ShareBars rows={districts} onHover={di.setHot} valueOf={r => r.cost} max={distMax} fmt={cr} />
      </Card>

      <Card
        label={t('hero.investments.tenure.label')}
        readout={te.hot
          ? rich(t('hero.investments.tenure.hot', {
            tenure: te.hot.label, count: fmtIN(te.hot.count), cost: cr(te.hot.cost),
            operational: fmtIN(te.hot.operational),
          }))
          : t('hero.investments.tenure.readout')}
        footer={te.hot ? null : byTenure?.unattributed_count
          ? t('hero.investments.tenure.footer', { count: fmtIN(byTenure.unattributed_count) })
          : null}
        expand={{
          unit: t('hero.unit.promised'), note: t('hero.investments.tenure.note'),
          rows: tenures.map(x => ({
            label: x.label, display: cr(x.cost),
            share: t('hero.investments.tenure.rowShare', {
              count: fmtIN(x.count), operational: fmtIN(x.operational),
            }),
          })),
        }}
      >
        {tenures.length > 0
          ? <TenureBars items={tenures} onHover={te.setHot} valueOf={x => x.cost} fmt={cr} />
          : <p className="text-label-md text-on-surface-variant">{t('common.loading')}</p>}
      </Card>
    </div>
  )
}


/* ------------------------------------------------------------------ */
/* FINANCES                                                            */
/* ------------------------------------------------------------------ */

/** A single line drawn from a year series, with a hoverable point per year. */
function MiniLine({ points, onHover, color = '#2a78d6', unit = 'Cr', detailed = false, valueFmt }) {
  // Compact mode is a sparkline: it sits in a small card and the readout line
  // underneath carries the numbers. Expanded, that trade stops making sense —
  // the reader opened it precisely to read the axis — so the detailed mode
  // draws gridlines, a value axis, year labels and a label on every point.
  const { t } = useT()
  const W = detailed ? 720 : 260
  const H = detailed ? 300 : 104
  const PAD = detailed ? 0 : 8
  const L = detailed ? 74 : PAD
  const R = detailed ? 46 : PAD
  const T = detailed ? 24 : PAD
  const B = detailed ? 46 : PAD

  const vals = points.map(p => p.value)
  const max = Math.max(...vals), min = Math.min(...vals, 0)
  const px = i => L + (i * (W - L - R)) / Math.max(1, points.length - 1)
  const py = v => H - B - ((v - min) / Math.max(1, max - min)) * (H - T - B)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(p.value)}`).join(' ')
  const fmt = valueFmt || (v => Math.round(v).toLocaleString('en-IN'))

  // On a long series, label every point crowds; step so labels stay legible.
  const step = Math.ceil(points.length / (detailed ? 12 : points.length))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={detailed ? 'w-full h-auto' : 'w-full h-[104px]'} role="img"
      onMouseLeave={() => onHover?.(null)}>
      {detailed && [0, 0.25, 0.5, 0.75, 1].map(f => {
        const v = min + (max - min) * f
        const y = py(v)
        return (
          <g key={f}>
            <line x1={L} y1={y} x2={W - R} y2={y} stroke="#e1e0d9" strokeWidth="1" />
            <text x={L - 8} y={y + 4} textAnchor="end" fontSize="12" className="fill-outline"
              style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</text>
          </g>
        )
      })}
      <path d={`${d} L ${px(points.length - 1)} ${H - B} L ${px(0)} ${H - B} Z`} fill={color} fillOpacity="0.10" />
      <path d={d} fill="none" stroke={color} strokeWidth={detailed ? 2 : 2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.fy_end}>
          <circle cx={px(i)} cy={py(p.value)} r={i === points.length - 1 ? 4 : 2.6}
            fill={p.stage === 'A' ? color : '#fff'} stroke={color} strokeWidth="1.6"
            className="cursor-pointer"
            onMouseEnter={() => onHover?.({ ...p, unit })} tabIndex={0} onFocus={() => onHover?.({ ...p, unit })} />
          {detailed && i % step === 0 && (
            <>
              <text x={px(i)} y={py(p.value) - 11} textAnchor="middle" fontSize="11.5" fontWeight="600"
                className="fill-on-surface" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(p.value)}{unit === '%' ? '%' : ''}
              </text>
              <text x={px(i)} y={H - B + 18} textAnchor="middle" fontSize="11.5" className="fill-on-surface-variant"
                style={{ fontVariantNumeric: 'tabular-nums' }}>{t('date.fyPrefix')}{p.fy_end}</text>
              {p.stage && (
                <text x={px(i)} y={H - B + 32} textAnchor="middle" fontSize="10" className="fill-outline">
                  {p.stage}
                </text>
              )}
            </>
          )}
        </g>
      ))}
      {detailed && <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#c3c2b7" strokeWidth="1" />}
      {detailed && (
        <text x={L} y={13} fontSize="11.5" className="fill-on-surface-variant">
          {unit === '%' ? t('hero.axis.percentOfGsdp') : t('unit.rupeeCrore')}
        </text>
      )}
    </svg>
  )
}

export function FinancesHero({ finances, governments }) {
  const { t } = useT()
  const de = useReadout(null)
  const co = useReadout(null)
  const ca = useReadout(null)
  const ga = useReadout(null)
  if (!finances?.series) return null

  const cr = v => fmtCr(v, t)
  const fy = y => `${t('date.fyPrefix')}${y}`
  const stage = code => stageWord(t, code)

  const find = (ind, fam) => finances.series.find(
    s => s.indicator === ind && (!fam || s.source_family === fam))
  const debt = find('outstanding_liabilities', 'RBI')
  const gsdp = find('gsdp')
  const off = find('off_budget_borrowings')
  const cap = governments?.spending?.capital_outlay

  // debt as a share of the economy, year by year — the honest way to read debt
  const ratio = (debt?.points || []).map(p => {
    const g = (gsdp?.points || []).find(x => x.fy_end === p.fy_end)
    return g && g.value ? { fy_end: p.fy_end, value: +((p.value / g.value) * 100).toFixed(1), stage: p.stage, abs: p.value } : null
  }).filter(Boolean)

  const comp = finances.composition?.rbi_latest_detail
  const compItems = comp ? [...comp.items].sort((a, b) => b.value - a.value).slice(0, 5)
    .map(i => ({ key: i.name, label: i.name.split('—')[0].trim(), value: i.value })) : []
  const compMax = Math.max(...compItems.map(i => i.value), 1)

  const last = a => (a && a.length ? a[a.length - 1] : null)
  const lastRatio = last(ratio)
  const lastCap = last(cap?.points || [])
  const lastOff = last(off?.points || [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card
        label={t('hero.finances.debt.label')}
        readout={de.hot
          ? rich(t('hero.finances.debt.hot', {
            fy: fy(de.hot.fy_end), value: de.hot.value, amount: cr(de.hot.abs), stage: stage(de.hot.stage),
          }))
          : lastRatio
            ? rich(t('hero.finances.debt.readout', { value: lastRatio.value, fy: fy(lastRatio.fy_end) }))
            : t('hero.finances.notPublished')}
        footer={de.hot ? null : t('hero.finances.debt.footer')}
        expand={{
          unit: t('hero.unit.pctOfGsdp'), note: t('hero.finances.debt.note'),
          rows: ratio.map(r => ({ label: fy(r.fy_end), display: `${r.value}%`, share: cr(r.abs) })),
          chart: <MiniLine points={ratio} onHover={de.setHot} unit="%" detailed valueFmt={v => v.toFixed(1)} />,
        }}
      >
        {ratio.length ? <MiniLine points={ratio} onHover={de.setHot} unit="%" /> : null}
      </Card>

      <Card
        label={t('hero.finances.composition.label')}
        readout={co.hot
          ? rich(t('hero.finances.composition.hot', {
            item: co.hot.label, amount: cr(co.hot.value), pct: ((co.hot.value / comp.total) * 100).toFixed(1),
          }))
          : compItems[0]
            ? rich(t('hero.finances.composition.readout', { item: compItems[0].label, amount: cr(compItems[0].value) }))
            : t('hero.finances.composition.empty')}
        footer={co.hot ? null : comp?.label}
        expand={comp ? {
          unit: t('hero.unit.owed'), note: comp.label,
          chart: (
            <ShareBars
              rows={[...comp.items].sort((a, b) => b.value - a.value)
                .map(i => ({ key: i.name, label: i.name, value: i.value }))}
              valueOf={r => r.value}
              max={Math.max(...comp.items.map(i => i.value), 1)}
              fmt={cr}
              wide
              showShare
              total={comp.total}
            />
          ),
        } : null}
      >
        <ShareBars rows={compItems} onHover={co.setHot} valueOf={r => r.value} max={compMax} fmt={cr} />
      </Card>

      <Card
        label={t('hero.finances.capital.label')}
        readout={ca.hot
          ? rich(t('hero.finances.capital.hot', {
            fy: fy(ca.hot.fy_end), amount: cr(ca.hot.value), stage: stage(ca.hot.stage),
          }))
          : lastCap
            ? rich(t('hero.finances.capital.readout', {
              amount: cr(lastCap.value), fy: fy(lastCap.fy_end), stage: stage(lastCap.stage),
            }))
            : t('hero.finances.notPublished')}
        footer={ca.hot ? null : t('hero.finances.capital.footer')}
        expand={cap ? {
          unit: t('hero.unit.spent'),
          note: t('hero.finances.capital.note', {
            audited: t('hero.stage.a'), revised: t('hero.stage.re'), budget: t('hero.stage.be'),
          }),
          rows: cap.points.map(p => ({ label: fy(p.fy_end), display: cr(p.value), share: stage(p.stage) })),
          chart: <MiniLine points={cap.points} onHover={ca.setHot} color="#155ba8" detailed />,
        } : null}
      >
        {cap?.points?.length ? <MiniLine points={cap.points} onHover={ca.setHot} color="#155ba8" /> : null}
      </Card>

      <Card
        label={t('hero.finances.offBudget.label')}
        readout={ga.hot
          ? rich(t('hero.finances.offBudget.hot', {
            fy: fy(ga.hot.fy_end), amount: cr(ga.hot.value), stage: stage(ga.hot.stage),
          }))
          : lastOff
            ? rich(t('hero.finances.offBudget.readout', { amount: cr(lastOff.value), fy: fy(lastOff.fy_end) }))
            : t('hero.finances.notPublished')}
        footer={ga.hot ? null : t('hero.finances.offBudget.footer')}
        expand={off ? {
          unit: t('hero.unit.borrowed'), note: t('hero.finances.offBudget.note'),
          rows: off.points.map(p => ({ label: fy(p.fy_end), display: cr(p.value), share: stage(p.stage) })),
          chart: <MiniLine points={off.points} onHover={ga.setHot} color="#a50e0e" detailed />,
        } : null}
      >
        {off?.points?.length ? <MiniLine points={off.points} onHover={ga.setHot} color="#a50e0e" /> : null}
      </Card>
    </div>
  )
}
