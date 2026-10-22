import * as React from 'react'
import {
  type ColumnDef, columnSizingFeature, columnVisibilityFeature, createPaginatedRowModel, createSortedRowModel, flexRender, rowPaginationFeature,
  rowSortingFeature, sortFn_alphanumeric, sortFn_text, tableFeatures, useTable,
} from '@tanstack/react-table'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { useDesign } from '@/lib/design'
import { href, go } from '@/lib/route'
import { districtByName, districts, MERGED, meta, type Project } from '@/lib/data'
import { paperOf, placeText, projects, todayDistricts, shortFacts } from '@/lib/data-projects'
import { pol } from '@/lib/data-polavaram'
import { periods } from '@/lib/data-periods'
import { clean, crore, croreTe, dateLong, dateShort, dateTe, num, STATUS_WORDS, TYPE_WORDS } from '@/lib/format'
import { Page, PageHead } from '@/components/shell'
import { InShort } from '@/components/card-bits'
import { ChartFrame, Section, StatusWord } from '@/components/kit'
import { CountBars } from '@/graphics/Counts'
import { TendersList } from './Papers'
import { cmName, periodName } from './Periods'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePagination } from '@/vendor/origin/use-pagination'
import { useTokens } from '@/graphics/util'

const ALL = projects.filter((p) => !MERGED[p.id])
const STATUS_ORDER = ['under_construction', 'completed', 'suspended', 'approved', 'tendered', 'delayed']
const latestPol = pol.readings[pol.readings.length - 1]

