import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import WhoRunsTheSchools from '../components/WhoRunsTheSchools'
import Deferred from '../components/Deferred'
import { useChartTip, fmtIN, LineOverlay, VizSection } from '../components/advanced/ChartPrimitives'
import { useT } from '../i18n'
import PageThread from '../components/community/PageThread'
import { TENURE_COLOR } from '../lib/tenure'

/**
 * School education, 2014 onward: what the state spent, what it built, and what
 * reached the schools.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT DO
 * It does not add up rupee figures from Government Orders. An earlier version
 * did, and was wrong: the extraction read "Rs.9,37,63,92,000/-" but skipped
 * "Rs.944.53 crores", dropping Rs 28,019 crore of YSRCP orders against Rs 955
 * crore of TDP 2014-19 orders, and drew a chart favouring the wrong government.
 *
 * Spending here is the Demands for Grants series, which the legislature votes
 * and the CAG audits. Government Orders are used for what they are good for -
 * naming what was sanctioned and when. The reconciliation section is published
 * on the page rather than kept in a comment, because a platform that asks
 * readers to trust figures over speeches has to let them inspect the checking.
 */

const PARTY_DOT = { TDP: TENURE_COLOR.tdp1, YSRCP: TENURE_COLOR.ysrcp }
const STAGE_COLORS = { BE: '#86b6ef', RE: '#2a78d6', Actual: '#104281' }
const SEVERITY = { high: '#a6421f', medium: '#7a5c12', low: '#5a5850' }

const toCr = r => (r == null ? null : r / 1e7)
const crLabel = (cr, t) => (cr == null ? t('common.notPublished') : `₹${fmtIN(Math.round(cr))} ${t('unit.crore')}`)

function rich(str) {
  return String(str).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p)
}

/**
 * A strip under a year-axis chart showing which government held office.
 * Drawn separately from the lines because party is a different kind of fact
 * from a budget figure, and merging the two colour scales would invite the
 * reader to see a party's colour as a value.
 */
function TenureStrip({ years, tenureOf, tenures, t }) {
  const runs = []
  years.forEach((y, i) => {
    const k = tenureOf[y]
    const last = runs[runs.length - 1]
    if (last && last.key === k) last.end = i
    else runs.push({ key: k, start: i, end: i })
  })
  return (
    <div className="flex mt-1 rounded overflow-hidden border border-outline-variant" role="img"
      aria-label={t('schoolEd.tenureStripAria')}>
      {runs.map(r => {
        const b = tenures.find(x => x.key === r.key)
        return (
          <div key={r.key + r.start}
            className="text-label-sm px-2 py-1 truncate text-center"
            style={{
              flexGrow: r.end - r.start + 1,
              flexBasis: 0,
              background: (PARTY_DOT[b?.party] || '#8a8880') + '22',
              borderInlineEnd: '1px solid var(--color-outline-variant, #dfdbd2)',
            }}>
            {b?.label || r.key}
          </div>
        )
      })}
    </div>
  )
}

