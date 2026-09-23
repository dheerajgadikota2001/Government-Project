import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apDistrictHq, apDistrictCode } from '../constants/apDistricts'
import shapes from '../constants/apDistrictShapes.json'
import { apiGet } from '../lib/api'
import { useT } from '../i18n'
import { placeName } from '../lib/placeNames.js'
import { EVENTS, track } from '../lib/analytics'

/**
 * Andhra Pradesh, district by district.
 *
 * Boundaries are the current 26 districts (the 2022 reorganisation), drawn
 * from published district boundary data and simplified for the browser.
 * Shading is the live count of tracked projects in each district — a district
 * with nothing on record is drawn grey and says so, never shaded as if it
 * were a zero we measured.
 *
 * WHY CLICKING OPENS THE PROJECTS HERE INSTEAD OF NAVIGATING
 * Each district used to be a <Link> to /projects?district=…, with the readout
 * appearing on hover in the column beside the map. Two things were wrong with
 * that, and they compounded:
 *
 *   The readout cleared on mouseleave of the MAP, while the "Open these
 *   projects" link lived outside it — so moving the cursor toward the link
 *   destroyed the thing you were reaching for. The link was, in practice,
 *   unclickable.
 *
 *   And it did not matter, because the Projects page read only `tenure` from
 *   the URL. The district parameter arrived and was dropped, so the rare
 *   reader who did hit the link saw all 526 projects.
 *
 * Opening the district's projects in place removes the navigation step that
 * both bugs lived in, and makes comparing two districts two clicks instead of
 * two page loads. The URL still updates, so the link is still shareable.
 *
 * The district list beside the map is not decoration: at phone width the
 * smallest district is a 16x21px target against a 44px guideline, and no
 * amount of care makes 26 irregular polygons thumb-friendly. The list is the
 * reliable path, and sorted by count it doubles as the ranking that shades of
 * blue can only hint at.
 */

const SEQ = ['#cde2fb', '#a8cbf5', '#7db0ee', '#4f92e3', '#2a78d6', '#155ba8', '#0b3f7a']
const fmtIN = n => (n == null ? '—' : n.toLocaleString('en-IN'))
const PREVIEW = 4

/**
 * `byDistrict` undefined means the counts have not arrived yet; an empty array
 * would mean they arrived and there is nothing on record. The difference
 * matters more here than anywhere else on the site: the loading state used to
 * print "0 of 26 districts have projects on record so far", which is not a
 * loading message, it is a false statement about the government's record — on a
 * platform whose entire claim is that it does not print figures it cannot
 * source. So while `loading` is true the map shows its shape and withholds
 * every number.
 */
