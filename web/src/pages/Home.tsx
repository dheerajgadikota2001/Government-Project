import * as React from 'react'
import { Building2, Droplets, HandCoins, Landmark, MapPin, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { useDesign } from '@/lib/design'
import { go, href } from '@/lib/route'
import { districts } from '@/lib/data'
import { Page, ShellContext } from '@/components/shell'
import { SearchTrigger } from '@/components/search'
import { ListenButton, Te } from '@/components/kit'
import { GridPattern } from '@/vendor/magicui/grid-pattern'
import { FadeIn as BlurFade } from '@/components/fade-in'
import type { CommandItem } from '@/vendor/kokonut/action-search-bar'
import { warmEngine } from '@/three/engine'
import { firstPosterBase, preloadFirstPoster } from '@/three/posters'
import { Poster } from '@/three/Poster'

// Home is the first screen, so this file holds only the hero: the title, the search box and
// the voice place. The big works (3D models and their data) and every section below the hero
// arrive as separate files after the hero has painted. On a slow phone the reader sees the
// title and can search while the rest is still on its way.
const BigWorks = React.lazy(() => import('@/components/BigWorks').then((m) => ({ default: m.BigWorks })))
const HomeBelow = React.lazy(() => import('./HomeBelow'))
// The dotted backdrop of the "search" hero design animates with the motion library; only that design loads it.
const DotPattern = React.lazy(() => import('@/vendor/magicui/dot-pattern').then((m) => ({ default: m.DotPattern })))
// Only the "ask" hero design uses this component; the default design never downloads it.
const ActionSearchBar = React.lazy(() => import('@/vendor/kokonut/action-search-bar'))

// Holds the big works' place with the first work's baked 3D picture, so the model is on screen from the
// moment the hero is, while the big works' own file is still on its way. Same shape as the real card.
function WorksPlaceholder() {
  const base = firstPosterBase()
  return (
    <div className="min-h-[460px] min-w-0 md:min-h-[540px]" aria-hidden>
      <div className="h-16" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_48px_-28px_rgba(0,0,0,.35)]">
        <div className="relative h-[260px] bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-muted),transparent_70%)] sm:h-[320px] lg:h-[340px]">
          {base ? <Poster base={base} eager className="absolute inset-0 size-full select-none object-cover" /> : null}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { d } = useDesign()
  // The big works open the page, so their picture and their engine start arriving right after the hero paints.
  React.useEffect(() => { preloadFirstPoster(); warmEngine() }, [])
  return (
    <div>
      {d.hero === 'ask' ? <HeroAsk /> : d.hero === 'search' ? <HeroSearch /> : <HeroRecord />}
      <Page className="space-y-20 py-12 md:space-y-28 md:py-16">
        {/* Holds the space the sections will take, so the page does not jump when they arrive. */}
        <React.Suspense fallback={<div className="min-h-[70vh]" aria-busy="true" />}>
          <HomeBelow />
        </React.Suspense>
      </Page>
    </div>
  )
}

/* ------------------------------------------------------------------ heroes */
function HeroText({ center }: { center?: boolean }) {
  const { lang } = useLang()
  return (
    <div className={cn('max-w-3xl', center && 'mx-auto text-center')}>
      <BlurFade delay={0.05}>
        <div className={cn('mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-[13px] text-muted-foreground backdrop-blur', center && 'mx-auto')}>
          <span className="size-1.5 rounded-full bg-foreground/70" />
          {lang === 'te' ? <Te>స్వతంత్రం. ఉచితం. లాగిన్ అవసరం లేదు.</Te> : 'Independent. Free. No login.'}
        </div>
      </BlurFade>
      <BlurFade delay={0.1}>
        <h1 className="text-[32px] font-semibold leading-[1.06] tracking-tight [text-wrap:balance] sm:text-[40px] md:text-[56px]">
          {lang === 'te' ? <Te>ఆంధ్రప్రదేశ్ ప్రభుత్వం ఏం నిర్మిస్తోందో చూడండి</Te> : 'Check what the Andhra Pradesh government is building'}
        </h1>
      </BlurFade>
      <BlurFade delay={0.15}>
        <p lang={lang === 'te' ? undefined : 'te'} className="mt-3 text-[17px] text-muted-foreground md:text-[19px]">
          {lang === 'te' ? 'Check what the Andhra Pradesh government is building' : 'ఆంధ్రప్రదేశ్ ప్రభుత్వం ఏం నిర్మిస్తోందో చూడండి'}
        </p>
        <p className="mt-5 text-[18px] leading-relaxed text-foreground/85 md:text-[20px]">{lang === 'te' ? <Te>ప్రభుత్వ పత్రాలను సేకరిస్తాం. అవి ఏం చెబుతున్నాయో చూపిస్తాం. ప్రతి అంకెను మీరే సరిచూసుకోవచ్చు.</Te> : 'We collect government papers. We show what they say. You can check every number.'}</p>
      </BlurFade>
    </div>
  )
}

const POPULAR = [[613, 'Polavaram', 'పోలవరం'], [4, 'Amaravati', 'అమరావతి'], [3, 'Visakhapatnam Metro', 'విశాఖ మెట్రో'], [2, 'Bhogapuram airport', 'భోగాపురం విమానాశ్రయం']] as const

function Popular({ center }: { center?: boolean }) {
  const { lang, tr } = useLang()
  return (
    <div className={cn('mt-4 flex flex-wrap gap-2', center && 'justify-center')}>
      <span className="py-1 text-[13px] text-muted-foreground">{tr('People look up:', 'ఎక్కువగా వెతికేవి:')}</span>
      {POPULAR.map(([id, en, te]) => <a key={id} href={href(`project-${id}`)} lang={lang === 'te' ? 'te' : undefined} className="rounded-full border border-border bg-card px-3 py-1 text-[13.5px] hover:border-foreground/30">{lang === 'te' ? te : en}</a>)}
    </div>
  )
}

function HeroRecord() {
  const { openSearch } = React.useContext(ShellContext)
  const { tr } = useLang()
  // Text, search and the voice place first; then the big works, one model at a time.
  return (
    <section className="relative overflow-hidden border-b border-border">
      <GridPattern width={44} height={44} className="stroke-foreground/[0.07] [mask-image:linear-gradient(to_bottom,#000,transparent_85%)]" />
      <Page wide className="relative grid items-start gap-8 py-8 md:py-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div className="lg:pt-8">
          <HeroText />
          <div className="mt-8"><SearchTrigger big onOpen={openSearch} /></div>
          <Popular />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ListenButton />
            <span className="text-[13px] text-muted-foreground">{tr('Ask aloud in Telugu or English. Coming with the voice assistant.', 'తెలుగులో లేదా ఇంగ్లీషులో అడగండి. వాయిస్ సహాయకుడితో వస్తుంది.')}</span>
          </div>
        </div>
        <React.Suspense fallback={<WorksPlaceholder />}>
          <BigWorks />
        </React.Suspense>
      </Page>
    </section>
  )
}

function HeroSearch() {
  const { openSearch } = React.useContext(ShellContext)
  return (
    <section className="relative overflow-hidden border-b border-border">
      <React.Suspense fallback={null}><DotPattern width={22} height={22} cr={1.1} className="text-foreground/[0.13] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_40%,transparent_100%)]" /></React.Suspense>
      <Page className="relative py-16 md:py-24">
        <HeroText center />
        <BlurFade delay={0.2}>
          <div className="mx-auto mt-9 max-w-2xl">
            <SearchTrigger big onOpen={openSearch} />
            <Popular center />
          </div>
        </BlurFade>
      </Page>
    </section>
  )
}

function HeroAsk() {
  const items: CommandItem[] = [
    { id: 'pol', label: 'Is Polavaram finished?', group: 'Projects', icon: <Droplets className="size-4" />, keywords: ['dam', 'polavaram', 'irrigation'] },
    { id: 'dist', label: 'What is being built in my district?', group: 'Projects', icon: <MapPin className="size-4" />, placeholder: 'Type your district…',
      children: districts.map((d) => ({ id: 'd-' + d.slug, label: d.name, keywords: [d.te], group: 'Districts' })) },
    { id: 'big', label: 'Which works have the largest published cost?', group: 'Projects', icon: <Building2 className="size-4" /> },
    { id: 'debt', label: 'How much does Andhra Pradesh owe?', group: 'Money', icon: <Landmark className="size-4" />, keywords: ['debt', 'loans'] },
    { id: 'dept', label: 'What did each department plan and spend?', group: 'Money', icon: <Landmark className="size-4" /> },
    { id: 'mou', label: 'Which company promises turned into investment?', group: 'Investment promises', icon: <HandCoins className="size-4" />, keywords: ['mou'] },
    { id: 'claim', label: 'Is what I heard true?', group: 'Check a claim', icon: <Scale className="size-4" /> },
  ]
  const onSelect = (it: CommandItem) => {
    const map: Record<string, string> = { pol: 'project-613', big: 'projects', debt: 'money', dept: 'money-departments', mou: 'investments', claim: 'claims' }
    if (it.id.startsWith('d-')) go('district-' + it.id.slice(2))
    else if (map[it.id]) go(map[it.id])
  }
  return (
    <section className="relative border-b border-border bg-paper">
      <Page className="grid items-start gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr]">
        <HeroText />
        <BlurFade delay={0.2}>
          <div className="min-h-[440px]">
            <div className="mb-2 px-1 text-[13px] font-medium text-muted-foreground">Ask a question, or pick one</div>
            <React.Suspense fallback={null}>
              <ActionSearchBar items={items} defaultRecent={['pol', 'debt']} defaultOpen onSelect={onSelect} placeholder="Ask about a work, a district or money…" label="Ask a question" className="w-full max-w-none" />
            </React.Suspense>
          </div>
        </BlurFade>
      </Page>
    </section>
  )
}

