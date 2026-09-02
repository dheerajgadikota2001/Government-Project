/**
 * /community — the public message board, plus the private
 * "report a correction" form (reports go to the maintainer's queue,
 * never to the public board).
 *
 * ?correct=1 opens the correction form directly (the footer's
 * "Report a Correction" links here).
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { useT } from '../i18n'
import Thread from '../components/community/Thread'

const TOPICS = ['general', 'projects', 'investments', 'finances', 'governments', 'suggestions']
const TOPIC_ICONS = {
  general: 'forum', projects: 'construction', investments: 'currency_rupee',
  finances: 'account_balance', governments: 'gavel', suggestions: 'lightbulb',
}

function CorrectionCard({ open, onToggle }) {
  const { t, lang } = useT()
  const [body, setBody] = useState('')
  const [pageKey, setPageKey] = useState('')
  const [contact, setContact] = useState('')
  const [state, setState] = useState('idle') // idle | busy | sent | error
  const ref = useRef(null)

  useEffect(() => { if (open && ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [open])

  const submit = async e => {
    e.preventDefault()
    setState('busy')
    try {
      await apiPost('/community/corrections', {
        page_key: pageKey.trim() || null, body: body.trim(),
        contact: contact.trim() || null, lang,
      })
      setState('sent'); setBody(''); setPageKey(''); setContact('')
    } catch { setState('error') }
  }

  return (
    <section ref={ref} id="report" className="w-full bg-secondary-container/40 border border-outline-variant rounded-2xl p-5 md:p-7 flex flex-col gap-3">
      <button type="button" onClick={onToggle} className="flex items-center justify-between gap-3 text-start w-full">
        <h2 className="text-headline-sm font-headline-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">published_with_changes</span>
          {t('community.correction.title')}
        </h2>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      <p className="text-body-md text-on-surface-variant max-w-2xl">{t('community.correction.sub')}</p>
      {open && (
        state === 'sent' ? (
          <p className="text-body-md text-on-surface font-semibold flex items-center gap-2" role="status">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">check_circle</span>
            {t('community.correction.thanks')}
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2 max-w-2xl">
            <input value={pageKey} onChange={e => setPageKey(e.target.value)} maxLength={200}
              placeholder={t('community.correction.where')} aria-label={t('community.correction.where')}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary" />
            <textarea value={body} onChange={e => setBody(e.target.value)} required minLength={10} maxLength={4000} rows={4}
              placeholder={t('community.correction.what')} aria-label={t('community.correction.what')}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={200}
              placeholder={t('community.correction.contact')} aria-label={t('community.correction.contact')}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary" />
            {state === 'error' && <p className="text-label-md text-error font-semibold" role="alert">{t('community.err.generic')}</p>}
            <div>
              <button type="submit" disabled={state === 'busy'}
                className="rounded-full bg-primary text-on-primary px-5 py-2 text-label-lg font-bold hover:opacity-90 disabled:opacity-50">
                {t('community.correction.send')}
              </button>
            </div>
            <p className="text-label-sm text-on-surface-variant">{t('community.correction.privacy')}</p>
          </form>
        )
      )}
    </section>
  )
}

export default function Community() {
  const { t } = useT()
  const [params] = useSearchParams()
  const [topics, setTopics] = useState(null)
  const [active, setActive] = useState('general')
  const [correctOpen, setCorrectOpen] = useState(params.get('correct') === '1')

  useEffect(() => {
    let cancelled = false
    apiGet('/community/topics').then(d => !cancelled && setTopics(d)).catch(() => {})
    return () => { cancelled = true }
  }, [active])

  return (
    <div className="w-full px-4 md:px-8 max-w-[1000px] mx-auto py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="text-label-md font-label-md text-secondary-container uppercase tracking-widest font-bold">{t('community.eyebrow')}</span>
        <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg text-primary text-balance">{t('community.title')}</h1>
        <p className="text-body-lg text-on-surface-variant max-w-3xl">{t('community.sub')}</p>
      </header>

      <CorrectionCard open={correctOpen} onToggle={() => setCorrectOpen(v => !v)} />

      <nav className="flex flex-wrap gap-2" aria-label={t('community.topicsLabel')}>
        {TOPICS.map(k => {
          const meta = topics?.find(x => x.key === k)
          const on = active === k
          return (
            <button key={k} type="button" onClick={() => setActive(k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-label-lg font-bold border transition-colors ${on
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-on-surface border-outline-variant hover:border-primary'}`}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{TOPIC_ICONS[k]}</span>
              {t(`community.topics.${k}`)}
              {meta && meta.post_count > 0 && (
                <span className={`text-label-sm ${on ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>({meta.post_count})</span>
              )}
            </button>
          )
        })}
      </nav>

      <Thread key={active} topic={active} />
    </div>
  )
}
