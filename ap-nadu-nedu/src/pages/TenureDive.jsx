import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useChartTip, fmtIN, HBarChart, VizSection } from '../components/advanced/ChartPrimitives'
import { useT } from '../i18n'

/**
 * One government's project record, in depth.
 *
 * Everything here is scoped by the ANNOUNCEMENT date recorded on each
 * project — the same rule used everywhere else on the platform, so these
 * numbers always agree with the register. The page says out loud what it
 * counted, what it could not attribute, and which figures are the
 * government's own claims rather than audited facts.
 *
 * Party names, CM names, district names, project titles and the tenure
 * stories all arrive from the API and are never keyed; only the chrome is.
 */

import { TENURE_COLOR as TENURE_TINT } from '../lib/tenure'
const STATUS_COLOR = {
  completed: '#137333', under_construction: '#2a78d6', tendered: '#86b6ef',
  approved: '#a8cbf5', announced: '#9a9890', delayed: '#a50e0e',
  suspended: '#ec835a', cancelled: '#6b6a64',
}

/* Status and project-type labels live under projects.status.* / projects.type.*,
 * shared with the register pages. Values the API adds later fall back to the
 * raw string, prettified — never to a bare key. */
const KNOWN_STATUSES = new Set(Object.keys(STATUS_COLOR))
const KNOWN_TYPES = new Set([
  'infrastructure', 'roads', 'irrigation', 'power', 'industrial',
  'urban_development', 'education', 'health', 'agriculture', 'ports',
  'airports', 'railways', 'housing', 'tourism', 'it_tech',
])
const prettifyEnum = s => (s ? String(s).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : s)
const enumLabel = (t, group, known) => v =>
  (v && known.has(v) ? t(`projects.${group}.${v}`) : prettifyEnum(v))

/** Unit words come from the catalogue, so callers pass `t` in. */
const fmtCr = (v, t) => {
  if (v == null || v === 0) return '—'
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
  return `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`
}
const fmtDate = (iso, t) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : t('tenureDive.today'))

/**
 * A sentence is one translation unit, so emphasis travels inside the string:
 * **bold** and *italic* markers become elements here. A translation that drops
 * the markers still renders, just unstyled.
 */
function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function Tile({ label, value, detail }) {
  return (
    <div className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
      <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{label}</p>
      <p className="text-headline-sm font-headline-sm font-bold text-on-surface mt-0.5 tabular-nums">{value}</p>
      {detail && <p className="text-label-sm text-on-surface-variant mt-0.5">{detail}</p>}
    </div>
  )
}

/** Announcements per calendar year inside the term. */
function YearBars({ rows, tip }) {
  const { t } = useT()
  if (!rows?.length) return null
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div className="flex items-end gap-3 h-[150px]" onMouseLeave={tip.hide}>
      {rows.map(r => (
        <div key={r.year} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
          <span className="text-label-sm text-on-surface-variant tabular-nums">{r.count}</span>
          <span
            className="w-full rounded-t-md cursor-pointer transition-opacity hover:opacity-80"
            style={{ height: `${Math.max(4, (r.count / max) * 100)}%`, background: '#2a78d6' }}
            onMouseMove={e => tip.show(e, `${r.year}`,
              t('tenureDive.year.announced', { count: fmtIN(r.count) }),
              t('tenureDive.year.publishedCost', { amount: fmtCr(r.cost_crore, t) }))}
            onMouseLeave={tip.hide}
          />
          <span className="text-label-sm text-on-surface-variant tabular-nums">{r.year}</span>
        </div>
      ))}
    </div>
  )
}

