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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
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

const {
  SITE_NAME, STATIC_ROUTES, LANG_CODES, localizedPath, districtPath,
} = await import('../src/lib/routes.js')
const { canonicalFor, seoForProject, seoForDistrict } = await import('../src/lib/seo.js')
const { schemaFor, projectTrail } = await import('../src/lib/schema.js')
const { projectSummary } = await import('../src/lib/projectSummary.js')
const { districtSummary } = await import('../src/lib/districtSummary.js')
const { departmentPath, departmentSummary, departmentFacts } = await import('../src/lib/departmentSummary.js')

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
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
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

// ---------------------------------------------------------------- fetching

async function get(path) {
  const res = await fetch(API + path, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json()
}

/** Walk the register, asserting the count so a silent truncation cannot pass. */
async function allProjects() {
  const items = []
  let expected = null
  for (let page = 1; page <= 200; page++) {
    const r = await get(`/projects/?page=${page}&page_size=100`)
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

function headTags({ lang, path, title, description, schema }) {
  const canonical = canonicalFor(path)
  const alternates = LANG_CODES
    .map(code => `<link rel="alternate" hreflang="${code}" href="${esc(canonicalFor(localizedPath(code, path)))}" />`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${esc(canonicalFor(localizedPath('en', path)))}" />`)
    .join('\n    ')

  return [
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:locale" content="${esc(lang)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    alternates,
    `<script type="application/ld+json" id="site-schema">${JSON.stringify(schema)}</script>`,
  ].join('\n    ')
}

/**
 * The body a machine reads.
 *
 * Ordered the way a citation is built: what it is, the number, when it was
 * published, who published it, then where to check. An answer engine quoting
 * this page has everything it needs before it stops reading.
 */
function projectBody({ project, observation, t, lang }) {
  const fm = monthFmt(t)
  const summary = projectSummary({ project, observation, t, fmtNum, fmtMonth: fm })
  const rows = []

  const money = v => (v == null ? null : `₹${fmtNum(Math.round(v) >= 100 ? Math.round(v) : Number(Number(v).toFixed(2)))} ${t('unit.croreWord')}`)

  if (project.estimated_cost_crore != null) rows.push([t('projectDetail.tiles.estimatedCost'), money(project.estimated_cost_crore)])
  if (observation?.cumulative_expenditure_crore != null) rows.push([t('projectDetail.tiles.moneySpent'), money(observation.cumulative_expenditure_crore)])
  if (project.completion_percentage != null) rows.push([t('projectDetail.tiles.physicalProgress'), `${project.completion_percentage}%`])
  if (project.expected_completion) rows.push([t('projectDetail.tiles.expectedCompletion'), fm(project.expected_completion)])
  if (project.district) rows.push([t('projects.filters.district'), project.district])
  if (project.department) rows.push([t('projectDetail.facts.department'), project.department])
  if (project.implementing_agency) rows.push([t('projectDetail.facts.implementingAgency'), project.implementing_agency])
  if (project.external_id) rows.push([t('projectDetail.facts.projectCode'), project.external_id])

  const source = observation?.source_url || project.source_url
  const sourceLabel = observation?.source_label || project.source_portal

  return [
    `<h1>${esc(project.title)}</h1>`,
    summary.length ? `<p>${esc(summary.join(' '))}</p>` : '',
    rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '',
    project.description ? `<h2>${esc(t('projectDetail.whatRecordSays'))}</h2><p>${esc(project.description)}</p>` : '',
    source ? `<p><a href="${esc(source)}" rel="nofollow">${esc(sourceLabel || t('projectDetail.primarySource'))}</a></p>` : '',
    project.district
      ? `<p><a href="${esc(localizedPath(lang, `/projects?district=${encodeURIComponent(project.district)}`))}">${esc(t('projectDetail.related.seeDistrict', { district: project.district }))}</a></p>`
      : '',
    `<p><a href="${esc(localizedPath(lang, '/projects'))}">${esc(t('projectDetail.related.seeRegister'))}</a></p>`,
  ].filter(Boolean).join('\n      ')
}

function districtBody({ district, total, row, t, lang }) {
  const lead = districtSummary({ district, total, row, t, fmtNum })
  return [
    `<h1>${esc(t('projects.district.heading', { district }))}</h1>`,
    lead.length ? `<p>${esc(lead.join(' '))}</p>` : '',
    `<p><a href="${esc(localizedPath(lang, '/projects'))}">${esc(t('projectDetail.related.seeRegister'))}</a></p>`,
  ].filter(Boolean).join('\n      ')
}

function departmentBody({ department, t, lang }) {
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
  ].filter(Boolean).join('\n      ')
}

function routeBody({ route, t, lang }) {
  return [
    `<h1>${esc(route.title)}</h1>`,
    `<p>${esc(route.description)}</p>`,
    `<p><a href="${esc(localizedPath(lang, '/projects'))}">${esc(t('projectDetail.related.seeRegister'))}</a></p>`,
  ].join('\n      ')
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
    .replace(/\s*<meta property="og:locale"[^>]*>/g, '')
    .replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '')
    .replace(/\s*<script type="application\/ld\+json" id="site-schema">[\s\S]*?<\/script>/g, '')
}

function render(template, { lang, dir, path, title, description, schema, body }) {
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

  html = html.replace('</head>', `  ${headTags({ lang, path, title, description, schema })}\n  </head>`)

  // Inside #root on purpose: React replaces this on hydration, so a reader
  // never sees both. A crawler that stops before running scripts sees it all.
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${MARK_OPEN}\n      ${body}\n    ${MARK_CLOSE}</div>`)

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

let districtRows = []
try {
  const insights = await get('/projects/insights')
  districtRows = insights?.by_district || []
} catch {
  districtRows = []   // districts still get their count, just not their cost
}

const extras = await pool(projects, CONCURRENCY, async p => {
  try {
    const x = await get(`/projects/${p.id}/extras`)
    const obs = x?.observations || []
    return obs.length ? obs[obs.length - 1] : null
  } catch {
    return null   // a thinner paragraph, never a wrong one
  }
})

const DIRS = { ur: 'rtl' }
let written = 0

function emit(path, html) {
  const clean = path.replace(/\/+$/, '')
  const dir = clean === '' ? DIST : join(DIST, clean)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
  written++
}

for (const lang of LANG_CODES) {
  const t = translator(lang)
  const dir = DIRS[lang] || 'ltr'

  for (const route of STATIC_ROUTES) {
    const path = localizedPath(lang, route.pattern)
    const schema = schemaFor(path, { title: route.title, description: route.description })
    emit(path, render(template, {
      lang, dir, path, title: route.title, description: route.description, schema,
      body: routeBody({ route, t, lang }),
    }))
  }

  for (const department of departments) {
    if (!department?.department) continue
    const facts = departmentFacts(department)
    if (!facts.latest) continue     // a demand with no figure has no page
    const path = localizedPath(lang, departmentPath(department.department))
    const title = clip(t('finances.dept.heading', { department: department.department }), 70)
    const description = clip(departmentSummary({ department, t, fmtNum }).slice(0, 2).join(' '), 200)
    const schema = schemaFor(path, { title, description })
    emit(path, render(template, {
      lang, dir, path, title, description, schema,
      body: departmentBody({ department, t, lang }),
    }))
  }

  for (const row of districtRows) {
    if (!row?.district) continue
    const path = localizedPath(lang, districtPath(row.district))
    const seo = seoForDistrict(row.district, row.count)
    const schema = schemaFor(path, { title: seo.title, description: seo.description })
    emit(path, render(template, {
      lang, dir, path, title: seo.title, description: seo.description, schema,
      body: districtBody({ district: row.district, total: row.count, row, t, lang }),
    }))
  }

  projects.forEach((project, i) => {
    const path = localizedPath(lang, `/projects/${project.id}`)
    const seo = seoForProject(project)
    const title = seo.title || `${project.title} | ${SITE_NAME}`
    const description = clip(seo.description || project.description || '', 200)
    const schema = schemaFor(path, {
      title, description, breadcrumbTrail: projectTrail(project),
    })
    emit(path, render(template, {
      lang, dir, path, title, description, schema,
      body: projectBody({ project, observation: extras[i], t, lang }),
    }))
  })
}

console.log(`prerender: ${STATIC_ROUTES.length} pages + ${districtRows.length} districts` +
  ` + ${departments.length} departments + ${projects.length} projects` +
  ` x ${LANG_CODES.length} languages = ${written} files`)
