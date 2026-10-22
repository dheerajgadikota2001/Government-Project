import * as React from 'react'
import { motion, useScroll, useTransform } from 'motion/react'

// A year-by-year list with a sticky year label and a rail that fills as the reader scrolls.
// Written for this site so the repo carries no third-party component source under a licence
// that forbids sharing it in a public repository. The rail is decoration only: every entry is
// plain content in reading order, so it works with motion turned off and with a screen reader.

export type YearEntry = { title: string; content: React.ReactNode }

export function YearTimeline({ data }: { data: YearEntry[] }) {
  const wrap = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start 15%', 'end 60%'] })
  const fill = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  return (
    <div ref={wrap} className="relative w-full pb-6">
      <div aria-hidden className="absolute bottom-0 left-[19px] top-0 w-[2px] bg-border md:left-[27px]">
        <motion.div style={{ height: fill }} className="w-full rounded-full bg-[var(--chart-1)]" />
      </div>
      <ol className="space-y-10 md:space-y-16">
        {data.map((item) => (
          <li key={item.title} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 md:grid-cols-[56px_200px_minmax(0,1fr)] md:gap-x-6">
            <span aria-hidden className="sticky top-32 mt-1 flex size-10 items-center justify-center self-start rounded-full bg-background md:size-14">
              <span className="size-3.5 rounded-full border-2 border-[var(--chart-1)] bg-background" />
            </span>
            <h3 className="sticky top-32 hidden self-start text-[40px] font-semibold leading-none text-muted-foreground tnum md:block">{item.title}</h3>
            <div className="min-w-0">
              <h3 className="mb-3 text-[24px] font-semibold text-muted-foreground tnum md:hidden">{item.title}</h3>
              {item.content}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
