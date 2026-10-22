/**
 * Write a real HTML file for every URL, after the bundle is built.
 *
 * WHY THIS EXISTS
 *
 * The body of every page on this site was 46 bytes: one empty div and a
 * script tag. Google is fine with that, because Google runs JavaScript.
 * Almost nothing else does.
 *
 *   GPTBot, ClaudeBot, PerplexityBot and CCBot do not execute JavaScript.
 *   CCBot is Common Crawl, which is what most models are trained on.
 *   Bing barely renders it, and Bing is what Copilot and DuckDuckGo read.
 *   WhatsApp, Facebook and X link previews do not render it at all.
 *
 * So an answer engine asking "how much has been spent on Polavaram" found a
 * site with no text on it, and every link shared into a WhatsApp group showed
 * the same generic homepage description whichever page it pointed at. On a
 * platform whose whole value is a cited number, that is the number failing to
 * reach the places people now ask.
 *
 * This is the fix, and it is deliberately not a headless browser screenshotting
 * the React tree. It writes the page on purpose: the heading, the sentence, the
 * figures, the source link, the neighbours. A machine reading it gets the facts
 * and the citation in the first 500 words, which is what makes a page quotable
 * rather than merely indexed. React hydrates over it for people.
 *
 * Districts are covered now. They used to live at /projects?district=Guntur,
 * and a query string is not a file path, so there was nowhere to write them:
 * 26 pages visible only to a crawler that runs JavaScript. They have real
 * paths now, /districts/guntur, and are written like everything else.
 *
 * SAFETY
 *
 * It refuses to write anything if the register is unreachable or answers with
 * nothing, for the same reason the sitemap generator does: publishing 4000
 * empty pages is far worse than publishing none.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const BUILD = resolve(here, '../dist')

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const API = flag('--api') || 'https://apfactcheck.dheeco.com/api/v1'
// --out lets the test drive the real script against a stub register without
// overwriting a real build. A prerenderer whose only proof is "it ran in
// production once" is not tested, it is hoped for.
const DIST = flag('--out') ? resolve(process.cwd(), flag('--out')) : BUILD
const TEMPLATE = join(BUILD, 'index.html')
const LIMIT = Number(flag('--limit') || 0)          // for a fast smoke run
const CONCURRENCY = Number(flag('--concurrency') || 8)
// --no-cards, or SHARE_CARDS=0, skips drawing the share cards. The tests use
// it: each of them runs this script, and starting Chromium a dozen times to
// test page markup would triple the suite for nothing. One test draws them.
const CARDS = !args.includes('--no-cards') && process.env.SHARE_CARDS !== '0'
// Where the hand-written project stories are read from. Only reviewed stories
// live directly in this folder; drafts sit in drafts/ below it and are never
// read here. --stories lets the tests hand the script a folder of their own.
const STORIES_DIR = flag('--stories') ? resolve(process.cwd(), flag('--stories')) : resolve(here, '../src/data/stories')

const {
  SITE_NAME, SITE_ORIGIN, STATIC_ROUTES, LANG_CODES, INDEXED_LANGS, localizedPath, districtPath,
} = await import('../src/lib/routes.js')
const {
  canonicalFor, alternatesFor, robotsFor, seoForRoute, seoForFinanceQuestion, seoForProject, seoForDistrict,
  seoForFactCheck, seoForDepartment, ogLocale, siteCardPath, SHARE_CARD_SIZE,
} = await import('../src/lib/seo.js')
const { projectCard, districtCard, sectionCard, homeCard, cardAlt } = await import('../src/lib/shareCard.js')
const { relatedGroups, neighbours } = await import('../src/lib/related.js')
const { renderCards, renderPictures } = await import('./share-cards.mjs')
const { localiseVars } = await import('../src/lib/placeNames.js')
const { schemaFor, projectTrail } = await import('../src/lib/schema.js')
const { canonicalIdFor, isDuplicate, membersOf, groupFor } =
  await import('../src/lib/sameWork.js')
const { croreAmount } = await import('../src/lib/money.js')
const { displayTitle, splitSuspects } = await import('../src/lib/projectTitle.js')

/**
 * An amount with its unit, for a table cell rather than a sentence.
 *
 * The rupee sign is added here because, unlike the summary strings, a cell
 * has no locale sentence around it to carry one. Rounding still comes from
 * money.js, so a figure in this table and the same figure in the paragraph
 * above it cannot round differently.
 */
const croreLabel = (v, t) =>
  (v == null ? null : `\u20B9${croreAmount(v, fmtNum)} ${t('unit.croreWord')}`)
const { projectSummary } = await import('../src/lib/projectSummary.js')
const {
  readingsOf, storyFacts, storyTools, keyDates: storyKeyDates, automaticStory, projectQuestions,
} = await import('../src/lib/projectStory.js')
const { validateStory, resolveStory, keptQuestions } = await import('../src/lib/storyData.js')
const { automaticSteps, stepsPicture } = await import('../src/lib/projectSteps.js')
const { summarySource, portalName } = await import('../src/lib/sourceDocs.js')
const { districtSummary } = await import('../src/lib/districtSummary.js')
const { departmentPath, departmentSummary, departmentFacts } = await import('../src/lib/departmentSummary.js')
const { FACT_CHECKS, factCheckPath, STATUS_RATING, STATUSES } = await import('../src/lib/factcheck.js')
const { FINANCE_QUESTIONS, financeQuestionPath } = await import('../src/lib/financeQuestions.js')

// ---------------------------------------------------------------- i18n

const CATALOGUES = Object.fromEntries(LANG_CODES.map(code => [
  code,
  JSON.parse(readFileSync(resolve(here, `../src/i18n/locales/${code}.json`), 'utf8')),
]))

/** The same lookup and interpolation the app uses, with the same fallback. */
function translator(code) {
  const cat = CATALOGUES[code]
  const en = CATALOGUES.en
  const look = (c, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), c)
  return (key, vars) => {
    const s = look(cat, key) ?? look(en, key)
    if (typeof s !== 'string') return key.split('.').pop()
    // Same rule as the app's translator: a {district} slot is filled with the
    // district's name in this language (src/lib/placeNames.js).
    const v = localiseVars(vars, code)
    return v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s
  }
}

const MONTH_KEYS = ['', 'month.jan', 'month.feb', 'month.mar', 'month.apr', 'month.may',
  'month.jun', 'month.jul', 'month.aug', 'month.sep', 'month.oct', 'month.nov', 'month.dec']

const fmtNum = n => Number(n).toLocaleString('en-IN')
const monthFmt = t => iso => {
  if (!iso) return null
  const [y, m] = String(iso).split('-')
  if (!m) return y
  return t('date.monthYear', { month: t(MONTH_KEYS[Number(m)]), year: y })
}
/** "12 June 2024", in each language's own order. Same rule as makeDateFmt in the app. */
const dayFmt = t => iso => {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!m) return y
  if (!d) return t('date.monthYear', { month: t(MONTH_KEYS[Number(m)]), year: y })
  return t('date.full', { day: Number(d), month: t(MONTH_KEYS[Number(m)]), year: y })
}

// ---------------------------------------------------------------- fetching

async function get(path) {
  // The API sits behind a CDN that keeps a copy for five minutes and serves it
  // stale for an hour after that. Right after a backend deploy that copy still
  // has the old shape, and this script would read it and refuse to publish.
  // A parameter the API ignores makes every request its own cache key.
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${sep}fresh=${Date.now()}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json()
}

/** Walk the register, asserting the count so a silent truncation cannot pass. */
async function allProjects() {
  const items = []
  let expected = null
  for (let page = 1; page <= 200; page++) {
    // full=true, because this endpoint is where every static page gets its
    // facts. Without it the response omits the description, the project code,
    // the implementing agency and the source document link, and the page
    // renders nothing for all of them while looking like the record is empty.
    const r = await get(`/projects/?page=${page}&page_size=100&full=true`)
    expected = r.total ?? expected
    for (const item of r.items || []) if (item?.id != null) items.push(item)
    if (!r.has_next) break
  }
  if (expected != null && items.length !== expected) {
    throw new Error(`walked ${items.length} projects but the register reports ${expected}`)
  }
  return items
}