export default function SchoolEducation() {
  const { t } = useT()
  const tip = useChartTip()
  const [d, setD] = useState(null)
  const [comp, setComp] = useState(null)
  const [prog, setProg] = useState(null)
  const [recon, setRecon] = useState(null)
  const [orders, setOrders] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      apiGet('/school-education/'),
      apiGet('/school-education/components'),
      apiGet('/school-education/programmes'),
      apiGet('/school-education/reconciliation'),
      apiGet('/school-education/orders'),
    ])
      .then(([a, b, c, e, f]) => {
        if (!alive) return
        setD(a); setComp(b); setProg(c); setRecon(e); setOrders(f)
      })
      .catch(e => alive && setErr(e))
    return () => { alive = false }
  }, [])

  if (err) return <div className="p-6 text-error">{t('common.error')}</div>
  if (!d) return <div className="p-6 text-on-surface-variant">{t('common.loading')}</div>

  const { tenures, spending, schools } = d
  const tenureOf = Object.fromEntries(spending.rows.map(r => [r.year, r.tenure]))
  const years = spending.rows.map(r => r.year)

  const spendSeries = ['BE', 'RE', 'Actual'].map(stage => ({
    label: t(`schoolEd.stage.${stage}`),
    color: STAGE_COLORS[stage],
    points: spending.rows
      .map((r, i) => ({ x: i, value: toCr((r[stage]?.total_crore ?? null) * 1e7) }))
      .filter(p => p.value != null && !Number.isNaN(p.value)),
  }))

  const schoolYears = schools.rows.map(r => r.year)
  const schoolSeries = [{
    label: t('schoolEd.schools.seriesSchools'),
    color: '#104281',
    points: schools.rows.map((r, i) => ({ x: i, value: r.schools })),
  }]
  const enrolRows = schools.rows.filter(r => r.enrolment)
  const perStudent = schools.rows.filter(r => r.per_student_rupees_our_calculation)
  const netChange = schools.rows[schools.rows.length - 1].schools - schools.rows[0].schools

  // Audited capital outlay per government. Averaged per year, never totalled across a
  // tenure: the three governments have served five, five and three years so far, and a
  // total would reward length of service rather than effort.
  const capitalByTenure = tenures
    .filter(b => b.key !== 'pre_tenure')
    .map(b => {
      const inTenure = spending.rows.filter(r => r.tenure === b.key)
      const withActual = inTenure.filter(r => r.Actual?.capital_crore != null)
      return {
        key: b.key,
        label: b.label,
        mean: withActual.length
          ? withActual.reduce((a, r) => a + r.Actual.capital_crore, 0) / withActual.length
          : 0,
        have: withActual.length,
        total: inTenure.length,
        missing: inTenure
          .filter(r => r.Actual?.capital_crore == null)
          .map(r => r.year),
      }
    })
    .filter(c => c.have > 0)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
      <header className="space-y-3">
        <h1 className="text-headline-lg font-bold text-on-surface">{t('schoolEd.title')}</h1>
        <p className="text-body-lg text-on-surface-variant max-w-3xl">{rich(t('schoolEd.intro'))}</p>
      </header>

      {/* Stated before any chart, not after. This page was withdrawn once because a
          comparison was published that the sources could not support; the honest fix
          is to say at the top which questions the sources answer and which they do
          not, so a reader never has to work it out from a footnote. */}
      <section className="rounded-xl border border-outline-variant p-5 space-y-4">
        <h2 className="text-title-md font-semibold text-on-surface">{t('schoolEd.limits.title')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-label-md font-semibold text-on-surface">{t('schoolEd.limits.canTitle')}</div>
            <p className="text-body-sm text-on-surface-variant">{t('schoolEd.limits.canBody')}</p>
          </div>
          <div className="space-y-1">
            <div className="text-label-md font-semibold text-on-surface">{t('schoolEd.limits.cannotTitle')}</div>
            <p className="text-body-sm text-on-surface-variant">{t('schoolEd.limits.cannotBody')}</p>
          </div>
        </div>
      </section>

      {/* ---------------- spending ---------------- */}
      <VizSection id="spending" title={t('schoolEd.spending.title')} sub={t('schoolEd.spending.sub')}
        provenance={spending.source.publisher + ' · ' + spending.source.name}>
        <LineOverlay seriesList={spendSeries} xLabels={years} tip={tip} unit={t('unit.crore')} height={210} />
        <TenureStrip years={years} tenureOf={tenureOf} tenures={tenures} t={t} />
        <p className="mt-3 text-body-sm text-on-surface-variant">{spending.coverage_warning}</p>

        {/* Capital outlay, audited, per government.
            This is the figure that answers "who built things", and it is the one the
            first version of this page got wrong. It comes from the Actual column of
            the Demands for Grants, not from any Government Order text. Years without
            a published actual are named rather than quietly averaged away: 2014-15
            and 2015-16 have none, so the 2014 government's average rests on three
            years, not five. */}
        <div className="mt-5">
          <h3 className="text-title-sm font-semibold text-on-surface">{t('schoolEd.capital.title')}</h3>
          <p className="text-body-sm text-on-surface-variant mt-1">{t('schoolEd.capital.sub')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {capitalByTenure.map(c => (
              <div key={c.key} className="rounded-lg border border-outline-variant p-3">
                <div className="text-label-sm text-outline">{c.label}</div>
                <div className="text-headline-sm font-bold text-on-surface mt-1"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ₹{fmtIN(Math.round(c.mean))} {t('unit.crore')}
                </div>
                <div className="text-label-sm text-on-surface-variant mt-1">
                  {t('schoolEd.capital.years', { have: c.have, total: c.total })}
                </div>
                {c.missing.length > 0 && (
                  <div className="text-label-sm text-on-surface-variant mt-0.5">
                    {t('schoolEd.capital.missing', { years: c.missing.join(', ') })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-body-sm text-on-surface-variant">{t('schoolEd.capital.note')}</p>
        </div>

        <div className="mt-4 space-y-2">
          {spending.caveats.map(c => (
            <div key={c.key} className="rounded-lg border-s-4 p-3 bg-surface-container"
              style={{ borderInlineStartColor: SEVERITY[c.severity] || SEVERITY.low }}>
              <div className="font-semibold text-on-surface text-body-md">{c.title}</div>
              <p className="text-body-sm text-on-surface-variant mt-1">{c.body}</p>
              {c.quote && (
                <blockquote className="text-body-sm italic text-on-surface-variant mt-2 ps-3 border-s border-outline-variant">
                  {c.quote}
                </blockquote>
              )}
              {c.source_url && (
                <a href={c.source_url} target="_blank" rel="noopener noreferrer"
                  className="text-label-sm text-primary underline underline-offset-2">
                  {t('common.source')}
                </a>
              )}
            </div>
          ))}
        </div>
      </VizSection>

      {/* Who runs the schools — the section that lets the page answer "built or
          closed", which the UDISE block below cannot on its own. */}
      {d.management_series && <WhoRunsTheSchools data={d.management_series} />}

      {/* ---------------- schools ---------------- */}
      <VizSection id="schools" title={t('schoolEd.schools.title')} sub={t('schoolEd.schools.sub')}
        provenance={schools.source.publisher + ' · ' + schools.source.name}>
        <LineOverlay seriesList={schoolSeries} xLabels={schoolYears} tip={tip} height={180} />
        {/* Deliberately not a headline. This is a NET count that begins in 2018-19 and
            includes private schools, so it cannot be read as "this government built
            and that one closed". It is stated as a change in a series, with its own
            limits attached, and nothing on this page derives a comparison from it. */}
        <p className="mt-2 text-body-sm text-on-surface-variant">
          {t('schoolEd.schools.netChangeNeutral', {
            from: schoolYears[0], to: schoolYears[schoolYears.length - 1],
            n: fmtIN(Math.abs(netChange)),
            dir: t(netChange >= 0 ? 'schoolEd.schools.rose' : 'schoolEd.schools.fell'),
          })}
        </p>
        <p className="mt-2 text-body-sm text-on-surface-variant">{schools.counting_note}</p>
        <p className="mt-2 text-body-sm text-on-surface-variant">{schools.coverage_warning}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-label-sm text-outline border-b border-outline-variant">
                <th className="text-start py-2 pe-3">{t('common.year')}</th>
                <th className="text-end py-2 pe-3">{t('schoolEd.schools.colSchools')}</th>
                <th className="text-end py-2 pe-3">{t('schoolEd.schools.colEnrolment')}</th>
                <th className="text-end py-2 pe-3">{t('schoolEd.schools.colTeachers')}</th>
                <th className="text-start py-2">{t('common.source')}</th>
              </tr>
            </thead>
            <tbody>
              {schools.rows.map(r => (
                <tr key={r.year} className="border-b border-outline-variant/60">
                  <td className="py-2 pe-3">{r.year}</td>
                  <td className="py-2 pe-3 text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtIN(r.schools)}</td>
                  <td className="py-2 pe-3 text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.enrolment ? fmtIN(r.enrolment) : t('common.notPublished')}</td>
                  <td className="py-2 pe-3 text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtIN(r.teachers)}</td>
                  <td className="py-2">
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 text-label-sm">{r.table}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VizSection>

      {/* ---------------- per student ---------------- */}
      <VizSection id="per-student" title={t('schoolEd.perStudent.title')} sub={t('schoolEd.perStudent.sub')}>
        <div className="rounded-lg bg-surface-container p-3 mb-3 text-body-sm text-on-surface-variant">
          {rich(t('schoolEd.perStudent.ourCalculation'))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {perStudent.map(r => {
            const b = tenures.find(x => x.key === r.tenure)
            return (
              <div key={r.year} className="rounded-lg border border-outline-variant p-3">
                <div className="flex items-center gap-2 text-label-sm text-outline">
                  {b?.party && <span className="w-2 h-2 rounded-full inline-block"
                    style={{ background: PARTY_DOT[b.party] }} />}
                  {r.year}
                </div>
                <div className="text-headline-sm font-bold text-on-surface mt-1"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ₹{fmtIN(r.per_student_rupees_our_calculation)}
                </div>
              </div>
            )
          })}
        </div>
        {enrolRows.length < schools.rows.length && (
          <p className="mt-3 text-body-sm text-on-surface-variant">
            {t('schoolEd.perStudent.gap', { n: schools.rows.length - enrolRows.length })}
          </p>
        )}
      </VizSection>

      {/* ---------------- what reached the schools ---------------- */}
      {comp && (
        <VizSection id="components" title={t('schoolEd.components.title')} sub={t('schoolEd.components.sub')}>
          <div className="rounded-lg bg-surface-container p-3 mb-3 text-body-sm text-on-surface-variant">
            {comp.what_it_is}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-label-sm text-outline border-b border-outline-variant">
                  <th className="text-start py-2 pe-3">{t('schoolEd.components.colItem')}</th>
                  {tenures.filter(x => x.key !== 'pre').map(b => (
                    <th key={b.key} className="text-end py-2 pe-3 whitespace-nowrap">
                      {b.party && <span className="w-2 h-2 rounded-full inline-block me-1"
                        style={{ background: PARTY_DOT[b.party] }} />}
                      {b.label}
                    </th>
                  ))}
                  <th className="text-start py-2">{t('schoolEd.components.colFirst')}</th>
                </tr>
              </thead>
              <tbody>
                {comp.items.map(i => (
                  <tr key={i.component} className="border-b border-outline-variant/60">
                    <td className="py-2 pe-3 font-medium text-on-surface">{i.component}</td>
                    {['tdp1', 'ysrcp', 'tdp2'].map(k => (
                      <td key={k} className="py-2 pe-3 text-end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {i.by_tenure[k] || '—'}
                      </td>
                    ))}
                    <td className="py-2">
                      <a href={i.first_order.document} target="_blank" rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 text-label-sm">
                        {i.first_order.date}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </VizSection>
      )}

      {/* ---------------- first appearance ---------------- */}
      {prog && (
        <VizSection id="programmes" title={t('schoolEd.programmes.title')} sub={t('schoolEd.programmes.sub')}>
          <div className="rounded-lg bg-surface-container p-3 mb-3 text-body-sm text-on-surface-variant">
            {prog.what_it_is}
          </div>
          <ul className="space-y-2">
            {prog.items.map(p => {
              const first = tenures.find(x => x.key === p.first_appearance.tenure)
              return (
                <li key={p.programme} className="rounded-lg border border-outline-variant p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-on-surface">{p.programme}</span>
                    <span className="text-label-sm text-outline">
                      {t('schoolEd.programmes.firstSeen', { date: p.first_appearance.date })}
                    </span>
                    <span className="text-label-sm inline-flex items-center gap-1.5">
                      {first?.party && <span className="w-2 h-2 rounded-full inline-block"
                        style={{ background: PARTY_DOT[first.party] }} />}
                      {first?.label}
                    </span>
                    <span className="ms-auto text-label-sm text-on-surface-variant">
                      {t('schoolEd.programmes.orders', { n: fmtIN(p.orders) })}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-1">{p.first_appearance.quote}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {p.spans_tenures.map(k => {
                      const b = tenures.find(x => x.key === k)
                      return (
                        <span key={k} className="text-label-sm px-2 py-0.5 rounded-full border border-outline-variant">
                          {b?.label || k}
                        </span>
                      )
                    })}
                    <a href={p.first_appearance.document} target="_blank" rel="noopener noreferrer"
                      className="ms-auto text-label-sm text-primary underline underline-offset-2">
                      {t('schoolEd.openOrder')}
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        </VizSection>
      )}

      {/* ---------------- the order record ---------------- */}
      {orders && (
        <VizSection id="orders" title={t('schoolEd.orders.title')} sub={t('schoolEd.orders.sub')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {orders.tenures.map(b => (
              <div key={b.key} className="rounded-lg border border-outline-variant p-3">
                <div className="flex items-center gap-2">
                  {b.party && <span className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: PARTY_DOT[b.party] }} />}
                  <span className="text-label-md font-semibold text-on-surface">
                    {b.label || (b.party ? `${b.party} ${String(b.from).slice(0, 4)}` : b.key)}
                  </span>
                </div>
                <div className="text-headline-sm font-bold text-on-surface mt-1"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtIN(b.orders)}</div>
                <div className="text-label-sm text-outline">
                  {t('schoolEd.orders.linked', { n: fmtIN(b.orders_linked) })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">{orders.coverage.telugu_note}</p>

          <h4 className="mt-5 font-semibold text-on-surface">{t('schoolEd.conflicts.title')}</h4>
          <p className="text-body-sm text-on-surface-variant mb-2">{t('schoolEd.conflicts.sub')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-label-sm text-outline border-b border-outline-variant">
                  <th className="text-start py-2 pe-3">{t('schoolEd.conflicts.colOrder')}</th>
                  <th className="text-end py-2 pe-3">{t('schoolEd.conflicts.colRegister')}</th>
                  <th className="text-end py-2 pe-3">{t('schoolEd.conflicts.colText')}</th>
                  <th className="text-start py-2">{t('common.source')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.conflicts.map(c => (
                  <tr key={c.go + c.date} className="border-b border-outline-variant/60 align-top">
                    <td className="py-3 pe-3">
                      <div className="font-semibold text-on-surface">{c.go}</div>
                      <div className="text-label-sm text-outline">{c.date}</div>
                      <p className="text-body-sm text-on-surface-variant mt-1 max-w-xl">{c.quote}</p>
                    </td>
                    <td className="py-3 pe-3 text-end whitespace-nowrap"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>{crLabel(toCr(c.register_column_rupees), t)}</td>
                    <td className="py-3 pe-3 text-end whitespace-nowrap font-semibold"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>{crLabel(toCr(c.order_text_rupees), t)}</td>
                    <td className="py-3">
                      <a href={c.document} target="_blank" rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2">{t('schoolEd.openOrder')}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </VizSection>
      )}

      {/* ---------------- how this was checked ---------------- */}
      {recon && (
        <VizSection id="reconciliation" title={t('schoolEd.recon.title')} sub={t('schoolEd.recon.sub')}>
          <p className="text-body-sm text-on-surface-variant mb-3">{recon.why}</p>
          <ul className="space-y-2">
            {recon.checks.map(c => (
              <li key={c.check} className="rounded-lg border border-outline-variant p-3">
                <div className="font-medium text-on-surface">{c.check}</div>
                <p className="text-body-sm text-on-surface-variant mt-1">{c.result}</p>
                {c.second_source?.startsWith('http') ? (
                  <a href={c.second_source} target="_blank" rel="noopener noreferrer"
                    className="text-label-sm text-primary underline underline-offset-2">{t('common.source')}</a>
                ) : (
                  <span className="text-label-sm text-outline">{c.second_source}</span>
                )}
              </li>
            ))}
          </ul>
          <h4 className="mt-4 font-semibold text-on-surface">{t('schoolEd.recon.defectsTitle')}</h4>
          <ul className="mt-2 space-y-2">
            {recon.extraction_defects_found_and_fixed.map((x, i) => (
              <li key={i} className="text-body-sm text-on-surface-variant rounded-lg bg-surface-container p-3">{x}</li>
            ))}
          </ul>
        </VizSection>
      )}

      {tip.node}
      <Deferred minHeight={320}><PageThread pageKey="school-education" /></Deferred>
    </div>
  )
}
