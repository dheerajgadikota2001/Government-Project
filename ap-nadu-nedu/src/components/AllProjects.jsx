import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import { TENURE_COLOR, TENURE_HATCHED } from '../lib/tenure'

/**
 * The register: every project, and what happened on it, in order.
 *
 * The Overview tab answers "how are projects going overall". This one answers
 * "what has actually been done on this project, and under whom" — and answers
 * it the only honest way available: as a list of dated government documents.
 *
 * THE ATTRIBUTION RULE, IN THE UI
 * Nothing here says a project belongs to a government. The band under each card
 * shows which governments appear in that project's record; the spine inside
 * shows each document with the government that held office on its date. Seven of
 * the eight projects we hold span more than one government, so any sentence
 * crediting a project to one of them would be false about most of them.
 *
 * WHAT THE DATES MEAN
 * For most projects the date is when the government published the document, not
 * when the thing happened. That distinction matters — Polavaram's investment
 * clearance is 2009 but the document recording it is from 2024 — so the panel
 * says which kind of dating it is using rather than letting the reader assume.
 */

const TEN_ORDER = ['pre', 'tdp1', 'ysrcp', 'tdp2']

const fill = ten => (TENURE_HATCHED.has(ten)
  ? { background: TENURE_COLOR[ten], backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.6) 0 3px,transparent 3px 6px)' }
  : { background: TENURE_COLOR[ten] })

const cr = v => (v == null ? null : v >= 100000
  ? `₹${(v / 100000).toFixed(2)}L cr`
  : `₹${Math.round(v).toLocaleString('en-IN')} cr`)

const norm = s => String(s ?? '').toLowerCase()

// How many cards to render at once. The register is now the whole project
// table, and painting several hundred expandable cards at once is what makes
// a page feel broken on a phone.
const PAGE = 40

// The catalogue keys months by short name, not by number. Getting this wrong
// renders the literal string "month.5" on every row, which is why it is written
// out rather than computed from the index.
const MONTH_KEY = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Expected completion arrives as YYYY-MM from a hand-built record and as a full
// date from a database column. Neither should be printed raw at a reader.
function fmtDue(value, t) {
  if (!value) return null
  const [y, m, d] = String(value).split('-')
  const month = m ? t(`month.${MONTH_KEY[Number(m) - 1]}`) : null
  if (!month) return String(value)
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`
}

function fmtDate(iso, t) {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${t(`month.${MONTH_KEY[d.getMonth()]}`)} ${d.getFullYear()}`
}

/* ------------------------------------------------------------- the spine */

