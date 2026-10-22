import * as React from 'react'
import { ApiError, apiDelete, apiGet, apiPost } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import { legal } from '@/lib/data-site'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// The discussion board. No accounts: a reader picks a name once, and it lives only in their own browser.
// Posts appear at once. Every post has a report button, and three reports hide it until a person reviews it.
// An author can remove their own post, because the browser keeps the secret the server gave at posting.
// Nothing here is cached: someone who has just posted must see their post.

export type Post = {
  id: number
  topic: string | null
  page_key: string | null
  parent_id: number | null
  display_name: string
  body: string
  lang: string
  status: string
  reply_count: number
  created_at: string
}
type PostPage = { items: Post[]; total: number; page: number; page_size: number; has_next: boolean; has_prev: boolean }
type Created = Post & { delete_token: string }

const NAME_KEY = 'apnn.community.name'
const TOKENS_KEY = 'apnn.community.tokens'

export const readName = () => { try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' } }
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n) } catch { /* private window: the name is simply not kept */ } }
export const readTokens = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}') } catch { return {} } }
const saveToken = (id: number, token: string) => {
  try { const t = readTokens(); t[id] = token; localStorage.setItem(TOKENS_KEY, JSON.stringify(t)) } catch { /* as above */ }
}
const dropToken = (id: number) => {
  try { const t = readTokens(); delete t[id]; localStorage.setItem(TOKENS_KEY, JSON.stringify(t)) } catch { /* as above */ }
}

/** The server's short error code, turned into the sentence the reader sees. */
export const ERR_KEY: Record<string, 'blocked' | 'links' | 'spam' | 'rate'> = {
  blocked_language: 'blocked', too_many_links: 'links', spam_pattern: 'spam', rate_limited: 'rate',
}
export function errKey(e: unknown): 'blocked' | 'links' | 'spam' | 'rate' | 'generic' {
  return (e instanceof ApiError && e.detail && ERR_KEY[e.detail]) || 'generic'
}

export function timeAgo(iso: string, C: { time: Record<string, string> }, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  const f = (k: string, n: number) => C.time[k].replace('{n}', String(n))
  if (s < 90) return C.time.justNow
  if (s < 3600) return f('minutes', Math.round(s / 60))
  if (s < 86400) return f('hours', Math.round(s / 3600))
  return f('days', Math.round(s / 86400))
}

function useStrings() {
  const { lang } = useLang()
  return { lang, C: (legal.community[lang] ?? legal.community.en) as any }
}

