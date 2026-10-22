import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { districtPath } from '../lib/routes'
import { displayTitle } from '../lib/projectTitle'
import { useT } from '../i18n'

/**
 * Links out of a project page, to other project pages.
 *
 * WHY THIS EXISTS
 *
 * A project page had exactly one internal link on it: "All projects". Six
 * hundred and seventy three pages, each a dead end, each reachable only by
 * paging through a list whose page two has no address. To a search engine
 * that is 673 orphans, and an orphan is treated as unimportant however good
 * it is. This was the largest thing holding the deep pages down and it cost
 * nothing to fix.
 *
 * It is also the only thing that makes the district pages worth having. A
 * district page nothing links to cannot rank for its own district's name; now
 * every project in that district links to it.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * Not a recommendation, not "projects you may like", not ranked by anything
 * we invented. It is the register's own neighbours: same district, or failing
 * that, same type. A reader who follows one of these is looking at another
 * record, not at an opinion, and the note under the heading says so.
 *
 * When the register cannot answer, this renders nothing. An empty box with a
 * heading is worse than no box.
 */
export default function RelatedProjects({ project, typeLabel }) {
  const { t } = useT()
  const [items, setItems] = useState(null)

  const district = project?.district || null
  const type = project?.project_type || null
  const id = project?.id

  useEffect(() => {
    if (!id) return
    let cancelled = false

    // District first: it is the sharper relationship and the one people
    // actually browse by. Type is the fallback for the central-sector
    // projects the record tracks state-wide with no district at all.
    const query = district
      ? `/projects/?district=${encodeURIComponent(district)}&page_size=7`
      : type
        // project_type, not type. The API declares `project_type` and simply
        // ignores an unknown parameter, so `type=irrigation` returns the whole
        // register of 673 and the first seven happen to be irrigation, which
        // is precisely how a wrong filter ships looking correct.
        ? `/projects/?project_type=${encodeURIComponent(type)}&page_size=7`
        : null
    if (!query) { setItems([]); return }

    apiGet(query)
      .then(res => {
        if (cancelled) return
        const near = (res?.items || []).filter(p => p.id !== id).slice(0, 6)
        setItems(near)
      })
      .catch(() => { if (!cancelled) setItems([]) })

    return () => { cancelled = true }
  }, [id, district, type])

  if (!items || items.length === 0) return null

  const heading = district
    ? t('projectDetail.related.inDistrict', { district })
    : t('projectDetail.related.byType', { type: typeLabel(type) || '' })

  return (
    <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5">
      <h2 className="text-title-md font-bold text-on-surface">{heading}</h2>
      <p className="text-label-sm text-on-surface-variant mt-1 mb-3">
        {t('projectDetail.related.note')}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map(p => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="text-primary text-body-md hover:underline break-words"
            >
              {displayTitle(p.title)}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to={district ? districtPath(district) : '/projects'}
        className="inline-block mt-4 text-primary text-label-md font-semibold hover:underline"
      >
        {district
          ? t('projectDetail.related.seeDistrict', { district })
          : t('projectDetail.related.seeRegister')}
      </Link>
    </section>
  )
}