function Timeline({ p, t }) {
  let last = null
  return (
    <ol className="relative flex flex-col gap-0 ps-0 mt-1 list-none">
      {p.events.map((e, i) => {
        const newBand = e.tenure !== last
        last = e.tenure
        const grey = e.pre_window
        return (
          <li key={`${e.date}-${i}`} className="relative ps-[136px] sm:ps-[168px]">
            {/* The government heading sits above its first row, not in the date
                gutter. In the gutter it landed on top of the date — the label is
                156px wide and the date column starts 8px in, so every band-opening
                row printed the two on top of each other. */}
            {newBand && (
              <p className="text-label-sm font-bold uppercase tracking-wide ps-6 pt-1 pb-2 flex items-center gap-2"
                style={{ color: grey ? TENURE_COLOR.pre : TENURE_COLOR[e.tenure] }}>
                <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                  style={fill(grey ? 'pre' : e.tenure)} />
                {t(`depts.tenure.${e.tenure}`)}
              </p>
            )}
            <div className="relative pb-5 ps-6 border-s border-surface-variant">
              <span aria-hidden="true"
                className="absolute -start-[7px] top-[13px] w-3.5 h-3.5 rounded-full border-[2.5px] border-surface-container-lowest"
                style={fill(grey ? 'pre' : e.tenure)} />
              <p className={`absolute -start-[${0}] text-label-sm text-outline tabular-nums`}
                style={{ insetInlineStart: '-160px', width: '124px', textAlign: 'end', top: '10px' }}
                data-numeric>
                {fmtDate(e.date, t)}
              </p>
              <p className={`text-body-md leading-relaxed ${grey ? 'italic text-on-surface-variant' : 'text-on-surface'}`}>
                {e.title}
              </p>
              <p className="text-label-sm text-outline mt-1 leading-snug">
                {e.order_no && <span className="text-on-surface-variant font-semibold">{e.order_no} · </span>}
                {e.document}
                {e.tier && e.tier !== 'government' && (
                  <span className="ms-1.5 px-1.5 py-0.5 rounded border border-dashed border-outline-variant text-outline whitespace-nowrap">
                    {t(`register.tier.${e.tier}`)}
                  </span>
                )}
              </p>
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer"
                  className="text-label-sm text-primary hover:underline inline-flex items-center gap-1 mt-1">
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  {t('register.openDocument')}
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* --------------------------------------------------------------- one card */

function ProjectCard({ p, q, t, open, onToggle, detail, detailError }) {
  const bands = p.spans.length ? p.spans : ['tdp2']
  return (
    <article className="border border-surface-variant rounded-xl bg-surface-container-lowest overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex justify-between gap-4 flex-wrap items-start">
          <div className="min-w-0 flex-1">
            <h3 className="text-title-md font-title-md text-on-surface">{p.title}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-label-sm px-2 py-0.5 rounded-full border border-outline-variant text-on-surface-variant">
                {t(`projects.status.${p.status}`, {}) || p.status}
              </span>
              {p.project_type && (
                <span className="text-label-sm px-2 py-0.5 rounded-full border border-surface-variant text-on-surface-variant">
                  {t(`projects.type.${p.project_type}`, {}) || p.project_type}
                </span>
              )}
              {p.district && (
                <span className="text-label-sm px-2 py-0.5 rounded-full border border-surface-variant text-on-surface-variant">{p.district}</span>
              )}
              <span className="text-label-sm px-2 py-0.5 rounded-full border border-surface-variant text-on-surface-variant">
                {/* Only say "government documents" when all of them are. Where a
                    company note or a press report is in the list, the chip says how
                    many of the total are actually the government's own record. */}
                {p.non_government_event_count > 0
                  ? t('register.nSourcesMixed', { n: p.event_count, g: p.government_event_count })
                  : t('register.nSources', { n: p.event_count })}
              </span>
              {/* Two kinds of record sit in this list and a reader must be able
                  to tell them apart: documents we assembled by hand, and what the
                  government's own published record states about a project. */}
              <span className={`text-label-sm px-2 py-0.5 rounded-full border ${p.has_documents
                ? 'border-primary text-primary' : 'border-surface-variant text-on-surface-variant'}`}>
                {t(p.has_documents ? 'register.kind.documents' : 'register.kind.record')}
              </span>
              {!p.has_published_cost && (
                <span className="text-label-sm px-2 py-0.5 rounded-full border border-dashed border-outline-variant text-outline">
                  {t('register.noPublishedCost')}
                </span>
              )}
            </div>
          </div>
          <div className="text-end shrink-0">
            <p className="text-title-md font-title-md text-on-surface tabular-nums" data-numeric>
              {cr(p.estimated_cost_crore) || '—'}
            </p>
            <p className="text-label-sm text-outline">
              {p.expected_completion ? t('register.due', { date: fmtDue(p.expected_completion, t) }) : t('register.noPublishedDate')}
            </p>
          </div>
        </div>

        {/* which governments appear in this project's record */}
        <div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-variant" role="img"
            aria-label={t('register.bandAria', { title: p.title })}>
            {/* Width follows the number of documents in each government's time.
                Equal segments made a 1-and-5 split look identical to a 4-and-2 one. */}
            {bands.map(g => <span key={g} style={{ ...fill(g), flex: p.by_tenure[g] || 1 }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-label-sm text-outline">
            {bands.map(g => (
              <span key={g} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={fill(g)} />
                <span className="text-on-surface-variant font-semibold">{t(`depts.tenure.${g}`)}</span>
                {p.by_tenure[g] ? ` · ${p.by_tenure[g]}` : ''}
              </span>
            ))}
            <span className="ms-auto">{t('register.nDocuments', { n: p.event_count })}</span>
          </div>
        </div>

        <button type="button" onClick={onToggle} aria-expanded={open}
          className="text-label-md text-primary font-semibold self-start inline-flex items-center gap-1 hover:underline">
          <span className={`material-symbols-outlined text-[18px] transition-transform ${open ? 'rotate-90' : ''}`}>chevron_right</span>
          {open ? t('register.hide') : t('register.showTimeline')}
        </button>
      </div>

      {open && !detail && !detailError && (
        <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-surface-variant">
          <p className="text-body-md text-on-surface-variant">{t('register.loadingRecord')}</p>
        </div>
      )}

      {open && detailError && (
        <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-surface-variant">
          <p className="text-body-md text-on-surface">{t('register.error', { message: detailError.message })}</p>
        </div>
      )}

      {open && detail && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-surface-variant flex flex-col gap-4">
          {p.description && (
            <p className="text-body-md text-on-surface-variant leading-relaxed max-w-3xl">{p.description}</p>
          )}
          <div className="flex flex-col gap-1">
            <h4 className="text-title-sm font-title-sm text-on-surface">{t('register.whatTheRecordShows')}</h4>
            <p className="text-label-sm text-outline max-w-3xl leading-relaxed">
              {t(p.dated_by === 'documents' ? 'register.datedByDocuments' : 'register.datedByRecord')}
            </p>
          </div>
          {p.unverified_cost_crore != null && p.unverified_cost_source && (
            <div className="border border-dashed border-outline-variant rounded-lg p-3 max-w-3xl">
              <p className="text-title-sm font-title-sm text-on-surface">{t('register.reportedTitle')}</p>
              <p className="text-body-md text-on-surface-variant mt-1 leading-relaxed">
                {t('register.reportedBody', {
                  value: Math.round(p.unverified_cost_crore).toLocaleString('en-IN'),
                  claim: p.unverified_cost_source.claim,
                  publisher: p.unverified_cost_source.publisher,
                  date: fmtDate(p.unverified_cost_source.date, t),
                })}
              </p>
              {p.unverified_cost_source.url && (
                <a href={p.unverified_cost_source.url} target="_blank" rel="noreferrer"
                  className="text-label-sm text-primary hover:underline inline-flex items-center gap-1 mt-1.5">
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  {t('register.openDocument')}
                </a>
              )}
            </div>
          )}
          <Timeline p={detail} t={t} />
          {p.starts_before_window && (
            <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl border-s-2 border-outline-variant ps-3">
              {t('register.preWindow')}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

/* ================================================================= the tab */

export default function AllProjects() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState(null)
  const [status, setStatus] = useState(null)
  const [tenure, setTenure] = useState(null)
  const [spanning, setSpanning] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [details, setDetails] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    apiGet('/projects/register').then(d => { setData(d); setError(null) }).catch(setError)
  }, [])

  // The list carries no timelines — six hundred projects with their readings is
  // megabytes, and a timeline is only visible once a reader opens a card. So the
  // record for one project is fetched the first time its card is opened, and kept.
  const toggle = id => {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    if (details[id] || detailErrors[id]) return
    apiGet(`/projects/register/${id}`)
      .then(d => setDetails(prev => ({ ...prev, [id]: d })))
      .catch(err => setDetailErrors(prev => ({ ...prev, [id]: err })))
  }

  const shown = useMemo(() => {
    if (!data) return []
    const k = norm(q)
    return data.projects.filter(p =>
      (!type || p.project_type === type) &&
      (!status || p.status === status) &&
      (!tenure || p.spans.includes(tenure)) &&
      (!spanning || p.spans_multiple_governments) &&
      (!k || [p.title, p.district, p.department, p.description, p.external_id]
        .some(v => norm(v).includes(k))))
  }, [data, q, type, status, tenure, spanning])

  // Reset the visible window whenever the result set changes, so a new filter
  // does not leave a reader looking at page four of something else.
  useEffect(() => { setLimit(PAGE) }, [q, type, status, tenure, spanning])

  if (error) {
    return <p className="text-body-md text-on-surface">{t('register.error', { message: error.message })}</p>
  }
  if (!data) {
    return <p className="text-body-md text-on-surface-variant">{t('register.loading')}</p>
  }

  const Pill = ({ on, onClick, children }) => (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={[
        'text-label-md px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5',
        on ? 'bg-primary text-on-primary border-primary'
           : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container',
      ].join(' ')}>{children}</button>
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-md text-on-surface-variant max-w-3xl leading-relaxed">
        {data.notes.coverage}
      </p>

      {/* -------------------------------------------------------- search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none">search</span>
        <input type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder={t('register.searchPlaceholder')} aria-label={t('register.searchPlaceholder')}
          className="w-full ps-11 pe-4 py-2.5 rounded-full border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary" />
      </div>

      {/* ------------------------------------------------------- filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label-sm uppercase tracking-wide text-on-surface-variant me-1">{t('register.filter.type')}</span>
          {data.filters.project_type.map(x => (
            <Pill key={x} on={type === x} onClick={() => setType(type === x ? null : x)}>
              {t(`projects.type.${x}`, {}) || x}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label-sm uppercase tracking-wide text-on-surface-variant me-1">{t('register.filter.status')}</span>
          {data.filters.status.map(x => (
            <Pill key={x} on={status === x} onClick={() => setStatus(status === x ? null : x)}>
              {t(`projects.status.${x}`, {}) || x}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label-sm uppercase tracking-wide text-on-surface-variant me-1">{t('register.filter.workedOn')}</span>
          {['tdp1', 'ysrcp', 'tdp2'].map(x => (
            <Pill key={x} on={tenure === x} onClick={() => setTenure(tenure === x ? null : x)}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={fill(x)} />
              {t(`depts.tenure.${x}`)}
            </Pill>
          ))}
          <Pill on={spanning} onClick={() => setSpanning(v => !v)}>{t('register.filter.spanning')}</Pill>
        </div>
      </div>

      <p className="text-label-md text-on-surface-variant" role="status" aria-live="polite">
        {t('register.showing', { n: shown.length, total: data.counts.projects })}
      </p>

      {shown.length === 0 ? (
        <p className="text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-xl px-5 py-8 text-center">
          {t('register.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.slice(0, limit).map(p => (
            <ProjectCard key={p.id} p={p} q={q} t={t}
              detail={details[p.id]} detailError={detailErrors[p.id]}
              open={openId === p.id} onToggle={() => toggle(p.id)} />
          ))}
          {shown.length > limit && (
            <button type="button" onClick={() => setLimit(n => n + PAGE)}
              className="self-center mt-2 px-5 py-2.5 rounded-full border border-outline-variant text-label-lg text-on-surface hover:bg-surface-container">
              {t('register.showMore', { n: Math.min(PAGE, shown.length - limit), left: shown.length - limit })}
            </button>
          )}
        </div>
      )}

      {/* -------------------------------------------------- how to read it */}
      <div className="border border-outline-variant rounded-xl p-5 bg-surface-container flex flex-col gap-3 mt-2">
        <h3 className="text-title-md font-title-md text-on-surface inline-flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-secondary">info</span>
          {t('register.howToRead')}
        </h3>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{data.notes.attribution}</p>
        <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl">{data.notes.dating}</p>
        <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl">{data.notes.pre_window}</p>
        <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl">{data.notes.blank_cost}</p>
        {data.notes.source_tier && (
          <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl">{data.notes.source_tier}</p>
        )}
        <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl">{t('register.bandNote')}</p>
        <p className="text-label-sm text-outline leading-relaxed max-w-3xl border-t border-dashed border-outline-variant pt-3">
          {t('register.stats', {
            projects: data.counts.projects.toLocaleString('en-IN'),
            events: data.counts.events.toLocaleString('en-IN'),
            spanning: data.counts.spanning_multiple_governments.toLocaleString('en-IN'),
            noCost: data.counts.without_published_cost.toLocaleString('en-IN'),
          })}
          {' '}
          {t('register.statsKinds', {
            documented: data.counts.documented.toLocaleString('en-IN'),
            record: data.counts.from_record_only.toLocaleString('en-IN'),
          })}
        </p>
      </div>
    </div>
  )
}