export default function APMap({
  byDistrict,
  statewideCount = 0,
  districtUnstatedCount = 0,
  totalMapped,
}) {
  const loading = byDistrict == null
  const { t, lang } = useT()
  const [hot, setHot] = useState(null)      // under the cursor
  const [open, setOpen] = useState(null)    // clicked: its projects are showing
  const [rows, setRows] = useState(null)    // the open district's projects
  const [rowsError, setRowsError] = useState(false)
  const closeRef = useRef(null)

  const fmtCr = v =>
    v == null || v === 0
      ? t('common.notPublished')
      : v >= 100000
        ? `₹${(v / 100000).toFixed(2)} ${t('unit.lakhCrore')}`
        : `₹${fmtIN(Math.round(v))} ${t('unit.crore')}`

  const lookup = useMemo(() => {
    const m = {}
    ;(byDistrict || []).forEach(d => { m[d.district] = d })
    return m
  }, [byDistrict])

  const max = useMemo(
    () => Math.max(1, ...(byDistrict || []).map(d => d.count)),
    [byDistrict]
  )
  const mapped = totalMapped ?? (byDistrict || []).reduce((s, d) => s + d.count, 0)

  const shade = n => {
    if (!n) return '#e6e4dc'
    const i = Math.min(SEQ.length - 1, Math.floor(Math.pow(n / max, 0.62) * SEQ.length))
    return SEQ[i]
  }

  // Centres come from the path data, not getBBox(): getBBox returns zeros for
  // an element inside a display:none subtree, and this map sits inside panels
  // that are hidden at some breakpoints. Measuring the geometry we already have
  // is both correct and free.
  const centres = useMemo(() => {
    const out = {}
    shapes.districts.forEach(d => {
      const nums = d.d.slice(1).split('Z')[0].split(' ')
        .map(pt => pt.split(',').map(Number)).filter(a => a.length === 2 && !isNaN(a[0]))
      if (!nums.length) return
      const xs = nums.map(a => a[0]), ys = nums.map(a => a[1])
      out[d.name] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    })
    return out
  }, [])

  const ranked = useMemo(
    () => shapes.districts.map(d => d.name)
      .sort((a, b) => (lookup[b]?.count || 0) - (lookup[a]?.count || 0)),
    [lookup]
  )

  // The open district's first few projects. Only a preview: the drawer's job is
  // to prove the filter worked and let the reader decide whether to open the
  // full register, not to reimplement it.
  useEffect(() => {
    if (!open) { setRows(null); setRowsError(false); return }
    let cancelled = false
    setRows(null); setRowsError(false)
    apiGet('/projects/', { district: open, page: 1, page_size: PREVIEW, sort: 'cost', order: 'desc' })
      .then(res => { if (!cancelled) setRows(res.items || []) })
      .catch(() => { if (!cancelled) setRowsError(true) })
    return () => { cancelled = true }
  }, [open])

  // Escape closes, and focus moves to the close button when it opens — a panel
  // that appears without taking focus is invisible to a screen reader and
  // untrappable by keyboard.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Expanded on desktop, where there is room for it; collapsed on a phone,
  // where it would add 400px above everything else. `lg:open` looks like it
  // would do this and cannot: `open` is an HTML attribute, not a CSS property.
  const [listOpen, setListOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches
  )

  const shown = hot ? lookup[hot] : null
  const withData = (byDistrict || []).filter(d => d.count > 0).length
  const openRec = open ? lookup[open] : null
  const pick = (name, via) => setOpen(prev => {
    const next = prev === name ? null : name
    // Which districts readers open is the signal that should decide which
    // portals get scraped next — a count of "someone opened a district" is a
    // vanity number, the names are editorial direction.
    //
    // `via` also answers a real design question from this week: at 390px the
    // smallest district is a 16x21px target, so the list exists as the usable
    // path. If almost everyone on a phone uses the list, the map is decoration
    // on mobile and should be treated as such deliberately.
    if (next) track(EVENTS.DISTRICT_OPENED, { district: next, via, projects: lookup[next]?.count ?? 0 })
    return next
  })

  // Overview, not the "All projects" tab: the filtered list lives there. The
  // hash lands the reader on the list itself rather than on the hero above it,
  // which is what made the filter look like it had been ignored.
  const districtLink = name =>
    `/projects?district=${encodeURIComponent(name)}#project-register`

  return (
    <section className="bg-surface rounded-2xl border border-surface-variant shadow-sm p-5 md:p-6 relative">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-headline-sm font-headline-sm font-bold text-on-surface">
            {t('map.title')} <span className="text-body-md font-normal text-on-surface-variant">| {t('map.titleTe')}</span>
          </h3>
          <p className="text-label-md text-on-surface-variant mt-0.5 max-w-xl">{t('map.intro')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <span>{t('map.legend.fewer')}</span>
          {SEQ.map(c => <i key={c} className="w-6 h-2.5 rounded-sm inline-block" style={{ background: c }} />)}
          <span>{t('map.legend.more')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_270px] gap-6 items-start">
        <div onMouseLeave={() => setHot(null)} className="max-w-[560px] w-full mx-auto">
          <svg viewBox={shapes.viewBox} className="w-full h-auto max-h-[380px]" role="img"
            aria-label={t('map.svgAlt')}>
            {shapes.districts.map(d => {
              const rec = lookup[d.name]
              const isOpen = open === d.name
              const isHot = !isOpen && hot === d.name
              return (
                <path
                  key={d.name}
                  d={d.d}
                  fill={shade(rec?.count || 0)}
                  stroke={isOpen || isHot ? '#0b2b52' : '#ffffff'}
                  strokeWidth={isOpen ? 3.4 : isHot ? 2.6 : 1.3}
                  /* The map is drawn from local boundaries the moment the page
                     renders, so it exists before the district counts arrive and
                     every district starts unshaded. Transitioning the fill makes
                     that second step read as the map colouring itself in, rather
                     than a blank shape snapping into a different picture. */
                  className="cursor-pointer transition-[stroke-width,fill] duration-500 focus:outline-none"
                  style={isOpen ? { filter: 'drop-shadow(0 0 5px rgba(11,43,82,.55))' } : undefined}
                  onMouseEnter={() => setHot(d.name)}
                  onFocus={() => setHot(d.name)}
                  onClick={() => pick(d.name, 'map')}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(d.name, 'keyboard') }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isOpen}
                  aria-label={rec ? t('map.a11y.district', { name: placeName(d.name, lang), n: rec.count }) : placeName(d.name, lang)}
                >
                  <title>{d.name}</title>
                </path>
              )
            })}
            {(open || hot) && centres[open || hot] && (
              <g pointerEvents="none">
                <rect x={centres[open || hot][0] - 34} y={centres[open || hot][1] - 15}
                  width="68" height="26" rx="5" fill="#0b2b52" fillOpacity={open ? 1 : 0.92} />
                <text x={centres[open || hot][0]} y={centres[open || hot][1] + 3} textAnchor="middle"
                  fontSize="15" fontWeight="700" fill="#ffffff">
                  {apDistrictCode[open || hot] || (open || hot).slice(0, 4).toUpperCase()}
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="flex flex-col gap-3">
          <div data-flex-h className="flex gap-6 h-[52px]">
            <div className="min-w-0">
              <p className="text-label-sm text-on-surface-variant">{t('map.stats.districts')}</p>
              <p className="text-headline-sm font-bold text-on-surface tabular-nums">26</p>
            </div>
            <div className="min-w-0">
              <p className="text-label-sm text-on-surface-variant">{t('map.stats.projectsMapped')}</p>
              <p className="text-headline-sm font-bold text-on-surface tabular-nums">{loading ? '—' : fmtIN(mapped)}</p>
            </div>
          </div>

          {/* Hover readout. It clears when the cursor leaves the map, which is
              correct now that it is a preview rather than the only route to the
              projects — clicking is what opens them. */}
          <div data-flex-h className="border border-surface-variant rounded-xl p-4 bg-surface-container-lowest min-h-[150px] flex flex-col overflow-hidden">
            {hot ? (
              <>
                <p className="text-title-md font-bold text-on-surface leading-tight">{hot}</p>
                {apDistrictHq[hot] && (
                  <p className="text-label-sm text-on-surface-variant mt-0.5">{t('map.headquarters', { hq: apDistrictHq[hot] })}</p>
                )}
                <dl className="flex flex-col mt-2">
                  <div className="flex justify-between py-1.5 border-t border-surface-variant text-label-md">
                    <dt className="text-on-surface-variant min-w-0">{t('map.readout.projectsTracked')}</dt>
                    <dd className="font-bold tabular-nums">{shown ? fmtIN(shown.count) : t('common.noneOnRecord')}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-surface-variant text-label-md">
                    <dt className="text-on-surface-variant min-w-0">{t('map.readout.publishedCost')}</dt>
                    <dd className="font-bold tabular-nums">{shown ? fmtCr(shown.cost_crore) : '—'}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-surface-variant text-label-md">
                    <dt className="text-on-surface-variant min-w-0">{t('map.readout.shareOfMapped')}</dt>
                    <dd className="font-bold tabular-nums">
                      {shown && mapped ? `${((shown.count / mapped) * 100).toFixed(1)}%` : '—'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="text-body-md text-on-surface">
                  {loading ? t('map.loading') : t('map.empty.hint')}
                </p>
                {!loading && (
                  <p className="text-label-sm text-on-surface-variant mt-2">
                    {t('map.empty.coverage', { n: withData })}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Every district as a 44px row: the map cannot be made thumb-sized,
              and sorted by count this is also the ranking the shading implies
              but never states. */}
          <details open={listOpen} onToggle={e => setListOpen(e.currentTarget.open)}
            className="border border-surface-variant rounded-xl bg-surface-container-lowest overflow-hidden">
            <summary className="cursor-pointer list-none px-4 py-3 text-label-md font-bold text-primary flex items-center justify-between">
              {t('map.browseAll')}
              <span aria-hidden="true" className="text-on-surface-variant">▾</span>
            </summary>
            <div className="max-h-[260px] overflow-y-auto border-t border-surface-variant">
              {ranked.map(name => {
                const rec = lookup[name]
                const isOpen = open === name
                return (
                  <button key={name} type="button" onClick={() => pick(name, 'list')}
                    onMouseEnter={() => setHot(name)} onMouseLeave={() => setHot(null)}
                    aria-current={isOpen ? 'true' : undefined}
                    className={[
                      'w-full min-h-[44px] px-3 flex items-center justify-between gap-2 text-label-md',
                      'border-b border-surface-variant/60 last:border-b-0 text-start transition-colors',
                      isOpen ? 'bg-primary text-on-primary font-bold' : 'text-on-surface hover:bg-surface-container',
                    ].join(' ')}>
                    <span className="flex items-center min-w-0">
                      <i className="w-2.5 h-2.5 rounded-sm shrink-0 me-2" style={{ background: shade(rec?.count || 0) }} />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="tabular-nums shrink-0">{loading ? '—' : fmtIN(rec?.count || 0)}</span>
                  </button>
                )
              })}
            </div>
          </details>

          {/* Two different facts, no longer shown as one word. Both are links,
              because until now these projects — Polavaram among them — could not
              be reached from this map at all. */}
          {!loading && (
            <p className="text-label-sm text-on-surface-variant leading-snug">
              {statewideCount > 0 && (
                <>
                  <Link to="/projects?placement=statewide#project-register" className="text-primary underline decoration-dotted">
                    {t('map.statewideCentral', { n: fmtIN(statewideCount) })}
                  </Link>{' '}
                </>
              )}
              {districtUnstatedCount > 0 && (
                <Link to="/projects?placement=unstated#project-register" className="text-primary underline decoration-dotted">
                  {t('map.districtUnstated', { n: fmtIN(districtUnstatedCount) })}
                </Link>
              )}
            </p>
          )}
        </div>
      </div>

      {/* The district's projects, opened in place.
          Below lg it is a bottom sheet: the inline drawer sat ~500px below the
          fold on a phone, so tapping a district looked like it did nothing. */}
      {open && (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpen(null)}
            className="lg:hidden fixed inset-0 z-[60] bg-black/40 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('map.drawer.aria', { name: placeName(open, lang) })}
            className={[
              // z-[70]: above the voice FAB, which is fixed at z-50 and was
              // covering a project row inside the sheet. A modal that something
              // else can sit on top of is not a modal.
              'z-[70] bg-surface border border-primary flex flex-col',
              'fixed inset-x-0 bottom-0 max-h-[74dvh] rounded-t-2xl shadow-2xl',
              'lg:static lg:max-h-none lg:rounded-2xl lg:shadow-none lg:mt-5 lg:z-auto',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-surface-variant bg-primary text-on-primary lg:rounded-t-2xl rounded-t-2xl">
              <div className="min-w-0">
                <h4 className="text-title-md font-bold truncate">{open}</h4>
                <p className="text-label-sm opacity-90">
                  {t('map.drawer.sub', {
                    hq: apDistrictHq[open] || '',
                    n: fmtIN(openRec?.count || 0),
                  })}
                </p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(null)}
                aria-label={t('common.close')}
                className="shrink-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 transition-colors">✕</button>
            </div>

            <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {/* The figures the map already holds, drawn immediately.
                  The project rows need a round trip to asia-south1, which on
                  mobile data is long enough that the sheet used to open saying
                  only "Loading…" — so a tap read as nothing having happened.
                  These three numbers are already in memory from the district
                  counts, so there is no reason to make anyone wait for them. */}
              {openRec && (
                <dl className="grid grid-cols-3 gap-3 pb-2 mb-1 border-b border-surface-variant">
                  <div className="min-w-0">
                    <dt className="text-label-sm text-on-surface-variant">{t('map.readout.projectsTracked')}</dt>
                    <dd className="text-title-md font-bold tabular-nums">{fmtIN(openRec.count)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-label-sm text-on-surface-variant">{t('map.readout.publishedCost')}</dt>
                    <dd className="text-title-md font-bold tabular-nums">{fmtCr(openRec.cost_crore)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-label-sm text-on-surface-variant">{t('map.readout.shareOfMapped')}</dt>
                    <dd className="text-title-md font-bold tabular-nums">
                      {mapped ? `${((openRec.count / mapped) * 100).toFixed(1)}%` : '—'}
                    </dd>
                  </div>
                </dl>
              )}
              {rowsError && <p className="text-label-md text-on-surface-variant">{t('map.drawer.error')}</p>}
              {!rowsError && rows == null && (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} aria-hidden="true"
                      className="border border-surface-variant rounded-xl px-3 py-2 animate-pulse">
                      <div className="h-4 bg-surface-variant rounded w-4/5" />
                      <div className="h-3 bg-surface-variant rounded w-2/5 mt-2" />
                    </div>
                  ))}
                  <p className="sr-only">{t('map.drawer.loading')}</p>
                </>
              )}
              {!rowsError && rows?.length === 0 && <p className="text-label-md text-on-surface-variant">{t('map.drawer.none')}</p>}
              {rows?.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="border border-surface-variant rounded-xl px-3 py-2 hover:bg-surface-container transition-colors">
                  <p className="text-label-lg font-bold text-on-surface leading-snug line-clamp-2">{p.title}</p>
                  <p className="text-label-sm text-on-surface-variant mt-0.5">
                    {[p.district, p.project_type, p.status].filter(Boolean)
                      .map(v => String(v).replaceAll('_', ' ')).join(' · ')}
                  </p>
                </Link>
              ))}
              <Link to={districtLink(open)}
                className="mt-1 text-center bg-primary text-on-primary rounded-xl min-h-[44px] flex items-center justify-center text-label-lg font-bold">
                {t('map.drawer.openAll', { n: fmtIN(openRec?.count || 0), name: placeName(open, lang) })}
              </Link>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
