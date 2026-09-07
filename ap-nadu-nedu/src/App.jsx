import { lazy, Suspense } from 'react'
import ChunkReloadBoundary from './components/ChunkReloadBoundary'
import Analytics from './components/Analytics'
import Seo from './components/Seo'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './i18n'
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

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
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
            <Route path="/projects/tenure/:key" element={<TenureDive />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/investments/tenure/:key" element={<InvestmentTenureDive />} />
            <Route path="/news" element={<News />} />
            <Route path="/news/:id" element={<NewsArticle />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/tenders" element={<Tenders />} />
            <Route path="/finances" element={<Finances />} />
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
