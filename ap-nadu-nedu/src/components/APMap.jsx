import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apDistrictHq, apDistrictCode } from '../constants/apDistricts'
import shapes from '../constants/apDistrictShapes.json'
import { useT } from '../i18n'

/**
 * Andhra Pradesh, district by district.
 *
 * Boundaries are the current 26 districts (the 2022 reorganisation), drawn
 * from published district boundary data and simplified for the browser.
 * Shading is the live count of tracked projects in each district — a district
 * with nothing on record is drawn grey and says so, never shaded as if it
 * were a zero we measured.
 */

const SEQ = ['#cde2fb', '#a8cbf5', '#7db0ee', '#4f92e3', '#2a78d6', '#155ba8', '#0b3f7a']
const fmtIN = n => (n == null ? '—' : n.toLocaleString('en-IN'))

export default function APMap({ byDistrict, statewideCount = 0, totalMapped }) {
  const { t } = useT()
  const [hot, setHot] = useState(null)

  // Needs the catalogue for its unit words, so it lives inside the component.
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

  // Rough centre of each district, for the hover label.
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

  const shown = hot ? lookup[hot] : null
  const withData = (byDistrict || []).filter(d => d.count > 0).length

  return (
    <section className="bg-surface rounded-2xl border border-surface-variant shadow-sm p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-headline-sm font-headline-sm font-bold text-on-surface">
            {t('map.title')} <span className="text-body-md font-normal text-on-surface-variant">| {t('map.titleTe')}</span>
          </h3>
          <p className="text-label-md text-on-surface-variant mt-0.5 max-w-xl">
            {t('map.intro')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <span>{t('map.legend.fewer')}</span>
          {SEQ.map(c => <i key={c} className="w-6 h-2.5 rounded-sm inline-block" style={{ background: c }} />)}
          <span>{t('map.legend.more')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div onMouseLeave={() => setHot(null)} className="max-w-[560px] w-full mx-auto">
          <svg viewBox={shapes.viewBox} className="w-full h-auto max-h-[380px]" role="img"
            aria-label={t('map.svgAlt')}>
            {shapes.districts.map(d => {
              const rec = lookup[d.name]
              const active = hot === d.name
              return (
                <Link key={d.name} to={`/projects?district=${encodeURIComponent(d.name)}`}>
                  <path
                    d={d.d}
                    fill={shade(rec?.count || 0)}
                    stroke={active ? '#0b2b52' : '#ffffff'}
                    strokeWidth={active ? 2.6 : 1.3}
                    className="cursor-pointer transition-[stroke-width]"
                    onMouseEnter={() => setHot(d.name)}
                    onFocus={() => setHot(d.name)}
                    tabIndex={0}
                  >
                    <title>{d.name}</title>
                  </path>
                </Link>
              )
            })}
            {hot && centres[hot] && (
              <g pointerEvents="none">
                <rect x={centres[hot][0] - 34} y={centres[hot][1] - 15} width="68" height="26" rx="5"
                  fill="#0b2b52" fillOpacity="0.92" />
                <text x={centres[hot][0]} y={centres[hot][1] + 3} textAnchor="middle"
                  fontSize="15" fontWeight="700" fill="#ffffff">
                  {apDistrictCode[hot] || hot.slice(0, 4).toUpperCase()}
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="flex flex-col gap-3">
          {/* Fixed height on purpose: the readout must not jump as you hover. */}
          <div data-flex-h className="flex gap-6 h-[52px]">
            <div className="min-w-0">
              <p className="text-label-sm text-on-surface-variant">{t('map.stats.districts')}</p>
              <p className="text-headline-sm font-bold text-on-surface tabular-nums">26</p>
            </div>
            <div className="min-w-0">
              <p className="text-label-sm text-on-surface-variant">{t('map.stats.projectsMapped')}</p>
              <p className="text-headline-sm font-bold text-on-surface tabular-nums">{fmtIN(mapped)}</p>
            </div>
          </div>

          <div data-flex-h className="border border-surface-variant rounded-xl p-4 bg-surface-container-lowest h-[236px] flex flex-col overflow-hidden">
            {shown || hot ? (
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
                <Link to={`/projects?district=${encodeURIComponent(hot)}`}
                  className="text-label-md text-primary font-bold mt-auto pt-2">
                  {t('map.readout.openProjects')}
                </Link>
              </>
            ) : (
              <>
                <p className="text-body-md text-on-surface">
                  {t('map.empty.hint')}
                </p>
                <p className="text-label-sm text-on-surface-variant mt-2">
                  {t('map.empty.coverage', { n: withData })}
                </p>
              </>
            )}
          </div>

          <p className="text-label-sm text-on-surface-variant leading-snug">
            {t('map.statewideNote', { n: fmtIN(statewideCount) })}
          </p>
        </div>
      </div>
    </section>
  )
}
