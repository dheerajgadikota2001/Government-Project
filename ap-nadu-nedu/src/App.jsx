import { lazy, Suspense } from 'react'
import ChunkReloadBoundary from './components/ChunkReloadBoundary'
import Analytics from './components/Analytics'
import Seo from './components/Seo'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider, readStoredLang, writeStoredLang } from './i18n'
import { splitLangPath } from './lib/routes'
import { bounceTarget, switchTarget } from './lib/language'
import Header from './components/Layout/Header'
import Footer from './components/Layout/Footer'
import MitraFAB from './components/Layout/MitraFAB'
import BottomNav from './components/Layout/BottomNav'
import Home from './pages/Home'

// Every other page is its own chunk: a phone downloads the page it opens,
// not the whole site. Chunks are cached after first visit.
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Investments = lazy(() => import('./pages/Investments'))
const News = lazy(() => import('./pages/News'))
const Documents = lazy(() => import('./pages/Documents'))
const Tenders = lazy(() => import('./pages/Tenders'))
const Search = lazy(() => import('./pages/Search'))
const About = lazy(() => import('./pages/About'))
const Disclaimer = lazy(() => import('./pages/Disclaimer'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Finances = lazy(() => import('./pages/Finances'))
const Department = lazy(() => import('./pages/Department'))
const FactChecks = lazy(() => import('./pages/FactChecks'))
const FactCheckDetail = lazy(() => import('./pages/FactCheckDetail'))
const Governments = lazy(() => import('./pages/Governments'))
const SchoolEducation = lazy(() => import('./pages/SchoolEducation'))
const AllStates = lazy(() => import('./pages/AllStates'))
const DataSources = lazy(() => import('./pages/DataSources'))
const NewsArticle = lazy(() => import('./pages/NewsArticle'))
const TenureDive = lazy(() => import('./pages/TenureDive'))
const InvestmentTenureDive = lazy(() => import('./pages/InvestmentTenureDive'))
const Community = lazy(() => import('./pages/Community'))
const StateFacts = lazy(() => import('./pages/StateFacts'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Updates = lazy(() => import('./pages/Updates'))

// Route fallback: a quiet page-shaped placeholder instead of a blank screen.
function PageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 w-2/3 rounded-lg bg-surface-container-high mb-4" />
      <div className="h-4 w-full rounded bg-surface-container mb-2" />
      <div className="h-4 w-5/6 rounded bg-surface-container mb-8" />
      <div className="h-40 rounded-xl bg-surface-container mb-4" />
      <div className="h-40 rounded-xl bg-surface-container" />
    </div>
  )
}

/**
 * LANGUAGE LIVES IN THE URL
 *
 * Six languages were published and Google could see one. The chosen language
 * sat in localStorage, never touched the URL, and a crawler has no stored
 * preference, so every Telugu, Hindi, Urdu, Tamil and Odia page on the site
 * was unreachable from search. The translations were already written. They
 * just had no address.
 *
 * English keeps the bare path, because moving 717 URLs Google had already
 * indexed would cost real ranking for no gain. The other five take a prefix,
 * and that prefix becomes the router's basename:
 *
 *   /projects/613       English
 *   /te/projects/613    Telugu
 *
 * basename is doing the heavy lifting. Every <Link to="/projects"> across the
 * app resolves against it, so a Telugu reader following any link in the site
 * stays in Telugu without a single link having to be rewritten. useLocation()
 * reports the path without the prefix, so the route table, matchRoute and the
 * analytics patterns all keep working unchanged.
 *
 * It is read once, at module load, from the real address bar. A basename
 * cannot change after the router mounts, which is why switching language is a
 * full page load rather than a client-side navigation. That is the honest
 * behaviour anyway: a switch already fetches a 150-300 KB catalogue, swaps the
 * script font and can flip text direction for Urdu.
 */
const INITIAL_LANG = typeof window === 'undefined'
  ? 'en'
  : splitLangPath(window.location.pathname).lang

const BASENAME = INITIAL_LANG === 'en' ? '/' : `/${INITIAL_LANG}`

/**
 * Switch language: same page, different address, fresh load.
 *
 * The write comes first and that order is the whole fix. Persisting in an
 * effect instead meant picking English navigated to "/", storage still said
 * "te", the bounce below fired, and the reader was returned to Telugu.
 * English was the one language nobody could select.
 */
function goToLanguage(code) {
  if (typeof window === 'undefined') return
  writeStoredLang(code)
  window.location.assign(switchTarget({
    code,
    path: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }))
}

/**
 * A returning reader who chose Telugu should not land on English just because
 * they bookmarked the bare path.
 *
 * This only fires for a browser that has been here and chosen before, so
 * Googlebot, which has no storage, always sees English at an English address.
 * It runs before React mounts so there is no flash of the wrong language, and
 * it replaces the history entry rather than pushing one, so Back still leaves
 * the site.
 */
function bounceToStoredLanguage() {
  if (typeof window === 'undefined') return
  const target = bounceTarget({
    urlLang: INITIAL_LANG,
    storedLang: readStoredLang(),
    path: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  })
  if (target) window.location.replace(target)
}

bounceToStoredLanguage()

export default function App() {
  return (
    <LanguageProvider lang={INITIAL_LANG} onChangeLang={goToLanguage}>
      <BrowserRouter basename={BASENAME}>
      {/* Inside the router: it needs useLocation. Renders nothing. */}
      <Analytics />
      <Seo />
      <div className="bg-background text-on-background min-h-screen flex flex-col font-sans antialiased">
        <Header />
        <main className="flex-grow flex flex-col pb-16 lg:pb-0">
          {/* A lazily-loaded route whose chunk no longer exists takes the
              whole tree down with it — see ChunkReloadBoundary for why that
              happens on every deploy and why a reload is the cure. */}
          <ChunkReloadBoundary>
          <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/districts/:slug" element={<Projects />} />
            <Route path="/projects/tenure/:key" element={<TenureDive />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/investments/tenure/:key" element={<InvestmentTenureDive />} />
            <Route path="/news" element={<News />} />
            <Route path="/news/:id" element={<NewsArticle />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/tenders" element={<Tenders />} />
            <Route path="/finances" element={<Finances />} />
            <Route path="/finances/:question" element={<Finances />} />
            <Route path="/finances/departments/:slug" element={<Department />} />
            <Route path="/factcheck" element={<FactChecks />} />
            <Route path="/factcheck/:slug" element={<FactCheckDetail />} />
            <Route path="/governments" element={<Governments />} />
            <Route path="/school-education" element={<SchoolEducation />} />
            <Route path="/states" element={<AllStates />} />
            <Route path="/sources" element={<DataSources />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/search" element={<Search />} />
            <Route path="/about" element={<About />} />
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/community" element={<Community />} />
            <Route path="/state-facts" element={<StateFacts />} />
            <Route path="/contacts" element={<Contacts />} />
          </Routes>
          </Suspense>
          </ChunkReloadBoundary>
        </main>
        <Footer />
        <BottomNav />
        <MitraFAB />
      </div>
      </BrowserRouter>
    </LanguageProvider>
  )
}
