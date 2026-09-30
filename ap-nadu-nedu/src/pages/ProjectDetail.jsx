import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, isNotFound, isRecordId } from '../lib/api'
import { applySeo, seoForProject } from '../lib/seo'
import { projectTrail } from '../lib/schema'
import { projectSummary, sourceCode } from '../lib/projectSummary'
import { whenPrinted, portalName } from '../lib/sourceDocs'
import {
  readingsOf, storyFacts, storyTools, keyDates as buildKeyDates, automaticStory, automaticChart,
  projectQuestions,
} from '../lib/projectStory'
import { resolveStory, keptQuestions } from '../lib/storyData'
import { automaticSteps } from '../lib/projectSteps'
import { SITE_ORIGIN, localizedPath } from '../lib/routes'
import { loadStory } from '../lib/flagshipLoader'
import { membersOf } from '../lib/sameWork'
import { displayTitle } from '../lib/projectTitle'
import { croreAmount } from '../lib/money'
import { useT, makeDateFmt } from '../i18n'
import ProgressGallery from '../components/ProgressGallery'
import Deferred from '../components/Deferred'
import SourceDocuments from '../components/SourceDocuments'
import RelatedProjects from '../components/RelatedProjects'
import PageThread from '../components/community/PageThread'
import { KeyDates, ProgressChart, StoryChapters, ProjectQuestions, ProjectSteps } from '../components/ProjectStory'
import { EVENTS, track } from '../lib/analytics'