export default function TenureDive() {
  const { t: tr } = useT()
  const { key } = useParams()
  const tip = useChartTip()
  const [ins, setIns] = useState(null)
  const [mou, setMou] = useState(null)
  const [top, setTop] = useState([])
  const [gov, setGov] = useState(null)
  const [error, setError] = useState(null)

  const statusLabel = enumLabel(tr, 'status', KNOWN_STATUSES)
  const typeLabel = enumLabel(tr, 'type', KNOWN_TYPES)

  useEffect(() => {
    let cancelled = false
    setIns(null); setMou(null); setTop([]); setError(null)
    apiGet('/projects/insights', { tenure: key })
      .then(d => { if (!cancelled) setIns(d) })
      .catch(e => { if (!cancelled) setError(e) })
    apiGet('/mous/insights', { tenure: key })
      .then(d => { if (!cancelled) setMou(d) })
      .catch(() => {})
    apiGet('/governments/').then(g => { if (!cancelled) setGov(g) }).catch(() => {})
    apiGet('/projects/', { tenure: key, sort: 'cost', order: 'desc', page_size: 6 })
      .then(r => { if (!cancelled) setTop(r.items || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{tr('tenureDive.errorServer', { message: error.message })}</p>
        <Link className="text-primary text-label-md" to="/projects">{tr('projectDetail.allProjects')}</Link>
      </div>
    )
  }
  if (!ins) return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{tr('tenureDive.loading')}</div>

  const t = ins.tenure
  if (!t) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{tr('tenureDive.unknownTenure')}</p>
        <Link className="text-primary text-label-md" to="/projects">{tr('projectDetail.allProjects')}</Link>
      </div>
    )
  }

  const tint = TENURE_TINT[t.key] || '#2a78d6'
  const story = gov?.tenure_stories?.stories?.[t.key]
  const completed = ins.by_status.find(s => s.status === 'completed')?.count || 0
  const building = ins.by_status.find(s => s.status === 'under_construction')?.count || 0
  const totalCost = ins.by_type.reduce((s, x) => s + x.cost_crore, 0)
  const types = ins.by_type.filter(x => x.cost_crore > 0).slice(0, 6)
  const districts = ins.by_district.slice(0, 8)
  const from = fmtDate(t.from, tr)
  const to = fmtDate(t.to, tr)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/projects">{tr('projectDetail.allProjects')}</Link>
        <div className="mt-2 ps-4" style={{ borderInlineStart: `5px solid ${tint}` }}>
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
            {tr('tenureDive.title', { party: t.party })}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {t.cm} · {tr('tenureDive.dateRange', { from, to })}
          </p>
        </div>
      </div>

      <section className="bg-surface-container rounded-xl px-4 py-3">
        <p className="text-label-md font-bold text-on-surface mb-1">{tr('tenureDive.counts.title')}</p>
        <p className="text-label-md text-on-surface-variant max-w-4xl">
          {rich(tr('tenureDive.counts.body', { from, to }))}{' '}
          <Link className="text-primary underline" to="/sources">{tr('tenureDive.counts.docsLink')}</Link>
        </p>
      </section>


      {story && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-3">
          <div>
            <h2 className="text-headline-sm font-headline-sm font-bold text-on-surface">{story.headline}</h2>
            <p className="text-label-sm text-on-surface-variant mt-1 max-w-3xl">
              {gov?.tenure_stories?.intro}
            </p>
          </div>
          <div className="flex flex-col gap-3 max-w-3xl">
            {story.paragraphs.map((para, i) => (
              <p key={i} className="text-body-md text-on-surface leading-relaxed">
                {para.text}{' '}
                {para.sources.map(sk => {
                  const src = gov?.sources?.[sk]
                  if (!src) return null
                  return (
                    <a key={sk} href={src.pdf || src.url} target="_blank" rel="noreferrer"
                      className="text-label-sm text-primary whitespace-nowrap me-1" title={src.title}>
                      [{src.short}]
                    </a>
                  )
                })}
              </p>
            ))}
          </div>
          {story.not_on_record && (
            <p className="text-label-md text-on-surface-variant border border-dashed border-outline-variant rounded-lg px-3 py-2 max-w-3xl">
              <strong className="text-on-surface">{tr('tenureDive.story.notOnRecord')} </strong>{story.not_on_record}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label={tr('tenureDive.tiles.announced')} value={fmtIN(ins.total)} detail={tr('tenureDive.tiles.announcedDetail')} />
        <Tile label={tr('tenureDive.tiles.publishedCost')} value={fmtCr(totalCost, tr)} detail={tr('tenureDive.tiles.publishedCostDetail')} />
        <Tile label={tr('tenureDive.tiles.completed')} value={fmtIN(completed)} detail={tr('tenureDive.tiles.completedDetail', { count: fmtIN(building) })} />
        <Tile label={tr('tenureDive.tiles.avgProgress')}
          value={ins.average_published_progress != null ? `${ins.average_published_progress}%` : tr('common.notPublished')}
          detail={tr('tenureDive.tiles.avgProgressDetail', { count: fmtIN(ins.with_published_progress) })} />
      </div>

      {ins.by_year?.length > 0 && (
        <VizSection
          title={tr('tenureDive.years.title')}
          sub={tr('tenureDive.years.sub')}
          provenance={tr('tenureDive.years.provenance')}
        >
          <YearBars rows={ins.by_year} tip={tip} />
        </VizSection>
      )}

      <VizSection
        title={tr('tenureDive.types.title')}
        sub={tr('tenureDive.types.sub')}
        provenance={tr('tenureDive.types.provenance')}
      >
        {types.length ? (
          <HBarChart tip={tip} unit={tr('unit.crore')}
            rows={types.map(x => ({
              label: typeLabel(x.type), value: x.cost_crore,
              tipDetail: tr('tenureDive.types.tipDetail', { count: fmtIN(x.count), pct: ((x.cost_crore / totalCost) * 100).toFixed(1) }),
            }))}
            maxValue={Math.max(...types.map(x => x.cost_crore))}
            valueFmt={v => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : fmtIN(Math.round(v)))} />
        ) : <p className="text-body-md text-on-surface-variant">{tr('tenureDive.types.empty')}</p>}
      </VizSection>

      <VizSection
        title={tr('tenureDive.districts.title')}
        sub={tr('tenureDive.districts.sub')}
        provenance={tr('tenureDive.districts.provenance', { count: fmtIN(ins.statewide_count) })}
      >
        {districts.length ? (
          <HBarChart tip={tip} unit=""
            rows={districts.map(d => ({
              label: d.district, value: d.count,
              tipDetail: tr('tenureDive.year.publishedCost', { amount: fmtCr(d.cost_crore, tr) }),
            }))}
            maxValue={Math.max(...districts.map(d => d.count))}
            valueFmt={v => fmtIN(Math.round(v))} />
        ) : <p className="text-body-md text-on-surface-variant">{tr('tenureDive.districts.empty')}</p>}
      </VizSection>

      <VizSection
        title={tr('tenureDive.status.title')}
        sub={tr('tenureDive.status.sub')}
        provenance={tr('tenureDive.status.provenance')}
      >
        <div className="flex flex-col gap-2">
          {ins.by_status.sort((a, b) => b.count - a.count).map(s => (
            <div key={s.status} className="flex items-center gap-3">
              <span className="text-label-md text-on-surface-variant w-40 min-w-0 shrink-0">{statusLabel(s.status)}</span>
              <span className="flex-1 h-5 bg-surface-container rounded-sm overflow-hidden">
                <span className="block h-full rounded-sm"
                  style={{ width: `${(s.count / ins.total) * 100}%`, background: STATUS_COLOR[s.status] || '#9a9890' }} />
              </span>
              <span className="text-label-md font-bold tabular-nums w-28 text-end">
                {fmtIN(s.count)} · {((s.count / ins.total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </VizSection>

      {mou?.total > 0 && (
        <VizSection
          title={tr('tenureDive.mous.title')}
          sub={tr('tenureDive.mous.sub')}
          provenance={tr('tenureDive.mous.provenance')}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label={tr('tenureDive.mous.signed')} value={fmtIN(mou.total)} />
            <Tile label={tr('tenureDive.mous.promised')} value={fmtCr(mou.by_sector.reduce((s, x) => s + x.investment_crore, 0), tr)} />
            <Tile label={tr('tenureDive.mous.jobs')} value={fmtIN(mou.by_sector.reduce((s, x) => s + x.jobs, 0))} />
            <Tile label={tr('tenureDive.mous.operational')}
              value={fmtIN(mou.by_status.find(s => s.status === 'operational')?.count || 0)}
              detail={tr('tenureDive.mous.operationalDetail')} />
          </div>
          <Link className="text-label-md text-primary font-bold mt-3 inline-block" to={`/investments?tenure=${t.key}`}>
            {tr('tenureDive.mous.openRegister')}
          </Link>
        </VizSection>
      )}

      {top.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-md font-bold text-on-surface border-b border-surface-variant pb-2">
            {tr('tenureDive.top.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {top.map(p => (
              <Link key={p.id} to={`/projects/${p.id}`}
                className="border border-surface-variant rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-1">
                <p className="text-body-md font-bold text-on-surface line-clamp-2">{p.title}</p>
                <p className="text-label-sm text-on-surface-variant">
                  {p.district || tr('projects.statewide')} · {statusLabel(p.status)}
                  {p.completion_percentage != null ? ` · ${tr('tenureDive.pctBuilt', { pct: p.completion_percentage })}` : ''}
                </p>
                <p className="text-label-md font-bold text-primary mt-auto pt-1">{fmtCr(p.estimated_cost_crore, tr)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-4 border-t border-surface-variant pt-4">
        <Link className="text-label-md text-primary font-bold" to={`/projects?tenure=${t.key}`}>
          {tr('tenureDive.links.seeAll', { count: fmtIN(ins.total) })}
        </Link>
        <Link className="text-label-md text-primary font-bold" to="/governments">
          {tr('tenureDive.links.fullRecord')}
        </Link>
        <Link className="text-label-md text-primary" to="/sources">{tr('common.dataSources')}</Link>
      </div>

      <p className="text-label-sm text-on-surface-variant">
        {tr('tenureDive.correction')}
      </p>
      {tip.node}
    </div>
  )
}
