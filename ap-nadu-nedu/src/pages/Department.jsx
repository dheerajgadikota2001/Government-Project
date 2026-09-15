import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { applySeo } from '../lib/seo'
import { useT } from '../i18n'
import { croreAmount } from '../lib/money'
import {
  departmentSlug, departmentPath, departmentFacts, departmentSummary,
} from '../lib/departmentSummary'

/**
 * One voted demand, thirteen years, every figure linked to the book it came from.
 *
 * WHY THIS PAGE EXISTS
 *
 * The register already held forty departments and thirteen years of budget
 * volumes, each row carrying the URL of the PDF it was read from. All of it
 * lived inside one chart on the finances page and had no address of its own.
 * "Andhra Pradesh school education budget" is a search people type, and the
 * answer was on the site and unreachable.
 *
 * WHAT MAKES IT WORTH READING RATHER THAN JUST INDEXING
 *
 * For the demands where the collection has audited actuals, this page can say
 * the thing nobody else in the state publishes: what was budgeted, and what
 * the audited accounts recorded as spent, for the same year. Two numbers from
 * two government books. The page does not draw a conclusion from them and does
 * not need to.
 *
 * Where those accounts are missing it says so in a sentence rather than
 * quietly showing plans as though they were outcomes, which is the single
 * easiest way for a page like this to mislead.
 */
const fmtNum = n => Number(n).toLocaleString('en-IN')

const STAGE_KEY = {
  BE: 'finances.dept.stageBE',
  RE: 'finances.dept.stageRE',
  Actual: 'finances.dept.stageActual',
}

export default function Department() {
  const { t } = useT()
  const { slug } = useParams()
  const [all, setAll] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiGet('/finances/departments')
      .then(res => { if (!cancelled) setAll(res) })
      .catch(err => { if (!cancelled) setError(err) })
    return () => { cancelled = true }
  }, [])

  const department = (all?.departments || [])
    .find(d => departmentSlug(d.department) === slug) || null

  const facts = department ? departmentFacts(department) : null
  const lead = department ? departmentSummary({ department, t, fmtNum }) : []

  useEffect(() => {
    if (!department) return
    applySeo(departmentPath(department.department), {
      title: t('finances.dept.heading', { department: department.department }).slice(0, 70),
      description: lead.slice(0, 2).join(' ').slice(0, 200),
    })
  }, [department?.department, lead.length])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-body-lg text-on-surface-variant">{t('projectDetail.unreachable')}</p>
      </div>
    )
  }
  if (!all) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse" aria-busy="true">
        <div className="h-8 w-2/3 rounded-lg bg-surface-container-high mb-4" />
        <div className="h-4 w-full rounded bg-surface-container mb-2" />
        <div className="h-40 rounded-xl bg-surface-container" />
      </div>
    )
  }
  if (!department) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-body-lg text-on-surface-variant">{t('projectDetail.notFound')}</p>
        <Link className="text-primary" to="/finances">{t('finances.dept.allDepartments')}</Link>
      </div>
    )
  }

  // Newest first: a reader arriving from a search wants this year, not 2014.
  const rows = [...(department.rows || [])].sort((a, b) => {
    const ya = Number(String(a.year).slice(0, 4)), yb = Number(String(b.year).slice(0, 4))
    if (ya !== yb) return yb - ya
    // Within a year the estimate hardens BE, RE, Actual; show it that way round.
    const order = { Actual: 0, RE: 1, BE: 2 }
    return (order[a.stage] ?? 9) - (order[b.stage] ?? 9)
  })

  const gapByYear = new Map(facts.gaps.map(g => [g.year, g]))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <Link className="text-primary text-label-md" to="/finances">
          {t('finances.dept.allDepartments')}
        </Link>
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface mt-2">
          {t('finances.dept.heading', { department: department.department })}
        </h1>
        {facts.demand && (
          <p className="text-label-md text-on-surface-variant mt-1">
            {t('finances.dept.demandLabel')} {facts.demand}
          </p>
        )}
      </div>

      {lead.length > 0 && (
        <p className="text-body-lg text-on-surface max-w-3xl">{lead.join(' ')}</p>
      )}

      <section>
        <h2 className="text-title-md font-bold text-on-surface mb-3">
          {t('finances.dept.tableTitle')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-body-md border-collapse">
            <thead>
              <tr className="text-label-sm text-on-surface-variant uppercase tracking-wide">
                <th className="text-start py-2 pe-4">{t('finances.dept.colYear')}</th>
                <th className="text-start py-2 pe-4">{t('finances.dept.colStage')}</th>
                <th className="text-end py-2 pe-4">{t('finances.dept.colTotal')}</th>
                <th className="text-start py-2">{t('finances.dept.colSource')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gap = r.stage === 'Actual' ? gapByYear.get(r.year) : null
                return (
                  <tr key={`${r.year}-${r.stage}-${i}`} className="border-t border-surface-variant align-top">
                    <td className="py-2 pe-4 whitespace-nowrap">{r.year}</td>
                    <td className="py-2 pe-4">{t(STAGE_KEY[r.stage] || 'finances.dept.stageBE')}</td>
                    <td className="py-2 pe-4 text-end whitespace-nowrap">
                      {r.total_crore != null
                        ? `₹${croreAmount(r.total_crore)} ${t('unit.crore')}`
                        : t('common.notPublished')}
                      {gap && gap.gap > 0 && (
                        <span className="block text-label-sm text-on-surface-variant">
                          {`− ₹${croreAmount(gap.gap)} ${t('unit.crore')}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.source_url
                        ? <a className="text-primary hover:underline break-all"
                             href={r.source_url} rel="nofollow">{r.page || r.year}</a>
                        : <span className="text-on-surface-variant">{r.page || ''}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* The caveats come from the register itself rather than being written
          here, so the page cannot drift from the rules the data was collected
          under. They are the reason a figure on this page can be trusted. */}
      {Array.isArray(all.caveats) && all.caveats.length > 0 && (
        <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
          <h2 className="text-title-md font-bold text-on-surface mb-3">
            {all.how_to_read?.title || ''}
          </h2>
          <ul className="flex flex-col gap-3">
            {all.caveats.map(c => (
              <li key={c.title}>
                <p className="text-body-md font-semibold text-on-surface">{c.title}</p>
                <p className="text-body-sm text-on-surface-variant">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-title-md font-bold text-on-surface mb-2">
          {t('finances.dept.allDepartments')}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {(all.departments || []).map(d => (
            <li key={d.department}>
              <Link className="text-primary text-body-md hover:underline"
                    to={departmentPath(d.department)}>{d.department}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