export default function Projects() {
  const { d } = useDesign()
  const { lang, tr } = useLang()
  const [q, setQ] = React.useState('')
  const [dist, setDist] = React.useState('all')
  const [type, setType] = React.useState('all')
  const [dept, setDept] = React.useState('all')
  const [status, setStatus] = React.useState<string[]>([])
  const listRef = React.useRef<HTMLDivElement>(null)
  const rows = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ALL.filter((p) =>
      (!ql || p.t.toLowerCase().includes(ql) || (p.dept ?? '').toLowerCase().includes(ql)) &&
      (dist === 'all' || (dist === 'none' ? todayDistricts(p).length === 0 : todayDistricts(p).includes(dist))) &&
      (type === 'all' || p.ty === type) &&
      (dept === 'all' || p.dept === dept) &&
      (!status.length || status.includes(p.st)))
  }, [q, dist, type, dept, status])
  const types = React.useMemo(() => [...new Set(ALL.map((p) => p.ty))].sort((a, b) => (TYPE_WORDS[a]?.en ?? a).localeCompare(TYPE_WORDS[b]?.en ?? b)), [])
  const depts = React.useMemo(() => [...new Set(ALL.map((p) => p.dept).filter(Boolean) as string[])].sort(), [])
  const clear = () => { setQ(''); setDist('all'); setType('all'); setDept('all'); setStatus([]) }
  const filtered = q || dist !== 'all' || type !== 'all' || dept !== 'all' || status.length > 0
  const toList = () => setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  const sf = shortFacts.projects()
  const byStatus = STATUS_ORDER.map((s) => ({ s, n: projects.filter((p) => p.st === s).length })).filter((x) => x.n)
  const byType = [...new Set(projects.map((p) => p.ty))].map((t) => ({ t, n: projects.filter((p) => p.ty === t).length })).sort((a, b) => b.n - a.n)
  const P = periods.periods as { from: string; to: string | null; cm: string; projects_announced: number }[]

  return (
    <Page className="pt-10 md:pt-14">
      <PageHead eyebrow={tr('Projects', 'పనులు')} q={{ en: 'What is being built, and is it finished?', te: 'ఏం నిర్మిస్తున్నారు, పూర్తయిందా?' }}
        lede={tr(`${num(projects.length, 0)} records, each from a government paper. Polavaram, recorded twice, is shown once, so ${num(ALL.length, 0)} works are listed. Most records are town works from the AMRUT list; the largest works often name no district.`,
          `${num(projects.length, 0)} రికార్డులు, ప్రతిదీ ఒక ప్రభుత్వ పత్రం నుంచి. రెండుసార్లు నమోదైన పోలవరం ఒక్కసారే కనిపిస్తుంది; అందుకే ${num(ALL.length, 0)} పనులు జాబితాలో ఉన్నాయి. ఎక్కువ రికార్డులు అమృత్ జాబితాలోని పట్టణ పనులు; పెద్ద పనులకు చాలాసార్లు జిల్లా పేరు ఉండదు.`)} />

      <InShort className="mt-8" items={[
        { value: num(sf.records, 0), label: tr('project records in our register', 'మా రిజిస్టర్‌లో ప్రాజెక్టు రికార్డులు'), paper: tr(`Counted ${dateShort(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) },
        { value: num(sf.done, 0), label: tr('completed, by their newest paper', 'పూర్తయినవి, తాజా పత్రం ప్రకారం'), paper: tr(`Counted ${dateShort(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) },
        { value: num(sf.building, 0), label: tr('still under construction', 'ఇంకా నిర్మాణంలో'), paper: tr(`Counted ${dateShort(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) },
        { value: `${num(latestPol.pct)}%`, label: tr('of Polavaram’s physical work done', 'పోలవరం భౌతిక పనిలో పూర్తయినది'), paper: <span lang="en">{latestPol.paper}</span>, href: 'project-613' },
      ]} />

      <Section className="mt-14" eyebrow={tr('The register at a glance', 'రిజిస్టర్ ఒక చూపులో')} title={tr('Counts of our records, with no costs added up', 'మా రికార్డుల లెక్కలు; ఏ ఖర్చూ కలపలేదు')}
        lede={tr('Each bar opens the list below, filtered.', 'ప్రతి బార్ కింది జాబితాను ఆ వడపోతతో తెరుస్తుంది.')}>
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame q={{ en: 'How many works are finished, and how many are still being built?', te: 'ఎన్ని పనులు పూర్తయ్యాయి, ఎన్ని ఇంకా నిర్మాణంలో ఉన్నాయి?' }}
            answer={tr(<><b>{num(sf.building, 0)}</b> of the {num(sf.records, 0)} records are under construction and <b>{sf.done}</b> are completed, by the status their newest paper prints.</>,
              <>{num(sf.records, 0)} రికార్డుల్లో <b>{num(sf.building, 0)}</b> నిర్మాణంలో, <b>{sf.done}</b> పూర్తయినట్లు, వాటి తాజా పత్రం ప్రకారం.</>)}
            how={tr(`Each bar is one status. A longer bar means more records. All six bars share one scale, 0 to ${num(byStatus[0].n, 0)}.`, `ప్రతి బార్ ఒక స్థితి. పొడవైన బార్ అంటే ఎక్కువ రికార్డులు. ఆరు బార్లూ ఒకే కొలతపై, 0 నుంచి ${num(byStatus[0].n, 0)}.`)}
            limits={tr('whether a completed work is in use, or how well it was built. A status is what the newest paper says, on its date.', 'పూర్తయిన పని వాడుకలో ఉందో లేదో, ఎంత బాగా కట్టారో. స్థితి అంటే తాజా పత్రం దాని తేదీన చెప్పింది.')}
            sources={[{ label: tr('MoSPI flash reports, the AMRUT 2.0 list, government orders and PIB releases', 'MoSPI ఫ్లాష్ నివేదికలు, అమృత్ 2.0 జాబితా, ప్రభుత్వ ఉత్తర్వులు, PIB ప్రకటనలు'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="10rem" rows={byStatus.map(({ s, n }) => ({ key: s, n, label: <StatusWord status={s} />, active: status.length === 1 && status[0] === s, onClick: () => { setStatus(status.length === 1 && status[0] === s ? [] : [s]); toList() } }))} />
          </ChartFrame>
          <ChartFrame q={{ en: 'What kinds of works are these?', te: 'ఇవి ఏ రకమైన పనులు?' }}
            answer={tr(<>Most are town works from the AMRUT list ({byType[0].n}), then {(TYPE_WORDS[byType[1].t]?.en ?? '').toLowerCase()} ({byType[1].n}) and {(TYPE_WORDS[byType[2].t]?.en ?? '').toLowerCase()} ({byType[2].n}).</>,
              <>ఎక్కువగా అమృత్ జాబితాలోని పట్టణ పనులు ({byType[0].n}), తర్వాత {TYPE_WORDS[byType[1].t]?.te} ({byType[1].n}), {TYPE_WORDS[byType[2].t]?.te} ({byType[2].n}).</>)}
            how={tr('Each bar is one kind of work, on one scale. A small drain and a large dam each count as one record.', 'ప్రతి బార్ ఒక రకం పని, ఒకే కొలతపై. చిన్న కాలువ, పెద్ద ఆనకట్ట రెండూ ఒక్కో రికార్డే.')}
            limits={tr('the size or cost of the works: one count per record, whatever its size.', 'పనుల పరిమాణం గానీ ఖర్చు గానీ: పరిమాణం ఏదైనా ఒక్కో రికార్డుకు ఒక లెక్క.')}
            sources={[{ label: tr('Our register', 'మా రిజిస్టర్'), date: tr(`counted ${dateLong(meta.asof)}`, `${dateTe(meta.asof)}న లెక్కించాం`) }]}>
            <CountBars labelWidth="10rem" color="var(--ink2)" rows={byType.map(({ t, n }) => ({ key: t, n, label: <span lang={lang === 'te' ? 'te' : undefined}>{lang === 'te' ? TYPE_WORDS[t]?.te ?? t : TYPE_WORDS[t]?.en ?? t}</span>, active: type === t, onClick: () => { setType(type === t ? 'all' : t); toList() } }))} />
          </ChartFrame>
          <ChartFrame className="lg:col-span-2" q={{ en: 'When were these works announced?', te: 'ఈ పనులు ఎప్పుడు ప్రకటించారు?' }}
            how={tr('Each card is one government period, named by its dates and Chief Minister. The number counts records whose announcement date falls inside that period.', 'ప్రతి కార్డు ఒక ప్రభుత్వ కాలం, దాని తేదీలు, ముఖ్యమంత్రి పేరుతో. సంఖ్య ఆ కాలంలో ప్రకటన తేదీ ఉన్న రికార్డులు.')}
            note={tr(`Most records, ${num(periods.unattributed, 0)}, carry no date that places them in a period, and ${periods.pre_division} are from before the state was divided. We never guess a period. These counts are the register’s own.`, `ఎక్కువ రికార్డులకు, ${num(periods.unattributed, 0)}, ఏ కాలంలో పెట్టాలో చెప్పే తేదీ లేదు; ${periods.pre_division} విభజనకు ముందువి. కాలాన్ని ఊహించం. ఈ లెక్కలు రిజిస్టర్‌వే.`)}
            limits={tr('who built or finished a work. A work announced in one period is often built in the next, and we never add up costs by period.', 'పనిని ఎవరు కట్టారో, పూర్తి చేశారో. ఒక కాలంలో ప్రకటించిన పని తరచూ తర్వాతి కాలంలో కడతారు; కాలం వారీగా ఖర్చులను ఎప్పుడూ కలపం.')}
            sources={[{ label: tr('The announcement date printed in each record’s own paper', 'ప్రతి రికార్డు సొంత పత్రంలో ముద్రించిన ప్రకటన తేదీ') }]}>
            <div className="grid gap-3 sm:grid-cols-3">
              {P.map((p, i) => (
                <a key={p.from} href={href('governments')} className="rounded-xl border border-border bg-background p-4 hover:border-foreground/30">
                  <div className={cn('h-1.5 w-12 rounded-full', ['bg-foreground/[0.12]', 'bg-foreground/[0.3]', 'bg-foreground/[0.6]'][i])} aria-hidden />
                  <div className="mt-2.5 text-[14.5px] font-semibold" lang={lang === 'te' ? 'te' : undefined}>{periodName(i, lang)}</div>
                  <div className="text-[13px] text-muted-foreground">{tr('Chief Minister', 'ముఖ్యమంత్రి')} <span lang={lang === 'te' ? 'te' : 'en'}>{cmName(p.cm, lang)}</span></div>
                  <div className="mt-3 font-heading text-[30px] font-semibold leading-none tnum">{p.projects_announced}</div>
                  <div className="mt-1 text-[13px] text-muted-foreground">{tr('records announced in this period', 'ఈ కాలంలో ప్రకటించిన రికార్డులు')}</div>
                </a>
              ))}
            </div>
          </ChartFrame>
        </div>
      </Section>

      <div ref={listRef} className="sticky z-20 mt-14 -mx-4 scroll-mt-[var(--header-h)] border-y border-border bg-background/92 px-4 py-3 backdrop-blur-md" style={{ top: 'var(--header-h)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Find a work: name, department or agency', 'పని వెతకండి: పేరు, శాఖ లేదా సంస్థ')} className="h-10 pl-9" aria-label={tr('Find a work', 'పని వెతకండి')} />
          </div>
          <Select value={dist} onValueChange={setDist}>
            <SelectTrigger className="h-10 w-[190px]" aria-label="District"><SelectValue placeholder="District" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All 28 districts', 'అన్ని 28 జిల్లాలు')}</SelectItem>
              <SelectItem value="none">{tr('District still being checked', 'జిల్లా ఇంకా సరిచూస్తున్నాం')}</SelectItem>
              {districts.map((x) => <SelectItem key={x.slug} value={x.name}>{lang === 'te' && x.te ? `${x.te} (${x.name})` : x.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 w-[170px]" aria-label="Type of work"><SelectValue placeholder="Type of work" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All kinds', 'అన్ని రకాలు')}</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{lang === 'te' ? TYPE_WORDS[t]?.te ?? t : TYPE_WORDS[t]?.en ?? t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-10 w-[200px]" aria-label="Department"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">{tr('All departments', 'అన్ని శాఖలు')}</SelectItem>
              {depts.map((x) => <SelectItem key={x} value={x}>{clean(x)}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtered ? <Button variant="ghost" size="sm" onClick={clear} className="gap-1"><X className="size-4" />{tr('Clear', 'తీసేయండి')}</Button> : null}
          <span className="ml-auto text-[13.5px] text-muted-foreground tnum">{tr(`${num(rows.length, 0)} of ${num(ALL.length, 0)}`, `${num(ALL.length, 0)}లో ${num(rows.length, 0)}`)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => {
            const on = status.includes(s)
            return (
              <button key={s} type="button" onClick={() => setStatus((x) => (on ? x.filter((y) => y !== s) : [...x, s]))} aria-pressed={on}
                className={cn('rounded-full border px-3 py-1 text-[13px]', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/30')}>
                {lang === 'te' ? STATUS_WORDS[s].te : STATUS_WORDS[s].en}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6">{d.projectsList === 'cards' ? <CardList rows={rows} /> : <DataTable rows={rows} />}</div>

      <Section className="mt-24" eyebrow={tr('Tenders', 'టెండర్లు')} title={tr('What is being bought now', 'ఇప్పుడు కొంటున్నవి')} te={tr('ఇప్పుడు కొంటున్నవి', undefined)}
        lede={tr('From the Amaravati capital authority (AP CRDA) only, the one tender source we read today. Dates in India time.', 'అమరావతి రాజధాని ప్రాధికార సంస్థ (ఏపీ సీఆర్డీఏ) నుంచి మాత్రమే; ఈ రోజు మేము చదివే ఒకే టెండర్ మూలం. తేదీలు భారత కాలమానంలో.')}>
        <TendersList limit={6} />
        <a href={href('tenders')} className="mt-4 inline-flex text-[15px] font-medium underline underline-offset-4">{tr('Every open notice, explained', 'తెరిచి ఉన్న ప్రతి నోటీసు, వివరంగా')}</a>
      </Section>
    </Page>
  )
}

/** One square per record, grouped by status: a count you can see, with no sums. */
export function StatusUnits({ className, onPick, active }: { className?: string; onPick: (s: string) => void; active: string[] }) {
  const C = useTokens()
  const groups = STATUS_ORDER.map((s) => ({ s, rows: ALL.filter((p) => p.st === s) })).filter((g) => g.rows.length)
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5 md:p-6', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[17px] font-semibold">Every record, by status</div>
        <div className="text-[12.5px] text-muted-foreground">One square for each record. Counted from our register, updated {dateShort(meta.register_updated)}.</div>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {groups.map((g) => (
          <button key={g.s} type="button" onClick={() => onPick(g.s)} className={cn('flex flex-col justify-start self-start rounded-lg p-2 text-left transition-colors hover:bg-accent', active.includes(g.s) && 'bg-accent')}>
            <div className="mb-2 flex w-full items-baseline justify-between gap-2"><StatusWord status={g.s} /><span className="font-heading text-[20px] font-semibold tnum">{num(g.rows.length, 0)}</span></div>
            <div className="flex flex-wrap gap-[3px]">
              {g.rows.map((p) => (
                <span key={p.id} className="size-[7px] rounded-[1.5px]" style={{ background: g.s === 'completed' ? C.fg : g.s === 'under_construction' ? C.c1 : 'transparent', border: g.s === 'completed' || g.s === 'under_construction' ? undefined : `1.4px solid ${C.ink2}` }} />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------- Origin UI table, TanStack v9 */
const features = tableFeatures({
  columnSizingFeature, columnVisibilityFeature, rowPaginationFeature, paginatedRowModel: createPaginatedRowModel(), rowSortingFeature,
  sortedRowModel: createSortedRowModel(), sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

const makeColumns = (lang: 'en' | 'te'): ColumnDef<typeof features, Project>[] => {
  const tr = (en: string, te: string) => (lang === 'te' ? te : en)
  return [
    { accessorKey: 't', header: tr('Work', 'పని'), size: 380, sortFn: 'text',
      cell: ({ row }) => (
        <a href={href('project-' + row.original.id)} className="block min-w-0 py-1">
          <span className="line-clamp-2 font-medium leading-snug hover:underline" lang="en">{row.original.id === 613 ? 'Polavaram Irrigation Project' : clean(row.original.t)}</span>
          <span className="text-[12.5px] text-muted-foreground">{lang === 'te' ? TYPE_WORDS[row.original.ty]?.te : TYPE_WORDS[row.original.ty]?.en}</span>
        </a>
      ) },
    { accessorKey: 'd', header: tr('District', 'జిల్లా'), size: 170, sortFn: 'text',
      cell: ({ row }) => todayDistricts(row.original).length ? placeText(row.original, lang) : <span className="text-muted-foreground">{placeText(row.original, lang)}</span> },
    { accessorKey: 'st', header: tr('Status', 'స్థితి'), size: 150, cell: ({ row }) => <StatusWord status={row.original.st} /> },
    { accessorKey: 'c', header: tr('Cost printed', 'ముద్రించిన వ్యయం'), size: 160, sortFn: 'alphanumeric', sortUndefined: 'last',
      cell: ({ row }) => row.original.c != null ? <span className="tnum">{lang === 'te' ? croreTe(row.original.c) : crore(row.original.c)}</span> : <span className="text-muted-foreground">{tr('Not printed', 'ముద్రించలేదు')}</span> },
    { accessorKey: 'l', header: tr('Latest paper', 'తాజా పత్రం'), size: 170, sortFn: 'text',
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild><span className="text-[13.5px]">{row.original.l ? (lang === 'te' ? dateTe(row.original.l) : dateShort(row.original.l)) : tr('Date not recorded', 'తేదీ నమోదు కాలేదు')}</span></TooltipTrigger>
          <TooltipContent>{paperOf(row.original)}</TooltipContent>
        </Tooltip>
      ) },
  ]
}

function DataTable({ rows }: { rows: Project[] }) {
  const { lang, tr } = useLang()
  const columns = React.useMemo(() => makeColumns(lang), [lang])
  const table = useTable(
    { columns, data: rows, enableSortingRemoval: false, features, initialState: { pagination: { pageIndex: 0, pageSize: 20 }, sorting: [{ desc: true, id: 'c' }] } },
    (state) => ({ pagination: state.pagination, sorting: state.sorting }),
  )
  React.useEffect(() => { table.setPageIndex(0) }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({ currentPage: table.state.pagination.pageIndex + 1, paginationItemsToDisplay: 5, totalPages: table.getPageCount() })
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className="min-w-[860px] table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow className="hover:bg-transparent" key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead className="h-11" key={h.id} style={{ width: `${h.getSize()}px` }}>
                    {h.column.getCanSort() ? (
                      <div className="flex h-full cursor-pointer select-none items-center justify-between gap-2" onClick={h.column.getToggleSortingHandler()} tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.column.getToggleSortingHandler()?.(e) } }}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {{ asc: <ChevronUpIcon className="shrink-0 opacity-60" size={16} />, desc: <ChevronDownIcon className="shrink-0 opacity-60" size={16} /> }[h.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) go('project-' + row.original.id) }}>
                {row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="whitespace-normal align-top">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>
            )) : <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">{tr('No work matches. Try another district or clear the filters.', 'ఏ పనీ సరిపోలలేదు. వేరే జిల్లా ఎంచుకోండి లేదా వడపోతలు తీసేయండి.')}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col">
        <p aria-live="polite" className="flex-1 whitespace-nowrap text-sm text-muted-foreground">Page <span className="text-foreground">{table.state.pagination.pageIndex + 1}</span> of <span className="text-foreground">{Math.max(1, table.getPageCount())}</span></p>
        <Pagination className="grow">
          <PaginationContent>
            <PaginationItem><Button aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="icon" variant="outline"><ChevronLeftIcon size={16} /></Button></PaginationItem>
            {showLeftEllipsis && <PaginationItem><PaginationEllipsis /></PaginationItem>}
            {pages.map((pg) => {
              const on = pg === table.state.pagination.pageIndex + 1
              return <PaginationItem key={pg}><Button aria-current={on ? 'page' : undefined} onClick={() => table.setPageIndex(pg - 1)} size="icon" variant={on ? 'outline' : 'ghost'}>{pg}</Button></PaginationItem>
            })}
            {showRightEllipsis && <PaginationItem><PaginationEllipsis /></PaginationItem>}
            <PaginationItem><Button aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="icon" variant="outline"><ChevronRightIcon size={16} /></Button></PaginationItem>
          </PaginationContent>
        </Pagination>
        <div className="flex flex-1 justify-end">
          <Select value={String(table.state.pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="w-fit whitespace-nowrap" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} a page</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function CardList({ rows }: { rows: Project[] }) {
  const { lang, tr } = useLang()
  const te = lang === 'te'
  const [n, setN] = React.useState(24)
  const sorted = React.useMemo(() => [...rows].sort((a, b) => (b.c ?? -1) - (a.c ?? -1)), [rows])
  React.useEffect(() => setN(24), [rows])
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.slice(0, n).map((p) => (
          <a key={p.id} href={href('project-' + p.id)} className="group flex flex-col rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
            <div className="flex items-start justify-between gap-2"><StatusWord status={p.st} /><span className="text-[12px] text-muted-foreground">{te ? TYPE_WORDS[p.ty]?.te : TYPE_WORDS[p.ty]?.en}</span></div>
            <div className="mt-2 line-clamp-3 text-[15.5px] font-medium leading-snug group-hover:underline" lang="en">{p.id === 613 ? 'Polavaram Irrigation Project' : clean(p.t)}</div>
            <div className="mt-auto pt-3 text-[13px] text-muted-foreground">
              <div>{placeText(p, lang)}</div>
              <div className="mt-0.5"><span className="font-medium text-foreground tnum">{p.c != null ? (te ? croreTe(p.c) : crore(p.c)) : tr('No cost printed', 'వ్యయం ముద్రించలేదు')}</span>{p.l ? ` · ${te ? dateTe(p.l) : dateShort(p.l)}` : ''}</div>
            </div>
          </a>
        ))}
      </div>
      {n < sorted.length ? <div className="mt-6 text-center"><Button variant="outline" onClick={() => setN((x) => x + 24)}>{tr(`Show more (${num(sorted.length - n, 0)} left)`, `మరిన్ని చూపండి (ఇంకా ${num(sorted.length - n, 0)})`)}</Button></div> : null}
    </div>
  )
}