/* ------------------------------------------------------------------ composer */
function Composer({ topic, pageKey, parentId, onPosted, onCancel, autoFocus }: {
  topic?: string; pageKey?: string; parentId?: number; onPosted: () => void; onCancel?: () => void; autoFocus?: boolean
}) {
  const { lang, C } = useStrings()
  const [name, setName] = React.useState(readName)
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const id = React.useId()
  React.useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const payload = parentId
        ? { parent_id: parentId, display_name: name.trim(), body: body.trim(), lang }
        : { topic: topic ?? null, page_key: pageKey ?? null, display_name: name.trim(), body: body.trim(), lang }
      const post = await apiPost<Created>('/community/posts', payload)
      saveName(name.trim())
      if (post?.id && post.delete_token) saveToken(post.id, post.delete_token)
      setBody('')
      onPosted()
    } catch (ex) {
      setErr(C.err[errKey(ex)])
    } finally { setBusy(false) }
  }

  const bodyLabel = parentId ? C.composer.reply : C.composer.body
  return (
    <form onSubmit={submit} className="grid gap-2.5">
      <div className="grid gap-2.5 sm:grid-cols-[14rem_1fr]">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-n`} className="text-[12.5px] font-medium text-muted-foreground">{C.composer.name}</label>
          <Input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} autoComplete="nickname" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-b`} className="text-[12.5px] font-medium text-muted-foreground">{bodyLabel}</label>
          <Textarea id={`${id}-b`} ref={ref} value={body} onChange={(e) => setBody(e.target.value)} required minLength={2} maxLength={2000} rows={parentId ? 2 : 4} />
        </div>
      </div>
      {err ? <p role="alert" className="text-[14px] font-semibold">{err}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>{parentId ? C.composer.sendReply : C.composer.send}</Button>
        {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>{C.composer.cancel}</Button> : null}
        <span className="ms-auto text-[12.5px] tabular-nums text-muted-foreground">{body.length}/2000</span>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ one post */
function PostCard({ post, isReply, onChanged }: { post: Post; isReply?: boolean; onChanged: () => void }) {
  const { C } = useStrings()
  const [replies, setReplies] = React.useState<Post[] | null>(null)
  const [open, setOpen] = React.useState(false)
  const [writing, setWriting] = React.useState(false)
  const [reported, setReported] = React.useState(false)
  const [gone, setGone] = React.useState(false)
  const [loadErr, setLoadErr] = React.useState(false)
  const own = Boolean(readTokens()[post.id])

  const loadReplies = React.useCallback(async () => {
    try { setReplies(await apiGet<Post[]>(`/community/posts/${post.id}/replies`)); setLoadErr(false) } catch { setLoadErr(true) }
  }, [post.id])

  const toggle = async () => {
    if (!open && replies === null) await loadReplies()
    setOpen((v) => !v)
  }
  const report = async () => {
    try { await apiPost(`/community/posts/${post.id}/report`) } catch { /* already hidden or gone: the reader's intent is met either way */ }
    setReported(true)
  }
  const removeOwn = async () => {
    // The "removed" note stays where the post was, so the author sees it went. The next load leaves it out.
    try { await apiDelete(`/community/posts/${post.id}`, { token: readTokens()[post.id] }); dropToken(post.id); setGone(true) } catch { /* wrong or expired secret: nothing to do */ }
  }

  if (gone) return <div className="rounded-xl border border-dashed border-foreground/25 px-4 py-3 text-[14px] text-muted-foreground">{C.post.removedByAuthor}</div>

  const count = replies ? replies.length : post.reply_count
  return (
    <article className={cn('grid gap-2 rounded-xl border border-border px-4 py-3', isReply ? 'bg-muted/40' : 'bg-card')}>
      <header className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[15px] font-semibold">{post.display_name}</span>
        <time dateTime={post.created_at} className="text-[12.5px] text-muted-foreground">{timeAgo(post.created_at, C)}</time>
      </header>
      <p className="whitespace-pre-wrap break-words text-[15.5px] leading-relaxed">{post.body}</p>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
        {!isReply ? (
          <>
            <button type="button" onClick={toggle} aria-expanded={open} className="font-semibold underline-offset-4 hover:underline">
              {count > 0 ? C.post.replies.replace('{n}', String(count)) : C.post.reply}
            </button>
            {!writing ? <button type="button" onClick={() => { setWriting(true); setOpen(true); if (replies === null) void loadReplies() }} className="font-semibold underline-offset-4 hover:underline">{C.post.writeReply}</button> : null}
          </>
        ) : null}
        {own
          ? <button type="button" onClick={removeOwn} className="text-muted-foreground underline-offset-4 hover:underline">{C.post.deleteOwn}</button>
          : reported
            ? <span className="text-muted-foreground">{C.post.reported}</span>
            : <button type="button" onClick={report} className="text-muted-foreground underline-offset-4 hover:underline">{C.post.report}</button>}
      </footer>
      {loadErr ? <p role="alert" className="text-[13.5px] text-muted-foreground">{C.err.load}</p> : null}
      {open && replies && replies.length > 0 ? (
        <div className="grid gap-2 border-s-2 border-border ps-4">
          {replies.map((r) => <PostCard key={r.id} post={r} isReply onChanged={() => void loadReplies()} />)}
        </div>
      ) : null}
      {writing ? (
        <div className="border-s-2 border-border ps-4">
          <Composer parentId={post.id} autoFocus onCancel={() => setWriting(false)} onPosted={() => { setWriting(false); setOpen(true); void loadReplies(); onChanged() }} />
        </div>
      ) : null}
    </article>
  )
}

/* ------------------------------------------------------------------ the thread */
/** Pass exactly one of `topic` (a board) or `pageKey` (one page's own discussion). */
export function Thread({ topic, pageKey, pageSize = 20, onPosted }: { topic?: string; pageKey?: string; pageSize?: number; onPosted?: () => void }) {
  const { lang, C } = useStrings()
  const [data, setData] = React.useState<PostPage | null>(null)
  const [page, setPage] = React.useState(1)
  const [err, setErr] = React.useState(false)
  const alive = React.useRef(0)

  const load = React.useCallback(async (p: number) => {
    const ticket = ++alive.current
    try {
      const d = await apiGet<PostPage>('/community/posts', { topic, page_key: pageKey, page: p, page_size: pageSize })
      if (ticket !== alive.current) return           // a newer request has been made; drop this answer
      setData(d); setPage(p); setErr(false)
    } catch { if (ticket === alive.current) setErr(true) }
  }, [topic, pageKey, pageSize])

  React.useEffect(() => { setData(null); void load(1) }, [load])

  return (
    <div className="grid gap-4">
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">{C.rules}</p>
      <Composer topic={topic} pageKey={pageKey} onPosted={() => { void load(1); onPosted?.() }} />
      {err ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-[14px]">
          <span>{C.err.load}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load(page)}>{lang === 'te' ? 'మళ్లీ ప్రయత్నించండి' : 'Try again'}</Button>
        </div>
      ) : null}
      {data && data.items.length === 0 ? <p className="text-[15px] text-muted-foreground">{C.empty}</p> : null}
      {data?.items.map((p) => <PostCard key={p.id} post={p} onChanged={() => void load(page)} />)}
      {data && (data.has_prev || data.has_next) ? (
        <nav className="flex items-center justify-center gap-5 text-[14px]" aria-label="Pages">
          {data.has_prev ? <button type="button" onClick={() => void load(page - 1)} className="font-semibold underline-offset-4 hover:underline">← {C.newer}</button> : null}
          {data.has_next ? <button type="button" onClick={() => void load(page + 1)} className="font-semibold underline-offset-4 hover:underline">{C.older} →</button> : null}
        </nav>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ correction form */
export function CorrectionForm() {
  const { lang, C } = useStrings()
  const K = C.correction
  const [where, setWhere] = React.useState('')
  const [what, setWhat] = React.useState('')
  const [contact, setContact] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const id = React.useId()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await apiPost('/community/corrections', { page_key: where.trim() || null, body: what.trim(), contact: contact.trim() || null, lang })
      setDone(true); setWhere(''); setWhat(''); setContact('')
    } catch (ex) { setErr(C.err[errKey(ex)]) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div role="status" className="grid gap-3">
        <p className="text-[15.5px] leading-relaxed">{K.thanks}</p>
        <div><Button type="button" variant="outline" onClick={() => setDone(false)}>{K.title}</Button></div>
      </div>
    )
  }
  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-1.5"><label htmlFor={`${id}-w`} className="text-[14px] font-medium">{K.where}</label><Input id={`${id}-w`} value={where} onChange={(e) => setWhere(e.target.value)} maxLength={200} /></div>
      <div className="grid gap-1.5"><label htmlFor={`${id}-a`} className="text-[14px] font-medium">{K.what}</label><Textarea id={`${id}-a`} value={what} onChange={(e) => setWhat(e.target.value)} required minLength={10} maxLength={4000} rows={5} /></div>
      <div className="grid gap-1.5"><label htmlFor={`${id}-c`} className="text-[14px] font-medium">{K.contact}</label><Input id={`${id}-c`} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} /></div>
      {err ? <p role="alert" className="text-[14px] font-semibold">{err}</p> : null}
      <div><Button type="submit" disabled={busy}>{K.send}</Button></div>
      <p className="text-[12.5px] text-muted-foreground">{K.privacy}</p>
    </form>
  )
}
