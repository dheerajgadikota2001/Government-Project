import * as React from 'react'
import { ArrowUpRight, ChevronLeft, FileText } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { useTitle } from '@/lib/titles'
import { Page, PageHead } from '@/components/shell'
import {
  docBySlug, docDescription, docFacts, docSiblings, docTab, docTitle, kindOf, SUMMIT_CAVEAT, summitBySlug, summitDescription, summitFacts,
  summitName, summitTitle, type Fact,
} from '@/lib/docs'

// One page for one government paper (/documents/<name>) and one for one investment summit (/investments/<key>).
// The words come from lib/docs.ts, the same file the pre-renderer reads, so a crawler and a reader see the same page.
// The page says only what the record says. It never summarises the paper's figures.

function Facts({ facts }: { facts: Fact[] }) {
  const { lang } = useLang()
  return (
    <dl className="mt-8 grid max-w-3xl gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      {facts.map((f, i) => (
        <React.Fragment key={i}>
          <dt className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{f.label[lang]}</dt>
          <dd className="min-w-0 text-[16px] leading-relaxed [overflow-wrap:anywhere]" lang={f.lang}>
            {f.href ? (
              <a href={f.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
                {f.value[lang]}<ArrowUpRight className="size-4" />
              </a>
            ) : f.value[lang]}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function Missing() {
  const { tr } = useLang()
  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Government papers', 'ప్రభుత్వ పత్రాలు')} q={{ en: 'We do not have this paper', te: 'ఈ పత్రం మా దగ్గర లేదు' }}
        lede={<a className="underline underline-offset-4" href={href('papers')}>{tr('See every paper we hold', 'మా దగ్గర ఉన్న అన్ని పత్రాలు చూడండి')}</a>} />
    </Page>
  )
}

export function DocPage({ slug }: { slug: string }) {
  const { lang, tr } = useLang()
  const d = docBySlug.get(slug)
  useTitle(d ? docTab(d) : null, lang)
  if (!d) return <Missing />
  const sibs = docSiblings(d)
  return (
    <Page className="pt-10 md:pt-14">
      <a href={href('papers')} className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />{tr('All government papers', 'అన్ని ప్రభుత్వ పత్రాలు')}
      </a>
      <PageHead eyebrow={kindOf(d)[lang]} q={docTitle(d)} lede={docDescription(d)[lang]} />
      <a href={d.url} target="_blank" rel="noopener noreferrer"
        className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-5 text-[16px] font-semibold text-background">
        <FileText className="size-5" />{tr('Open the official file', 'అధికారిక ఫైల్ తెరవండి')}<ArrowUpRight className="size-4" />
      </a>
      <Facts facts={docFacts(d)} />
      <p className="mt-8 max-w-3xl rounded-xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed">{kindOf(d).what[lang]}</p>
      {sibs.length ? (
        <section className="mt-10" aria-labelledby="sibs">
          <h2 id="sibs" className="text-[20px] font-semibold">{tr('More from the same office', 'అదే కార్యాలయం నుంచి మరిన్ని')}</h2>
          <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
            {sibs.map((s) => (
              <li key={s.slug}>
                <a href={href(`doc-${s.slug}`)} className="block h-full rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
                  <span className="line-clamp-3 text-[15px] font-medium leading-snug" lang="en">{s.title}</span>
                  {s.period ? <span className="mt-1 block text-[13px] text-muted-foreground">{s.period}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  )
}

export function SummitPage({ slug }: { slug: string }) {
  const { lang, tr } = useLang()
  const s = summitBySlug.get(slug)
  useTitle(s ? summitTitle(s) : null, lang)
  if (!s) return <Missing />
  return (
    <Page className="pt-10 md:pt-14">
      <a href={href('investments')} className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />{tr('Investments', 'పెట్టుబడులు')}
      </a>
      <PageHead eyebrow={summitName(s)[lang]} q={summitTitle(s)} lede={summitDescription(s)[lang]} />
      <Facts facts={summitFacts(s)} />
      <p className="mt-8 max-w-3xl rounded-xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed">{SUMMIT_CAVEAT[lang]}</p>
    </Page>
  )
}
