import { TooltipProvider } from '@/components/ui/tooltip'
import { LangProvider, useLang } from '@/lib/i18n'
import { CLAIM_Q, PAGE_WORDS, useTitle } from '@/lib/titles'
import { DesignProvider } from '@/lib/design'
import { useRoute } from '@/lib/route'
import { prerenderedHere } from '@/lib/prerendered'
import { AppShell } from '@/components/shell'
import * as React from 'react'

// Each page and its data arrive only when a reader opens it, so the first screen stays small.
// The home page is in the main file, because it is the first screen.
import Home from '@/pages/Home'
const lazy = <T extends object>(load: () => Promise<T>, pick: (m: T) => React.ComponentType<any>) => React.lazy(() => load().then((m) => ({ default: pick(m) })))
const Projects = lazy(() => import('@/pages/Projects'), (m) => m.default)
const ProjectPage = lazy(() => import('@/pages/Project'), (m) => m.default)
const Districts = lazy(() => import('@/pages/Districts'), (m) => m.default)
const DistrictPage = lazy(() => import('@/pages/Districts'), (m) => m.DistrictPage)
const MoneyPage = lazy(() => import('@/pages/Money'), (m) => m.default)
const Departments = lazy(() => import('@/pages/Money'), (m) => m.Departments)
const AllStates = lazy(() => import('@/pages/Money'), (m) => m.AllStates)
const StateFacts = lazy(() => import('@/pages/StateFacts'), (m) => m.default)
const Investments = lazy(() => import('@/pages/Investments'), (m) => m.default)
const Claims = lazy(() => import('@/pages/Claims'), (m) => m.default)
const Papers = lazy(() => import('@/pages/Papers'), (m) => m.default)
const Updates = lazy(() => import('@/pages/Papers'), (m) => m.Updates)
const Tenders = lazy(() => import('@/pages/Papers'), (m) => m.Tenders)
const Periods = lazy(() => import('@/pages/Periods'), (m) => m.default)
const Helplines = lazy(() => import('@/pages/Helplines'), (m) => m.default)
const About = lazy(() => import('@/pages/More'), (m) => m.About)
const Community = lazy(() => import('@/pages/More'), (m) => m.Community)
const Disclaimer = lazy(() => import('@/pages/More'), (m) => m.Disclaimer)
const Privacy = lazy(() => import('@/pages/More'), (m) => m.Privacy)
const Sources = lazy(() => import('@/pages/More'), (m) => m.Sources)
const Words = lazy(() => import('@/pages/More'), (m) => m.Words)
const DocPage = lazy(() => import('@/pages/Docs'), (m) => m.DocPage)
const SummitPage = lazy(() => import('@/pages/Docs'), (m) => m.SummitPage)
const Paper = lazy(() => import('@/pages/Paper'), (m) => m.default)
const NotFound = lazy(() => import('@/pages/More'), (m) => m.NotFound)
const CardsFeed = lazy(() => import('@/components/cards'), (m) => m.CardsFeed)

/** A quiet placeholder while a page's code arrives; it never flashes for a cached page. */
function Wait() {
  // On the first load, the facts the server wrote for this address stay up until the page arrives.
  const pre = prerenderedHere()
  if (pre) return <div aria-busy="true" dangerouslySetInnerHTML={{ __html: pre }} />
  return <div className="mx-auto max-w-6xl px-4 py-24 text-center text-[13.5px] text-muted-foreground" aria-busy="true">…</div>
}

function Router() {
  const r = useRoute()
  const { lang } = useLang()
  // Pages about one record (a project, a district, a district paper) set their own title from the record.
  useTitle(r.page === 'claim' ? CLAIM_Q[r.arg ?? ''] : PAGE_WORDS[r.page]?.title, lang)
  let body: React.ReactNode
  switch (r.page) {
    case 'cards': body = <CardsFeed />; break
    case 'projects': body = <Projects />; break
    case 'project': body = <ProjectPage id={Number(r.arg)} />; break
    case 'tenders': body = <Tenders />; break
    case 'districts': body = <Districts />; break
    case 'district': body = <DistrictPage slug={r.arg!} />; break
    case 'doc': body = <DocPage slug={r.arg!} />; break
    case 'summit': body = <SummitPage slug={r.arg!} />; break
    case 'paper': body = <Paper slug={r.arg!} />; break
    case 'money': body = <MoneyPage />; break
    case 'money-departments': body = <Departments />; break
    case 'money-states': body = <AllStates />; break
    case 'state-facts': body = <StateFacts />; break
    case 'investments': body = <Investments />; break
    case 'governments': body = <Periods />; break
    case 'claims': body = <Claims />; break
    case 'claim': body = <Claims focus={r.arg} />; break
    case 'papers': body = <Papers />; break
    case 'updates': body = <Updates />; break
    case 'helplines': body = <Helplines />; break
    case 'words': body = <Words />; break
    case 'community': body = <Community />; break
    case 'sources': body = <Sources />; break
    case 'about': body = <About />; break
    case 'disclaimer': body = <Disclaimer />; break
    case 'privacy': body = <Privacy />; break
    case 'notfound': body = <NotFound />; break
    default: body = <Home />
  }
  return <AppShell route={r}><React.Suspense fallback={<Wait />}>{body}</React.Suspense></AppShell>
}

export default function App() {
  return (
    <LangProvider>
      <DesignProvider>
        <TooltipProvider delayDuration={200}>
          <Router />
        </TooltipProvider>
      </DesignProvider>
    </LangProvider>
  )
}
