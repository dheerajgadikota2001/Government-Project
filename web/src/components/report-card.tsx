import { ArrowRight } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { href } from '@/lib/route'
import { KindBadge } from '@/components/kit'
import { dateLong, dateTe } from '@/lib/format'
import type { ReportEntry } from '@/lib/reports'

// A report's card. It lives apart from the report page so the home page can show it without downloading the
// report's data: it reads only src/lib/reports.ts, whose card figures the summit test holds to the report's own.

/** On the Reports page and, the newest one, on the home page. */
export function ReportCard({ r, headingLevel = 2 }: { r: ReportEntry; headingLevel?: 2 | 3 }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.1em]">{tr('Report', 'నివేదిక')}</span>
          <span aria-hidden>·</span>
          <span>{tr(`Checked ${dateLong(r.checked)}`, `${dateTe(r.checked)}న సరిచూశాం`)}</span>
          <KindBadge kind="press" />
        </div>
        <div className="mt-2 text-[14px] text-muted-foreground">{te ? r.eyebrow.te : r.eyebrow.en}</div>
        <H className="mt-1 text-[24px] font-semibold leading-tight tracking-tight [text-wrap:balance] md:text-[30px]">
          <a href={href(`report-${r.slug}`)} className="hover:underline hover:underline-offset-4">{te ? r.title.te : r.title.en}</a>
        </H>
        <p className="mt-2 max-w-3xl text-[15.5px] leading-relaxed text-foreground/85">{te ? r.description.te : r.description.en}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          {r.card.map((f) => (
            <div key={f.report + f.group} className="min-w-0 rounded-xl border border-dashed border-foreground/30 bg-background px-4 py-3">
              <dd className="font-heading text-[22px] font-semibold leading-tight tnum md:text-[24px]" lang={te ? 'te' : undefined}>{te ? f.amount.te : f.amount.en}</dd>
              <dt className="mt-1 text-[13px] leading-snug text-muted-foreground">{te ? f.what.te : f.what.en}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{te ? r.missing.te : r.missing.en}</p>
        <a href={href(`report-${r.slug}`)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[14.5px] font-semibold text-background hover:bg-foreground/85">
          {tr('Read the full report', 'పూర్తి నివేదిక చదవండి')}<ArrowRight className="size-4" />
        </a>
      </div>
    </article>
  )
}