/**
 * Project detail: 100% live from the API. Nothing on this page is sample
 * content: every figure comes from the project row (seeded/scraped from
 * cited official sources), photographs and documents render only when they
 * actually exist, and every dated reading names the document it came from.
 * Where a value was never published, the page says "not published", never a
 * guess.
 *
 * THE PAGE TELLS THE PROJECT'S STORY
 *
 * Top: the story in steps (src/lib/projectSteps.js), a short road of dated
 * steps each naming its paper, which a reader can send on as a picture; the
 * key dates stand in when the record is too thin for a road of three. Then,
 * when at least two readings exist, a progress chart whose line breaks at
 * every change of government. Middle: the story in
 * chapters a reader opens one at a time. Bottom: the questions people search,
 * the same ones the prerendered page hands to search engines. The story is
 * hand-written for the flagship projects (src/data/stories) and built from
 * the record for every other one (src/lib/projectStory.js). The old dated
 * timeline and the "which government, how much" bar are both inside it now:
 * every reading is listed in "Year by year" with its document, and the chart
 * does what the bar did without dividing credit between governments.
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
  const { t, tn, lang } = useT()
  const { fmtDate, fmtMonth } = makeFmts(t)
  const statusLabel = enumLabel(t, 'status', KNOWN_STATUSES)
  const typeLabel = enumLabel(t, 'type', KNOWN_TYPES)
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [extras, setExtras] = useState(null)
  const [news, setNews] = useState(null)
  const [error, setError] = useState(null)
  const [story, setStory] = useState(null)
  const [siblings, setSiblings] = useState([])

  useEffect(() => {
    let cancelled = false
    setProject(null); setExtras(null); setNews(null); setError(null); setStory(null); setSiblings([])
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
    // A hand-written story, for the handful of projects that have one. Its
    // absence is the normal case, not an error.
    loadStory(id).then(s => { if (!cancelled) setStory(s) })
    // The other government records of the same work, for "why do the sources
    // differ". One work in the register has them today; every other project
    // skips this request.
    const others = membersOf(id).filter(m => m !== Number(id))
    if (others.length) {
      Promise.all(others.map(m => apiGet(`/projects/${m}`).catch(() => null)))
        .then(list => { if (!cancelled) setSiblings(list.filter(Boolean)) })
    }
    return () => { cancelled = true }
  }, [id])

  const obs = extras?.observations || []
  const latestObs = obs.length ? obs[obs.length - 1] : null

  const told = useMemo(() => {
    if (!project) return null
    const today = new Date().toISOString().slice(0, 10)
    const fmtDay = iso => (iso ? makeDateFmt(t)(String(iso).slice(0, 10)) : null)
    const tools = storyTools({ t, fmtNum: fmtIN, fmtMonth, fmtDay, lang })
    const facts = storyFacts({ project, readings: readingsOf(obs), today })
    const work = siblings.length ? [project, ...siblings] : []
    const auto = projectQuestions({ project, observation: latestObs, facts, tools, siblings: work })
    const flagship = story ? resolveStory(story, lang, { fmtMonth, fmtDay }) : null
    // The story in steps: the hand-written road when the story has one,
    // otherwise the record's own, when it makes a road of three.
    const steps = flagship?.steps || automaticSteps({ project, facts, tools, today })
    const road = steps
      ? {
          title: flagship?.stepsTitle || t('projectDetail.story.steps.title'),
          sub: t('projectDetail.story.steps.sub', { count: steps.length }),
          // A hand-written heading names the project ("How Bhogapuram
          // airport came to be"); the automatic one does not.
          name: flagship?.stepsTitle || displayTitle(project.title),
          steps,
        }
      : null
    if (flagship) {
      return {
        road,
        keyDates: flagship.keyDates.length ? flagship.keyDates : buildKeyDates({ facts, project, t, fmtMonth, today }),
        chart: flagship.chart || automaticChart(facts),
        chapters: flagship.chapters,
        questions: [...flagship.questions, ...keptQuestions(auto, flagship.replaces)],
        note: flagship.draft
          ? t('projectDetail.story.draftNote')
          : t('projectDetail.story.flagshipNote', { date: fmtDay(flagship.reviewedOn) }),
        fmtDay,
      }
    }
    return {
      road,
      keyDates: buildKeyDates({ facts, project, t, fmtMonth, today }),
      chart: automaticChart(facts),
      chapters: automaticStory({ project, facts, tools }),
      questions: auto,
      note: t('projectDetail.story.autoNote'),
      fmtDay,
    }
    // t changes identity with the catalogue; lang and the data are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, extras, story, siblings, lang, t])

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
  const summary = projectSummary({ project, observation: latestObs, t, fmtNum: fmtIN, fmtMonth })
  const code = sourceCode(project)

  // Identity facts: rendered only when the record actually carries them.
  const facts = [
    code && {
      k: 'projectDetail.facts.projectCode', v: code.code,
      hint: code.search === code.code
        ? t('projectDetail.facts.projectCodeHint')
        : t('projectDetail.facts.projectCodeHintNumber', { number: code.search }),
    },
    project.implementing_agency && { k: 'projectDetail.facts.implementingAgency', v: project.implementing_agency },
    project.department && { k: 'projectDetail.facts.department', v: project.department },
    project.mandal && { k: 'projectDetail.facts.mandal', v: project.mandal },
    project.constituency && { k: 'projectDetail.facts.constituency', v: project.constituency },
    project.source_portal && { k: 'projectDetail.facts.trackedFrom', v: portalName(project) },
    project.created_at && { k: 'projectDetail.facts.registeredSince', v: fmtDate(project.created_at) },
  ].filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/projects">{t('projectDetail.allProjects')}</Link>
        <div className="flex flex-wrap items-start gap-3 mt-2">
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface max-w-3xl min-w-0">{displayTitle(project.title)}</h1>
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

      {/* The road holds the key dates and names the paper for each, so a
          project with a road does not show both. */}
      {told.road
        ? (
          <ProjectSteps
            road={told.road}
            readMoreId="story"
            share={{
              // Only English and Telugu have pictures; the other languages
              // share the English one, as they do the link card.
              pictureKey: `${project.id}-${lang === 'te' ? 'te' : 'en'}`,
              link: SITE_ORIGIN + localizedPath(lang, `/projects/${project.id}`),
              // The caption names the project, so it still says what the
              // picture is about when an app shows the caption alone.
              caption: `${told.road.name}\n${SITE_ORIGIN + localizedPath(lang, `/projects/${project.id}`)}`,
              onShared: method => track(EVENTS.PICTURE_SHARED, { project_id: project.id, method }),
            }}
          />
        )
        : <KeyDates items={told.keyDates} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile title={t('projectDetail.tiles.estimatedCost')} value={project.estimated_cost_crore != null ? `₹${croreAmount(project.estimated_cost_crore, fmtIN)} ${t('unit.crore')}` : t('common.notPublished')} />
        <Tile title={t('projectDetail.tiles.physicalProgress')} value={project.completion_percentage != null ? `${project.completion_percentage}%` : t('common.notPublished')}
          detail={t(project.completion_percentage != null ? 'projectDetail.tiles.perLatestSource' : 'projectDetail.tiles.noOfficialFigure')} />
        {latestObs?.cumulative_expenditure_crore != null && (
          <Tile title={t('projectDetail.tiles.moneySpent')} value={`₹${croreAmount(latestObs.cumulative_expenditure_crore, fmtIN)} ${t('unit.crore')}`}
            detail={`${t('projectDetail.tiles.cumulativeAsOf', { date: whenPrinted(latestObs, fmtMonth) })}${latestObs.source_label ? ` · ${latestObs.source_label}` : ''}`} />
        )}
        {project.actual_cost_crore != null && (
          <Tile title={t('projectDetail.tiles.actualCost')} value={`₹${croreAmount(project.actual_cost_crore, fmtIN)} ${t('unit.crore')}`} detail={t('projectDetail.tiles.asRecordedOnCompletion')} />
        )}
        <Tile title={t('projectDetail.tiles.recordUpdated')} value={fmtDate(project.updated_at)} detail={t('projectDetail.tiles.inOurDatabase')} />
      </div>

      <ProgressChart model={told.chart} fmtMonth={fmtMonth} fmtDay={told.fmtDay} />

      <StoryChapters id="story" chapters={told.chapters} note={told.note} />

      {facts.length > 0 && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
          <h2 className="text-title-md font-bold text-on-surface mb-3">{t('projectDetail.identity.title')}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {facts.map(f => (
              <div key={f.k} className="flex flex-col min-w-0">
                <dt className="text-label-sm text-on-surface-variant uppercase tracking-wide">{t(f.k)}</dt>
                <dd className="text-body-md text-on-surface">
                  {f.v}
                  {f.hint && <span className="block text-label-sm text-on-surface-variant mt-0.5">({f.hint})</span>}
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
                {portalName(project)} ↗
              </a>
            </p>
          )}
        </section>
      )}

      {extras?.images?.length > 0 && (
        <ProgressGallery
          projectTitle={displayTitle(project.title)}
          images={extras.images.map((im, i) => ({
            id: i, url: im.url, thumbnailUrl: im.thumbnail_url, kind: im.kind,
            caption: im.caption, capturedDate: im.captured_date, credit: im.credit,
            sourceUrl: im.source_url, license: im.license, isCover: im.is_cover,
          }))}
        />
      )}

      {extras?.documents?.length > 0 && (
        <SourceDocuments documents={extras.documents.map((doc, i) => ({
          id: i, role: doc.role, referenceNumber: doc.reference_number, title: doc.title,
          note: doc.note, sourcePortal: doc.source_portal, sourceUrl: doc.source_url,
          collectedFromUrl: doc.collected_from_url, collectedFromTitle: doc.collected_from_title,
          collectedAt: doc.collected_at,
        }))} />
      )}

      <ProjectQuestions items={told.questions} />

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

      <p className="text-label-sm text-on-surface-variant border-t border-surface-variant pt-3">
        {t('projectDetail.correctionNote')}
      </p>

      <RelatedProjects project={project} typeLabel={typeLabel} />

      <Deferred minHeight={320}><PageThread pageKey={`project:${id}`} /></Deferred>
    </div>
  )
}
