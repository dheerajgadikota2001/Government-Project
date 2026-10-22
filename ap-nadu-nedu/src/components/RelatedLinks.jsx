import { Link, useLocation } from 'react-router-dom'
import { matchRoute } from '../lib/routes'
import { relatedGroups } from '../lib/related'
import { useT } from '../i18n'

/**
 * "Fact checks on the same record" under the governments page, "Government
 * projects by district" under tenders, and the rest of src/lib/related.js.
 *
 * Mounted once in App.jsx rather than in seven pages, for the same reason
 * Seo and Analytics are: a list that seven pages each have to remember is a
 * list one of them forgets. The prerenderer writes the same groups into the
 * HTML (scripts/prerender.mjs routeBody), so a crawler and a reader follow the
 * same links.
 *
 * Renders nothing on a page with no related groups.
 */
export default function RelatedLinks() {
  const { pathname } = useLocation()
  const { t } = useT()
  const route = matchRoute(pathname)
  const groups = route ? relatedGroups(route.pattern, t) : []
  if (!groups.length) return null

  return (
    <section className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pb-10" aria-labelledby="related-heading">
      <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 md:p-6">
        <p id="related-heading" className="text-label-sm text-on-surface-variant mb-4">{t('related.note')}</p>
        <div className="flex flex-col gap-6">
          {groups.map(g => (
            <div key={g.key}>
              <h2 className="text-title-md font-bold text-on-surface mb-3">{g.heading}</h2>
              <ul className={g.key === 'districts'
                ? 'flex flex-wrap gap-2'
                : 'flex flex-col gap-2'}
              >
                {g.links.map(l => (
                  <li key={l.path}>
                    <Link
                      to={l.path}
                      className={g.key === 'districts'
                        ? 'inline-block rounded-full border border-surface-variant px-3 py-1 text-label-md text-primary hover:bg-surface-container-high'
                        : 'text-primary text-body-md hover:underline break-words'}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
