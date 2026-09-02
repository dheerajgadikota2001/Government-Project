import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useChartTip } from '../components/advanced/ChartPrimitives'
import { RankChart, CompareChart, IndexScorecards } from '../components/advanced/StateCharts'
import { useT } from '../i18n'

/**
 * All States — Central Records. Detailed charts of the Union government's
 * own statistical tables, covering EVERY state — not just AP: rank charts
 * per year, multi-state comparisons over time, and the Centre's own index
 * scorecards. Every figure is transcribed verbatim from the cited RBI/NITI
 * publication; the only transformation anywhere is ₹ lakh → ₹ crore on the
 * GSDP table. A dash or a missing bar means the Centre published nothing.
 *
 * State names, source titles, index names and the seed file's own notes come
 * from the API and are never keyed — only the chrome around them is.
 */

export default function AllStates() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const tip = useChartTip()

  useEffect(() => {
    apiGet('/governments/').then(d => { setData(d); setError(null) }).catch(setError)
  }, [])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10"><p className="text-body-md text-on-surface">{t('states.errorServer', { message: error.message })}</p></div>
  if (!data) return <div className="max-w-5xl mx-auto px-4 py-10 text-on-surface-variant text-body-md">{t('states.loading')}</div>

  const lb = data.state_leaderboards
  if (!lb?.metrics?.length) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-2">
        <p className="text-body-md text-on-surface">{t('states.staleBackend')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-4">
      <header className="flex flex-col gap-3 mb-2">
        <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">
          {t('states.title')}{' '}
          <span className="text-on-surface-variant font-normal text-headline-sm" lang="te">{t('states.titleSub')}</span>
        </h1>
        <p className="text-body-md text-on-surface leading-relaxed max-w-3xl">{lb.intro}</p>
        <p className="text-label-sm text-on-surface-variant bg-surface-container rounded-lg px-4 py-2.5 max-w-3xl">
          {t('states.sourceTables.label')}{' '}
          <a className="text-primary" href={lb.metrics[0].source.url} target="_blank" rel="noreferrer">{t('states.sourceTables.t19')}</a> ·{' '}
          <a className="text-primary" href={lb.metrics[1].source.url} target="_blank" rel="noreferrer">{t('states.sourceTables.t21')}</a> ·{' '}
          <a className="text-primary" href={lb.metrics[2].source.url} target="_blank" rel="noreferrer">{t('states.sourceTables.t20')}</a>.
          {' '}{t('states.sourceTables.apRecord')}{' '}
          <Link className="text-primary" to="/governments">{t('nav.governments')}</Link>.
        </p>
      </header>

      <RankChart lb={lb} tip={tip} />
      <CompareChart lb={lb} tip={tip} />
      <IndexScorecards rankings={data.rankings} data={data} tip={tip} />

      <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-5 flex flex-col gap-2">
        <h3 className="text-body-lg font-bold text-on-surface">{t('states.readHonestly')}</h3>
        <p className="text-label-sm text-on-surface-variant max-w-4xl">{lb.backseries_note}</p>
        <p className="text-label-sm text-on-surface-variant max-w-4xl">{lb.metrics[2].anomaly_note}</p>
        <p className="text-label-sm text-on-surface-variant max-w-4xl">
          {t('states.currentPricesNote')} {lb.metrics[1].conversion_note}
        </p>
      </section>

      {tip.node}
    </div>
  )
}
