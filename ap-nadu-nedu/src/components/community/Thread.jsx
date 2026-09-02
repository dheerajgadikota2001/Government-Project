/**
 * Community thread — the one discussion widget used everywhere:
 * the /community topic boards and the per-page threads under data pages.
 *
 * Ground rules baked into the UI:
 *  - No accounts. The reader picks a display name once; it lives only in
 *    their browser (localStorage), never in any profile of ours.
 *  - Posts appear instantly. Every post carries a "report" flag; three
 *    reports hide a post until the maintainer reviews it.
 *  - Authors can delete their own posts — the browser keeps the secret
 *    token the server issued at creation. Nothing is ever silently edited.
 *  - The house-rules line is always visible above the composer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiDelete } from '../../lib/api'
import { useT } from '../../i18n'

const NAME_KEY = 'apnn.community.name'
const TOKENS_KEY = 'apnn.community.tokens'

const readName = () => { try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' } }
const saveName = n => { try { localStorage.setItem(NAME_KEY, n) } catch { /* private mode */ } }
const readTokens = () => { try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}') } catch { return {} } }
const saveToken = (id, token) => {
  try {
    const t = readTokens(); t[id] = token
    localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
  } catch { /* private mode */ }
}

function timeAgo(iso, t) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return t('community.time.justNow')
  if (s < 3600) return t('community.time.minutes', { n: Math.round(s / 60) })
  if (s < 86400) return t('community.time.hours', { n: Math.round(s / 3600) })
  return t('community.time.days', { n: Math.round(s / 86400) })
}

const ERR_KEYS = {
  blocked_language: 'community.err.blocked',
  too_many_links: 'community.err.links',
  spam_pattern: 'community.err.spam',
  rate_limited: 'community.err.rate',
}

function Composer({ topic, pageKey, parentId, lang, onPosted, onCancel, autoFocus }) {
  const { t } = useT()
  const [name, setName] = useState(readName)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => { if (autoFocus && bodyRef.current) bodyRef.current.focus() }, [autoFocus])

  const submit = async e => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const payload = parentId
        ? { parent_id: parentId, display_name: name.trim(), body: body.trim(), lang }
        : { topic: topic || null, page_key: pageKey || null, display_name: name.trim(), body: body.trim(), lang }
      const post = await apiPost('/community/posts', payload)
      saveName(name.trim())
      if (post?.id && post?.delete_token) saveToken(post.id, post.delete_token)
      setBody('')
      onPosted?.(post)
    } catch (ex) {
      setErr(t(ERR_KEYS[ex.detail] || 'community.err.generic'))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={name} onChange={e => setName(e.target.value)}
          required minLength={2} maxLength={40}
          placeholder={t('community.composer.name')}
          aria-label={t('community.composer.name')}
          className="sm:w-56 shrink-0 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <textarea
          ref={bodyRef}
          value={body} onChange={e => setBody(e.target.value)}
          required minLength={2} maxLength={2000} rows={parentId ? 2 : 3}
          placeholder={t(parentId ? 'community.composer.reply' : 'community.composer.body')}
          aria-label={t(parentId ? 'community.composer.reply' : 'community.composer.body')}
          className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
      </div>
      {err && <p className="text-label-md text-error font-semibold" role="alert">{err}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy}
          className="rounded-full bg-primary text-on-primary px-5 py-2 text-label-lg font-bold hover:opacity-90 disabled:opacity-50">
          {t(parentId ? 'community.composer.sendReply' : 'community.composer.send')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-label-md text-on-surface-variant hover:underline">
            {t('community.composer.cancel')}
          </button>
        )}
        <span className="ms-auto text-label-sm text-on-surface-variant">{body.length}/2000</span>
      </div>
    </form>
  )
}

