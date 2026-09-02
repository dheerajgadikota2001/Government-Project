import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import { useChartTip, fmtIN, HBarChart, VizSection } from '../components/advanced/ChartPrimitives'
// Government colours come from one module: nine files used to declare their own
// map and had drifted to three different values for the 2024 government.
import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'

/**
 * One government's investment record, in depth.
 *
 * Scoped by the SIGNING DATE recorded on each MoU. Two things are said out
 * loud on every screen here, because without them the totals mislead: an MoU
 * is a promise rather than money spent, and our register holds only the
 * commitments we have documented, so every total is a floor and not the
 * state's full tally.
 */

const STATUS_COLOR = {
  operational: '#137333', investment_started: '#2a78d6', signed: '#86b6ef',
  stalled: '#a50e0e', cancelled: '#6b6a64',
}
// Values are key paths, resolved at render so they follow the chosen language.
const STATUS_EXPLAIN = {
  signed: 'invDive.statusExplain.signed',
  investment_started: 'invDive.statusExplain.investmentStarted',
  operational: 'invDive.statusExplain.operational',
  stalled: 'invDive.statusExplain.stalled',
  cancelled: 'invDive.statusExplain.cancelled',
}
const title = s => (s ? String(s).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : s)

/** ₹ crore, rolled up to lakh crore, with the unit in the chosen language. */
const makeFmtCr = t => v =>
  v == null || v === 0
    ? '—'
    : v >= 100000
      ? `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
      : `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`

/** Compact axis/bar labels: 1.2L or a grouped number. */
const makeShort = t => v => (v >= 100000 ? `${(v / 100000).toFixed(1)}${t('invDive.lakhShort')}` : fmtIN(Math.round(v)))

function Tile({ label, value, detail }) {
  return (
    <div className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
      <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{label}</p>
      <p className="text-headline-sm font-headline-sm font-bold text-on-surface mt-0.5 tabular-nums">{value}</p>
      {detail && <p className="text-label-sm text-on-surface-variant mt-0.5">{detail}</p>}
    </div>
  )
}

function YearBars({ rows, tip }) {
  const { t, tn } = useT()
  const fmtCr = makeFmtCr(t)
  const short = makeShort(t)
  if (!rows?.length) return null
  const max = Math.max(...rows.map(r => r.investment_crore), 1)
  return (
    <div className="flex items-end gap-3 h-[170px]" data-flex-h onMouseLeave={tip.hide}>
      {rows.map(r => (
        <div key={r.year} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
          <span className="text-label-sm text-on-surface-variant tabular-nums whitespace-nowrap">
            {short(r.investment_crore)}
          </span>
          <span className="w-full rounded-t-md cursor-pointer transition-opacity hover:opacity-80"
            style={{ height: `${Math.max(4, (r.investment_crore / max) * 100)}%`, background: '#2a78d6' }}
            onMouseMove={e => tip.show(e, `${r.year}`, fmtCr(r.investment_crore), tn('invDive.year.tipSigned', r.count, { count: fmtIN(r.count) }))}
            onMouseLeave={tip.hide} />
          <span className="text-label-sm text-on-surface-variant tabular-nums">{r.year}</span>
        </div>
      ))}
    </div>
  )
}

const TABLE_COLUMNS = [
  { key: 'invDive.table.company', align: 'py-2 pe-3' },
  { key: 'invDive.table.sector', align: 'py-2 pe-3' },
  { key: 'invDive.table.signed', align: 'py-2 pe-3' },
  { key: 'invDive.table.promised', align: 'py-2 pe-3 text-end' },
  { key: 'invDive.table.jobs', align: 'py-2 pe-3 text-end' },
  { key: 'invDive.table.statusToday', align: 'py-2' },
]

export default function InvestmentTenureDive() {
  const { key } = useParams()
  const { t, tn } = useT()
  const tip = useChartTip()
  const [ins, setIns] = useState(null)
  const [byTenure, setByTenure] = useState(null)
  const [list, setList] = useState([])
  const [error, setError] = useState(null)

  const fmtCr = makeFmtCr(t)
  const short = makeShort(t)
  const fmtDate = iso =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : t('invDive.today')

  useEffect(() => {
    let cancelled = false
    setIns(null); setList([]); setError(null)
    apiGet('/mous/insights', { tenure: key })
      .then(d => { if (!cancelled) setIns(d) })
      .catch(e => { if (!cancelled) setError(e) })
    apiGet('/mous/by-tenure')
      .then(d => { if (!cancelled) setByTenure(d) })
      .catch(() => {})
    apiGet('/mous/', { tenure: key, sort: 'investment', order: 'desc', page_size: 50 })
      .then(r => { if (!cancelled) setList(r.items || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{t('invDive.errorServer', { message: error.message })}</p>
        <Link className="text-primary text-label-md" to="/investments">{t('invDive.allInvestments')}</Link>
      </div>
    )
  }
  if (!ins) return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('invDive.loading')}</div>

  const ten = ins.tenure
  if (!ten) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{t('invDive.unknownTenure')}</p>
        <Link className="text-primary text-label-md" to="/investments">{t('invDive.allInvestments')}</Link>
      </div>
    )
  }

  const rec = byTenure?.tenures?.find(x => x.key === ten.key)
  const tint = TENURE_TINT[ten.key] || '#2a78d6'
  const sectors = ins.by_sector.filter(s => s.investment_crore > 0)
  const totalInv = sectors.reduce((s, x) => s + x.investment_crore, 0)
  const totalJobs = ins.by_sector.reduce((s, x) => s + x.jobs, 0)
  const districts = ins.by_district.slice(0, 8)
  const operational = ins.by_status.find(s => s.status === 'operational')?.count || 0

  // If a tenure has no documented MoUs at all, say that instead of drawing empty charts.
  if (ins.total === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-4">
        <Link className="text-primary text-label-md" to="/investments">{t('invDive.allInvestments')}</Link>
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
          {t('invDive.emptyTitle', { party: ten.party })}
        </h1>
        <p className="text-body-md text-on-surface leading-relaxed">
          {t('invDive.emptyBody', { from: fmtDate(ten.from), to: fmtDate(ten.to) })}
        </p>
        <Link className="text-primary text-label-md font-bold" to="/sources">{t('invDive.docsWeHold')}</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/investments">{t('invDive.allInvestments')}</Link>
        <div className="mt-2 ps-4" style={{ borderLeft: `5px solid ${tint}` }}>
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
            {t('invDive.title', { party: ten.party })}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {ten.cm} · {t('invDive.dateRange', { from: fmtDate(ten.from), to: fmtDate(ten.to) })}
          </p>
        </div>
      </div>

      <section className="bg-surface-container rounded-xl px-4 py-3 flex flex-col gap-2">
        <p className="text-label-md font-bold text-on-surface">{t('invDive.readCorrectly')}</p>
        <p className="text-label-md text-on-surface-variant max-w-4xl">
          {t('invDive.countedBy.lead')}{' '}
          <strong>{t('invDive.countedBy.signingDate')}</strong>
          {t('invDive.countedBy.rest')}
        </p>
        <p className="text-label-md text-on-surface-variant max-w-4xl">
          <strong className="text-on-surface">{t('invDive.floor.lead')}</strong>{' '}
          {tn('invDive.floor.body', ins.total, {
            count: fmtIN(ins.total),
            withInvestment: fmtIN(rec?.with_investment_count ?? 0),
            withJobs: fmtIN(rec?.with_jobs_count ?? 0),
          })}{' '}
          <Link className="text-primary underline" to="/sources">{t('invDive.floor.whereFrom')}</Link>
        </p>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label={t('invDive.tiles.mousOnRecord')} value={fmtIN(ins.total)} detail={t('invDive.tiles.signedInTerm')} />
        <Tile label={t('invDive.tiles.investmentPromised')} value={fmtCr(totalInv)}
          detail={t('invDive.tiles.acrossNamingAmount', { n: fmtIN(rec?.with_investment_count ?? 0) })} />
        <Tile label={t('invDive.tiles.jobsPromised')} value={totalJobs ? fmtIN(totalJobs) : t('invDive.tiles.nonePublished')}
          detail={t('invDive.tiles.acrossNamingJobs', { n: fmtIN(rec?.with_jobs_count ?? 0) })} />
        <Tile label={t('invDive.tiles.recordedOperational')} value={fmtIN(operational)}
          detail={t('invDive.tiles.ofSignedInTerm', { n: fmtIN(ins.total) })} />
      </div>

      {ins.by_year?.length > 0 && (
        <VizSection
          title={t('invDive.viz.years.title')}
          sub={t('invDive.viz.years.sub')}
          provenance={t('invDive.viz.years.provenance')}
        >
          <YearBars rows={ins.by_year} tip={tip} />
        </VizSection>
      )}

      <VizSection
        title={t('invDive.viz.sectors.title')}
        sub={t('invDive.viz.sectors.sub')}
        provenance={t('invDive.viz.sectors.provenance')}
      >
        {sectors.length ? (
          <HBarChart tip={tip} unit={t('unit.crore')}
            rows={sectors.map(x => ({
              label: title(x.sector), value: x.investment_crore,
              tipDetail: [
                tn('invDive.mouCount', x.count, { count: fmtIN(x.count) }),
                x.jobs ? t('invDive.viz.sectors.tipJobs', { jobs: fmtIN(x.jobs) }) : t('invDive.viz.sectors.tipNoJobs'),
                t('invDive.viz.sectors.tipShare', { pct: ((x.investment_crore / totalInv) * 100).toFixed(1) }),
              ].join(' · '),
            }))}
            maxValue={Math.max(...sectors.map(x => x.investment_crore))}
            valueFmt={short} />
        ) : <p className="text-body-md text-on-surface-variant">{t('invDive.viz.sectors.none')}</p>}
      </VizSection>

      <VizSection
        title={t('invDive.viz.status.title')}
        sub={t('invDive.viz.status.sub')}
        provenance={t('invDive.viz.status.provenance')}
      >
        <div className="flex flex-col gap-2">
          {[...ins.by_status].sort((a, b) => b.count - a.count).map(s => (
            <div key={s.status} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-3">
                <span className="text-label-md text-on-surface-variant w-40 shrink-0">{title(s.status)}</span>
                <span className="flex-1 h-5 bg-surface-container rounded-sm overflow-hidden">
                  <span className="block h-full rounded-sm"
                    style={{ width: `${(s.count / ins.total) * 100}%`, background: STATUS_COLOR[s.status] || '#9a9890' }} />
                </span>
                <span className="text-label-md font-bold tabular-nums w-36 text-end">
                  {fmtIN(s.count)} · {fmtCr(s.investment_crore)}
                </span>
              </div>
              <p className="text-label-sm text-on-surface-variant ms-[10.75rem]">
                {STATUS_EXPLAIN[s.status] ? t(STATUS_EXPLAIN[s.status]) : ''}
              </p>
            </div>
          ))}
        </div>
      </VizSection>

      {districts.length > 0 && (
        <VizSection
          title={t('invDive.viz.districts.title')}
          sub={t('invDive.viz.districts.sub')}
          provenance={tn('invDive.viz.districts.provenance', ins.no_district_count, { count: fmtIN(ins.no_district_count) })}
        >
          <HBarChart tip={tip} unit={t('unit.crore')}
            rows={districts.map(d => ({
              label: d.district, value: d.investment_crore,
              tipDetail: tn('invDive.mouCount', d.count, { count: fmtIN(d.count) }),
            }))}
            maxValue={Math.max(...districts.map(d => d.investment_crore))}
            valueFmt={short} />
        </VizSection>
      )}

      {list.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-md font-bold text-on-surface border-b border-surface-variant pb-2">
            {t('invDive.table.title')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-label-md">
              <thead>
                <tr className="text-start text-on-surface-variant border-b border-surface-variant">
                  {TABLE_COLUMNS.map(c => (
                    <th key={c.key} className={c.align}>{t(c.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(m => (
                  <tr key={m.id} className="border-b border-surface-variant/60">
                    <td className="py-2 pe-3 text-on-surface font-medium">{m.company_name}</td>
                    <td className="py-2 pe-3 text-on-surface-variant">{title(m.sector)}</td>
                    <td className="py-2 pe-3 text-on-surface-variant tabular-nums whitespace-nowrap">
                      {m.signed_date ? new Date(m.signed_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums font-bold">
                      {m.investment_crore != null ? fmtCr(m.investment_crore) : t('common.notPublished')}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {m.expected_employment != null ? fmtIN(m.expected_employment) : t('common.notPublished')}
                    </td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: STATUS_COLOR[m.status] || '#9a9890' }} />
                        {title(m.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-label-sm text-on-surface-variant">
            {t('invDive.table.note')}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-4 border-t border-surface-variant pt-4">
        <Link className="text-label-md text-primary font-bold" to={`/investments?tenure=${ten.key}`}>
          {t('invDive.links.openInRegister')}
        </Link>
        <Link className="text-label-md text-primary font-bold" to={`/projects/tenure/${ten.key}`}>
          {t('invDive.links.projectRecord')}
        </Link>
        <Link className="text-label-md text-primary" to="/sources">{t('common.dataSources')}</Link>
      </div>
      {tip.node}
    </div>
  )
}
