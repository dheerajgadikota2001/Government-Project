import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, isNotFound, isRecordId } from '../lib/api'
import { applySeo, seoForProject } from '../lib/seo'
import { projectTrail } from '../lib/schema'
import { projectSummary } from '../lib/projectSummary'
import { croreAmount } from '../lib/money'
import { useT, makeDateFmt } from '../i18n'
import ProgressGallery from '../components/ProgressGallery'
import Deferred from '../components/Deferred'
import SourceDocuments from '../components/SourceDocuments'
import PageThread from '../components/community/PageThread'
import { TENURE_COLOR } from '../lib/tenure'
import { EVENTS, track } from '../lib/analytics'

/**
 * Project detail: 100% live from the API. Nothing on this page is sample
 * content: every figure comes from the project row (seeded/scraped from
 * cited official sources), photographs and documents render only when they
 * actually exist, and the dated record lists official observations with
 * their source documents. Where a value was never published, the page says
 * "not published", never a guess.
 */

/* Status badges. The label for each enum value lives under projects.status.*,
 * shared with the register page; only the colour is decided here. Values the
 * API adds later fall back to the raw string, prettified. */
const STATUS_CLS = {
  completed: 'bg-green-700 text-white',
  under_construction: 'bg-blue-700 text-white',
  tendered: 'bg-amber-500 text-black',
  approved: 'bg-blue-300 text-black',
  announced: 'bg-gray-400 text-black',
  delayed: 'bg-red-700 text-white',
  suspended: 'bg-orange-600 text-white',
  cancelled: 'bg-red-800 text-white',
}
const KNOWN_STATUSES = new Set(Object.keys(STATUS_CLS))
const KNOWN_TYPES = new Set([
  'infrastructure', 'roads', 'irrigation', 'power', 'industrial',
  'urban_development', 'education', 'health', 'agriculture', 'ports',
  'airports', 'railways', 'housing', 'tourism', 'it_tech',
])

const prettifyEnum = v => (v ? String(v).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : v)
const enumLabel = (t, group, known) => (value, fallback) =>
  !value ? value
    : known.has(value) ? t(`projects.${group}.${value}`)
      : (fallback || prettifyEnum(value))

const fmtIN = n => (n == null ? null : n.toLocaleString('en-IN'))

/** Localized date helpers over ISO strings: full date and month+year. */
const makeFmts = t => {
  const d = makeDateFmt(t)
  return {
    fmtDate: iso => (iso ? d(String(iso).slice(0, 10)) : null),
    fmtMonth: iso => (iso ? d(String(iso).slice(0, 7)) : null),
  }
}

/* Government tenures since bifurcation: used to color the timeline and to
 * attribute progress honestly. Dates are the swearing-in boundaries. */
const TENURES = [
  { key: 'pre', labelKey: 'projectDetail.tenures.pre', color: '#9a9890', from: '1900-01-01', to: '2014-06-07' },
  { key: 'tdp1', labelKey: 'projectDetail.tenures.tdp1', color: TENURE_COLOR.tdp1, from: '2014-06-08', to: '2019-05-29' },
  { key: 'ysrcp', labelKey: 'projectDetail.tenures.ysrcp', color: TENURE_COLOR.ysrcp, from: '2019-05-30', to: '2024-06-11' },
  { key: 'tdp2', labelKey: 'projectDetail.tenures.tdp2', color: TENURE_COLOR.tdp2, from: '2024-06-12', to: '2099-12-31' },
]
const tenureOf = iso => {
  const d = new Date(iso)
  return TENURES.find(t => d >= new Date(t.from) && d <= new Date(t.to)) || TENURES[0]
}

/** Vertical timeline: every dot is a published date, colored by which
 * government was in office on that date. */
