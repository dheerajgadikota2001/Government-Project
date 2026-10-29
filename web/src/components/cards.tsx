import * as React from 'react'
import { Check, ChevronRight, Copy, FileText, Share2, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Lang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { meta } from '@/lib/data'
import { pol } from '@/lib/data-polavaram'
import { helplines } from '@/lib/data-helplines'
import { dateLong, dateTe } from '@/lib/format'
import { CardsLangSwitch, DistrictSelect, InShort, useCardsLang, useMyDistrict, W, type ShortItem } from '@/components/card-bits'
import { todaysCards, type BiS, type FactCard } from '@/lib/cards'
import { EVENTS, track } from '@/lib/analytics'
import { useTenderSummary } from '@/lib/live'
import { Dam } from '@/graphics/Dam'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// One card system, used in four places: the "Today's cards" feed, the "In short"
// row on pages, the wall on Home, and the picture people forward on WhatsApp.
// A card holds one fact: the number as the paper prints it, one short line, and
// the paper with its date. No explanation on the card; one tap opens the chart
// that explains it.

// Kept here for older imports; new code should import the light parts from card-bits.
export { CardsLangSwitch, DistrictSelect, InShort, useCardsLang, useMyDistrict, type ShortItem }

/* ------------------------------------------------------------- the card */
const EMERGENCY = ['112', '108'].map((n) => (helplines.emergency as any[]).find((e) => e.number === n)).filter(Boolean)

// fit is for the one-card-a-screen phone feed, where the card has a fixed height.
// The top and the footer keep their size, the middle gives way (the dam shrinks first,
// then the text scrolls), so nothing can be drawn on top of the paper line. Elsewhere
// the card is as tall as its content, as before.
export function FactCardView({ card, lang, className, onPickDistrict, footer = true, fit = false }: {
  card: FactCard; lang: Lang; className?: string; onPickDistrict?: (name: string | null) => void; footer?: boolean; fit?: boolean
}) {
  const L = (b?: BiS | null) => (b ? b[lang] : '')
  const te = lang === 'te'
  return (
    <article lang={te ? 'te' : 'en'} className={cn('flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground', fit && 'overflow-hidden p-4 [@media(max-height:700px)]:p-3.5', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12px] font-semibold text-ink2">{L(card.topic)}</span>
      </div>
      <h3 className={cn('mt-3 text-[17px] font-semibold leading-snug tracking-tight [text-wrap:balance]', fit && 'mt-2.5 shrink-0')}>{L(card.title)}</h3>
      <div className={cn('mt-3 min-h-0 flex-1', fit && 'mt-2.5 overflow-y-auto overscroll-contain [container-type:size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>
        <CardBody card={card} lang={lang} onPickDistrict={onPickDistrict} fit={fit} />
      </div>
      {footer ? (
        <footer className={cn('mt-4 flex shrink-0 flex-wrap items-end justify-between gap-x-3 gap-y-2 border-t border-border pt-3', fit && 'mt-3')}>
          <span className="flex min-w-0 flex-1 basis-[11rem] items-start gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
            <FileText className="mt-px size-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="min-w-0">{typeof card.paper.label === 'string' ? <span lang="en">{card.paper.label}</span> : <span>{L(card.paper.label)}</span>}{card.paper.date ? <span>, {L(card.paper.date)}</span> : null}</span>
          </span>
          <a href={href(card.href)} className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-[13.5px] font-semibold text-foreground hover:underline hover:underline-offset-4">
            {L(card.hrefLabel ?? W.fullPicture)}<ChevronRight className="size-4" aria-hidden />
          </a>
        </footer>
      ) : null}
    </article>
  )
}

function CardBody({ card, lang, onPickDistrict, fit = false }: { card: FactCard; lang: Lang; onPickDistrict?: (name: string | null) => void; fit?: boolean }) {
  const L = (b?: BiS | null) => (b ? b[lang] : '')
  const te = lang === 'te'
  switch (card.kind) {
    case 'picture': {
      const rows = card.picture ?? []
      const max = Math.max(...rows.map((r) => r.value))
      return (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.style}>
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="text-muted-foreground">{L(r.label)}</span>
                <span className="font-semibold tnum">{L(r.text)}</span>
              </div>
              <div className="relative mt-1 h-4 rounded-[5px] bg-muted/70">
                <span className={cn('absolute inset-y-0 left-0 rounded-[5px]', r.style === 'plan' ? 'border-2 border-dashed border-foreground/55' : 'bg-[var(--chart-1)]')}
                  style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[13.5px] leading-snug text-muted-foreground">{L(card.line)} {te ? 'గీతల పెట్టె: బడ్జెట్ అంచనా.' : 'Dashed: the budget estimate, a plan.'}</p>
        </div>
      )
    }
    case 'thenNow': {
      const tn = card.thenNow!
      const est = tn.a.est || tn.b.est
      return (
        <div className="@container">
          <div className="grid grid-cols-1 gap-2.5 @[15rem]:grid-cols-2">
            {[tn.a, tn.b].map((x, i) => (
              <div key={i} className={cn('min-w-0 rounded-xl p-3', x.est ? 'border border-dashed border-foreground/45' : 'bg-secondary')}>
                <div className="text-[12.5px] leading-snug text-muted-foreground">{L(x.label)}</div>
                <div className="mt-1 font-heading text-[22px] font-semibold leading-tight tnum sm:text-[24px]">{x.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[13.5px] leading-snug text-muted-foreground">{L(card.line)}</p>
          {est ? <p className="mt-1 text-[12.5px] text-muted-foreground">{L(W.dashed)}</p> : null}
        </div>
      )
    }
    case 'claim': {
      const c = card.claim!
      return (
        <div className="space-y-2">
          <div className="rounded-xl border border-dashed border-foreground/35 p-3">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{L(W.claim)} · {L(c.doc)}</div>
            <div className="mt-1 font-heading text-[22px] font-semibold leading-tight tnum">{L(c.figure)}</div>
            <div className="text-[13px] leading-snug text-muted-foreground">{L(c.said)}</div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{L(W.record)} · {L(c.recordDoc)}</div>
            <div className="mt-1 text-[14.5px] font-medium leading-snug">{L(c.record)}</div>
          </div>
          <div className="inline-flex max-w-full items-center rounded-full border border-foreground/25 bg-card px-2.5 py-1 text-[12.5px] font-semibold leading-snug">{L(c.status)}</div>
        </div>
      )
    }
    case 'word': {
      const w = card.word!
      return (
        <div>
          <div lang={te ? 'en' : 'te'} className="-mt-2 text-[15px] text-muted-foreground">{w.term[te ? 'en' : 'te']}</div>
          <p className="mt-2 text-[15.5px] leading-relaxed">{L(w.plain)}</p>
          <div className="mt-3 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--chart-3)_45%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,var(--card))] px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground/85">
            <span className="font-semibold">{L(W.example)}: </span>{L(w.example)}
          </div>
        </div>
      )
    }
    case 'district': {
      if (!card.value) {
        return (
          <div>
            <p className="text-[14.5px] leading-snug text-muted-foreground">{L(card.line)}</p>
            <DistrictSelect lang={lang} value={null} onChange={(v) => onPickDistrict?.(v)} className="mt-3" />
          </div>
        )
      }
      return (
        <div>
          <div className="font-heading text-[44px] font-semibold leading-none tracking-tight tnum">{L(card.value)}</div>
          <p className="mt-2 text-[14.5px] leading-snug text-muted-foreground">{L(card.line)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EMERGENCY.map((e: any) => (
              <span key={e.number} className="inline-flex items-baseline gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px]">
                <b className="font-heading text-[16px] tnum">{e.number}</b>
                <span className="text-muted-foreground">{L(e.number === '112' ? W.emergency : W.ambulance)}</span>
              </span>
            ))}
          </div>
          {onPickDistrict ? (
            <button type="button" onClick={() => onPickDistrict(null)} className="mt-3 text-[12.5px] font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">{L(W.change)}</button>
          ) : null}
        </div>
      )
    }
    default: {
      return (
        <div>
          {card.img === 'dam' ? (
            <div className={cn('pointer-events-none mx-auto mb-2 w-full max-w-[230px]', fit && 'max-w-[clamp(96px,calc((100cqh-96px)*1.14),230px)]')} aria-hidden>
              <Dam readings={pol.readings} index={pol.readings.length - 1} gauge={false} notes={false} />
            </div>
          ) : null}
          <div className="font-heading text-[44px] font-semibold leading-none tracking-tight tnum">{L(card.value)}</div>
          <p className="mt-2 text-[14.5px] leading-snug text-muted-foreground">{L(card.line)}</p>
        </div>
      )
    }
  }
}

/* ------------------------------------------------------- card actions */
export function ListenReserved({ lang, compact }: { lang: Lang; compact?: boolean }) {
  const L = (b: BiS) => b[lang]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-disabled className={cn('inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13.5px] font-medium text-foreground/60', compact && 'size-10 px-0')} aria-label={L(W.listen)}>
          <Volume2 className="size-4" aria-hidden />{compact ? null : L(W.listen)}
        </button>
      </TooltipTrigger>
      <TooltipContent>{L(W.voiceSoon)}</TooltipContent>
    </Tooltip>
  )
}

export function CardActions({ card, lang, onShare, className }: { card: FactCard; lang: Lang; onShare: (c: FactCard) => void; className?: string }) {
  const L = (b: BiS) => b[lang]
  return (
    <div lang={lang} className={cn('flex items-center gap-2', className)}>
      <ListenReserved lang={lang} />
      <a href={href(card.href)} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background hover:opacity-90">
        {L(card.hrefLabel ?? W.fullPicture)}<ChevronRight className="size-4" aria-hidden />
      </a>
      <button type="button" onClick={() => onShare(card)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13.5px] font-medium hover:border-foreground/30">
        <Share2 className="size-4" aria-hidden />{L(W.share)}
      </button>
    </div>
  )
}

/* ------------------------------------------------- the share picture */
// The same card as a square picture in the Ink and plum look, so that when it is
// forwarded the paper, the date and the site go with it. A claim always travels
// with its record on the same picture.
const INK = { bg: '#FBF8F4', card: '#FFFDFA', ink: '#1F1A24', muted: '#6D6573', plum: '#8E3468', line: '#E9E1D8', soft: '#F3EDE6', blue: '#1C78B5' }
const SITE = 'apfactcheck.dheeco.com'

async function fontsReady(lang: Lang) {
  const loads = ['600 64px "Source Serif 4"', '700 150px "Source Serif 4"', '500 36px "Geist"', '600 36px "Geist"']
  if (lang === 'te') loads.push('500 36px "Noto Sans Telugu"', '700 64px "Noto Sans Telugu"')
  try {
    await Promise.race([Promise.all(loads.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))])
  } catch { /* draw with the fallback fonts */ }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

export async function drawSharePicture(card: FactCard, lang: Lang): Promise<string> {
  await fontsReady(lang)
  const S = 1080, P = 84
  const cv = document.createElement('canvas')
  cv.width = S; cv.height = S
  const ctx = cv.getContext('2d')!
  const te = lang === 'te'
  const L = (b?: BiS | null) => (b ? b[lang] : '')
  const sans = (w: number, px: number) => `${w} ${px}px ${te ? '"Noto Sans Telugu", ' : ''}"Geist", system-ui, sans-serif`
  const serif = (w: number, px: number) => `${w} ${px}px ${te ? '"Noto Sans Telugu", ' : ''}"Source Serif 4", Georgia, serif`
  // Figures in Telugu carry Telugu words ("కోట్లు"), which need the Telugu face to shape correctly.
  const num = (w: number, px: number) => `${w} ${px}px ${te ? '"Noto Sans Telugu", ' : ''}"Source Serif 4", Georgia, serif`

  ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, S, S)
  // top line: the mark and the name
  ctx.fillStyle = INK.ink; roundRect(ctx, P, P - 6, 52, 52, 10); ctx.fill()
  ctx.fillStyle = INK.bg; ctx.font = '700 22px "Geist", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('AP', P + 26, P + 20)
  ctx.textAlign = 'left'; ctx.fillStyle = INK.ink; ctx.font = sans(600, 30)
  ctx.fillText(te ? 'ఏపీ ఫ్యాక్ట్ చెక్ · రికార్డు' : 'AP Fact Check · the record', P + 70, P + 21)
  ctx.textBaseline = 'alphabetic'
  // topic
  ctx.font = sans(600, 26); ctx.fillStyle = INK.plum
  ctx.fillText(L(card.topic).toUpperCase(), P, P + 128)
  // title
  ctx.fillStyle = INK.ink; ctx.font = serif(600, 60)
  let y = P + 200
  for (const ln of wrap(ctx, L(card.title), S - 2 * P).slice(0, 2)) { ctx.fillText(ln, P, y); y += 72 }
  y += 20

  const text = (t: string, font: string, color: string, maxLines = 3, lh = 46) => {
    ctx.font = font; ctx.fillStyle = color
    for (const ln of wrap(ctx, t, S - 2 * P).slice(0, maxLines)) { ctx.fillText(ln, P, y); y += lh }
  }

  if (card.kind === 'claim' && card.claim) {
    const c = card.claim
    // the claim, dashed
    ctx.setLineDash([12, 9]); ctx.strokeStyle = INK.muted; ctx.lineWidth = 3
    roundRect(ctx, P, y, S - 2 * P, 190, 18); ctx.stroke(); ctx.setLineDash([])
    let yy = y + 50
    ctx.font = sans(600, 24); ctx.fillStyle = INK.muted; ctx.fillText(`${L(W.claim).toUpperCase()} · ${L(c.doc)}`, P + 28, yy)
    yy += 62; ctx.font = num(700, 58); ctx.fillStyle = INK.ink; ctx.fillText(L(c.figure), P + 28, yy)
    yy += 46; ctx.font = sans(500, 28); ctx.fillStyle = INK.muted; ctx.fillText(wrap(ctx, L(c.said), S - 2 * P - 56)[0] ?? '', P + 28, yy)
    y += 214
    // the record, solid
    ctx.fillStyle = INK.soft; roundRect(ctx, P, y, S - 2 * P, 210, 18); ctx.fill()
    yy = y + 50
    ctx.font = sans(600, 24); ctx.fillStyle = INK.muted; ctx.fillText(`${L(W.record).toUpperCase()} · ${L(c.recordDoc)}`, P + 28, yy)
    ctx.font = sans(500, 34); ctx.fillStyle = INK.ink
    yy += 52
    for (const ln of wrap(ctx, L(c.record), S - 2 * P - 56).slice(0, 3)) { ctx.fillText(ln, P + 28, yy); yy += 44 }
    y += 236
    ctx.font = sans(600, 28); ctx.fillStyle = INK.plum
    for (const ln of wrap(ctx, L(c.status), S - 2 * P).slice(0, 2)) { ctx.fillText(ln, P, y + 10); y += 38 }
  } else if (card.kind === 'picture' && card.picture) {
    const max = Math.max(...card.picture.map((r) => r.value))
    for (const r of card.picture) {
      ctx.font = sans(500, 30); ctx.fillStyle = INK.muted; ctx.fillText(L(r.label), P, y + 20)
      ctx.font = num(700, 44); ctx.fillStyle = INK.ink; ctx.textAlign = 'right'; ctx.fillText(L(r.text), S - P, y + 24); ctx.textAlign = 'left'
      const bw = (S - 2 * P) * (r.value / max)
      if (r.style === 'plan') { ctx.setLineDash([12, 8]); ctx.strokeStyle = INK.ink; ctx.lineWidth = 4; roundRect(ctx, P + 2, y + 50, bw - 4, 56, 10); ctx.stroke(); ctx.setLineDash([]) }
      else { ctx.fillStyle = INK.plum; roundRect(ctx, P, y + 48, bw, 60, 10); ctx.fill() }
      y += 150
    }
    text(L(card.line) + (te ? ' గీతల పెట్టె: బడ్జెట్ అంచనా.' : ' Dashed: the budget estimate, a plan.'), sans(500, 30), INK.muted, 2, 42)
  } else if (card.kind === 'thenNow' && card.thenNow) {
    const tn = card.thenNow
    const bw = (S - 2 * P - 28) / 2
    ;[tn.a, tn.b].forEach((x, i) => {
      const bx = P + i * (bw + 28)
      if (x.est) { ctx.setLineDash([12, 8]); ctx.strokeStyle = INK.muted; ctx.lineWidth = 3; roundRect(ctx, bx, y, bw, 220, 18); ctx.stroke(); ctx.setLineDash([]) }
      else { ctx.fillStyle = INK.soft; roundRect(ctx, bx, y, bw, 220, 18); ctx.fill() }
      ctx.font = sans(500, 28); ctx.fillStyle = INK.muted; ctx.fillText(wrap(ctx, L(x.label), bw - 48)[0] ?? '', bx + 24, y + 56)
      ctx.font = num(700, 64); ctx.fillStyle = INK.ink; ctx.fillText(x.value, bx + 24, y + 150)
    })
    y += 270
    text(L(card.line), sans(500, 30), INK.muted, 2, 42)
    if (tn.a.est || tn.b.est) text(L(W.dashed), sans(500, 26), INK.muted, 2, 38)
  } else if (card.kind === 'word' && card.word) {
    const w = card.word
    text(w.term[te ? 'en' : 'te'], (te ? '500 34px "Geist", system-ui, sans-serif' : '500 34px "Noto Sans Telugu", sans-serif'), INK.muted, 1, 60)
    text(L(w.plain), sans(500, 38), INK.ink, 3, 52)
    y += 18
    text(`${L(W.example)}: ${L(w.example)}`, sans(500, 29), INK.muted, 5, 42)
  } else {
    ctx.font = num(700, 170); ctx.fillStyle = INK.ink
    ctx.fillText(card.share?.value ?? L(card.value), P - 4, y + 140)
    y += 210
    text(L(card.line), sans(500, 36), INK.muted, 3, 50)
  }

  // the paper and the site, always at the foot
  ctx.fillStyle = INK.line; ctx.fillRect(P, S - P - 104, S - 2 * P, 2)
  ctx.font = sans(500, 27); ctx.fillStyle = INK.muted
  const paperLine = (typeof card.paper.label === 'string' ? card.paper.label : L(card.paper.label)) + (card.paper.date ? `, ${L(card.paper.date)}` : '')
  wrap(ctx, (te ? 'పత్రం: ' : 'Paper: ') + paperLine, S - 2 * P).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, P, S - P - 58 + i * 36))
  ctx.font = '600 27px "Geist", system-ui, sans-serif'; ctx.fillStyle = INK.plum
  ctx.textAlign = 'right'; ctx.fillText(SITE, S - P, S - P + 18); ctx.textAlign = 'left'
  ctx.font = sans(500, 24); ctx.fillStyle = INK.muted
  ctx.fillText(te ? 'అంకెలు పత్రంలో ముద్రించినట్లే' : 'Figures as the paper prints them', P, S - P + 18)
  return cv.toDataURL('image/png')
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function cardText(card: FactCard, lang: Lang): string {
  const L = (b?: BiS | null) => (b ? b[lang] : '')
  const parts = [L(card.title)]
  if (card.value) parts.push(`${L(card.value)} ${L(card.line)}`.trim())
  else if (card.claim) parts.push(`${L(W.claim)}: ${L(card.claim.figure)} (${L(card.claim.doc)}). ${L(W.record)}: ${L(card.claim.record)} ${L(card.claim.status)}.`)
  else if (card.thenNow) parts.push(`${L(card.thenNow.a.label)}: ${card.thenNow.a.value}. ${L(card.thenNow.b.label)}: ${card.thenNow.b.value}. ${L(card.line)}`)
  else if (card.picture) parts.push(card.picture.map((r) => `${L(r.label)}: ${L(r.text)}`).join('. ') + '.')
  else if (card.word) parts.push(`${L(card.word.plain)} ${L(card.word.example)}`)
  parts.push(`${lang === 'te' ? 'పత్రం' : 'Paper'}: ${typeof card.paper.label === 'string' ? card.paper.label : L(card.paper.label)}${card.paper.date ? ', ' + L(card.paper.date) : ''}`)
  parts.push(SITE)
  return parts.join('\n')
}

export function ShareDialog({ card, lang, onOpenChange }: { card: FactCard | null; lang: Lang; onOpenChange: (o: boolean) => void }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const textRef = React.useRef<HTMLTextAreaElement>(null)
  const counted = React.useRef<string | null>(null)
  const te = lang === 'te'
  React.useEffect(() => {
    setSrc(null); setCopied(false)
    if (!card) { counted.current = null; return }
    // The share picture exists so the record can travel in WhatsApp groups. If this stays near zero, it is not.
    // Once per opening: switching the card's language redraws the picture but is not a second share.
    if (counted.current !== card.id) { counted.current = card.id; track(EVENTS.SHARE_OPENED, { card_id: card.id, card_kind: card.kind, site_language: lang }) }
    let live = true
    drawSharePicture(card, lang).then((u) => { if (live) setSrc(u) }).catch(() => { if (live) setSrc('') })
    return () => { live = false }
  }, [card, lang])
  const text = card ? cardText(card, lang) : ''
  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2400) }
    if (card) track(EVENTS.SHARE_TEXT_COPIED, { card_id: card.id, card_kind: card.kind, site_language: lang })
    try {
      navigator.clipboard.writeText(text).then(done, () => { textRef.current?.select(); done() })
    } catch { textRef.current?.select(); done() }
  }
  return (
    <Dialog open={!!card} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-[520px]" lang={te ? 'te' : 'en'}>
        <DialogHeader>
          <DialogTitle>{te ? 'ఈ కార్డును పంచుకోండి' : 'Share this card'}</DialogTitle>
          <DialogDescription>{te ? 'పత్రం, తేదీ, సైట్ చిరునామా బొమ్మపైనే ఉంటాయి. ఫార్వర్డ్ చేసినా ఆధారం దానితోనే వెళ్తుంది.' : 'The paper, its date and the site are printed on the picture, so the source travels with it when it is forwarded.'}</DialogDescription>
        </DialogHeader>
        <div className="aspect-square w-full max-w-full overflow-hidden rounded-xl border border-border bg-muted">
          {src ? <img src={src} alt={text} className="size-full object-contain" /> : src === '' ? null : <div className="grid size-full place-items-center text-[13px] text-muted-foreground">{te ? 'బొమ్మ తయారవుతోంది' : 'Drawing the picture'}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? (te ? 'కాపీ అయింది' : 'Copied') : (te ? 'మాటలు కాపీ చేయండి' : 'Copy the words')}
          </button>
          <span className="text-[12.5px] leading-snug text-muted-foreground">{te ? 'బొమ్మను దాచుకోవడానికి దానిపై నొక్కి పట్టండి.' : 'To keep the picture, press and hold it.'}</span>
        </div>
        <textarea ref={textRef} readOnly value={text} rows={4} className="w-full resize-none rounded-lg border border-border bg-muted/40 p-2 text-[12.5px] text-muted-foreground" aria-label={te ? 'కార్డు మాటలు' : 'The card in words'} />
        <p className="text-[12px] text-muted-foreground">{te ? 'లైవ్ సైట్‌లో ఈ బటన్ వాట్సాప్ పంపే జాబితాను నేరుగా తెరుస్తుంది. ఈ ప్రివ్యూలో అది సాధ్యం కాదు.' : 'On the live site this opens WhatsApp’s share sheet with the picture. This preview cannot open it.'}</p>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------------- Home wall */
export function CardWall({ className }: { className?: string }) {
  const [lang, setLang] = useCardsLang()
  const [district, setDistrict] = useMyDistrict()
  const [share, setShare] = React.useState<FactCard | null>(null)
  const ts = useTenderSummary()
  const sum = ts.status === 'ok' ? ts.data : null
  const all = React.useMemo(() => todaysCards(district, sum), [district, sum])
  const pick = ['polavaram', 'tenders', 'claim-2024', 'income', 'schools', 'district']
  const cards = pick.map((id) => all.find((c) => c.id === id)).filter(Boolean) as FactCard[]
  // The tenders card is live. While it is on its way a plain placeholder holds its place, so the wall does not jump.
  const waiting = ts.status === 'loading'
  const te = lang === 'te'
  return (
    <section className={cn('min-w-0', className)} aria-labelledby="wall-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground" lang={te ? 'te' : 'en'}>{te ? `నేటి కార్డులు · ${dateTe(meta.asof)}` : `Today's cards · ${dateLong(meta.asof)}`}</div>
          <h2 id="wall-title" lang={te ? 'te' : 'en'} className="text-[26px] font-semibold leading-[1.15] tracking-tight md:text-[30px]">{te ? 'ఒక్కో కార్డులో ఒక్కో నిజం' : 'Straight facts, one card at a time'}</h2>
          <p lang={te ? 'te' : 'en'} className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">{te ? 'ప్రతి కార్డులో పత్రం ముద్రించిన అంకె, ఒక చిన్న వాక్యం, పత్రం పేరు, తేదీ. పూర్తి వివరం కోసం నొక్కండి.' : 'Each card holds the number as the paper prints it, one short line, and the paper with its date. Tap one for the full picture.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <CardsLangSwitch value={lang} onChange={setLang} />
          <a href={href('cards')} lang={te ? 'te' : 'en'} className="inline-flex items-center gap-1 text-[14.5px] font-semibold hover:underline hover:underline-offset-4">{te ? `అన్ని ${all.length} కార్డులు` : `All ${all.length} cards`}<ChevronRight className="size-4" /></a>
        </div>
      </div>
      <div className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
        {waiting ? <div aria-hidden className="order-2 flex min-h-[260px] w-[82vw] max-w-[340px] shrink-0 animate-pulse rounded-2xl border border-border bg-muted/50 md:w-auto md:max-w-none" /> : null}
        {cards.map((c, k) => (
          <div key={c.id} style={{ order: k < 1 ? 1 : 3 }} className="flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col gap-2 md:w-auto md:max-w-none">
            <FactCardView card={c} lang={lang} onPickDistrict={setDistrict} className="flex-1" />
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setShare(c)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground" lang={te ? 'te' : 'en'}>
                <Share2 className="size-4" aria-hidden />{te ? W.share.te : W.share.en}
              </button>
            </div>
          </div>
        ))}
      </div>
      <ShareDialog card={share} lang={lang} onOpenChange={(o) => !o && setShare(null)} />
    </section>
  )
}

/* ------------------------------------------------------- the feed */
export function CardsFeed() {
  const [lang, setLang] = useCardsLang()
  const [district, setDistrict] = useMyDistrict()
  const [share, setShare] = React.useState<FactCard | null>(null)
  const ts = useTenderSummary()
  const sum = ts.status === 'ok' ? ts.data : null
  const cards = React.useMemo(() => todaysCards(district, sum), [district, sum])
  const [i, setI] = React.useState(0)
  const scroller = React.useRef<HTMLDivElement>(null)
  const te = lang === 'te'
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const k = Math.round(el.scrollTop / Math.max(1, el.clientHeight))
    if (k !== i) setI(Math.min(cards.length - 1, Math.max(0, k)))
  }
  const go = (k: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: k * el.clientHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const head = (
    <div className="min-w-0">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground max-md:[@media(max-height:640px)]:hidden" lang={te ? 'te' : 'en'}>{te ? dateTe(meta.asof) : dateLong(meta.asof)}</div>
      <h1 lang={te ? 'te' : 'en'} className="text-[24px] font-semibold leading-tight tracking-tight max-md:[@media(max-height:640px)]:text-[20px] md:text-[40px]">{te ? 'నేటి కార్డులు' : "Today's cards"}</h1>
    </div>
  )
  return (
    <div>
      {/* Phones: one card a screen, swipe up for the next, like a status */}
      <div className="flex flex-col md:hidden" style={{ height: 'calc(100dvh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        <div className="pt-3 [@media(max-height:640px)]:pt-1.5">
          <div className="flex items-end justify-between gap-3">
            {head}
            <div className="flex items-center gap-2 pb-0.5">
              <span className="text-[12.5px] text-muted-foreground tnum" lang={te ? 'te' : 'en'}>{te ? `${cards.length}లో ${i + 1}` : `${i + 1} of ${cards.length}`}</span>
              <CardsLangSwitch value={lang} onChange={setLang} />
            </div>
          </div>
          <div className="mt-2.5 [@media(max-height:640px)]:mt-1.5 flex gap-1" aria-hidden>
            {cards.map((c, k) => <button key={c.id} type="button" tabIndex={-1} onClick={() => go(k)} className={cn('h-1 flex-1 rounded-full transition-colors', k <= i ? 'bg-foreground' : 'bg-foreground/15')} />)}
          </div>
        </div>
        <div ref={scroller} onScroll={onScroll} data-feed="cards" className="mt-2 min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={te ? 'కార్డులు' : 'Cards'}>
          {cards.map((c) => (
            <div key={c.id} className="flex h-full snap-start snap-always flex-col gap-2.5 py-2 [@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:py-1">
              <FactCardView card={c} lang={lang} onPickDistrict={setDistrict} className="min-h-0 flex-1" fit />
              <CardActions card={c} lang={lang} onShare={setShare} />
            </div>
          ))}
        </div>
      </div>

      {/* Larger screens: the same cards in a grid */}
      <div className="mx-auto hidden w-full max-w-[1240px] pb-10 pt-12 md:block" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            {head}
            <p lang={te ? 'te' : 'en'} className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{te
              ? `ఈ రోజు ${cards.length} కార్డులు: కొత్త రీడింగులు, గడువు దగ్గర పడుతున్న టెండర్లు, ప్రతి ప్రభుత్వం నుంచి ఒక్కో వాదన పరిశీలన, ఒక పదం, మీ జిల్లా. ప్రతి అంకె పత్రంలో ముద్రించినట్లే.`
              : `${cards.length} cards today: new readings, tenders about to close, one claim check from each government's paper in turn, a word to know, and your district. Every figure is as its paper prints it.`}</p>
          </div>
          <CardsLangSwitch value={lang} onChange={setLang} />
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-col gap-2.5">
              <FactCardView card={c} lang={lang} onPickDistrict={setDistrict} className="flex-1" />
              <CardActions card={c} lang={lang} onShare={setShare} />
            </div>
          ))}
        </div>
      </div>
      <ShareDialog card={share} lang={lang} onOpenChange={(o) => !o && setShare(null)} />
    </div>
  )
}
