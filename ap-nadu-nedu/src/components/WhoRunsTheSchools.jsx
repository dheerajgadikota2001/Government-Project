import { useMemo, useState } from 'react'
import { VizSection } from './advanced/ChartPrimitives'
import { useT } from '../i18n'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TINT } from '../lib/tenure'

/**
 * Who runs the schools, and did that change.
 *
 * WHY THIS SECTION EXISTS AT ALL
 * The first version of this page showed one school count that mixed government and
 * private schools together. A fall in that number could mean a government closed
 * schools, or that private schools shut, or that the definition moved -- and the
 * reader had no way to tell which. The section was withdrawn for exactly that
 * reason. This replaces it with the state's own ten-year table, split by who runs
 * the school, so the question can actually be answered.
 *
 * Three series, one chosen at a time rather than three charts stacked: schools,
 * enrolment and teachers answer different questions and share no scale. Government
 * is drawn solid because it is the subject; aided and private unaided are drawn
 * lighter because they are context, not the answer.
 *
 * No cross-government verdict is computed here. The change between the first and
 * last year of each government's term is arithmetic and is shown as such; who
 * deserves credit for it is the reader's judgement, and the caveats that would
 * change that judgement sit directly underneath rather than in a footnote.
 */

const SERIES = ['schools', 'enrolment', 'teachers']

function fmt(n) {
  return n == null ? '—' : n.toLocaleString('en-IN')
}

export default function WhoRunsTheSchools({ data }) {
  const { t } = useT()
  const [series, setSeries] = useState('schools')
  const rows = data?.[series] || []

  // First and last year within each government, from the data itself rather than a
  // hardcoded map, so adding a year to the seed cannot silently break the framing.
  const spans = useMemo(() => {
    const by = {}
    for (const r of rows) (by[r.tenure] ||= []).push(r)
    return Object.entries(by)
      .filter(([k]) => k !== 'pre')
      .map(([k, rs]) => {
        const a = rs[0]
        const b = rs[rs.length - 1]
        return {
          tenure: k,
          from: a.year,
          to: b.year,
          start: a.government_total,
          end: b.government_total,
          change: b.government_total - a.government_total,
          years: rs.length,
        }
      })
  }, [rows])

  if (!rows.length) return null

  const max = Math.max(...rows.map(r => r.total), 1)
  const W = 940
  const H = 250
  const L = 8
  const colW = (W - L - 14) / rows.length

  return (
    <VizSection
      id="who-runs-schools"
      title={t('schoolEd.whoRuns.title')}
      sub={t('schoolEd.whoRuns.sub')}
      provenance={`${data.source.publisher} · ${data.source.name}`}
    >
      <p className="text-body-md text-on-surface-variant max-w-[75ch] mb-3">
        {data.what_it_is}
      </p>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {SERIES.map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={series === k}
            onClick={() => setSeries(k)}
            className={`px-3 py-1.5 rounded-full text-label-md border transition-colors
              ${series === k
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container'}`}
          >
            {t(`schoolEd.whoRuns.series.${k}`)}
          </button>
        ))}
      </div>

      {/* stacked bars: government solid, aided and private lighter */}
      <div className="overflow-x-auto" dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img"
          aria-label={t(`schoolEd.whoRuns.series.${series}`)}>
          {rows.map((r, i) => {
            const x = L + i * colW
            const scale = 190 / max
            const g = r.government_total * scale
            const a = r.private_aided * scale
            const p = r.private_unaided * scale
            let y = 200
            const bar = (h, fill, op) => {
              y -= h
              return <rect x={x + colW * 0.18} y={y} width={colW * 0.64} height={Math.max(h, 0)}
                fill={fill} opacity={op} />
            }
            return (
              <g key={r.year}>
                {bar(g, TINT[r.tenure] || '#9b9992', 1)}
                {bar(a, TINT[r.tenure] || '#9b9992', 0.45)}
                {bar(p, TINT[r.tenure] || '#9b9992', 0.2)}
                <text x={x + colW / 2} y={216} textAnchor="middle"
                  className="fill-on-surface-variant" style={{ fontSize: 10 }}>
                  {r.year.slice(2)}
                </text>
              </g>
            )
          })}
          <line x1={L} y1="200" x2={W - 14} y2="200" stroke="currentColor" opacity="0.25" />
        </svg>
      </div>
      <p className="text-label-sm text-on-surface-variant mb-4">{t('schoolEd.whoRuns.legend')}</p>

      {/* the arithmetic, per government, with the year count attached */}
      <div className="grid gap-3 sm:grid-cols-2">
        {spans.map(s => (
          <div key={s.tenure} className="rounded-lg border border-outline-variant p-3">
            <div className="text-label-sm text-outline">
              {t(`depts.tenure.${s.tenure}`)} · {s.from} → {s.to}
            </div>
            <div className="text-headline-sm font-bold text-on-surface mt-1 tabular-nums">
              {s.change > 0 ? '+' : ''}{fmt(s.change)}
            </div>
            <div className="text-label-sm text-on-surface-variant mt-0.5">
              {t('schoolEd.whoRuns.fromTo', {
                from: fmt(s.start), to: fmt(s.end), n: s.years,
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-label-sm text-on-surface-variant mt-2 max-w-[75ch]">
        {t('schoolEd.whoRuns.arithmeticNote')}
      </p>

      <p className="text-label-sm text-on-surface-variant mt-4 max-w-[75ch]">
        {data.government_definition}
      </p>

      {/* the things that would change how the numbers above should be read */}
      <div className="mt-4 flex flex-col gap-2">
        {(data.caveats || []).map(c => (
          <div key={c.title} className="rounded-lg border-s-4 border-amber-400/70 bg-surface-container p-3">
            <div className="text-label-md font-bold text-on-surface">{c.title}</div>
            <p className="text-body-sm text-on-surface-variant mt-1 max-w-[75ch]">{c.body}</p>
          </div>
        ))}
      </div>

      <details className="mt-4 border border-surface-variant rounded-lg">
        <summary className="cursor-pointer px-3 py-2 text-label-md text-on-surface">
          {t('depts.everyRow', { count: rows.length })}
        </summary>
        <div className="px-3 pb-3 overflow-x-auto" dir="ltr">
          <table className="w-full min-w-[620px] text-label-md border-collapse">
            <thead>
              <tr className="border-b border-surface-variant text-on-surface-variant">
                {['year', 'government', 'aided', 'private', 'total'].map(h => (
                  <th key={h} className="py-2 pe-3 text-start font-normal">
                    {t(`schoolEd.whoRuns.col.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.year} className="border-b border-surface-variant/60">
                  <td className="py-1.5 pe-3 tabular-nums">{r.year}</td>
                  <td className="py-1.5 pe-3 tabular-nums font-bold">{fmt(r.government_total)}</td>
                  <td className="py-1.5 pe-3 tabular-nums">{fmt(r.private_aided)}</td>
                  <td className="py-1.5 pe-3 tabular-nums">{fmt(r.private_unaided)}</td>
                  <td className="py-1.5 pe-3 tabular-nums">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </VizSection>
  )
}