/** Run tasks with a small pool: 673 sequential round trips is a slow build. */
async function pool(items, size, worker) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await worker(items[i], i)
    }
  }))
  return out
}

// ---------------------------------------------------------------- html

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const clip = (s, max) => {
  const text = String(s || '').replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * The link graph, written into every page.
 *
 * WHY THIS EXISTS
 *
 * Search Console, 16 September 2026: 169 pages indexed out of 4,620 submitted,
 * and 4,379 of them sitting under "Discovered, currently not indexed". That
 * reason means Google found the URL in the sitemap and chose not to spend a
 * crawl on it.
 *
 * The cause was measurable and it was in this file. Every page written here
 * carried exactly one link, always to /projects, and /projects linked only to
 * itself. Following links from the homepage reached two pages out of 4,620.
 * Every project, district, department, fact check and finance question was an
 * orphan, known to Google only from the sitemap and linked from nothing. A URL
 * with no inbound link is the definition of low crawl priority, so Google
 * queued them and moved on.
 *
 * A sitemap is a suggestion. Links are the argument. So every page now carries
 * the section navigation the React header already renders, every hub page
 * lists its own children the way the React page does, and the six language
 * addresses of a page point at each other. Nothing here is shown to a crawler
 * that a reader does not also get, which is the line that separates internal
 * linking from cloaking.
 */

// A language's own name is not a translated string, it is a fixed name, so it
// lives here rather than in a catalogue where five of six copies would be wrong.
const LANG_NAME = {
  en: 'English', te: 'తెలుగు', hi: 'हिन्दी', ur: 'اردو', ta: 'தமிழ்', or: 'ଓଡ଼ିଆ',
}

// The header's own labels, so the crawler reads the same words a reader does.
// A route with no entry falls back to the part of its title before the pipe.
const NAV_KEY = {
  '/': 'nav.home',
  '/projects': 'nav.projects',
  '/finances': 'nav.finances',
  '/factcheck': 'factcheck.allChecks',
  '/investments': 'nav.investments',
  '/governments': 'nav.governments',
  '/documents': 'nav.govDocuments',
  '/tenders': 'nav.tenders',
  '/news': 'nav.news',
  '/school-education': 'nav.schoolEducation',
  '/state-facts': 'nav.stateFacts',
  '/contacts': 'nav.contacts',
  '/states': 'nav.allStates',
  '/sources': 'nav.dataSources',
  '/community': 'nav.community',
}

const linkTo = (lang, path, label) =>
  `<li><a href="${esc(localizedPath(lang, path))}">${esc(label)}</a></li>`

const list = (items, heading) =>
  (items.length ? `${heading ? `<h2>${esc(heading)}</h2>` : ''}<ul>${items.join('')}</ul>` : '')

/** Every section, on every page. This is what makes the site crawlable at all. */
function siteNav({ t, lang, current }) {
  const items = STATIC_ROUTES
    .filter(r => r.pattern !== current)
    .map(r => linkTo(lang, r.pattern, NAV_KEY[r.pattern]
      ? t(NAV_KEY[r.pattern])
      : clip(String(r.title).split('|')[0], 60)))
  return `<nav><ul>${items.join('')}</ul></nav>`
}

/**
 * The same page in the other indexed languages, as real links.
 *
 * Indexed ones only. This markup is what a crawler follows; a reader never
 * sees it, because the app replaces #root on mount and brings its own
 * switcher, which navigates by script rather than by link. So linking a
 * noindex language page here would spend crawl time on a page that has
 * asked not to be indexed, 526 projects at a time. A language page still
 * links back to English, which is the direction worth following.
 */
function langNav({ path, lang }) {
  // lang, deliberately not hreflang. The head declares the hreflang set, when
  // there is one, exactly once. On an anchor lang is the attribute that tells
  // a screen reader to switch voice.
  // And only where that language's page is itself indexed: a Telugu
  // department page is noindex, so the English one does not link it.
  const items = INDEXED_LANGS.filter(c => c !== lang && robotsFor(localizedPath(c, path)) === null).map(c =>
    `<li><a href="${esc(localizedPath(c, path))}" lang="${esc(c)}">${esc(LANG_NAME[c] || c)}</a></li>`)
  return items.length ? `<ul>${items.join('')}</ul>` : ''
}

/** The tail every page carries: the other languages, then every section. */
function footer({ t, lang, path, current }) {
  return [langNav({ path, lang }), siteNav({ t, lang, current })].filter(Boolean).join('\n      ')
}

// ---------------------------------------------------------------- child lists
//
// A hub page that names its children is two things at once: a page worth
// indexing, and the only route by which those children get crawled.

/**
 * A district link, but only where the district has a page.
 *
 * The register carries the district name the source document used, and some
 * sources write Anantapur for Ananthapuramu, Nellore for Sri Potti Sriramulu
 * Nellore, Tirupathi for Tirupati. districtPath folds all of those now, so the
 * seven spellings that used to produce 42 links to pages that do not exist
 * resolve to the district's real address instead.
 *
 * This guard stays because the register is fed by scrapers. The next new
 * spelling, typo or renamed district will arrive with nothing behind it, and a
 * crawl budget spent on 404s is worse than no link. The build names whatever
 * it could not match rather than hiding it.
 */
const unmatchedDistricts = new Set()
function districtHref(name, known) {
  if (!name) return null
  const path = districtPath(name)
  if (known.has(path)) return path
  unmatchedDistricts.add(name)
  return null
}

const districtLinks = ({ districtRows, t, lang }) => list(
  districtRows.filter(r => r?.district).map(r =>
    linkTo(lang, districtPath(r.district), t('projects.district.heading', { district: r.district }))),
  t('projects.filters.district'))

const departmentLinks = ({ departments, t, lang }) => list(
  departments.filter(d => d?.department && departmentFacts(d).latest).map(d =>
    linkTo(lang, departmentPath(d.department), d.department)),
  t('finances.dept.allDepartments'))

const questionLinks = ({ t, lang }) => list(
  FINANCE_QUESTIONS.map(q => linkTo(lang, financeQuestionPath(q.slug), t(q.questionKey))),
  t('finances.menu.title'))

const checkLinks = ({ t, lang }) => list(
  FACT_CHECKS.map(c => linkTo(lang, factCheckPath(c.slug), c.question)),
  t('factcheck.allChecks'))

/**
 * Every project, under the district it belongs to.
 *
 * 673 links on one page is a lot to read and exactly right to crawl: it is the
 * register, and the register is the list. Grouping by district gives the crawl
 * a structure to follow and gives a reader the heading they were looking for.
 */
function projectLinks({ projects, t, lang, knownDistricts, districtOf = p => p.district }) {
  const byDistrict = new Map()
  // One entry per real-world work. The register listed Polavaram twice, under
  // two names, at two costs, and a reader scanning for it had no way to know
  // which one to open.
  for (const p of projects.filter(p => !isDuplicate(p.id))) {
    const key = districtOf(p) || ''
    if (!byDistrict.has(key)) byDistrict.set(key, [])
    byDistrict.get(key).push(p)
  }
  const out = []
  for (const key of [...byDistrict.keys()].sort()) {
    const href = districtHref(key, knownDistricts)
    const label = key ? esc(t('projects.district.heading', { district: key })) : ''
    const heading = !key ? ''
      : href ? `<h2><a href="${esc(localizedPath(lang, href))}">${label}</a></h2>`
      : `<h2>${label}</h2>`
    out.push(heading + `<ul>${byDistrict.get(key)
      .map(p => linkTo(lang, `/projects/${p.id}`, displayTitle(p.title))).join('')}</ul>`)
  }
  return out.join('\n      ')
}

/**
 * @param canonicalPath  the path this page should hand its ranking to, when
 *                       that is not its own. Used by the second record of a
 *                       project two government sources both carry: the page is
 *                       still written and still reachable, and it tells the
 *                       crawler which of the two to rank rather than competing
 *                       with itself.
 *
 * The hreflang set, when there is one, is deliberately NOT redirected with
 * it. hreflang describes this page in its languages, and pointing it at
 * another project's addresses would claim a different record's translation
 * is this one's.
 *
 * Head rules live in seo.js (alternatesFor, robotsFor) so the prerendered
 * head and the one the app writes after load cannot disagree.
 */
function headTags({ lang, path, title, description, schema, canonicalPath, image }) {
  const canonical = canonicalFor(canonicalPath || path)
  const pairs = alternatesFor(path)
  const alternates = pairs
    .map(([code, href]) => `<link rel="alternate" hreflang="${esc(code)}" href="${esc(href)}" />`)
    .join('\n    ')
  // The other languages this page is published in, as Open Graph knows them,
  // so Facebook can pick the Telugu preview for a Telugu reader.
  const otherLocales = pairs.map(([code]) => code).filter(code => code !== 'x-default' && code !== lang)
  const robots = robotsFor(path)
  const src = image?.src ? SITE_ORIGIN + image.src : null

  return [
    robots ? `<meta name="robots" content="${esc(robots)}" />` : '',
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:locale" content="${esc(ogLocale(lang))}" />`,
    ...otherLocales.map(code => `<meta property="og:locale:alternate" content="${esc(ogLocale(code))}" />`),
    src ? `<meta property="og:image" content="${esc(src)}" />` : '',
    src ? `<meta property="og:image:type" content="image/jpeg" />` : '',
    src ? `<meta property="og:image:width" content="${SHARE_CARD_SIZE.width}" />` : '',
    src ? `<meta property="og:image:height" content="${SHARE_CARD_SIZE.height}" />` : '',
    src ? `<meta property="og:image:alt" content="${esc(image.alt)}" />` : '',
    // The large card, not the thumbnail: the figure is the reason to share.
    `<meta name="twitter:card" content="${src ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    src ? `<meta name="twitter:image" content="${esc(src)}" />` : '',
    src ? `<meta name="twitter:image:alt" content="${esc(image.alt)}" />` : '',
    alternates,
    `<script type="application/ld+json" id="site-schema">${JSON.stringify(schema)}</script>`,
  ].filter(Boolean).join('\n    ')
}

/**
 * The questions a person types, and this page's answer to each one.
 *
 * WHY QUESTIONS
 *
 * Nobody searches "Polavaram Irrigation Project (Phase 1)". They search "how
 * much was sanctioned for Polavaram" and "when will Polavaram be finished".
 * The page held both answers and phrased neither as the question, so a search
 * that this page could answer better than anyone matched a rival page that
 * merely asked it.
 *
 * Nothing new is invented here. Every answer is one of the sentences in
 * projectSummary.js or projectStory.js, built from the same field by the same
 * helper, so the paragraph at the top and the section below it cannot
 * disagree. A question whose field is empty is not asked at all: 673 pages
 * carrying an identical "no figure is on record" paragraph would be duplicate
 * boilerplate, which is the thin-content problem this work exists to fix, not
 * a fix for it.
 *
 * @param questions  projectQuestions(), plus a hand-written story's own
 * @param source     the document the figures come from, for the link under
 *                   "where do these figures come from"
 * @returns [{ q, a, extra }]  q and a are plain text and go into the FAQ
 *                             schema; extra is optional markup that does not.
 */
function projectSections({ project, questions, source, t, lang, knownDistricts }) {
  // The questions and their answers are built in src/lib/projectStory.js,
  // where the React page builds them too, so the page a reader sees and the
  // page a crawler reads ask the same questions and give the same answers.
  // Only the links are added here, because only this page is plain HTML.
  const districtTarget = districtHref(project.district, knownDistricts)
  return questions.map(({ key, q, a }) => {
    let extra = ''
    // The district link lives inside its own answer rather than loose at the
    // foot of the page. A reader who has just been told which district this
    // is in is the reader most likely to want the other projects in it, and a
    // crawler reads the link in the context of the words around it.
    if (key === 'where' && districtTarget) {
      extra = `<p><a href="${esc(localizedPath(lang, districtTarget))}">` +
        `${esc(t('projectDetail.related.seeDistrict', { district: project.district }))}</a></p>`
    }
    if (key === 'source' && source?.href) {
      extra = `<p><a href="${esc(source.href)}" rel="nofollow">${esc(source.label || t('projectDetail.primarySource'))}</a></p>`
    }
    return { q, a, extra }
  })
}

/**
 * Every government record of this work, side by side.
 *
 * Not a merge. Nothing here picks a winning figure or averages two of them:
 * both numbers are published by the government and the gap between them is the
 * fact. Each row names its own document, so a reader can check either one and
 * disagree with us.
 */
function sourcesTable({ siblings, observations, t, lang }) {
  if (siblings.length < 2) return ''
  const money = v => (v == null ? '' : croreLabel(v, t))
  const fm = monthFmt(t)

  const head = [t('projectDetail.sources.column'), t('projectDetail.tiles.estimatedCost'),
    t('projectDetail.tiles.physicalProgress'), t('projectDetail.tiles.expectedCompletion')]

  const rows = siblings.map((p, i) => {
    const obs = observations[i]
    const label = obs?.source_label || portalName(p) || ''
    const href = obs?.source_url || p.source_url
    const cell = href
      ? `<a href="${esc(href)}" rel="nofollow">${esc(label)}</a>`
      : esc(label)
    return `<tr><td>${cell}</td><td>${esc(money(p.estimated_cost_crore))}</td>` +
      `<td>${esc(p.completion_percentage == null ? '' : `${p.completion_percentage}%`)}</td>` +
      `<td>${esc(p.expected_completion ? fm(p.expected_completion) : '')}</td></tr>`
  }).join('')

  return [
    `<h2>${esc(t('projectDetail.sources.heading'))}</h2>`,
    `<p>${esc(t('projectDetail.sources.note'))}</p>`,
    `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows}</tbody></table>`,
  ].join('\n      ')
}

/**
 * The body a machine reads.
 *
 * Ordered the way a citation is built: what it is, the number, when it was
 * published, who published it, then where to check. An answer engine quoting
 * this page has everything it needs before it stops reading.
 *
 * The lead paragraph is the whole summary and the sections below restate parts
 * of it. That repetition is deliberate and it is how an answer page reads: the
 * paragraph is what a snippet quotes, the headings are what a query matches.
 */
/**
 * "Other projects in Eluru district", as the React page shows it
 * (components/RelatedProjects.jsx), written into the HTML.
 *
 * Without it a project page linked to its district and to the register and
 * to nothing else, so 728 project pages were reachable only through two hub
 * pages. With it every project page links six neighbours, and the register
 * becomes a web a crawler can walk rather than a star it has to keep
 * returning to the centre of.
 */
function neighbourBlock({ near, project, t, lang }) {
  if (!near?.items?.length) return ''
  const heading = near.by === 'district'
    ? t('projectDetail.related.inDistrict', { district: near.district })
    : t('projectDetail.related.byType', { type: t(`projects.type.${project.project_type}`) })
  return [
    `<h2>${esc(heading)}</h2>`,
    `<p>${esc(t('projectDetail.related.note'))}</p>`,
    `<ul>${near.items.map(p => linkTo(lang, `/projects/${p.id}`, displayTitle(p.title))).join('')}</ul>`,
  ].join('\n      ')
}

/** A source under a paragraph, as a link, with what kind of document it is. */
function citeHtml(sources, t) {
  if (!sources?.length) return ''
  const kind = s => (s.tier === 'company' ? t('projectDetail.story.tier.company')
    : s.tier === 'lender' ? t('projectDetail.story.tier.lender')
      : s.tier && s.tier !== 'gov' ? t('projectDetail.story.tier.other') : null)
  const one = s => {
    const label = kind(s) ? `${s.name} (${kind(s)})` : s.name
    return s.url ? `<a href="${esc(s.url)}" rel="nofollow">${esc(label)}</a>` : esc(label)
  }
  return ` <cite>${sources.map(one).join(', ')}</cite>`
}

function blockHtml(b, t) {
  if (b.type === 'list') {
    const items = b.items.map(it => {
      const doc = it.doc
        ? `${doc0(it.doc, t)}: `
        : ''
      return `<li>${doc}${esc(it.text)}</li>`
    }).join('')
    return `${b.intro ? `<p>${esc(b.intro)}</p>` : ''}<ul>${items}</ul>`
  }
  return `<p>${esc(b.text)}${citeHtml(b.sources, t)}</p>`
}

/** A reading's document at the head of its line in "Year by year". */
function doc0(doc, t) {
  const kind = doc.tier && doc.tier !== 'gov'
    ? ` (${t(`projectDetail.story.tier.${doc.tier === 'company' ? 'company' : doc.tier === 'lender' ? 'lender' : 'other'}`)})`
    : ''
  return doc.url
    ? `<a href="${esc(doc.url)}" rel="nofollow">${esc(doc.name)}</a>${esc(kind)}`
    : `${esc(doc.name)}${esc(kind)}`
}

/**
 * The story, as a crawler reads it: the key dates, then every chapter with
 * its paragraphs open. A reader gets the same chapters folded; a search
 * engine indexes text inside a closed section anyway, so there is nothing to
 * gain from hiding it here.
 */
function storyBlock({ story, t }) {
  if (!story) return ''
  const out = []
  // The story in steps holds the key dates and names each one's paper, so a
  // page with a road does not repeat them, the same as the live page.
  if (story.road) {
    const tier = x => (x === 'company' ? 'company' : x === 'lender' ? 'lender' : x && x !== 'gov' ? 'other' : null)
    out.push(`<h2>${esc(story.road.title)}</h2>`)
    out.push(`<p>${esc(story.road.sub)}</p>`)
    out.push(`<ol>${story.road.steps.map(s => {
      const kind = tier(s.paper?.tier)
      const paper = s.paper
        ? ` ${esc(t('projectDetail.story.steps.paper'))}: ${s.paper.url ? `<a href="${esc(s.paper.url)}" rel="noopener">${esc(s.paper.name)}</a>` : esc(s.paper.name)}` +
          (kind ? ` (${esc(t(`projectDetail.story.tier.${kind}`))})` : '')
        : ''
      // An automatic step is a phrase ("80.19% built") and a hand-written one
      // a sentence; each ends with exactly one full stop here.
      const said = `${s.text}${s.note ? ` (${s.note})` : ''}`
      return `<li>${esc(s.when)}: ${esc(said)}${/[.?!।]$/.test(said) ? '' : '.'}${paper}</li>`
    }).join('')}</ol>`)
  } else if (story.keyDates?.length) {
    out.push(`<h2>${esc(t('projectDetail.story.keyDates.title'))}</h2>`)
    out.push(`<ul>${story.keyDates.map(k =>
      `<li>${esc(k.label)}: ${esc(k.value)}${k.detail ? ` (${esc(k.detail)})` : ''}</li>`).join('')}</ul>`)
  }
  if (story.chapters?.length) {
    out.push(`<h2>${esc(t('projectDetail.story.heading'))}</h2>`)
    if (story.note) out.push(`<p>${esc(story.note)}</p>`)
    for (const c of story.chapters) {
      out.push(`<h3>${esc(c.title)}</h3>`)
      for (const b of c.blocks) out.push(blockHtml(b, t))
    }
  }
  return out.join('\n      ')
}

function projectBody({ project, observation, t, lang, path, knownDistricts, sections, sourcesBlock = '', near = null, story = null }) {
  const summary = projectSummary({ project, observation, t, fmtNum, fmtMonth: monthFmt(t) })

  return [
    // The name is the register's, in English, until a checked translation
    // exists. lang="en" tells a screen reader to switch voice and tells a
    // crawler which words on a Telugu page are not Telugu.
    `<h1${lang === 'en' ? '' : ' lang="en"'}>${esc(displayTitle(project.title))}</h1>`,
    summary.length ? `<p>${esc(summary.join(' '))}</p>` : '',
    storyBlock({ story, t }),
    ...sections.map(({ q, a, extra }) =>
      `<h2>${esc(q)}</h2>\n      <p>${esc(a)}</p>${extra ? `\n      ${extra}` : ''}`),
    sourcesBlock,
    neighbourBlock({ near, project, t, lang }),
    `<p><a href="${esc(localizedPath(lang, '/projects'))}">${esc(t('projectDetail.related.seeRegister'))}</a></p>`,
    footer({ t, lang, path }),
  ].filter(Boolean).join('\n      ')
}

function districtBody({ district, total, row, projects, t, lang, path,
  districtOf = p => p.district, canonicalProject = p => p }) {
  const lead = districtSummary({ district, total, row, t, fmtNum })
  // A district page that does not name its own projects is a dead end: those
  // projects then have no inbound link except the register, and the whole
  // point of giving districts a real address was that people search for them.
  const home = districtPath(district)
  // Matched on the address, not on the string. An exact comparison is what
  // kept 42 projects off the district page they belong to: the register spells
  // one of them "Tirupathi" and this page is headed "Tirupati", and those are
  // two correct names for one district.
  //
  // districtOf, not p.district, for the same reason one page down: the record
  // that names the district is not always the record that carries the work.
  const seen = new Set()
  const mine = []
  for (const p of projects || []) {
    const where = districtOf(p)
    if (!where || districtPath(where) !== home) continue
    const owner = canonicalProject(p)
    if (seen.has(owner.id)) continue
    seen.add(owner.id)
    mine.push(owner)
  }
  return [
    `<h1>${esc(t('projects.district.heading', { district }))}</h1>`,
    lead.length ? `<p>${esc(lead.join(' '))}</p>` : '',
    list(mine.map(p => linkTo(lang, `/projects/${p.id}`, displayTitle(p.title)))),
    `<p><a href="${esc(localizedPath(lang, '/projects'))}">${esc(t('projectDetail.related.seeRegister'))}</a></p>`,
    footer({ t, lang, path }),
  ].filter(Boolean).join('\n      ')
}

function departmentBody({ department, t, lang, path }) {
  const lead = departmentSummary({ department, t, fmtNum })
  const facts = departmentFacts(department)
  const rows = (department.rows || [])
    .filter(r => r.total_crore != null)
    .sort((a, b) => Number(String(b.year).slice(0, 4)) - Number(String(a.year).slice(0, 4)))
    .slice(0, 16)

  const stageWord = { BE: 'finances.dept.stageBE', RE: 'finances.dept.stageRE', Actual: 'finances.dept.stageActual' }

  return [
    `<h1>${esc(t('finances.dept.heading', { department: department.department }))}</h1>`,
    lead.length ? `<p>${esc(lead.join(' '))}</p>` : '',
    rows.length
      ? `<h2>${esc(t('finances.dept.tableTitle'))}</h2><dl>` + rows.map(r =>
          `<dt>${esc(r.year)} ${esc(t(stageWord[r.stage] || stageWord.BE))}</dt>` +
          `<dd>₹${esc(fmtNum(Math.round(r.total_crore)))} ${esc(t('unit.croreWord'))}</dd>`).join('') + '</dl>'
      : '',
    facts.gaps.length
      ? `<p>${esc(facts.gaps.map(g =>
          t('finances.dept.gap', {
            year: g.year, budgeted: fmtNum(Math.round(g.budgeted)),
            spent: fmtNum(Math.round(g.spent)), gap: fmtNum(Math.round(g.gap)),
            unit: t('unit.croreWord'),
          })).slice(0, 3).join(' '))}</p>`
      : '',
    `<p><a href="${esc(localizedPath(lang, '/finances'))}">${esc(t('finances.dept.allDepartments'))}</a></p>`,
    footer({ t, lang, path }),
  ].filter(Boolean).join('\n      ')
}

function factCheckBody({ check, t, lang, path }) {
  const money = v => `₹${fmtNum(Math.round(v))} ${t('unit.croreWord')}`
  const claims = (check.claims || []).map(c =>
    `<h2>${esc(t('factcheck.claimHeading'))}</h2>` +
    `<p>${esc(t('factcheck.saidBy', { who: c.made_by, about: c.about }))}, ${esc(c.date)}. ` +
    `<a href="${esc(c.document_url)}" rel="nofollow">${esc(c.document)}</a></p>` +
    `<blockquote>${esc(c.quote)}</blockquote>` +
    `<p>${esc(t('factcheck.figure'))}: ${esc(money(c.figure))}. ` +
    `<strong>${esc(t(`factcheck.status.${c.status}`))}</strong>. ${esc(c.note)}</p>`).join('')
  const record = (check.record || []).map(r =>
    `<dt>${esc(r.source)}: ${esc(r.measure)}</dt>` +
    `<dd>${esc(money(r.figure))} (<a href="${esc(r.document_url)}" rel="nofollow">${esc(r.document)}</a>)</dd>`).join('')
  return [
    `<h1>${esc(check.question)}</h1>`,
    `<p>${esc(check.summary)}</p>`,
    claims,
    `<h2>${esc(t('factcheck.recordHeading'))}</h2><dl>${record}</dl>`,
    `<h2>${esc(t('factcheck.differenceHeading'))}</h2><p>${esc(check.explanation)}</p>`,
    `<p><a href="${esc(localizedPath(lang, '/factcheck'))}">${esc(t('factcheck.allChecks'))}</a></p>`,
    footer({ t, lang, path }),
  ].join('\n      ')
}

/**
 * One finances question, open on its own address.
 *
 * The charts and tables under a question are drawn from the API in the
 * browser; a crawler without JavaScript gets the question, the one-paragraph
 * answer where the catalogue has one, and links to the other eight. That is
 * the same text a reader sees first, and it is enough for the address to mean
 * something in a search result rather than "State finances" nine times over.
 */
function financeQuestionBody({ question, t, lang, path }) {
  const others = FINANCE_QUESTIONS.filter(q => q.slug !== question.slug)
  return [
    `<h1>${esc(t('finances.title'))}</h1>`,
    `<h2>${esc(t(question.questionKey))}</h2>`,
    question.answerKey ? `<p>${esc(t(question.answerKey))}</p>` : '',
    `<p>${esc(t('finances.menu.hint'))}</p>`,
    '<ul>',
    ...others.map(q => `<li><a href="${esc(localizedPath(lang, financeQuestionPath(q.slug)))}">${esc(t(q.questionKey))}</a></li>`),
    '</ul>',
    `<p><a href="${esc(localizedPath(lang, '/finances'))}">${esc(t('finances.title'))}</a></p>`,
    footer({ t, lang, path }),
  ].filter(Boolean).join('\n      ')
}

/**
 * A section page, with the section in it.
 *
 * This used to be a heading, a sentence and one link to /projects, on all
 * nineteen static routes including /projects itself. That is both halves of
 * the Search Console report in one function: nothing to crawl onward to, which
 * produced 4,379 "discovered, not indexed", and nothing worth indexing, which
 * produced the 41 that were crawled and passed over.
 */
/**
 * The MoU register as a crawler reads it: a headline that carries its own
 * composition, then every commitment with its amount, its status and who
 * says so. Same catalogue keys as the cards, so the two cannot disagree.
 */
function mouRegister({ mous, mouStats, t, lang, knownDistricts = new Set() }) {
  if (!mous.length) return ''
  const label = v => String(v || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  const tier = m => t(`investments.card.tier.${m.source_tier || 'unlabelled'}`)
  const status = m => (!m.source_tier || m.source_tier === 'government')
    ? label(m.status)
    : t('investments.card.statusBy', { status: label(m.status), source: t(`investments.card.saysWho.${m.source_tier}`) })
  const fmtMonth = monthFmt(t)
  const out = []

  if (mouStats?.total_investment_crore != null) {
    const by = mouStats.by_source_tier || {}
    out.push(`<p>${esc(t('investments.register.summary', {
      total: croreLabel(mouStats.total_investment_crore, t),
      n: mouStats.total_mous,
      gov: by.government?.share_pct ?? 0, company: by.company?.share_pct ?? 0, press: by.press?.share_pct ?? 0,
    }))}</p>`)
    const nl = mouStats.not_live
    if (nl && (nl.cancelled?.mous || nl.stalled?.mous)) {
      out.push(`<p>${esc(t('investments.provenance.notLive', {
        cancelled: nl.cancelled?.mous || 0, cancelledCr: croreAmount(nl.cancelled?.investment_crore || 0, fmtNum),
        stalled: nl.stalled?.mous || 0, stalledCr: croreAmount(nl.stalled?.investment_crore || 0, fmtNum),
      }))}</p>`)
    }
  }

  const cols = ['company', 'sector', 'district', 'amount', 'status', 'source', 'signed']
  // The district, linked to its page when it has one. A commitment is made
  // somewhere, and "Google data centre Visakhapatnam" is a search that should
  // be able to reach the Visakhapatnam page from here.
  const districtCell = m => {
    if (!m.district) return ''
    const href = districtHref(m.district, knownDistricts)
    return href ? `<a href="${esc(localizedPath(lang, href))}">${esc(m.district)}</a>` : esc(m.district)
  }
  out.push(`<h2>${esc(t('investments.register.heading'))}</h2>`)
  out.push('<table>',
    `<thead><tr>${cols.map(c => `<th>${esc(t(`investments.register.col.${c}`))}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...mous.map(m => '<tr>' + [
      esc(m.company_name),
      esc(label(m.sector)),
      districtCell(m),
      esc(m.investment_crore == null ? t('investments.register.amountUnknown') : croreLabel(m.investment_crore, t)),
      esc(status(m)),
      esc(tier(m)),
      esc(m.signed_date ? fmtMonth(String(m.signed_date).slice(0, 7)) : t('investments.card.undated')),
    ].map(v => `<td>${v}</td>`).join('') + '</tr>'),
    '</tbody></table>')
  return out.join('\n      ')
}

function routeBody({ route, seo, t, lang, path, ctx }) {
  const children = {
    '/': () => districtLinks(ctx),
    '/projects': () => [districtLinks(ctx), projectLinks(ctx)].join('\n      '),
    '/finances': () => [questionLinks(ctx), departmentLinks(ctx)].join('\n      '),
    '/factcheck': () => checkLinks(ctx),
    '/investments': () => mouRegister(ctx),
  }[route.pattern]

  // The same groups components/RelatedLinks.jsx shows a reader.
  const written = path => !path.startsWith('/districts/') || ctx.knownDistricts.has(path)
  const related = relatedGroups(route.pattern, t, { keep: written })
    .map(g => list(g.links.map(l => linkTo(lang, l.path, l.label)), g.heading))
    .join('\n      ')

  return [
    // The page's heading, not its <title>: the site name belongs in the tab.
    `<h1>${esc(seo.heading || seo.title)}</h1>`,
    `<p>${esc(seo.description)}</p>`,
    children ? children() : '',
    related,
    footer({ t, lang, path, current: route.pattern }),
  ].filter(Boolean).join('\n      ')
}

const MARK_OPEN = '<!--prerendered-->'
const MARK_CLOSE = '<!--/prerendered-->'

/**
 * Undo a previous pass before doing this one.
 *
 * The homepage's own output is written to dist/index.html, which is the file
 * this script reads as its template. So the moment anyone runs the prerender
 * twice without rebuilding in between, the template already carries a
 * canonical, a hreflang set, a JSON-LD block and the homepage's body, and
 * every page written in that second pass gets two of each. Two canonicals is
 * worse than none: Google picks one and it may not be the page's own.
 *
 * Nothing about that failure is visible. The build succeeds, the site looks
 * right, and the pages quietly argue with themselves. So the render is made
 * idempotent rather than merely careful about call order.
 */
function stripPrevious(html) {
  return html
    // Empties #root whether or not the previous pass left a marker, and
    // whether the module script sits after it or in the head, which is where
    // Vite actually puts it. Two earlier versions of this line failed
    // silently: one keyed on the marker, so a template from an older build was
    // left untouched; the next anchored on a <script> that is not there, so it
    // matched nothing. Both produced pages whose head was perfect and whose
    // body was the homepage, on every URL.
    .replace(/<div id="root">[\s\S]*?<\/div>(?=\s*(?:<script|<\/body>))/, '<div id="root"></div>')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '')
    .replace(/\s*<meta property="og:url"[^>]*>/g, '')
    .replace(/\s*<meta property="og:locale(?::alternate)?"[^>]*>/g, '')
    .replace(/\s*<meta property="og:image(?::[a-z_]+)?"[^>]*>/g, '')
    .replace(/\s*<meta name="twitter:(?:card|image|image:alt)"[^>]*>/g, '')
    .replace(/\s*<meta name="robots"[^>]*>/g, '')
    .replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '')
    .replace(/\s*<script type="application\/ld\+json" id="site-schema">[\s\S]*?<\/script>/g, '')
}

function render(template, { lang, dir, path, title, description, schema, body, canonicalPath, image }) {
  let html = stripPrevious(template)

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${esc(lang)}" dir="${esc(dir)}"`)
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(description)}" />`)

  // Generic og:title and og:description ship in the template. Every page had
  // the homepage's, which is why a shared project link previewed as the site
  // rather than as the project. Strip them; the per-page ones go in below.
  html = html.replace(/<meta\s+property="og:title"[\s\S]*?\/>\s*/g, '')
  html = html.replace(/<meta\s+property="og:description"[\s\S]*?\/>\s*/g, '')
  html = html.replace(/<meta\s+name="twitter:title"[\s\S]*?\/>\s*/g, '')
  html = html.replace(/<meta\s+name="twitter:description"[\s\S]*?\/>\s*/g, '')

  html = html.replace('</head>', `  ${headTags({ lang, path, title, description, schema, canonicalPath, image })}\n  </head>`)

  // Inside #root on purpose: createRoot empties the container when the app
  // mounts, so a reader never sees both. A crawler that stops before running
  // scripts sees it all.
  //
  // data-prerender is what the inline stylesheet in index.html hooks onto. The
  // reader looks at this markup for as long as the 420 KB bundle takes to
  // arrive, and until that attribute existed they looked at it with no styles
  // at all: a bare column of links that read as a broken page. The attribute
  // lives only here, so those rules can never reach React's DOM afterwards.
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${MARK_OPEN}<div data-prerender>\n      ${body}\n    </div>${MARK_CLOSE}</div>`)

  return html
}

// ---------------------------------------------------------------- run

if (process.env.SKIP_PRERENDER === '1') {
  console.log('prerender: skipped (SKIP_PRERENDER=1)')
  console.log('the built site will be 46 bytes to anything that does not run JavaScript')
  process.exit(0)
}

if (!existsSync(TEMPLATE)) {
  console.error(`\nNo dist/index.html. Run "npm run build" before prerendering.\n`)
  process.exit(1)
}
const template = readFileSync(TEMPLATE, 'utf8')

let projects = []
try {
  projects = await allProjects()
} catch (err) {
  console.error(`\nCould not read the register at ${API}`)
  console.error(`  ${err.message}`)
  console.error('\nRefusing to prerender. dist/ is left exactly as the build made it,')
  console.error('which is a working app, rather than thousands of empty pages.\n')
  process.exit(1)
}
if (!projects.length) {
  console.error('\nThe register returned no projects. Refusing to prerender.\n')
  process.exit(1)
}
if (LIMIT) projects = projects.slice(0, LIMIT)

let departments = []
try {
  const r = await get('/finances/departments')
  departments = r?.departments || []
} catch {
  departments = []   // forty fewer pages, never forty wrong ones
}

/**
 * Every district that gets a page, and its count where the register knows one.
 *
 * Two endpoints, on purpose. /projects/insights returns only districts that
 * currently hold a project, and that is what the counts come from. But the
 * sitemap is built from /projects/filters, which returns all 26. For months
 * the two disagreed by one: Alluri Sitharama Raju has no tracked project yet,
 * so it was published in the sitemap and never prerendered, and the six URLs
 * behind it served the empty app shell to every crawler that does not run
 * JavaScript.
 *
 * Taking the union fixes that from this side rather than by quietly dropping
 * the district from the sitemap. A district with nothing tracked in it is a
 * true answer to "projects in Alluri Sitharama Raju", and saying so is the
 * page this site should have. The count is zero and the page says zero.
 */
/**
 * The MoU register and its headline, for the /investments page.
 *
 * The page a crawler read was 83 words: the route's title and description,
 * and nothing else. Twenty-eight commitments, 8.5 lakh crore of announced
 * money, Google, NTPC, ArcelorMittal by name, all of it fetched by script
 * after load and none of it in the HTML. A search for "Google data centre
 * Visakhapatnam investment" could not find the page that lists it.
 *
 * Non-fatal: a register that cannot be read costs the table, not the build.
 */
let mous = []
let mouStats = null
try {
  const r = await get('/mous/?page=1&page_size=100')
  mous = r?.items || []
  if (r?.has_next) console.warn('prerender: the MoU register has more than 100 rows; only the first page is prerendered')
  mouStats = await get('/mous/stats')
} catch {
  mous = []
  mouStats = null
}

let districtRows = []
try {
  const insights = await get('/projects/insights')
  districtRows = insights?.by_district || []
} catch {
  districtRows = []   // districts still get their count, just not their cost
}

try {
  const filters = await get('/projects/filters')
  // The endpoint returns { code, name } objects, not strings. The sitemap
  // learned that the hard way and shipped 26 URLs reading %5Bobject%20Object%5D.
  const named = (filters?.districts || [])
    .map(d => (typeof d === 'string' ? d : d?.name))
    .filter(n => typeof n === 'string' && n.trim())
    .map(n => n.trim())
  const have = new Set(districtRows.filter(r => r?.district).map(r => districtPath(r.district)))
  for (const name of named) {
    if (have.has(districtPath(name))) continue
    have.add(districtPath(name))
    districtRows.push({ district: name, count: 0 })
  }
} catch {
  // The filters endpoint is not load bearing. Without it the build is exactly
  // what it was before: every district that holds a project still gets a page.
}

// Every dated reading of every project, oldest first. The summary and the
// share card use the latest one; the story tells all of them.
const extras = await pool(projects, CONCURRENCY, async p => {
  try {
    const x = await get(`/projects/${p.id}/extras`)
    return Array.isArray(x?.observations) ? x.observations : []
  } catch {
    return []   // a thinner story, never a wrong one
  }
})
const latestOf = list => (list?.length ? list[list.length - 1] : null)

/**
 * The hand-written stories, reviewed ones only, keyed by project id.
 *
 * A story that fails validateStory() is not used, and the build says so out
 * loud: a reviewed story that no longer checks out (a fact deleted, a Telugu
 * number that drifted) must fall back to the automatic story rather than
 * publish a claim its own file can no longer support. The test suite fails on
 * the same file first, so this is the second lock, not the only one.
 */
function readStories(dir) {
  const out = new Map()
  if (!existsSync(dir)) return out
  for (const file of readdirSync(dir).filter(f => /^\d+-.+\.json$/.test(f)).sort()) {
    let story
    try {
      story = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch (err) {
      console.warn(`prerender: story ${file} is not valid JSON and is not used (${err.message})`)
      continue
    }
    const problems = validateStory(story)
    if (story.status !== 'reviewed') problems.unshift('it is not marked reviewed')
    if (problems.length) {
      console.warn(`prerender: story ${file} is not used: ${problems.slice(0, 3).join('; ')}`)
      continue
    }
    out.set(story.id, story)
  }
  return out
}
const STORIES = readStories(STORIES_DIR)
const TODAY = new Date().toISOString().slice(0, 10)

// Every project by id, and where it sits in `extras`, so a project can reach
// the other government record of the same work without a scan per page.
const byId = new Map(projects.map(p => [p.id, p]))
const indexById = new Map(projects.map((p, i) => [p.id, i]))

/** The project whose page carries this work. Itself, unless it is a duplicate. */
const canonicalOf = p => byId.get(canonicalIdFor(p.id)) || p

/**
 * Where a work is, taking the answer from whichever record has one.
 *
 * The record with the fuller figures is not always the record with the
 * district. MoSPI files Polavaram with no district at all, the Socio-Economic
 * Survey files it in Eluru, and once the MoSPI page became canonical the dam
 * dropped off Eluru's district page entirely: the page still linked the other
 * record, which now points away from itself. A link a crawler is told to leave
 * again is worse than the duplicate it replaced.
 *
 * This is not inventing a location. It is reading the same work's own row in
 * another government document, which is what the page tells the reader it is
 * doing.
 */
function workDistrict(p) {
  if (p?.district) return p.district
  for (const id of membersOf(p?.id)) {
    const sib = byId.get(id)
    if (sib?.district) return sib.district
  }
  return null
}

// The districts that actually have a page. districtPath folds a source
// document's spelling onto the canonical address first, so "Tirupathi" and
// "Tirupati" both land here as one entry. Anything still left out is a name
// nothing in the catalogue recognises, and must not be linked.
const knownDistricts = new Set(
  districtRows.filter(r => r?.district).map(r => districtPath(r.district)))

const DIRS = { ur: 'rtl' }
let written = 0

function emit(path, html) {
  const clean = path.replace(/\/+$/, '')
  const dir = clean === '' ? DIST : join(DIST, clean)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
  written++
}

/**
 * Pages are collected first and written after the share cards are drawn,
 * because a page's head names its card, and the card's file name is the hash
 * of what is on it.
 *
 * Only English and Telugu get cards of their own. The other four languages
 * are read, not indexed, and their pages reuse the English card: a preview in
 * half-translated Hindi would be worse than a preview in English. Pages whose
 * text is English in every language (fact checks, department budgets) reuse
 * the English card for the same reason.
 */
const pages = []
const cards = new Map()
// The square steps pictures, one per project and card language with a road.
const pictures = new Map()
const CARD_LANGS = new Set(['en', 'te'])

function page({ path, lang, key, card, build }) {
  const own = key && card && CARD_LANGS.has(lang) ? `${key}-${lang}` : null
  if (own) cards.set(own, card)
  pages.push({ path, lang, cardKey: own || (key ? `${key}-en` : null), build })
}

/** The card for one language of a page, only when this language draws its own. */
const cardIn = (lang, make) => (CARD_LANGS.has(lang) ? make() : null)

const slugOf = pattern => pattern.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'home'

// Counts for the homepage card, from the register this build is writing.
const liveProjectCount = projects.filter(p => !isDuplicate(p.id)).length

for (const lang of LANG_CODES) {
  const t = translator(lang)
  const dir = DIRS[lang] || 'ltr'
  // Everything a hub page needs to name its children, built once per language.
  const ctx = { projects, districtRows, departments, knownDistricts, mous, mouStats, t, lang, districtOf: workDistrict }

  for (const route of STATIC_ROUTES) {
    const path = localizedPath(lang, route.pattern)
    const seo = seoForRoute(route, { t, lang })
    const schema = schemaFor(path, { title: seo.title, description: seo.description })
    page({
      path, lang, key: route.pattern === '/' ? 'home' : `s/${slugOf(route.pattern)}`,
      card: cardIn(lang, () => (route.pattern === '/'
        ? homeCard({ projects: liveProjectCount, districts: knownDistricts.size, departments: departments.length, t, lang })
        : sectionCard({ title: seo.heading || seo.title, subtitle: seo.description, t, lang }))),
      build: image => render(template, {
        lang, dir, path, title: seo.title, description: seo.description, schema, image,
        body: routeBody({ route, seo, t, lang, path, ctx }),
      }),
    })
  }

  for (const question of FINANCE_QUESTIONS) {
    const path = localizedPath(lang, financeQuestionPath(question.slug))
    const { title, description } = seoForFinanceQuestion(question, { t, lang })
    const schema = schemaFor(path, { title, description })
    page({
      path, lang, key: `fq/${question.slug}`,
      card: cardIn(lang, () => sectionCard({
        title: t(question.questionKey), subtitle: description, eyebrow: t('share.kind.finances'), kind: 'finances', t, lang })),
      build: image => render(template, {
        lang, dir, path, title, description, schema, image,
        body: financeQuestionBody({ question, t, lang, path }),
      }),
    })
  }

  for (const check of FACT_CHECKS) {
    const path = localizedPath(lang, factCheckPath(check.slug))
    const labels = Object.fromEntries(STATUSES.map(st => [st, t(`factcheck.status.${st}`)]))
    const { title, description } = seoForFactCheck(check, { t, lang })
    const schema = schemaFor(path, {
      title, description,
      factCheck: { check, ratings: STATUS_RATING, labels },
    })
    page({
      path, lang, key: `fc/${check.slug}`,
      card: lang === 'en' ? sectionCard({
        title: check.question, subtitle: check.summary, eyebrow: t('share.kind.factcheck'), kind: 'factcheck', t, lang }) : null,
      build: image => render(template, {
        lang, dir, path, title, description, schema, image,
        body: factCheckBody({ check, t, lang, path }),
      }),
    })
  }

  for (const department of departments) {
    if (!department?.department) continue
    const facts = departmentFacts(department)
    if (!facts.latest) continue     // a demand with no figure has no page
    const path = localizedPath(lang, departmentPath(department.department))
    const heading = t('finances.dept.heading', { department: department.department })
    const { title, description } = seoForDepartment({
      department: department.department,
      heading,
      headingShort: t('finances.dept.headingShort', { department: department.department }),
      lead: departmentSummary({ department, t, fmtNum }).slice(0, 2),
    })
    const schema = schemaFor(path, { title, description })
    page({
      path, lang, key: `dept/${departmentPath(department.department).split('/').pop()}`,
      card: lang === 'en' ? sectionCard({ title: heading, subtitle: description, eyebrow: t('share.kind.department'), kind: 'department', t, lang }) : null,
      build: image => render(template, {
        lang, dir, path, title, description, schema, image,
        body: departmentBody({ department, t, lang, path }),
      }),
    })
  }

  for (const row of districtRows) {
    if (!row?.district) continue
    const path = localizedPath(lang, districtPath(row.district))
    const seo = seoForDistrict(row.district, row.count, { t, lang })
    const schema = schemaFor(path, { title: seo.title, description: seo.description })
    page({
      path, lang, key: `d/${districtPath(row.district).split('/').pop()}`,
      card: cardIn(lang, () => districtCard({ district: row.district, count: row.count, costCrore: row.cost_crore, t, lang })),
      build: image => render(template, {
        lang, dir, path, title: seo.title, description: seo.description, schema, image,
        body: districtBody({
          district: row.district, total: row.count, row, projects, t, lang, path,
          districtOf: workDistrict, canonicalProject: canonicalOf,
        }),
      }),
    })
  }

  projects.forEach((project, i) => {
    const path = localizedPath(lang, `/projects/${project.id}`)
    // The same district the page body prints: a record with none of its own
    // (the MoSPI Polavaram row) takes it from the merged sibling that has one,
    // so the title and snippet cannot say "Andhra Pradesh" where the page
    // itself says "Eluru".
    const where = workDistrict(project)
    const seo = seoForProject({ ...project, district: where }, { t, lang })
    const title = seo.title || `${displayTitle(project.title)} | ${SITE_NAME}`
    const description = seo.description || clip(project.description || '', 160)
    const observations = extras[i]
    const observation = latestOf(observations)

    // Every government record of this same work, canonical first. Usually just
    // this one. Two sources carrying one dam under two names is the case this
    // exists for, and both of them lost while they competed for the same query.
    const siblings = membersOf(project.id).map(id => byId.get(id)).filter(Boolean)
    const siblingObs = siblings.map(p => latestOf(extras[indexById.get(p.id)]))

    // The story: hand-written when a reviewed one exists for this work and is
    // written in this language, built from the record otherwise.
    const fm = monthFmt(t)
    const fd = dayFmt(t)
    const tools = storyTools({ t, fmtNum, fmtMonth: fm, fmtDay: fd, lang })
    const facts = storyFacts({ project, readings: readingsOf(observations), today: TODAY })
    const auto = projectQuestions({ project, observation, facts, tools, siblings })
    const written = STORIES.get(canonicalIdFor(project.id))
    const flagship = written ? resolveStory(written, lang, { fmtMonth: fm, fmtDay: fd }) : null
    // The story in steps, by the same rule as the live page: the reviewed
    // story's own road, or the record's when it makes one of three.
    const steps = flagship?.steps || automaticSteps({ project, facts, tools, today: TODAY })
    const road = steps
      ? { title: flagship?.stepsTitle || t('projectDetail.story.steps.title'), sub: t('projectDetail.story.steps.sub', { count: steps.length }), steps }
      : null
    if (road && CARD_LANGS.has(lang)) {
      pictures.set(`steps/${project.id}-${lang}`, stepsPicture({
        steps,
        title: flagship?.stepsTitle || displayTitle(project.title),
        eyebrow: flagship?.stepsTitle ? '' : t('projectDetail.story.steps.title'),
        link: SITE_ORIGIN.replace(/^https?:\/\//, '') + localizedPath(lang, `/projects/${project.id}`),
        t, lang,
      }))
    }
    const story = flagship
      ? {
          road,
          keyDates: flagship.keyDates.length ? flagship.keyDates : storyKeyDates({ facts, project, t, fmtMonth: fm, today: TODAY }),
          chapters: flagship.chapters,
          note: t('projectDetail.story.flagshipNote', { date: fd(flagship.reviewedOn) }),
        }
      : {
          road,
          keyDates: storyKeyDates({ facts, project, t, fmtMonth: fm, today: TODAY }),
          chapters: automaticStory({ project, facts, tools }),
          note: t('projectDetail.story.autoNote'),
        }
    const questions = flagship ? [...flagship.questions, ...keptQuestions(auto, flagship.replaces)] : auto

    const sections = projectSections({
      project, questions, t, lang, knownDistricts,
      source: (() => {
        const src = summarySource({ project, observation })
        return src ? { href: src.url, label: src.label } : null
      })(),
    })
    const near = neighbours(project, projects, { districtOf: workDistrict, isDuplicate })
    // The same question and answer pairs the reader sees, handed to the
    // machines as data. Google shows an FAQ rich result only for a short list
    // of official sites and this is not one of them, so this is not here for a
    // rich result. It is here because an answer engine asked "how much did
    // Polavaram cost" reads this graph before it reads the prose, and a cited
    // answer it can lift cleanly is the whole point of the site.
    const schema = schemaFor(path, {
      title,
      description,
      // The same check the visible link makes. A breadcrumb naming a district
      // page that was never written is a published 404.
      breadcrumbTrail: projectTrail(project, districtHref(project.district, knownDistricts)),
      faq: sections,
    })
    page({
      path, lang, key: `p/${project.id}`,
      card: cardIn(lang, () => projectCard({ project, observation, district: where, t, lang })),
      build: image => render(template, {
        lang, dir, path, title, description, schema, image,
        // A duplicate record hands its ranking to the canonical page rather than
        // splitting it. The page is still written: its URL may already be
        // indexed or shared, and a crawler that finds it must be told where the
        // work really lives, not given a 404.
        canonicalPath: isDuplicate(project.id)
          ? localizedPath(lang, `/projects/${canonicalIdFor(project.id)}`)
          : undefined,
        body: projectBody({
          project, observation, t, lang, path, knownDistricts, sections, near, story,
          sourcesBlock: sourcesTable({ siblings, observations: siblingObs, t, lang }),
        }),
      }),
    })
  })
}

// ------------------------------------------------------------- share cards

let drawnCards = { urls: new Map(), drawn: 0, cached: 0, failed: 0, reason: CARDS ? null : 'skipped (--no-cards)' }
if (CARDS && cards.size) {
  drawnCards = await renderCards([...cards].map(([key, card]) => ({ key, card })), {
    outDir: DIST, log: m => console.warn(`prerender: ${m}`),
  })
}

// The steps pictures, and the index the live page reads to find one when a
// reader taps "Share as picture". A picture that is not drawn is simply not
// in the index, and the page then offers the link alone.
let drawnPictures = { urls: new Map(), drawn: 0, cached: 0, failed: 0, reason: CARDS ? null : 'skipped (--no-cards)' }
if (CARDS && pictures.size) {
  drawnPictures = await renderPictures([...pictures].map(([key, card]) => ({ key, card })), {
    outDir: DIST, log: m => console.warn(`prerender: ${m}`),
  })
}
{
  const index = {}
  for (const [key, url] of drawnPictures.urls) index[key.replace(/^steps\//, '')] = url
  mkdirSync(join(DIST, 'og', 'steps'), { recursive: true })
  writeFileSync(join(DIST, 'og', 'steps', 'index.json'), JSON.stringify(index), 'utf8')
}

/** The image a page's head names: its own card, the English one, or the site's. */
function imageFor({ cardKey, lang }) {
  const own = cardKey && drawnCards.urls.get(cardKey)
  if (own) return { src: own, alt: clip(cardAlt(cards.get(cardKey)), 420) }
  return { src: siteCardPath(lang), alt: SITE_NAME }
}

for (const p of pages) emit(p.path, p.build(imageFor(p)))

const merged = projects.filter(p => isDuplicate(p.id)).length
if (CARDS) {
  console.log(`prerender: share cards: ${drawnCards.drawn} drawn, ${drawnCards.cached} reused from the cache` +
    (drawnCards.failed ? `, ${drawnCards.failed} not drawn (${drawnCards.reason || 'see above'}); those pages preview with the site card` : ''))
  console.log(`prerender: steps pictures: ${drawnPictures.drawn} drawn, ${drawnPictures.cached} reused from the cache` +
    (drawnPictures.failed ? `, ${drawnPictures.failed} not drawn (${drawnPictures.reason || 'see above'}); those pages offer the link only` : ''))
}
console.log(`prerender: ${STATIC_ROUTES.length} pages + ${FINANCE_QUESTIONS.length} finance questions + ${FACT_CHECKS.length} fact checks` +
  ` + ${districtRows.length} districts + ${departments.length} departments + ${projects.length} projects` +
  ` x ${LANG_CODES.length} languages = ${written} files`)
// The number that decides whether any of it gets crawled. Every page carries
// the section nav, so a crawler reaching one page can reach all of them.
console.log(`prerender: every page links to ${STATIC_ROUTES.length - 1} sections;` +
  ` /projects lists ${projects.length - merged} projects, /finances lists ${FINANCE_QUESTIONS.length} questions and ${departments.length} demands`)
// Said every build, so nobody wonders later why five languages are missing
// from Search Console. They are written, served and deliberately not indexed.
const quiet = LANG_CODES.filter(c => !INDEXED_LANGS.includes(c))
if (quiet.length) {
  console.log(`prerender: indexed ${INDEXED_LANGS.join(', ')}; ${quiet.join(', ')} written for readers ` +
    'with noindex, follow and no hreflang (src/lib/routes.js INDEXED_LANGS). Pages whose text is English ' +
    '(fact checks, department budgets) are noindex outside English (seo.js ENGLISH_CONTENT_PATTERNS)')
}
if (merged) {
  // Said out loud because merging is a judgement, not a rule, and a silent
  // merge is how a real project disappears from a public register.
  console.log(`prerender: ${merged} record(s) point at another project's page as the same work, ` +
    'and are kept out of the register list and the sitemap ' +
    `(${projects.filter(p => isDuplicate(p.id)).map(p => `/projects/${p.id} -> /projects/${canonicalIdFor(p.id)}`).join(', ')})`)
}
// Case is fixed here; a word the PDF tore in half is not, because repairing it
// without a dictionary is a guess at what a government document said. Counted
// so it is visible rather than sitting unseen in 900 pages.
const byTitle = new Map(projects.map(p => [p.title, p.id]))
const torn = splitSuspects(projects.map(p => p.title))
  .map(x => ({ id: byTitle.get(x.title), at: x.at }))
if (torn.length) {
  console.warn(`prerender: ${torn.length} title(s) look like the source PDF broke a word ` +
    'across a column edge. They are printed as the record holds them; the fix belongs in the parser.')
  console.warn(`prerender: for example ${torn.slice(0, 5).map(x => `/projects/${x.id} "${x.at}"`).join(', ')}`)
}

if (unmatchedDistricts.size) {
  // Not fatal: the pages are still written and still correct, they just do not
  // link a district page because there is none under that spelling. It is said
  // here because a project filed under a district that does not exist is also
  // missing from that district's page, which is a data problem, not a link one.
  console.warn(`prerender: ${unmatchedDistricts.size} district name(s) in the register match no district page, ` +
    `so those projects link no district: ${[...unmatchedDistricts].sort().join(', ')}`)
  console.warn('prerender: fold them onto the canonical name (backend/scripts/backfill_project_districts.py)')
}
