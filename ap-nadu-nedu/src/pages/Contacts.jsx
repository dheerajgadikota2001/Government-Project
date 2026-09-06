import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import PageThread from '../components/community/PageThread'
import Deferred from '../components/Deferred'

/**
 * Who to call, and where to go.
 *
 * This is the page a person opens on the worst day of their year: a pension
 * has stopped, a land record is wrong, a police station will not write an FIR.
 * So it is built phone-first and it does not make anyone read an essay before
 * they find a number.
 *
 * THREE RULES THIS PAGE KEEPS
 *
 * 1. Every number and every URL came off a government page, and that page is
 *    linked beside it. Nothing here was copied from a directory site or a news
 *    report. A wrong helpline number is worse than a missing one.
 *
 * 2. Where we could not confirm something from a government source, it is not
 *    quietly dropped. It sits in a block at the foot of the page saying what is
 *    missing and exactly which page a person in Andhra Pradesh should open to
 *    fill it. That block is part of the page, not an apology hidden in a
 *    footnote.
 *
 * 3. An escalation ladder shows the office at every rung, what to carry, and
 *    the notified time limit where one is published. Where the time limit is
 *    not published anywhere we could read, the rung says so in those words. We
 *    would rather print "not published" than print a number we made up.
 */

/* ------------------------------------------------------------- utilities */

/** Strip a number down to what a phone can dial. */
const dialable = n => String(n).replace(/[^\d+]/g, '')

/** Case- and punctuation-insensitive haystack for the one search box. */
const norm = s => String(s ?? '').toLowerCase()

function useDebounced(value, ms = 160) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Highlight the matched run so a filtered list explains itself. */
function Mark({ text, q }) {
  if (!q) return <>{text}</>
  const i = norm(text).indexOf(norm(q))
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-secondary-fixed text-on-secondary-fixed rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** The first real address in a field.
 *
 * Several seed fields hold a labelled list — 'land records: https://a ; maps:
 * https://b' — or an address with a note after it: 'https://a (formerly
 * https://b)'. Handing that whole string to href produces a link that opens
 * nothing, which on this site means a figure a reader cannot check. Take the
 * first ';' piece, then the first whitespace-delimited URL inside it.
 */
function firstUrl(value) {
  if (!value) return null
  const piece = String(value).split(/\s*;\s*/)[0]
  const url = (piece.match(/https?:\/\/\S+/) || [])[0]
  if (!url) return null
  // A trailing ')' closes the note, not the address — unless the address
  // itself opened one, as some budget filenames do.
  return url.includes('(') ? url : url.replace(/\)+$/, '')
}

/** The government page a fact came from, as a quiet trailing link. */
function Source({ url, t }) {
  const first = firstUrl(url)
  if (!first) return null
  let host = first
  try { host = new URL(first).host.replace(/^www\./, '') } catch { /* keep raw */ }
  return (
    <a href={first} target="_blank" rel="noreferrer"
      className="text-label-sm text-outline hover:text-primary hover:underline inline-flex items-center gap-1"
      title={t('contacts.sourceTitle', { url: first })}>
      <span className="material-symbols-outlined text-[13px]">link</span>{host}
    </a>
  )
}

/* --------------------------------------------------------- emergency band */

function EmergencyBand({ rows, t }) {
  if (!rows?.length) return null
  return (
    <section aria-labelledby="emergency-title"
      className="rounded-2xl border border-outline-variant bg-tertiary text-on-tertiary overflow-hidden">
      <div className="px-5 sm:px-6 pt-5 pb-2">
        <h2 id="emergency-title" className="text-title-md font-title-md text-on-tertiary">
          {t('contacts.emergency.title')}
        </h2>
        <p className="text-label-md text-tertiary-fixed-dim mt-0.5">{t('contacts.emergency.sub')}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-on-tertiary-container">
        {rows.map(h => (
          <a key={h.number} href={`tel:${dialable(h.number)}`}
            className="bg-tertiary hover:bg-tertiary-container transition-colors px-4 py-3.5 flex flex-col gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inverse-primary">
            <span className="text-display-lg-mobile font-display-lg-mobile text-on-tertiary tabular-nums leading-none" data-numeric>
              {h.number}
            </span>
            <span className="text-label-md text-tertiary-fixed leading-snug">{h.name}</span>
          </a>
        ))}
      </div>
      <p className="px-5 sm:px-6 py-2.5 text-label-sm text-tertiary-fixed-dim border-t border-on-tertiary-container">
        {t('contacts.emergency.foot')}
      </p>
    </section>
  )
}

/* ------------------------------------------------------- escalation ladder */