function PostCard({ post, lang, isReply, onChanged }) {
  const { t } = useT()
  const [replies, setReplies] = useState(null)      // null = not loaded
  const [showReplies, setShowReplies] = useState(false)
  const [composing, setComposing] = useState(false)
  const [reported, setReported] = useState(false)
  const [gone, setGone] = useState(false)
  const own = Boolean(readTokens()[post.id])

  const loadReplies = useCallback(async () => {
    const r = await apiGet(`/community/posts/${post.id}/replies`)
    setReplies(r)
  }, [post.id])

  const toggleReplies = async () => {
    if (!showReplies && replies === null) await loadReplies()
    setShowReplies(v => !v)
  }

  const report = async () => {
    try { await apiPost(`/community/posts/${post.id}/report`, {}) } catch { /* already gone */ }
    setReported(true)
  }

  const removeOwn = async () => {
    try {
      await apiDelete(`/community/posts/${post.id}`, { token: readTokens()[post.id] })
      setGone(true)
      onChanged?.()
    } catch { /* token mismatch */ }
  }

  if (gone) {
    return (
      <div className={`rounded-xl border border-dashed border-outline-variant px-4 py-3 text-label-md text-on-surface-variant ${isReply ? '' : 'bg-surface'}`}>
        {t('community.post.removedByAuthor')}
      </div>
    )
  }

  return (
    <article className={`rounded-xl border border-outline-variant ${isReply ? 'bg-surface-container-low' : 'bg-surface'} px-4 py-3 flex flex-col gap-2`}>
      <header className="flex items-baseline gap-2 flex-wrap">
        <span className="text-title-sm font-bold text-on-surface">{post.display_name}</span>
        <span className="text-label-sm text-on-surface-variant">{timeAgo(post.created_at, t)}</span>
      </header>
      <p className="text-body-md text-on-surface whitespace-pre-wrap break-words">{post.body}</p>
      <footer className="flex items-center gap-4 text-label-md">
        {!isReply && (
          <>
            <button type="button" onClick={toggleReplies} className="text-primary font-bold hover:underline">
              {post.reply_count > 0 || (replies && replies.length)
                ? t('community.post.replies', { n: (replies ? replies.length : post.reply_count) })
                : t('community.post.reply')}
            </button>
            {!composing && (
              <button type="button" onClick={() => { setComposing(true); setShowReplies(true); if (replies === null) loadReplies() }}
                className="text-primary font-bold hover:underline">
                {t('community.post.writeReply')}
              </button>
            )}
          </>
        )}
        {own ? (
          <button type="button" onClick={removeOwn} className="text-error hover:underline">
            {t('community.post.deleteOwn')}
          </button>
        ) : (
          reported
            ? <span className="text-on-surface-variant">{t('community.post.reported')}</span>
            : <button type="button" onClick={report} className="text-on-surface-variant hover:text-error hover:underline">
                {t('community.post.report')}
              </button>
        )}
      </footer>
      {showReplies && replies && replies.length > 0 && (
        <div className="flex flex-col gap-2 ps-4 border-s-2 border-outline-variant">
          {replies.map(r => <PostCard key={r.id} post={r} lang={lang} isReply onChanged={loadReplies} />)}
        </div>
      )}
      {composing && (
        <div className="ps-4 border-s-2 border-outline-variant">
          <Composer parentId={post.id} lang={lang}
            onPosted={async () => { setComposing(false); await loadReplies(); setShowReplies(true) }}
            onCancel={() => setComposing(false)} autoFocus />
        </div>
      )}
    </article>
  )
}

/**
 * The thread. Pass exactly one of `topic` (community board) or
 * `pageKey` (a data page's own discussion).
 */
export default function Thread({ topic, pageKey, compact = false }) {
  const { t, lang } = useT()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)

  const load = useCallback(async (p = 1) => {
    try {
      const d = await apiGet('/community/posts', {
        topic: topic || '', page_key: pageKey || '', page: p, page_size: compact ? 5 : 20,
      })
      setData(d); setPage(p); setError(false)
    } catch { setError(true) }
  }, [topic, pageKey, compact])

  useEffect(() => { load(1) }, [load])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-label-sm text-on-surface-variant leading-relaxed">
        {t('community.rules')}
      </p>
      <Composer topic={topic} pageKey={pageKey} lang={lang} onPosted={() => load(1)} />
      {error && <p className="text-label-md text-error">{t('community.err.load')}</p>}
      {data && data.items.length === 0 && (
        <p className="text-body-md text-on-surface-variant">{t('community.empty')}</p>
      )}
      {data && data.items.map(p => <PostCard key={p.id} post={p} lang={lang} onChanged={() => load(page)} />)}
      {data && data.total > data.items.length && (
        <div className="flex items-center gap-3 justify-center text-label-md">
          {data.has_prev && (
            <button type="button" onClick={() => load(page - 1)} className="text-primary font-bold hover:underline">
              ← {t('community.newer')}
            </button>
          )}
          {data.has_next && (
            <button type="button" onClick={() => load(page + 1)} className="text-primary font-bold hover:underline">
              {t('community.older')} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