function Timeline({ events }) {
  const { t } = useT()
  const { fmtMonth } = makeFmts(t)
  return (
    <div>
      <ol className="relative border-s-2 border-surface-variant ms-24 flex flex-col gap-5 py-1">
        {events.map((ev, i) => (
          <li key={i} className="relative ps-5">
            <span
              className="absolute -start-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-surface"
              style={{ background: ev.color }}
              title={ev.tenure}
            />
            <span className="absolute -start-24 top-0.5 w-20 text-end text-label-sm tabular-nums text-on-surface-variant">
              {fmtMonth(ev.d)}
            </span>
            <p className="text-body-md text-on-surface">{ev.text}</p>
            {ev.sub && <p className="text-label-sm text-on-surface-variant mt-0.5">{ev.sub}</p>}
            {ev.link && (
              <a className="text-label-sm text-primary" href={ev.link.url} target="_blank" rel="noreferrer">
                [{ev.link.label}]
              </a>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-dashed border-surface-variant text-label-sm text-on-surface-variant">
        {TENURES.filter(ten => events.some(e => e.tenureKey === ten.key)).map(ten => (
          <span key={ten.key} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: ten.color }} /> {t(ten.labelKey)}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Which government built how much: attributed ONLY where the dated record
 * allows it. A progress change between two published figures is credited to
 * a tenure only when both dates fall inside that one tenure; a change that
 * spans a government handover is shown as "cannot be split", we never
 * divide credit ourselves.
 */
function TenureProgressBand({ project, obs }) {
  const { t } = useT()
  const { fmtMonth } = makeFmts(t)
  const points = []
  const startISO = project.start_date || project.announced_date
  if (startISO) points.push({ d: startISO, pct: 0, label: t(project.start_date ? 'projectDetail.band.worksBegan' : 'projectDetail.band.announced') })
  // o.source_label names a real document, API content, never translated.
  obs.forEach(o => { if (o.completion_percentage != null) points.push({ d: o.observed_date, pct: o.completion_percentage, label: o.source_label || t('projectDetail.band.publishedFigure') }) })
  if (project.status === 'completed' && project.actual_completion) {
    points.push({ d: project.actual_completion, pct: 100, label: t('projectDetail.band.completed') })
  }
  points.sort((a, b) => new Date(a.d) - new Date(b.d))
  const dedup = points.filter((p, i) => i === 0 || p.pct > points[i - 1].pct || p.d !== points[i - 1].d)
  if (dedup.length < 2) return null

  const segs = []
  for (let i = 1; i < dedup.length; i++) {
    const a = dedup[i - 1], b = dedup[i]
    const delta = b.pct - a.pct
    if (delta <= 0) continue
    const ta = tenureOf(a.d), tb = tenureOf(b.d)
    segs.push({
      delta,
      from: a, to: b,
      single: ta.key === tb.key ? ta : null,
      spanned: ta.key === tb.key ? null : TENURES.filter(t => new Date(t.to) >= new Date(a.d) && new Date(t.from) <= new Date(b.d) && t.key !== 'pre'),
    })
  }
  if (!segs.length) return null
  const totalPct = dedup[dedup.length - 1].pct

  // Progress that already existed at the first published figure. Where a
  // project was 71% done before any dated record we hold, that 71% is most of
  // the story and it used to be drawn nowhere at all, the bar rendered only
  // the attributable deltas and let a grey flex-1 filler take the rest, so a
  // 78%-complete project appeared about 10% done. Everything below is now sized
  // against the same 0-100 scale as the project itself.
  const baselinePct = Math.max(0, dedup[0].pct)
  const unreportedPct = Math.max(0, 100 - totalPct)

  return (
    <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
      <h2 className="text-title-md font-bold text-on-surface mb-1">{t('projectDetail.band.title')}</h2>
      <p className="text-label-sm text-on-surface-variant mb-3 max-w-3xl">
        {t('projectDetail.band.intro')}
      </p>
      <div className="w-full h-6 rounded-full overflow-hidden flex gap-[2px] border border-surface-variant" role="img"
        aria-label={t('projectDetail.band.chartLabel')}>
        {baselinePct > 0 && (
          <div
            className="h-full"
            style={{
              width: `${baselinePct}%`,
              // Neither a government's credit nor unbuilt work: this is real
              // progress whose timing the record does not give. It reads as
              // "counted, but unattributed".
              background: 'repeating-linear-gradient(90deg, #cfcdc4 0 2px, #e4e2da 2px 5px)',
            }}
            title={t('projectDetail.band.beforeRecordTip', { pct: baselinePct.toFixed(1) })}
          />
        )}
        {segs.map((s, i) => (
          <div key={i}
            className="h-full"
            style={{
              width: `${s.delta}%`,
              background: s.single
                ? s.single.color
                : 'repeating-linear-gradient(45deg, #b9b7ad 0 6px, #d9d7cd 6px 12px)',
            }}
            title={s.single
              ? t('projectDetail.band.segmentTip', { pct: s.delta.toFixed(1), tenure: t(s.single.labelKey), from: fmtMonth(s.from.d), to: fmtMonth(s.to.d) })
              : t('projectDetail.band.segmentTipSpanned', { pct: s.delta.toFixed(1) })}
          />
        ))}
        {unreportedPct > 0 && (
          <div className="h-full bg-surface-container-high"
            style={{ width: `${unreportedPct}%` }}
            title={t('projectDetail.band.notReported')} />
        )}
      </div>
      <ul className="flex flex-col gap-1.5 mt-3 text-label-md text-on-surface">
        {baselinePct > 0 && (
          <li className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-sm mt-1 shrink-0"
              style={{ background: 'repeating-linear-gradient(90deg, #cfcdc4 0 2px, #e4e2da 2px 5px)' }} />
            <span>
              <strong>{baselinePct.toFixed(1)}%</strong>{' '}
              {t('projectDetail.band.beforeRecord', {
                pct: baselinePct.toFixed(1),
                date: fmtMonth(dedup[0].d),
              })}
            </span>
          </li>
        )}
        {segs.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-sm mt-1 shrink-0"
              style={{ background: s.single ? s.single.color : 'repeating-linear-gradient(45deg, #b9b7ad 0 4px, #d9d7cd 4px 8px)' }} />
            <span>
              <strong>{s.delta.toFixed(1)}%</strong>{' '}
              {s.single
                ? t('projectDetail.band.attributed', {
                  tenure: t(s.single.labelKey),
                  fromPct: s.from.pct, fromDate: fmtMonth(s.from.d), fromLabel: s.from.label,
                  toPct: s.to.pct, toDate: fmtMonth(s.to.d), toLabel: s.to.label,
                })
                : t('projectDetail.band.spanned', {
                  from: fmtMonth(s.from.d), to: fmtMonth(s.to.d),
                  tenures: s.spanned.map(ten => t(ten.labelKey)).join(' → '),
                })}
            </span>
          </li>
        ))}
        {totalPct < 100 && (
          <li className="text-label-sm text-on-surface-variant">
            {t('projectDetail.band.remaining', { pct: (100 - totalPct).toFixed(1) })}
          </li>
        )}
      </ul>
      <p className="text-label-sm text-on-surface-variant mt-2">
        {t('projectDetail.band.sharpens')}
      </p>
    </section>
  )
}

function Tile({ title, value, detail }) {
  return (
    <div className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
      <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{title}</p>
      <p className="text-title-md font-bold text-on-surface mt-0.5">{value}</p>
      {detail && <p className="text-label-sm text-on-surface-variant mt-0.5">{detail}</p>}
    </div>
  )
}

export default function ProjectDetail() {
  const { t, tn } = useT()
  const { fmtDate, fmtMonth } = makeFmts(t)
  const statusLabel = enumLabel(t, 'status', KNOWN_STATUSES)
  const typeLabel = enumLabel(t, 'type', KNOWN_TYPES)
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [extras, setExtras] = useState(null)
  const [news, setNews] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setProject(null); setExtras(null); setNews(null); setError(null)
    if (!isRecordId(id)) {
      // Not a lookup. Same "not found" the server would give, without asking it.
      setError(Object.assign(new Error('not a record id'), { status: 404 }))
      return
    }
    apiGet(`/projects/${id}`)
      .then(p => {
        if (cancelled) return
        setProject(p)
        // The route table cannot know that project 613 is Polavaram, so the
        // record supplies its own title once it lands. Before this, all 673
        // project pages shared the title "Project record", which nobody
        // searches for.
        applySeo(`/projects/${id}`, { ...seoForProject(p), breadcrumbTrail: projectTrail(p) })
        // Fired on the loaded project rather than on the click, so it counts a
        // project a reader actually reached, not a link they clicked before
        // the request failed. The district and type are what make it useful:
        // "irrigation projects in Eluru get read" is a scraping priority,
        // "someone opened a project" is not.
        track(EVENTS.PROJECT_OPENED, {
          project_id: String(id),
          district: p?.district || 'unstated',
          project_type: p?.project_type || 'unknown',
          status: p?.status || 'unknown',
        })
      })
      .catch(e => { if (!cancelled) setError(e) })
    apiGet(`/projects/${id}/extras`)
      .then(x => { if (!cancelled) setExtras(x) })
      .catch(() => { if (!cancelled) setExtras({ images: [], documents: [], observations: [] }) })
    apiGet(`/projects/${id}/news`)
      .then(n => { if (!cancelled) setNews(n) })
      .catch(() => { if (!cancelled) setNews({ matched_on: [], articles: [] }) })
    return () => { cancelled = true }
  }, [id])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">
          {isNotFound(error)
            ? t('projectDetail.notFound')
            : t('projectDetail.unreachable', { message: error.message })}
        </p>
        <Link className="text-primary text-label-md" to="/projects">{t('projectDetail.allProjects')}</Link>
      </div>
    )
  }
  if (!project) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('projectDetail.loading')}</div>
  }

  const statusCls = STATUS_CLS[project.status] || STATUS_CLS.announced
  const obs = extras?.observations || []
  const latestObs = obs.length ? obs[obs.length - 1] : null

  const summary = projectSummary({ project, observation: latestObs, t, fmtNum: fmtIN, fmtMonth })

  // Identity facts: rendered only when the record actually carries them.
  const facts = [
    project.external_id && {
      k: 'projectDetail.facts.projectCode', v: project.external_id,
      hint: 'projectDetail.facts.projectCodeHint',
    },
    project.implementing_agency && { k: 'projectDetail.facts.implementingAgency', v: project.implementing_agency },
    project.department && { k: 'projectDetail.facts.department', v: project.department },
    project.mandal && { k: 'projectDetail.facts.mandal', v: project.mandal },
    project.constituency && { k: 'projectDetail.facts.constituency', v: project.constituency },
    project.source_portal && { k: 'projectDetail.facts.trackedFrom', v: project.source_portal },
    project.created_at && { k: 'projectDetail.facts.registeredSince', v: fmtDate(project.created_at) },
  ].filter(Boolean)

  // Span between recorded dates: plain arithmetic on published dates, labeled as such.
  const spanFrom = project.announced_date || project.start_date
  const spanTo = project.actual_completion || project.expected_completion
  let spanText = null
  if (spanFrom && spanTo && new Date(spanTo) > new Date(spanFrom)) {
    const months = Math.round((new Date(spanTo) - new Date(spanFrom)) / (1000 * 60 * 60 * 24 * 30.44))
    const y = Math.floor(months / 12), m = months % 12
    const duration = [y > 0 && tn('projectDetail.span.years', y), m > 0 && tn('projectDetail.span.months', m)]
      .filter(Boolean).join(' ')
    spanText = t('projectDetail.span.text', {
      from: t(project.announced_date ? 'projectDetail.span.fromAnnouncement' : 'projectDetail.span.fromStart'),
      to: t(project.actual_completion ? 'projectDetail.span.toCompletion' : 'projectDetail.span.toExpected'),
      duration,
    })
  }

  const milestones = [
    project.announced_date && { d: project.announced_date, t: t('projectDetail.milestone.announced') },
    project.start_date && { d: project.start_date, t: t('projectDetail.milestone.started') },
    project.expected_completion && !project.actual_completion && {
      d: project.expected_completion,
      t: t(project.status === 'completed' ? 'projectDetail.milestone.expectedAsRecorded' : 'projectDetail.milestone.expectedLatestCited'),
    },
    project.actual_completion && { d: project.actual_completion, t: t('projectDetail.milestone.completed') },
  ].filter(Boolean).sort((a, b) => new Date(a.d) - new Date(b.d))

  const timelineEvents = [
    ...milestones.map(m => ({ d: m.d, text: m.t })),
    ...obs.map(o => ({
      d: o.observed_date,
      text: [
        o.completion_percentage != null
          ? t('projectDetail.timeline.physicalProgress', { pct: o.completion_percentage })
          : t('projectDetail.timeline.progressObservation'),
        o.cumulative_expenditure_crore != null
          ? t('projectDetail.timeline.cumulativeSpend', { amount: croreAmount(o.cumulative_expenditure_crore, fmtIN), unit: t('unit.crore') })
          : null,
        // The source's own printed context (targets, ayacut, pre-closures,
        // and figures that move backwards between editions), API content
        // quoted as printed, never translated or reconciled.
        o.status_note || null,
      ].filter(Boolean).join(' · '),
      // source_label is the document's own title, API content, left as is.
      link: o.source_label ? { label: o.source_label, url: o.source_url } : null,
    })),
  ].sort((a, b) => new Date(a.d) - new Date(b.d)).map(ev => {
    const ten = tenureOf(ev.d)
    return { ...ev, color: ten.color, tenure: t(ten.labelKey), tenureKey: ten.key }
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/projects">{t('projectDetail.allProjects')}</Link>
        <div className="flex flex-wrap items-start gap-3 mt-2">
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface max-w-3xl min-w-0">{project.title}</h1>
          <span className={`text-label-md px-3 py-1 rounded-full ${statusCls} mt-2`}>{statusLabel(project.status) || t('projects.status.announced')}</span>
        </div>
        <p className="text-label-md text-on-surface-variant mt-1">
          {typeLabel(project.project_type)} · {project.district || t('projects.statewide')}
          {project.implementing_agency ? ` · ${project.implementing_agency}` : ''}
          {project.department ? ` · ${project.department}` : ''}
        </p>
      </div>

      {/* The answer, in a sentence.
          Every number on this page used to live in a tile, and a tile is not
          text. A page holding the only cited answer to "how much has been
          spent on Polavaram" did not contain that sentence anywhere, so a
          search for it could not match. This says it, in the reader's
          language, generated from the record for all of them rather than
          hand-written for the famous few. Clauses drop out when the record is
          thin, so a sparse project gets a short paragraph and never an
          invented figure. */}
      {summary.length > 0 && (
        <p className="text-body-lg text-on-surface max-w-3xl">
          {summary.join(' ')}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile title={t('projectDetail.tiles.estimatedCost')} value={project.estimated_cost_crore != null ? `₹${croreAmount(project.estimated_cost_crore, fmtIN)} ${t('unit.crore')}` : t('common.notPublished')} />
        <Tile title={t('projectDetail.tiles.physicalProgress')} value={project.completion_percentage != null ? `${project.completion_percentage}%` : t('common.notPublished')}
          detail={t(project.completion_percentage != null ? 'projectDetail.tiles.perLatestSource' : 'projectDetail.tiles.noOfficialFigure')} />
        {latestObs?.cumulative_expenditure_crore != null && (
          <Tile title={t('projectDetail.tiles.moneySpent')} value={`₹${croreAmount(latestObs.cumulative_expenditure_crore, fmtIN)} ${t('unit.crore')}`}
            detail={`${t('projectDetail.tiles.cumulativeAsOf', { date: fmtMonth(latestObs.observed_date) })}${latestObs.source_label ? ` · ${latestObs.source_label}` : ''}`} />
        )}
        {project.actual_cost_crore != null && (
          <Tile title={t('projectDetail.tiles.actualCost')} value={`₹${croreAmount(project.actual_cost_crore, fmtIN)} ${t('unit.crore')}`} detail={t('projectDetail.tiles.asRecordedOnCompletion')} />
        )}
        <Tile title={t(project.actual_completion ? 'projectDetail.tiles.completed' : 'projectDetail.tiles.expectedCompletion')}
          value={fmtMonth(project.actual_completion || project.expected_completion) || t('common.notPublished')} />
        <Tile title={t('projectDetail.tiles.recordUpdated')} value={fmtDate(project.updated_at)} detail={t('projectDetail.tiles.inOurDatabase')} />
      </div>

      {facts.length > 0 && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
          <h2 className="text-title-md font-bold text-on-surface mb-3">{t('projectDetail.identity.title')}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {facts.map(f => (
              <div key={f.k} className="flex flex-col min-w-0">
                <dt className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t(f.k)}</dt>
                <dd className="text-body-md text-on-surface">
                  {f.v}
                  {f.hint && <span className="block text-label-sm text-on-surface-variant mt-0.5">({t(f.hint)})</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {project.description && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
          <h2 className="text-title-md font-bold text-on-surface mb-2">{t('projectDetail.whatRecordSays')}</h2>
          <p className="text-body-md text-on-surface leading-relaxed whitespace-pre-line">{project.description}</p>
          {project.source_url && (
            <p className="mt-3 pt-2 border-t border-dashed border-surface-variant text-label-sm">
              <span className="text-on-surface-variant">{t('projectDetail.primarySource')} </span>
              <a className="text-primary" href={project.source_url} target="_blank" rel="noreferrer">
                {project.source_portal} ↗
              </a>
            </p>
          )}
        </section>
      )}

      {(milestones.length > 0 || obs.length > 0) && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
          <h2 className="text-title-md font-bold text-on-surface mb-1">{t('projectDetail.datedRecord.title')}</h2>
          <p className="text-label-sm text-on-surface-variant mb-3">
            {t('projectDetail.datedRecord.note')}
            {spanText && <span className="block mt-1 text-on-surface">{spanText}</span>}
          </p>
          <Timeline events={timelineEvents} />
        </section>
      )}

      <TenureProgressBand project={project} obs={obs} />

      {extras?.images?.length > 0 && (
        <ProgressGallery
          projectTitle={project.title}
          images={extras.images.map((im, i) => ({
            id: i, url: im.url, thumbnailUrl: im.thumbnail_url, kind: im.kind,
            caption: im.caption, capturedDate: im.captured_date, credit: im.credit,
            sourceUrl: im.source_url, license: im.license, isCover: im.is_cover,
          }))}
        />
      )}

      {news?.articles?.length > 0 && (
        <details className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden group">
          <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-surface-container transition-colors">
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-title-md font-bold text-on-surface">{t('projectDetail.news.title')}</span>
              <span className="text-label-sm text-on-surface-variant">
                {tn('projectDetail.news.count', news.articles.length)} · {t('projectDetail.news.matchedOn', { words: news.matched_on.join('", "') })}
              </span>
            </span>
            <span aria-hidden="true" className="ms-auto text-on-surface-variant transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-5 pb-5 pt-1 border-t border-surface-variant/60 flex flex-col gap-3">
            <p className="text-label-sm text-on-surface-variant max-w-3xl">
              {t('projectDetail.news.note')}
            </p>
            {news.articles.map(a => (
              <div key={a.id} className="flex flex-col gap-0.5">
                <a className="text-body-md text-primary hover:underline" href={a.source_url} target="_blank" rel="noreferrer">{a.headline} ↗</a>
                <p className="text-label-sm text-on-surface-variant">
                  {a.source_name}{a.published_at ? ` · ${fmtDate(a.published_at)}` : ''} · {t('projectDetail.news.matchedWords', { words: a.matched_words.join('", "') })}
                </p>
                {a.summary && <p className="text-label-sm text-on-surface-variant line-clamp-2 max-w-3xl">{a.summary}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {extras?.documents?.length > 0 && (
        <SourceDocuments documents={extras.documents.map((doc, i) => ({
          id: i, role: doc.role, referenceNumber: doc.reference_number, title: doc.title,
          note: doc.note, sourcePortal: doc.source_portal, sourceUrl: doc.source_url,
          collectedFromUrl: doc.collected_from_url, collectedFromTitle: doc.collected_from_title,
          collectedAt: doc.collected_at,
        }))} />
      )}

      <p className="text-label-sm text-on-surface-variant border-t border-surface-variant pt-3">
        {t('projectDetail.correctionNote')}
      </p>

      <Deferred minHeight={320}><PageThread pageKey={`project:${id}`} /></Deferred>
    </div>
  )
}
