import { useEffect, useState } from 'react'
import { useT, LTR } from '../i18n'

/**
 * The parts of a project's story on its page: the story in steps (or the key
 * dates, when there is no road) and the progress chart at the top, the
 * chapters in the middle, and the questions people search at the bottom.
 *
 * Everything here only draws. What each part says is decided in
 * src/lib/projectStory.js (for every project) or written by hand in
 * src/data/stories (for the flagship ones), and the prerendered page for
 * crawlers is built from the same data, so a reader and a search engine are
 * told the same story.
 *
 * WHY THE COLOURS ARE INK AND PLUM
 *
 * A chart about which government did what cannot use a party's colour, and
 * in Andhra Pradesh yellow, blue, green, saffron and red all belong to one.
 * Government figures are ink, anything else is plum, and a change of
 * government is a grey dashed line, the same palette as the share cards.
 */

const INK = '#1c1917'
const PLUM = '#6b2d5c'
const GRID = '#e2e2e7'
const MUTED = '#5c5048'
const FAINT = '#737780'

const COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }

/** Up to three dates: how it started, the latest report, done or due. */
export function KeyDates({ items }) {
  const { t } = useT()
  if (!items?.length) return null
  return (
    <section aria-label={t('projectDetail.story.keyDates.title')}>
      <h2 className="text-title-md font-bold text-on-surface mb-2">{t('projectDetail.story.keyDates.title')}</h2>
      <div className={`grid grid-cols-1 gap-3 ${COLS[Math.min(items.length, 3)]}`}>
        {items.map(k => (
          <div key={k.key} className="border border-surface-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{k.label}</p>
            <p className="text-title-md font-bold text-on-surface mt-0.5">{k.value}</p>
            {k.detail && (
              <p className={`text-label-sm mt-0.5 ${k.passed ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>{k.detail}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

const ms = iso => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)

/**
 * The width the chart is actually drawn at.
 *
 * The chart is laid out at its real pixel width instead of being drawn at
 * 800 and shrunk. Shrunk, a 12px label on a 390px phone came out at 5px and
 * the Telugu labels were unreadable; laid out at the real width, text stays
 * the size it was written at on every screen.
 */
function useWidth(fallback = 800) {
  const [el, setEl] = useState(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!el) return undefined
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width) || fallback)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, fallback])
  return [setEl, width]
}

/**
 * Physical progress over time, broken at every change of government.
 *
 * Drawn only from chartModel(), which refuses to exist with fewer than two
 * readings. A dot is a published figure; a line joins two figures published
 * under the same government and never crosses a change, because the figure
 * for the handover day was never published and a line through it would
 * draw one.
 */
export function ProgressChart({ model, fmtMonth, fmtDay }) {
  const { t } = useT()
  const [ref, width] = useWidth()
  if (!model) return null

  const W = Math.max(300, Math.min(900, width))
  const narrow = W < 560
  const H = narrow ? 250 : 290
  const L = 40, R = 16, T = 46, B = 34
  const x0 = ms(model.from), x1 = ms(model.to)
  const pad = Math.max((x1 - x0) * 0.06, 1000 * 60 * 60 * 24 * 25)
  const lo = x0 - pad, hi = x1 + pad
  const X = iso => L + ((ms(iso) - lo) / (hi - lo)) * (W - L - R)
  const Y = pct => T + (1 - Math.max(0, Math.min(100, pct)) / 100) * (H - T - B)

  const years = []
  for (let y = new Date(lo).getUTCFullYear() + 1; y <= new Date(hi).getUTCFullYear(); y++) {
    const at = Date.UTC(y, 0, 1)
    if (at > lo && at < hi) years.push(y)
  }
  // Every year needs about 44px of axis to be read; skip some when it is short.
  const step = Math.max(1, Math.ceil(years.length / Math.max(1, Math.floor((W - L - R) / 44))))

  const notes = [t('projectDetail.story.chart.note')]
  if (model.anyNotGovernment) notes.push(t('projectDetail.story.chart.hollow'))
  if (model.anyUndated) notes.push(t('projectDetail.story.chart.undated'))

  return (
    <section className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4">
      <h2 className="text-title-md font-bold text-on-surface mb-2">{t('projectDetail.story.chart.title')}</h2>
      <div ref={ref} {...LTR}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="img"
          aria-label={t('projectDetail.story.chart.aria', { count: model.dots.length })}>
          {[0, 25, 50, 75, 100].map(g => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke={GRID} />
              <text x={L - 6} y={Y(g) + 4} fontSize="11" textAnchor="end" fill={FAINT}>{g}%</text>
            </g>
          ))}
          {years.filter((_, i) => i % step === 0).map(y => (
            <text key={y} x={X(`${y}-01-01`)} y={H - 10} fontSize="12" textAnchor="middle" fill={MUTED} fontWeight="700">{y}</text>
          ))}
          {model.changes.map(c => {
            // Two short lines rather than one long one, so a label fits
            // beside its dashed line on a phone. Past the middle of the
            // chart the label sits to the left of its line.
            const right = X(c) > W * 0.62
            const lx = right ? X(c) - 5 : X(c) + 5
            const anchor = right ? 'end' : 'start'
            return (
              <g key={c}>
                <line x1={X(c)} x2={X(c)} y1={T - 12} y2={H - B} stroke={FAINT} strokeDasharray="5 5" />
                <text x={lx} y={T - 30} fontSize="11" textAnchor={anchor} fill={MUTED} fontWeight="700">{t('projectDetail.story.chart.changed')}</text>
                <text x={lx} y={T - 17} fontSize="11" textAnchor={anchor} fill={MUTED}>{fmtMonth(c)}</text>
              </g>
            )
          })}
          {model.marks.map(k => (
            <g key={`${k.kind}-${k.date}`}>
              <line x1={X(k.date)} x2={X(k.date)} y1={T - 12} y2={H - B} stroke={INK} strokeWidth="2" />
              <text x={X(k.date) - 5} y={Y(50)} fontSize="11" textAnchor="end" fill={INK} fontWeight="800">{k.label}</text>
              <text x={X(k.date) - 5} y={Y(50) + 14} fontSize="11" textAnchor="end" fill={INK}>{fmtDay(k.date)}</text>
            </g>
          ))}
          {model.segments.filter(s => s.dots.length > 1).map(s => (
            <polyline key={`${s.era}-${s.dots[0].date}`} fill="none" stroke={INK} strokeWidth="2.5"
              points={s.dots.map(d => `${X(d.date)},${Y(d.pct)}`).join(' ')} />
          ))}
          {model.dots.map(d => {
            const notGov = d.tier && d.tier !== 'gov'
            return (
              <g key={`${d.date}-${d.order}`}>
                <circle cx={X(d.date)} cy={Y(d.pct)} r="5.5" fill={notGov ? '#ffffff' : INK}
                  stroke={notGov ? PLUM : INK} strokeWidth="2.5">
                  <title>{`${d.name}: ${d.pct}%`}</title>
                </circle>
                <text x={X(d.date)} y={Y(d.pct) - 10} fontSize="11" textAnchor="middle" fill={MUTED}>{d.pct}%</text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="text-label-sm text-on-surface-variant mt-2 max-w-3xl">{notes.join(' ')}</p>
    </section>
  )
}

/**
 * The story in steps (src/lib/projectSteps.js): a short road of dated steps,
 * each naming the paper it comes from. It takes the place of the key dates
 * when a project has one, because it holds those dates and says where each
 * one comes from.
 *
 * The left column shows the year so the road can be read at a glance; the
 * exact date sits above the step when there is one finer than a year. The
 * dashed line between the circles is the road, as on the square picture.
 */
export function ProjectSteps({ road, share, readMoreId }) {
  const { t } = useT()
  if (!road?.steps?.length) return null
  return (
    <section aria-labelledby="story-steps" className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 sm:p-5">
      <h2 id="story-steps" className="text-title-md font-bold text-on-surface">{road.title}</h2>
      <p className="text-label-md text-on-surface-variant mt-0.5">{road.sub}</p>
      <ol className="mt-4 flex flex-col">
        {road.steps.map((s, i) => {
          const year = /^\d{4}-\d{2}$/.test(s.when || '') ? s.when : String(s.date).slice(0, 4)
          const last = i === road.steps.length - 1
          return (
            <li key={s.key} className="grid grid-cols-[4.25rem_2.5rem_minmax(0,1fr)] gap-x-2">
              <span className="text-label-md font-bold text-on-surface pt-2.5 tabular-nums">{year}</span>
              <span className="flex flex-col items-center">
                <span className="w-10 h-10 shrink-0 rounded-full border-2 border-on-surface bg-surface grid place-items-center text-primary">
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{s.icon}</span>
                </span>
                {!last && <span aria-hidden="true" className="flex-1 w-0 border-s-2 border-dashed border-outline my-1" />}
              </span>
              <div className={`min-w-0 pt-1 ${last ? '' : 'pb-4'}`}>
                {s.when && s.when !== year && <p className="text-label-sm text-on-surface-variant">{s.when}</p>}
                <p className="text-body-md text-on-surface">{s.text}</p>
                {s.note && <p className="text-label-sm font-semibold text-on-surface mt-0.5">{s.note}</p>}
                {s.paper && <Paper paper={s.paper} />}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {share && <SharePicture {...share} />}
        {readMoreId && (
          <a href={`#${readMoreId}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline text-label-lg text-on-surface hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">menu_book</span>
            {t('projectDetail.story.steps.readFull')}
          </a>
        )}
      </div>
    </section>
  )
}

/** "Paper: MoSPI flash report, July 2026", linked, with its kind when it is not the government's. */
function Paper({ paper }) {
  const { t } = useT()
  const kind = paper.tier === 'company' ? 'company' : paper.tier === 'lender' ? 'lender' : paper.tier && paper.tier !== 'gov' ? 'other' : null
  return (
    <p className="text-label-sm text-on-surface-variant mt-0.5">
      {t('projectDetail.story.steps.paper')}:{' '}
      {paper.url
        ? <a className="text-primary font-normal underline decoration-dotted underline-offset-2 hover:decoration-solid" href={paper.url} target="_blank" rel="noreferrer" title={paper.title}>{paper.name}</a>
        : <span title={paper.title}>{paper.name}</span>}
      {kind && ` (${t(`projectDetail.story.tier.${kind}`)})`}
    </p>
  )
}

/**
 * The picture a project's road is drawn as at build time, found through the
 * manifest the prerender writes (dist/og/steps/index.json). Read once per
 * visit, and only when a reader asks to share: most readers never do, and a
 * village reader pays for every byte.
 */
let pictureIndex = null
async function pictureFor(key) {
  if (!pictureIndex) {
    try {
      const res = await fetch('/og/steps/index.json', { cache: 'no-cache' })
      pictureIndex = res.ok ? await res.json() : {}
    } catch {
      return null
    }
  }
  return pictureIndex[key] || null
}

/**
 * "Share as picture". On a phone this opens the phone's own share sheet with
 * the picture and a caption holding the link, so it goes to WhatsApp, a
 * Status or anywhere else the reader chooses. Where a browser cannot share a
 * file, it offers the picture as a download and the link to copy.
 *
 * A share must start from a tap, and a slow connection can take longer to
 * fetch the picture than the browser lets a tap count. So when the picture
 * arrives too late, the button becomes "Send the picture" and the next tap
 * shares it. A reader who closes the share sheet is back where they started;
 * that is not an error.
 */
export function SharePicture({ pictureKey, link, caption, onShared }) {
  const { t } = useT()
  const [phase, setPhase] = useState('idle') // idle | preparing | ready | fallback
  const [file, setFile] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [objectUrl, setObjectUrl] = useState(null)

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])

  const offerFallback = f => {
    if (f) setObjectUrl(URL.createObjectURL(f))
    setPhase('fallback')
  }
  // With a picture, the picture and a caption holding the link; without one
  // (a story not yet reviewed, or a picture that failed its check at build
  // time), the link alone, which previews as the page's own card.
  const share = async f => {
    try {
      await navigator.share(f ? { files: [f], text: caption } : { text: caption })
      onShared?.(f ? 'share' : 'link')
      setPhase('idle')
    } catch (err) {
      if (err?.name === 'AbortError') setPhase('idle')
      else if (err?.name === 'NotAllowedError') { setFile(f); setPhase('ready') }
      else offerFallback(f)
    }
  }
  const start = async () => {
    setPhase('preparing')
    let f = null
    try {
      const url = await pictureFor(pictureKey)
      if (url) {
        const res = await fetch(url)
        if (res.ok) f = new File([await res.blob()], `${pictureKey}.jpg`, { type: 'image/jpeg' })
      }
    } catch { f = null }
    const canSend = f ? !!navigator.canShare?.({ files: [f] }) : typeof navigator.share === 'function'
    if (canSend) {
      if (navigator.userActivation && !navigator.userActivation.isActive) { setFile(f); setPhase('ready') }
      else share(f)
    } else {
      offerFallback(f)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      onShared?.('copy')
    } catch {
      // No clipboard (an old browser, or a page opened inside another app):
      // show the link itself, selected, for the reader to copy by hand.
      setShowLink(true)
    }
  }

  const pill = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-label-lg transition-colors'
  const main = `${pill} bg-primary text-on-primary hover:opacity-90 disabled:opacity-70`
  const quiet = `${pill} border border-outline text-on-surface hover:bg-surface-container`
  if (phase === 'fallback') {
    return (
      <>
        {objectUrl && (
          <a className={main} href={objectUrl} download={`${pictureKey}.jpg`} onClick={() => onShared?.('download')}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
            {t('projectDetail.story.steps.download')}
          </a>
        )}
        <button type="button" className={quiet} onClick={copy}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">link</span>
          {copied ? t('projectDetail.story.steps.copied') : t('projectDetail.story.steps.copyLink')}
        </button>
        {showLink && (
          <input readOnly value={link} aria-label={t('projectDetail.story.steps.copyLink')} autoFocus
            onFocus={e => e.target.select()}
            className="w-full min-w-0 px-3 py-2 rounded-lg border border-outline bg-surface text-label-md text-on-surface" />
        )}
      </>
    )
  }
  return (
    <button type="button" className={main} disabled={phase === 'preparing'}
      onClick={() => (phase === 'ready' ? share(file) : start())}>
      {/* Two spans with fixed classes, not one with a computed class: the
          icon guard (scripts/icon-font.mjs) reads icon names only from spans
          whose class is written out, and a name it cannot see is left out of
          the shipped font and shows as a word. */}
      {phase === 'preparing'
        ? <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>
        : <span className="material-symbols-outlined text-[18px]" aria-hidden="true">share</span>}
      {phase === 'preparing' ? t('projectDetail.story.steps.preparing')
        : phase === 'ready' ? t('projectDetail.story.steps.send') : t('projectDetail.story.steps.share')}
    </button>
  )
}

/** A source named under a paragraph: the document, its link and its kind. */
function SourceChip({ src }) {
  const { t } = useT()
  const kind = src.tier === 'company' ? t('projectDetail.story.tier.company')
    : src.tier === 'lender' ? t('projectDetail.story.tier.lender')
      : src.tier && src.tier !== 'gov' ? t('projectDetail.story.tier.other') : null
  const label = kind ? `${src.name} (${kind})` : src.name
  const cls = `inline-block text-label-sm px-2 py-0.5 rounded-full me-1.5 mt-1 ${kind
    ? 'border border-dashed border-outline text-on-surface-variant'
    : 'bg-primary-fixed text-on-primary-fixed-variant'}`
  return src.url
    ? <a className={`${cls} hover:underline`} href={src.url} target="_blank" rel="noreferrer" title={src.title || src.name}>{label} ↗</a>
    : <span className={cls} title={src.title || src.name}>{label}</span>
}

function Sources({ list }) {
  if (!list?.length) return null
  return <span className="block">{list.map((s, i) => <SourceChip key={`${s.url || s.name}-${i}`} src={s} />)}</span>
}

function Block({ block }) {
  if (block.type === 'list') {
    return (
      <div>
        {block.intro && <p className="mb-1">{block.intro}</p>}
        <ul className="flex flex-col gap-2">
          {block.items.map((it, i) => (
            <li key={i} className={it.marker
              ? 'text-on-surface-variant italic border-s-2 border-outline ps-3'
              : 'ps-3 border-s-2 border-surface-variant first-letter:uppercase'}>
              {it.doc && (
                <>
                  {it.doc.url
                    ? <a className="font-semibold text-primary hover:underline" href={it.doc.url} target="_blank" rel="noreferrer" title={it.doc.title || it.doc.name}>{it.doc.name}</a>
                    : <span className="font-semibold">{it.doc.name}</span>}
                  {it.doc.tier && it.doc.tier !== 'gov' && <TierTag tier={it.doc.tier} />}
                  {': '}
                </>
              )}
              {it.text}
              {it.sources?.length > 0 && <Sources list={it.sources} />}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <p>
      {block.text}
      <Sources list={block.sources} />
    </p>
  )
}

function TierTag({ tier }) {
  const { t } = useT()
  const key = tier === 'company' ? 'company' : tier === 'lender' ? 'lender' : 'other'
  return <span className="text-label-sm text-on-surface-variant"> ({t(`projectDetail.story.tier.${key}`)})</span>
}

/**
 * The story, in chapters. Each chapter shows one line while closed; the
 * first one starts open so a reader sees at once that there is more.
 */
export function StoryChapters({ chapters, note, id }) {
  const { t } = useT()
  if (!chapters?.length) return null
  return (
    <section id={id} className="scroll-mt-20" aria-label={t('projectDetail.story.heading')}>
      <h2 className="text-title-md font-bold text-on-surface">{t('projectDetail.story.heading')}</h2>
      {note && <p className="text-label-sm text-on-surface-variant mt-1 mb-3 max-w-3xl">{note}</p>}
      <div className="flex flex-col gap-2">
        {chapters.map((c, i) => (
          <details key={c.id} open={i === 0}
            className="group bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden">
            <summary className="list-none cursor-pointer px-4 py-3 flex items-start gap-3 hover:bg-surface-container transition-colors [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true"
                className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-primary-fixed text-on-primary-fixed-variant grid place-items-center font-bold transition-transform group-open:rotate-90">
                ›
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-body-md font-bold text-on-surface">{c.title}</span>
                {c.line && <span className="text-label-md text-on-surface-variant">{c.line}</span>}
              </span>
            </summary>
            <div className="px-4 pb-4 ps-[3.25rem] flex flex-col gap-3 text-body-md text-on-surface leading-relaxed">
              {c.blocks.map((b, j) => <Block key={j} block={b} />)}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

/** The questions people search, each with the same answer the page gives. */
export function ProjectQuestions({ items }) {
  const { t } = useT()
  if (!items?.length) return null
  return (
    <section aria-label={t('projectDetail.story.questionsHeading')}>
      <h2 className="text-title-md font-bold text-on-surface mb-2">{t('projectDetail.story.questionsHeading')}</h2>
      <div className="flex flex-col gap-2">
        {items.map(q => (
          <details key={q.key} className="group bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden">
            <summary className="list-none cursor-pointer px-4 py-3 flex items-start gap-3 hover:bg-surface-container transition-colors [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true"
                className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant grid place-items-center font-bold transition-transform group-open:rotate-90">
                ›
              </span>
              <span className="text-body-md font-semibold text-on-surface">{q.q}</span>
            </summary>
            <div className="px-4 pb-4 ps-[3.25rem] text-body-md text-on-surface leading-relaxed">
              <p>{q.a}</p>
              <Sources list={q.sources} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