/**
 * The rungs, drawn as a rail. A numbered node per office, connected by a
 * line, so the sequence reads as a sequence rather than as a bulleted list —
 * the whole point being that you may not skip a rung.
 */
function Ladder({ steps, t }) {
  return (
    <ol className="relative flex flex-col gap-5 ps-9 mt-1">
      {/* the rail */}
      <span aria-hidden="true"
        className="absolute start-[13px] top-3 bottom-3 w-px bg-outline-variant" />
      {steps.map(s => (
        <li key={s.rung} className="relative">
          <span aria-hidden="true"
            className="absolute -start-9 top-0 w-[27px] h-[27px] rounded-full bg-surface-container-lowest border border-outline-variant text-on-surface-variant text-label-sm font-bold inline-flex items-center justify-center tabular-nums">
            {s.rung}
          </span>
          <p className="text-title-sm font-title-sm text-on-surface">{s.office}</p>
          {s.what_to_bring && (
            <p className="text-label-md text-on-surface-variant mt-1 leading-relaxed">
              <span className="text-on-surface font-semibold">{t('contacts.ladder.bring')}</span> {s.what_to_bring}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            {s.time_limit && (
              <span className="text-label-sm text-on-surface-variant inline-flex items-start gap-1.5 max-w-xl">
                <span className="material-symbols-outlined text-[15px] mt-px shrink-0">schedule</span>
                <span>{s.time_limit}</span>
              </span>
            )}
            {s.portal && String(s.portal).split(/\s*;\s*/).map(p => {
              const url = firstUrl(p)
              if (!url) return null
              let host = url
              try { host = new URL(url).host.replace(/^www\./, '') } catch { /* keep raw */ }
              return (
                <a key={url} href={url} target="_blank" rel="noreferrer"
                  className="text-label-sm text-primary hover:underline inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>{host}
                </a>
              )
            })}
            <Source url={s.source_url} t={t} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function EscalationCard({ e, index, q, t }) {
  return (
    <details className="group border border-surface-variant rounded-xl bg-surface-container-lowest overflow-hidden"
      open={Boolean(q)}>
      <summary className="cursor-pointer list-none px-5 py-4 flex items-start gap-3 hover:bg-surface-container transition-colors">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant mt-0.5 transition-transform group-open:rotate-90">
          chevron_right
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-title-md font-title-md text-on-surface">
            <Mark text={e.problem} q={q} />
          </span>
          <span className="block text-label-md text-on-surface-variant mt-0.5">
            {t('contacts.ladder.rungs', { n: e.steps.length })}
          </span>
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-surface-variant">
        <Ladder steps={e.steps} t={t} />
        {e.law_or_go && (
          <p className="text-label-md text-on-surface-variant leading-relaxed mt-5 pt-3 border-t border-dashed border-surface-variant max-w-3xl">
            <span className="text-on-surface font-semibold">{t('contacts.ladder.law')}</span> {e.law_or_go}
          </p>
        )}
        {e.notes && (
          <p className="text-label-sm text-outline leading-relaxed mt-2 max-w-3xl">{e.notes}</p>
        )}
      </div>
    </details>
  )
}

/* -------------------------------------------------------------- list bits */

function HelplineRow({ h, q, t }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-surface-variant last:border-0">
      <a href={`tel:${dialable(h.number)}`}
        className="text-title-md font-title-md text-primary hover:underline tabular-nums shrink-0 w-[110px]"
        data-numeric>
        <Mark text={h.number} q={q} />
      </a>
      <div className="flex-1 min-w-0">
        <p className="text-body-md text-on-surface"><Mark text={h.name} q={q} /></p>
        {h.what_for && <p className="text-label-md text-on-surface-variant leading-snug mt-0.5">{h.what_for}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-label-sm text-outline">
            {h.scope === 'state' ? t('contacts.scope.state') : t('contacts.scope.national')}
            {h.hours ? ` · ${h.hours}` : ''}
          </span>
          <Source url={h.source_url || h.url} t={t} />
        </div>
      </div>
    </div>
  )
}

function LinkCard({ name, website, phone, email, portal, foot, q, t }) {
  const Wrapper = website ? 'a' : 'div'
  return (
    <Wrapper
      {...(website ? { href: website, target: '_blank', rel: 'noreferrer' } : {})}
      className={[
        'border border-surface-variant rounded-xl px-4 py-3 flex flex-col gap-1 bg-surface-container-lowest',
        website ? 'hover:border-outline hover:bg-surface-container transition-colors' : '',
      ].join(' ')}>
      <span className="text-title-sm font-title-sm text-on-surface"><Mark text={name} q={q} /></span>
      {website && (
        <span className="text-label-sm text-primary truncate">
          {website.replace(/^https?:\/\/(www\.)?/, '')}
        </span>
      )}
      {(phone || email) && (
        <span className="text-label-sm text-on-surface-variant flex flex-wrap gap-x-3">
          {phone && <span className="tabular-nums" data-numeric>{phone}</span>}
          {email && <span className="truncate">{email}</span>}
        </span>
      )}
      {portal && (
        <span className="text-label-sm text-on-surface-variant truncate">
          {t('contacts.dept.portal')} {portal.replace(/^https?:\/\/(www\.)?/, '')}
        </span>
      )}
      {foot && <span className="text-label-sm text-outline">{foot}</span>}
    </Wrapper>
  )
}

/* ================================================================== page */

export default function Contacts() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [raw, setRaw] = useState('')
  const q = useDebounced(raw.trim())
  const searchRef = useRef(null)

  useEffect(() => {
    apiGet('/contacts/').then(d => { setData(d); setError(null) }).catch(setError)
  }, [])

  // "/" focuses search, the way every reference page a developer has ever used
  // behaves. Ignored while typing in a field.
  useEffect(() => {
    const onKey = ev => {
      if (ev.key !== '/' || ev.metaKey || ev.ctrlKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      ev.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    if (!data) return null
    if (!q) return data
    const k = norm(q)
    const hit = (...parts) => parts.some(p => norm(p).includes(k))
    return {
      ...data,
      helplines: data.helplines.filter(h => hit(h.name, h.number, h.what_for)),
      grievance_systems: data.grievance_systems.filter(g => hit(g.name, g.what_for, g.how_to_file)),
      departments: data.departments.filter(x => hit(x.name, x.website, x.citizen_portal)),
      districts: data.districts.filter(x => hit(x.name, x.website)),
      escalations: data.escalations.filter(e =>
        hit(e.problem, e.law_or_go) || e.steps.some(s => hit(s.office, s.what_to_bring, s.portal))),
    }
  }, [data, q])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-body-md text-on-surface">{t('contacts.error', { message: error.message })}</p>
      </div>
    )
  }
  if (!data) {
    return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('contacts.loading')}</div>
  }

  const f = filtered
  const nothing = q && !f.helplines.length && !f.grievance_systems.length
    && !f.departments.length && !f.districts.length && !f.escalations.length

  const Section = ({ id, title, sub, count, children }) => {
    if (count === 0) return null
    return (
      <section id={id} className="scroll-mt-20 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-headline-md font-headline-md text-on-surface">{title}</h2>
          {sub && <p className="text-body-md text-on-surface-variant max-w-3xl leading-relaxed">{sub}</p>}
        </div>
        {children}
      </section>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-headline-lg font-headline-lg text-on-surface">{t('contacts.title')}</h1>
        <p className="text-body-lg font-body-lg text-on-surface leading-relaxed max-w-3xl">
          {t('contacts.intro')}
        </p>
      </header>

      <EmergencyBand rows={data.emergency} t={t} />

      {/* ------------------------------------------------------- search */}
      <div className="flex flex-col gap-2 sticky top-0 z-20 bg-surface/95 backdrop-blur py-3 -my-1">
        <label htmlFor="contacts-search" className="sr-only">{t('contacts.search.label')}</label>
        <div className="relative">
          <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant pointer-events-none">
            search
          </span>
          <input
            id="contacts-search"
            ref={searchRef}
            type="search"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder={t('contacts.search.placeholder')}
            className="w-full ps-11 pe-4 py-3 rounded-full border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
        </div>
        {q && (
          <p className="text-label-md text-on-surface-variant px-2" role="status" aria-live="polite">
            {t('contacts.search.results', {
              problems: f.escalations.length,
              helplines: f.helplines.length,
              departments: f.departments.length,
              districts: f.districts.length,
            })}
          </p>
        )}
      </div>

      {nothing && (
        <p className="text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-xl px-5 py-6 text-center">
          {t('contacts.search.none', { q })}
        </p>
      )}

      <Section
        id="problems"
        title={t('contacts.problems.title')}
        sub={t('contacts.problems.sub')}
        count={f.escalations.length}
      >
        <div className="flex flex-col gap-2.5">
          {f.escalations.map((e, i) => <EscalationCard key={e.problem} e={e} index={i} q={q} t={t} />)}
        </div>
        <p className="text-label-md text-on-surface-variant leading-relaxed max-w-3xl border-s-2 border-outline-variant ps-3">
          {t('contacts.problems.timeLimitNote')}
        </p>
      </Section>

      <Section
        id="grievances"
        title={t('contacts.grievance.title')}
        sub={t('contacts.grievance.sub')}
        count={f.grievance_systems.length}
      >
        <div className="grid md:grid-cols-2 gap-3">
          {f.grievance_systems.map(g => (
            <article key={g.name} className="border border-surface-variant rounded-xl p-5 flex flex-col gap-2 bg-surface-container-lowest">
              <h3 className="text-title-md font-title-md text-on-surface"><Mark text={g.name} q={q} /></h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">{g.what_for}</p>
              {g.how_to_file && (
                <p className="text-label-md text-on-surface-variant leading-relaxed">
                  <span className="text-on-surface font-semibold">{t('contacts.grievance.how')}</span> {g.how_to_file}
                </p>
              )}
              {g.what_happens_next && (
                <p className="text-label-md text-on-surface-variant leading-relaxed">
                  <span className="text-on-surface font-semibold">{t('contacts.grievance.next')}</span> {g.what_happens_next}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-auto pt-2">
                {g.url && (
                  <a href={g.url} target="_blank" rel="noreferrer"
                    className="text-label-md text-primary hover:underline inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                    {g.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
                <Source url={g.source_url} t={t} />
              </div>
              {g.time_limit && <p className="text-label-sm text-outline">{g.time_limit}</p>}
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="helplines"
        title={t('contacts.helplines.title')}
        sub={t('contacts.helplines.sub')}
        count={f.helplines.length}
      >
        {['state', 'national'].map(scope => {
          const rows = f.helplines.filter(h => h.scope === scope)
          if (!rows.length) return null
          return (
            <div key={scope} className="flex flex-col gap-1">
              <h3 className="text-title-sm font-title-sm text-on-surface-variant uppercase tracking-wide mt-2">
                {scope === 'state' ? t('contacts.helplines.stateGroup') : t('contacts.helplines.nationalGroup')}
              </h3>
              <div className="border border-surface-variant rounded-xl px-4 bg-surface-container-lowest">
                {rows.map(h => <HelplineRow key={h.number + h.name} h={h} q={q} t={t} />)}
              </div>
            </div>
          )
        })}
      </Section>

      <Section
        id="departments"
        title={t('contacts.dept.title')}
        sub={t('contacts.dept.sub')}
        count={f.departments.length}
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {f.departments.map(d => (
            <LinkCard key={d.name} name={d.name} website={d.website} phone={d.phone}
              email={d.email} portal={d.citizen_portal} q={q} t={t} />
          ))}
        </div>
      </Section>

      <Section
        id="districts"
        title={t('contacts.districts.title')}
        sub={t('contacts.districts.sub')}
        count={f.districts.length}
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {f.districts.map(d => (
            <LinkCard key={d.name} name={d.name} website={d.website} phone={d.phone}
              email={d.email} foot={d.formed_from} q={q} t={t} />
          ))}
        </div>
      </Section>

      {/* --------------------------------------------- the honest block */}
      <section id="unverified" className="scroll-mt-20 border border-outline-variant rounded-xl p-5 bg-surface-container flex flex-col gap-3">
        <h2 className="text-title-md font-title-md text-on-surface inline-flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-secondary">info</span>
          {t('contacts.unverified.title')}
        </h2>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">
          {t('contacts.unverified.body', { n: data.counts.unverified })}
        </p>
        <details className="group">
          <summary className="cursor-pointer text-label-md text-primary font-semibold list-none inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">chevron_right</span>
            {t('contacts.unverified.toggle', { n: data.counts.unverified })}
          </summary>
          <ul className="flex flex-col gap-4 mt-4">
            {data.unavailable.map((u, i) => (
              <li key={i} className="border-s-2 border-outline-variant ps-3 flex flex-col gap-1">
                <p className="text-label-md text-on-surface leading-relaxed">{u.what}</p>
                {u.what_a_human_should_do && (
                  <p className="text-label-md text-on-surface-variant leading-relaxed">
                    <span className="text-on-surface font-semibold">{t('contacts.unverified.todo')}</span> {u.what_a_human_should_do}
                  </p>
                )}
                {firstUrl(u.url) && (
                  <a href={firstUrl(u.url)} target="_blank" rel="noreferrer"
                    className="text-label-sm text-primary hover:underline">
                    {firstUrl(u.url)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
        <p className="text-label-sm text-outline leading-relaxed max-w-3xl border-t border-dashed border-outline-variant pt-3">
          {t('contacts.unverified.foot', { date: data.fetched })}
        </p>
      </section>

      <Deferred minHeight={320}><PageThread pageKey="contacts" /></Deferred>
    </div>
  )
}
