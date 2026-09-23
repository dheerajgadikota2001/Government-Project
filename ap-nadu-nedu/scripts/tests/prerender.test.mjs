import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, rmSync, existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative, sep } from 'node:path'

/**
 * WHY THIS TEST EXISTS
 *
 * The body of every page on this site was 46 bytes. Google was fine, because
 * Google runs JavaScript. GPTBot, ClaudeBot, PerplexityBot and CCBot do not,
 * and CCBot is Common Crawl, which is what most models read. Neither do
 * WhatsApp, Facebook or X link previews, so every project link ever shared
 * into a group previewed as the homepage rather than as the project.
 *
 * The prerenderer is what puts the facts back into the HTML. It is a build
 * step, which means when it breaks nothing throws and nothing looks wrong: the
 * site keeps working perfectly for humans while quietly going invisible again
 * to everything that does not run scripts. That is the only kind of failure
 * worth this much test.
 *
 * So this runs the actual script against a stub register and reads what it
 * wrote. It does not check that the code contains the right words.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')

const PROJECT = {
  id: 613,
  title: 'POLAVARAM IRRIGATION PROJECT',
  description: 'Central-sector project tracked in the MoSPI flash report.',
  project_type: 'irrigation',
  status: 'under_construction',
  district: 'Eluru',
  estimated_cost_crore: 55548.87,
  completion_percentage: 76,
  expected_completion: '2027-12-01T00:00:00Z',
  announced_date: '2009-02-01T00:00:00Z',
  department: 'Water Resources',
  implementing_agency: 'PPA',
  external_id: 'N30000002',
  source_portal: 'MOSPI_IPMD',
  source_url: 'https://www.mospi.gov.in/example.pdf',
}
const OBSERVATION = {
  observed_date: '2025-06-30T00:00:00+00:00',
  cumulative_expenditure_crore: 23775.68,
  source_label: 'MoSPI flash report, June 2025',
  source_url: 'https://www.mospi.gov.in/example.pdf',
}

// A district name nothing can resolve. The register is fed by scrapers, so a
// new spelling, a typo or a renamed district will arrive one day with no page
// behind it, and linking it costs a crawl to reach a 404.
const STRAY = { ...PROJECT, id: 999, title: 'A PROJECT IN AN UNKNOWN DISTRICT', district: 'Ruritania' }

// Three commitments, one per kind of source, plus the one the register says
// was cancelled. The cancelled one is the point: it used to be summed into
// "promised" and it must now be listed and not counted.
const MOUS = [
  { id: 6, company_name: 'Google (Alphabet Inc.)', sector: 'it_tech', investment_crore: 135000, status: 'investment_started',
    source_tier: 'company', signed_date: '2024-10-15T00:00:00Z', is_foreign_investment: true },
  { id: 12, company_name: 'Greenko Group', sector: 'renewable_energy', investment_crore: 19600, status: 'operational',
    source_tier: 'government', signed_date: '2019-01-01T00:00:00Z', is_foreign_investment: false },
  { id: 2, company_name: 'ArcelorMittal Nippon Steel India', sector: 'manufacturing', investment_crore: 147162, status: 'investment_started',
    source_tier: 'press', signed_date: null, date_status: 'undated', is_foreign_investment: true },
  { id: 17, company_name: 'Lulu Group International', sector: 'real_estate', investment_crore: 2200, status: 'cancelled',
    source_tier: 'press', signed_date: '2019-06-01T00:00:00Z', is_foreign_investment: true },
]
const MOU_STATS = {
  total_mous: 3, total_investment_crore: 301762, total_expected_jobs: 0, foreign_investments: 2,
  by_source_tier: {
    government: { mous: 1, investment_crore: 19600, share_pct: 6.5 },
    company: { mous: 1, investment_crore: 135000, share_pct: 44.7 },
    press: { mous: 1, investment_crore: 147162, share_pct: 48.8 },
    unlabelled: { mous: 0, investment_crore: 0, share_pct: 0 },
  },
  all_recorded: { mous: 4, investment_crore: 303962 },
  not_live: { cancelled: { mous: 1, investment_crore: 2200 }, stalled: { mous: 0, investment_crore: 0 } },
  provenance_note: 'x',
}

// The same dam, filed by a second government source under a different name,
// at a different cost, with no district on it. This is the live case: the
// Socio-Economic Survey annexure and the MoSPI flash report both carry
// Polavaram, 25,000 crore apart. The ids are the real ones on purpose: PROJECT
// is 613 and this is 1, which is exactly the pair sameWork.js merges in
// production, so this exercises the live entry rather than a fixture that only
// agrees with itself.
const TWIN = {
  ...PROJECT,
  id: 1,
  title: 'Polavaram Irrigation Project (Phase 1)',
  estimated_cost_crore: 30437,
  completion_percentage: null,
  district: null,
  source_portal: 'AP_SOCIO_ECONOMIC_SURVEY',
  source_url: 'https://example.gov.in/survey.pdf',
}

// A name that IS resolvable, spelled the way its source document spelled it.
// Seven of these are in the live register: Anantapur for Ananthapuramu,
// Nellore for Sri Potti Sriramulu Nellore, Tirupathi for Tirupati and four
// more. None of them is a misspelling; they are older or shorter names for the
// same district. For months they were treated as unknown, so 42 project pages
// linked to a page that does not exist while the district page they belonged
// to sat one spelling away.
const FOLDED = { ...PROJECT, id: 998, title: 'A PROJECT FILED UNDER AN OLDER NAME', district: 'Tirupathi' }

/** A stub register. Shapes copied from the live API, not invented. */
function stubApi({ empty = false, breakExtras = false, stray = false, folded = false, catalogue = false, twin = false, noMous = false } = {}) {
  return new Promise(resolve_ => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      res.setHeader('content-type', 'application/json')
      if (url.pathname === '/api/v1/projects/') {
        // A project whose district is spelled the way its source document
        // spelled it, which is not the name the insights endpoint returns.
        const items = empty ? [] : [PROJECT, ...(stray ? [STRAY] : []), ...(folded ? [FOLDED] : []), ...(twin ? [TWIN] : [])]
        return res.end(JSON.stringify({ items, total: items.length, page: 1, page_size: 100, has_next: false }))
      }
      if (url.pathname === '/api/v1/finances/departments') {
        return res.end(JSON.stringify({
          departments: empty ? [] : [{
            department: 'School Education',
            demand_no: 'XII',
            rows: [
              { year: '2019-20', tenure: 'ysrcp', stage: 'BE', total_crore: 29772.79 },
              { year: '2019-20', tenure: 'ysrcp', stage: 'Actual', total_crore: 24819.73 },
              { year: '2026-27', tenure: 'tdp2', stage: 'BE', total_crore: 32308.32 },
            ],
          }],
          caveats: [{ title: 'These are budget estimates, not spending', body: 'b' }],
          how_to_read: { title: 'How to read a demand' },
        }))
      }
      if (url.pathname === '/api/v1/projects/insights') {
        return res.end(JSON.stringify({
          by_district: empty ? [] : [
            { district: 'Eluru', count: 21, cost_crore: 30837 },
            // Spelled canonically here, the way the insights endpoint returns
            // it. The register spells the same district 'Tirupathi'.
            ...(folded ? [{ district: 'Tirupati', count: 3, cost_crore: 120 }] : []),
          ],
        }))
      }
      if (url.pathname === '/api/v1/projects/filters') {
        // The catalogue of all districts, the same endpoint the sitemap reads.
        // Objects, not strings, because that is what the live API returns.
        if (!catalogue) { res.statusCode = 404; return res.end('{}') }
        return res.end(JSON.stringify({
          districts: [
            { code: 'eluru', name: 'Eluru' },
            { code: 'tirupati', name: 'Tirupati' },
            // Holds no project at all. In the sitemap, never prerendered.
            { code: 'alluri-sitharama-raju', name: 'Alluri Sitharama Raju' },
          ],
        }))
      }
      if (url.pathname === '/api/v1/mous/') {
        if (noMous) { res.statusCode = 500; return res.end('{}') }
        return res.end(JSON.stringify({ items: MOUS, total: MOUS.length, page: 1, page_size: 100, has_next: false }))
      }
      if (url.pathname === '/api/v1/mous/stats') {
        return res.end(JSON.stringify(MOU_STATS))
      }
      if (/\/extras$/.test(url.pathname)) {
        if (breakExtras) { res.statusCode = 500; return res.end('{}') }
        return res.end(JSON.stringify({ images: [], documents: [], observations: [OBSERVATION] }))
      }
      res.statusCode = 404
      res.end('{}')
    })
    // unref, and close every socket on the way out. Without both, node's test
    // runner waits on a keep-alive connection that will never speak again and
    // the whole suite hangs with no failure to look at.
    server.unref()
    server.listen(0, '127.0.0.1', () => resolve_({
      server,
      base: `http://127.0.0.1:${server.address().port}/api/v1`,
      stop: () => { server.closeAllConnections?.(); server.close() },
    }))
  })
}

/**
 * Async on purpose. spawnSync blocks this process's event loop, and the stub
 * register lives in this process, so the child's very first request could
 * never be answered. The suite deadlocked with no output and no failure,
 * which is a worse thing to debug than any test it contains.
 */
function runPrerender(base, out, extraArgs = []) {
  return new Promise(done => {
    const child = spawn(process.execPath,
      ['scripts/prerender.mjs', '--api', base, '--out', out, ...extraArgs],
      { cwd: ROOT })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', status => done({ status, stdout, stderr }))
  })
}

const outDir = () => mkdtempSync(join(tmpdir(), 'prerender-'))

test('a project page ships the facts in its HTML, with no JavaScript run', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    const r = await runPrerender(base, out)
    assert.equal(r.status, 0, r.stderr)

    const file = join(out, 'projects/613/index.html')
    assert.ok(existsSync(file), 'no file was written for the project')
    const html = readFileSync(file, 'utf8')

    // The whole point: a machine that stops before running scripts still gets
    // the number, the date it was published, and where to check it.
    // Cased, not as the flash report typesets it. The record keeps its own
    // string; the page shows a reader a title rather than shouting at them.
    assert.match(html, /Polavaram Irrigation Project/)
    assert.ok(!html.includes('POLAVARAM IRRIGATION PROJECT'),
      'the page still shouts the title the source PDF was typeset in')
    assert.match(html, /23,776/, 'the spend figure is not in the HTML')
    assert.match(html, /55,549/, 'the cost figure is not in the HTML')
    assert.match(html, /76%/)
    assert.match(html, /MoSPI flash report, June 2025/, 'the citation is missing')
    assert.match(html, /mospi\.gov\.in/, 'nothing links to the source document')

    // And it is a real body, not a shell.
    const body = html.split('<body')[1] || ''
    assert.ok(body.length > 800, `body is only ${body.length} bytes; it was 46 before`)
    assert.match(html, /<h1>Polavaram Irrigation Project<\/h1>/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a shared link previews as the project, not as the homepage', async () => {
  // WhatsApp does not run JavaScript. Every link shared out of this site used
  // to preview with the homepage's title and description, whichever page it
  // pointed at, because those tags were injected by the app after load.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const html = readFileSync(join(out, 'projects/613/index.html'), 'utf8')

    const ogTitles = [...html.matchAll(/<meta property="og:title" content="([^"]*)"/g)].map(m => m[1])
    assert.equal(ogTitles.length, 1, `expected exactly one og:title, got ${ogTitles.length}`)
    assert.match(ogTitles[0], /Polavaram/, 'the preview still shows the site, not the page')

    const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)[1]
    assert.match(ogDesc, /55,549|Polavaram|POLAVARAM/i)

    assert.match(html, /<meta property="og:url" content="[^"]*\/projects\/613"/)
    assert.match(html, /<title>Polavaram[^<]*<\/title>/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('every language gets its own file, in its own script and direction', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)

    const te = readFileSync(join(out, 'te/projects/613/index.html'), 'utf8')
    assert.match(te, /<html lang="te"/)
    assert.ok(/[ఀ-౿]/.test(te), 'the Telugu page has no Telugu in it')
    assert.match(te, /23,776/, 'the figure did not survive translation')

    const ur = readFileSync(join(out, 'ur/projects/613/index.html'), 'utf8')
    assert.match(ur, /<html lang="ur" dir="rtl"/,
      'Urdu is not marked right to left, so it renders backwards before hydration')

    const en = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    assert.match(en, /<html lang="en" dir="ltr"/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

/**
 * Only INDEXED_LANGS are offered to search. The other languages are still
 * written, for readers who pick them, and carry noindex, follow and no
 * hreflang. Written against the list rather than against "English only", so
 * the day a language is added to it these tests demand its hreflang back
 * instead of failing.
 */
test('a page asks to be indexed only in the languages we index', async () => {
  const { INDEXED_LANGS, LANG_CODES } = await import('../../src/lib/routes.js')
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const expected = INDEXED_LANGS.length > 1 ? [...INDEXED_LANGS, 'x-default'] : []

    for (const code of LANG_CODES) {
      const rel = code === 'en' ? 'projects/613/index.html' : `${code}/projects/613/index.html`
      const html = readFileSync(join(out, rel), 'utf8')
      const self = code === 'en' ? '/projects/613' : `/${code}/projects/613`

      assert.match(html, new RegExp(`<link rel="canonical" href="[^"]*${self.replace(/\//g, '\\/')}"`),
        `${self} canonicalises somewhere other than itself`)
      assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, `${self} has two canonicals`)

      const robots = [...html.matchAll(/<meta name="robots" content="([^"]+)"/g)].map(m => m[1])
      const langs = [...html.matchAll(/hreflang="([^"]+)"/g)].map(m => m[1])

      if (INDEXED_LANGS.includes(code)) {
        assert.deepEqual(robots, [], `${self} is an indexed language but carries ${robots}`)
        assert.deepEqual(langs, expected, `${self} has the wrong hreflang set`)
      } else {
        assert.deepEqual(robots, ['noindex, follow'],
          `${self} is not translated by hand and must stay out of the index, followed`)
        assert.deepEqual(langs, [],
          `${self} is noindex, so any hreflang pointing at it is an error Search Console reports on every URL`)
      }
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the structured data is in the file, not added later by script', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const html = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    const ld = html.match(/<script type="application\/ld\+json" id="site-schema">([\s\S]*?)<\/script>/)
    assert.ok(ld, 'no JSON-LD in the prerendered HTML')
    const graph = JSON.parse(ld[1])['@graph'].map(n => n['@type'])
    assert.ok(graph.includes('Organization'))
    assert.ok(graph.includes('WebPage'))
    assert.ok(graph.includes('BreadcrumbList'))
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the prerendered body sits inside #root so a reader never sees both', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const html = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    // The marker is what makes a second pass strippable, so it is part of the
    // contract, not decoration.
    assert.match(html, /<div id="root"><!--prerendered--><div data-prerender>\s*<h1>/,
      'the static body is outside #root, or lost its marker; React will not ' +
      'replace it and a second prerender pass cannot remove it')
    assert.match(html, /<\/div><!--\/prerendered--><\/div>/)

    // The attribute the inline stylesheet hooks onto. Without it the reader
    // spends the whole bundle download looking at unstyled markup, which is
    // what this page looked like the day the prerendered homepage grew from
    // 324 bytes to 11 KB.
    assert.match(html, /<div data-prerender>/,
      'the prerendered block cannot be styled before the stylesheet loads')

    // And the rules that style it must be in the document itself, because a
    // stylesheet cannot style the paint that happens before it arrives.
    //
    // Asserted against index.html rather than the output: the prerenderer's
    // template is the built dist/index.html, so a freshly cloned checkout has
    // no build to read and this would test the last build instead of the
    // source. The contract lives in the source template.
    const source = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
    assert.match(source, /<style id="prerender-paint">/,
      'the first-paint styles are missing from index.html')
    assert.match(source, /#root \[data-prerender\]/,
      'the first-paint styles are not scoped to the prerendered block, so they ' +
      'will leak into the app once React mounts')
    assert.ok(!/\[data-prerender\][^{]*\{[^}]*(display:\s*none|visibility:\s*hidden)/.test(source),
      'the prerendered content is hidden from readers while still served to ' +
      'crawlers, which is cloaking')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a broken extras call costs a sentence, not a page', async () => {
  const { base, stop } = await stubApi({ breakExtras: true })
  const out = outDir()
  try {
    const r = await runPrerender(base, out)
    assert.equal(r.status, 0, 'one failing endpoint stopped the whole prerender')
    const html = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    assert.match(html, /55,549/, 'lost the cost as well as the spend')
    assert.ok(!/23,776/.test(html), 'invented a spend figure it never received')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('an unreachable or empty register writes nothing at all', async () => {
  // 4000 empty pages published over working ones is far worse than none.
  const dead = outDir()
  const bad = await runPrerender('http://127.0.0.1:1/api/v1', dead)
  assert.notEqual(bad.status, 0, 'prerendered against a register it could not reach')
  assert.ok(!existsSync(join(dead, 'projects')), 'wrote pages anyway')
  rmSync(dead, { recursive: true, force: true })

  const { base, stop } = await stubApi({ empty: true })
  const out = outDir()
  try {
    const r = await runPrerender(base, out)
    assert.notEqual(r.status, 0, 'prerendered an empty register')
    assert.match(r.stderr, /no projects/i)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('static routes are prerendered too, in every language', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    for (const path of ['finances/index.html', 'te/finances/index.html', 'documents/index.html']) {
      const file = join(out, path)
      assert.ok(existsSync(file), `${path} was not written`)
      const html = readFileSync(file, 'utf8')
      assert.match(html, /<h1>/, `${path} has no heading in its HTML`)
      assert.match(html, /<link rel="canonical"/)
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('running it twice produces the same page, not two of everything', async () => {
  // The homepage's own output is written to dist/index.html, which is the file
  // this script reads as its template. So a second pass without a rebuild in
  // between starts from a page that already has a canonical, a hreflang set,
  // a JSON-LD block and a body. Two canonicals is worse than none: Google
  // picks one and it need not be the page's own.
  //
  // This took three attempts to get right and every wrong version failed
  // silently, with a perfect head over the homepage's body on every URL.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const once = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    await runPrerender(base, out)
    const twice = readFileSync(join(out, 'projects/613/index.html'), 'utf8')

    assert.equal(twice, once, 'a second pass changed the output')
    for (const [what, re] of [
      ['canonical', /rel="canonical"/g],
      ['og:url', /property="og:url"/g],
      ['JSON-LD block', /id="site-schema"/g],
      ['h1', /<h1>/g],
    ]) {
      assert.equal((twice.match(re) || []).length, 1, `${what} appears more than once`)
    }
    assert.match(twice, /<h1>Polavaram Irrigation Project<\/h1>/,
      'the body is not the project; the template was left unstripped')
    assert.ok(!/independent, no-login transparency platform/.test(
      twice.split('<div id="root">')[1].split('</div>')[0]),
      'the homepage body survived inside the project page')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('districts are prerendered too, now that they have a path', async () => {
  // They used to live at /projects?district=Guntur. A query string is not a
  // file path, so there was nowhere to write them and 26 real pages were
  // visible only to a crawler that runs JavaScript.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)

    const file = join(out, 'districts/eluru/index.html')
    assert.ok(existsSync(file), 'no file was written for the district')
    const html = readFileSync(file, 'utf8')

    assert.match(html, /<h1>Government projects in Eluru district<\/h1>/)
    assert.match(html, /21 tracked government projects in Eluru district/)
    assert.match(html, /₹30,837 crore/, 'the district total is missing')
    assert.match(html, /counted in each district it touches/,
      'the caveat that stops a reader summing 26 districts is missing')
    assert.match(html, /<link rel="canonical" href="[^"]*\/districts\/eluru"/)

    const te = readFileSync(join(out, 'te/districts/eluru/index.html'), 'utf8')
    assert.match(te, /<html lang="te"/)
    assert.ok(/[ఀ-౿]/.test(te), 'the Telugu district page has no Telugu on it')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('each finances question is prerendered on its own address', async () => {
  // Nine questions that used to share one page and one title. A crawler that
  // does not run JavaScript must still find the question, its answer and the
  // way to the other eight, in every language.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)

    const file = join(out, 'finances/does-the-state-earn-enough/index.html')
    assert.ok(existsSync(file), 'no file was written for the question')
    const html = readFileSync(file, 'utf8')
    assert.match(html, /<title>Does Andhra Pradesh earn enough to run itself\?/)
    assert.match(html, /<h2>Does the state earn enough to run itself\?<\/h2>/)
    assert.match(html, /revenue deficit/i, 'the one-paragraph answer is missing')
    assert.match(html, /href="\/finances\/whose-number-is-right"/, 'the other questions are not linked')
    assert.match(html, /<link rel="canonical" href="[^"]*\/finances\/does-the-state-earn-enough"/)
    assert.ok(!/<meta name="robots"/.test(html), 'the English question page asks not to be indexed')

    const te = readFileSync(join(out, 'te/finances/does-the-state-earn-enough/index.html'), 'utf8')
    assert.match(te, /<html lang="te"/)
    const { isIndexedLang } = await import('../../src/lib/routes.js')
    if (isIndexedLang('te')) {
      assert.ok(!/<meta name="robots"/.test(te), 'the Telugu question page is indexed and must not say noindex')
      assert.match(te, /<title>[^<]*[ఀ-౿][^<]*<\/title>/, 'the Telugu question page carries an English title')
    } else {
      assert.match(te, /<meta name="robots" content="noindex, follow"/)
    }
    assert.ok(/[ఀ-౿]/.test(te), 'the Telugu question page has no Telugu on it')
    assert.match(te, /href="\/te\/finances\/whose-number-is-right"/, 'the Telugu page links to English neighbours')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('department pages are prerendered, in every language', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)

    const file = join(out, 'finances/departments/school-education/index.html')
    assert.ok(existsSync(file), 'no file was written for the department')
    const html = readFileSync(file, 'utf8')

    assert.match(html, /<h1>Andhra Pradesh School Education budget, year by year<\/h1>/)
    assert.match(html, /₹32,308 crore for School Education in 2026-27/)
    assert.match(html, /₹29,773 crore/, 'the budgeted figure is missing')
    assert.match(html, /₹24,820 crore spent/, 'the audited actual is missing')
    assert.match(html, /₹4,953 crore less than the Assembly authorised/,
      'the gap between budgeted and spent is the point of the page and it is gone')
    assert.match(html, /<link rel="canonical" href="[^"]*\/finances\/departments\/school-education"/)

    const te = readFileSync(join(out, 'te/finances/departments/school-education/index.html'), 'utf8')
    assert.match(te, /<html lang="te"/)
    assert.ok(/[ఀ-౿]/.test(te), 'the Telugu department page has no Telugu on it')
    assert.match(te, /32,308/, 'the figure did not survive translation')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

// --------------------------------------------------------------- the orphans
//
// WHY THESE EXIST
//
// Search Console, 16 September 2026: 169 pages indexed of 4,620 submitted,
// 4,379 of them "Discovered, currently not indexed". That reason means Google
// found the URL in the sitemap and did not think it worth a crawl.
//
// Crawling the built site proved why. Every page carried one link, always to
// /projects, and /projects linked only to itself. Following links from the
// homepage reached two pages out of 4,620. Everything else was an orphan.
//
// None of the thirteen tests above caught it, and none of them were wrong to
// miss it: each checks one page in isolation, and an orphan is perfectly
// correct in isolation. What was missing was a test of the thing between the
// pages. These walk the link graph.

/** Every page the prerenderer wrote, as site paths. */
function pagesIn(out) {
  const found = new Set()
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name))
      else if (entry.name === 'index.html') {
        const rel = relative(out, dir).split(sep).join('/')
        found.add(rel ? `/${rel}` : '/')
      }
    }
  }
  walk(out)
  return found
}

const ORIGIN = 'https://apfactcheck.dheeco.com'

/** Internal links on one page, as site paths. */
function linksOn(out, path) {
  const file = join(out, path === '/' ? '' : path.slice(1), 'index.html')
  if (!existsSync(file)) return null
  const html = readFileSync(file, 'utf8')
  const found = new Set()
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    let href = m[1].split('#')[0].split('?')[0]
    if (href.startsWith(ORIGIN)) href = href.slice(ORIGIN.length)
    if (!href.startsWith('/')) continue          // off-site source documents
    found.add(href.replace(/\/+$/, '') || '/')
  }
  return found
}

/** Breadth-first from the homepage, the way a crawler arrives. */
function crawl(out) {
  const seen = new Set(['/'])
  const dangling = new Set()
  const queue = ['/']
  while (queue.length) {
    const links = linksOn(out, queue.shift())
    if (links === null) { dangling.add(queue.length); continue }
    for (const next of links) {
      if (linksOn(out, next) === null) { dangling.add(next); continue }
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  return { seen, dangling }
}

test('every page can be reached from the homepage by following links', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    // Indexed pages only. A language page kept out of the index is meant to
    // be unreachable from English; that is the next test.
    const { robotsFor } = await import('../../src/lib/seo.js')
    const written = new Set([...pagesIn(out)].filter(p => robotsFor(p) === null))
    const { seen } = crawl(out)
    const orphans = [...written].filter(p => !seen.has(p)).sort()

    assert.deepEqual(orphans, [],
      `${orphans.length} of ${written.size} pages are reachable only from the sitemap. ` +
      'Google calls that "Discovered, currently not indexed" and it is how this site ' +
      `went to 169 indexed out of 4,620. First few: ${orphans.slice(0, 5).join(', ')}`)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('no internal link points at a page that was never written', async () => {
  // The opposite failure, and just as quiet: a crawl budget spent on 404s.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const { dangling } = crawl(out)
    assert.deepEqual([...dangling].sort(), [],
      `these links go nowhere: ${[...dangling].slice(0, 5).join(', ')}`)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a hub page names its own children', async () => {
  // A section page that does not list what is in it is both a dead end for a
  // crawler and a thin page for a reader. Both halves of the Search Console
  // report came from the same missing list.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    const register = linksOn(out, '/projects')
    assert.ok(register.has('/projects/613'), 'the register does not link the project it contains')
    assert.ok(register.has('/districts/eluru'), 'the register does not link its districts')

    const finances = linksOn(out, '/finances')
    assert.ok([...finances].some(p => p.startsWith('/finances/')),
      'the finances page lists none of its questions')

    const district = linksOn(out, '/districts/eluru')
    assert.ok(district.has('/projects/613'),
      'a district page does not name the projects in that district')

    // And the project points back at the canonical district path, not at the
    // query form that only redirects there.
    const project = linksOn(out, '/projects/613')
    assert.ok(project.has('/districts/eluru'),
      'a project does not link the district page it belongs to')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

/**
 * Crawl time is the scarce thing. Search Console showed 4,300 URLs Google had
 * found and never fetched, spread evenly over six languages. A link from an
 * English page to a noindex page is a fetch spent learning that the page does
 * not want to be indexed, so none may exist, anywhere in the reachable graph.
 */
test('no page a crawler can reach links into a language kept out of the index', async () => {
  const { splitLangPath, isIndexedLang } = await import('../../src/lib/routes.js')
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const { seen } = crawl(out)
    const leaks = [...seen].filter(p => !isIndexedLang(splitLangPath(p).lang)).sort()
    assert.deepEqual(leaks, [],
      `${leaks.length} noindex language page(s) are linked from indexed ones: ${leaks.slice(0, 5).join(', ')}`)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a language page is still written, and leads back to English', async () => {
  // Out of the index is not out of the site. A shared Telugu link must still
  // open a Telugu page, and a crawler landing on one is pointed home.
  const { PREFIXED_LANGS, isIndexedLang } = await import('../../src/lib/routes.js')
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    for (const code of PREFIXED_LANGS.filter(c => !isIndexedLang(c))) {
      for (const path of ['/', '/projects', '/projects/613', '/districts/eluru']) {
        const local = path === '/' ? `/${code}` : `/${code}${path}`
        const links = linksOn(out, local)
        assert.ok(links !== null, `${local} was not written`)
        assert.ok(links.has(path), `${local} does not link its English page ${path}`)
      }
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a district spelling with no page is not linked', async () => {
  // Found by the dangling-link test above, at full scale: 42 links to seven
  // district pages that do not exist, because the register carries the
  // spelling the source document used. The pages themselves are fine. The
  // link was the lie.
  const { base, stop } = await stubApi({ stray: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    const { dangling } = crawl(out)
    assert.deepEqual([...dangling].sort(), [],
      `an unfolded district spelling was linked anyway: ${[...dangling].join(', ')}`)

    // The page is still written and still complete. It just names no district.
    const stray = readFileSync(join(out, 'projects/999/index.html'), 'utf8')
    assert.match(stray, /A Project in an Unknown District/)
    assert.ok(!stray.includes('/districts/ruritania'),
      'it linked the district that has no page, in the body or in the breadcrumb')

    // And the build says so, rather than letting it pass unseen.
    const r = await runPrerender(base, out)
    assert.match(r.stdout + r.stderr, /Ruritania/,
      'the build did not name the unmatched district spelling')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a district spelled the way its source spelled it still reaches its own page', async () => {
  // The other half of the test above, and the half that was missing. Refusing
  // to link an unknown district kept the crawl clean; it did not put the
  // project back on its district page. 42 projects were reachable only from
  // the register, and absent from the one page a reader would look on.
  const { base, stop } = await stubApi({ folded: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    const page = readFileSync(join(out, 'projects/998/index.html'), 'utf8')
    assert.ok(page.includes('/districts/tirupati'),
      'a project filed as Tirupathi did not link the Tirupati district page')
    assert.ok(!page.includes('/districts/tirupathi'),
      'it invented a second address for one district')

    // The record keeps its own words. Only the address is canonicalised.
    assert.match(page, /Tirupathi/,
      'the source document spelling was rewritten, which is not this fix')

    const { dangling } = crawl(out)
    assert.deepEqual([...dangling].sort(), [])

    // And nothing is reported as unmatched, because nothing is.
    const r = await runPrerender(base, out)
    assert.ok(!/match no district page/.test(r.stdout + r.stderr),
      'a district that folds cleanly was still reported as unmatched')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a project page asks the questions people search, and answers each one', async () => {
  // WHY
  //
  // 4,038 of 4,614 pages were project pages, and Search Console had 4,379 URLs
  // sitting in "Discovered, currently not indexed". Those are the same pages.
  // Stripped of the nav they shared with every other page, a project page held
  // roughly zero words of its own: every fact was in a definition list, and a
  // definition list is not the sentence anyone types into a search box.
  //
  // This does not check wording. It checks that each fact present in the
  // record turns into a question with a real answer under it, and that a fact
  // the record does not carry produces no question at all.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const page = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    const body = page.split('<body')[1]
    const h2s = [...body.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1])

    // One heading per fact the stub carries: cost, stage, timing, place,
    // responsibility, source. Plus "what the record says" for the description.
    assert.ok(h2s.length >= 6, `only ${h2s.length} headings: ${h2s.join(' | ')}`)
    assert.ok(h2s.some(h => /\?$/.test(h)), 'not one heading is a question')

    // Every question is followed by text, not by an empty paragraph.
    for (const m of body.matchAll(/<h2>([^<]+\?)<\/h2>\s*<p>([\s\S]*?)<\/p>/g)) {
      assert.ok(m[2].trim().length > 10, `the answer under "${m[1]}" is empty`)
    }

    // The numbers themselves reached the questions, not just the paragraph.
    assert.match(body, /55,549/, 'the cost is missing from the page')
    assert.match(body, /Under construction/, 'the status was still never printed')
    assert.match(body, /Irrigation/, 'the project type was still never printed')
    assert.match(body, /Eluru/, 'the district is missing')
    assert.match(body, /N30000002/, 'the project code, the reader\'s own check on us, is missing')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a question is not asked when the record cannot answer it', async () => {
  // The failure this guards against is the tempting one: filling a thin page
  // by printing "no figure is on record" under every missing field. That is
  // 4,038 pages of identical boilerplate, which is the thin-content problem
  // restated, not solved. A silent omission is the honest answer.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const body = readFileSync(join(out, 'projects/613/index.html'), 'utf8').split('<body')[1]

    // The stub carries no mandal and no actual cost. Neither may appear as an
    // empty heading, a dash, or a "not available".
    assert.ok(!/<h2>[^<]*<\/h2>\s*<p>\s*<\/p>/.test(body), 'a question was asked with no answer')
    assert.ok(!/not available|no data|N\/A|—\s*<\/p>/i.test(body),
      'a missing field was papered over instead of dropped')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the questions on the page are the questions in the structured data', async () => {
  // Two copies of the same answer is how a site ends up telling a reader one
  // number and an answer engine another. They are built from one array, and
  // this is what keeps them built from one array.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const page = readFileSync(join(out, 'projects/613/index.html'), 'utf8')

    const graph = JSON.parse(
      page.match(/id="site-schema">([\s\S]*?)<\/script>/)[1])['@graph']
    const faq = graph.find(n => n['@type'] === 'FAQPage')
    assert.ok(faq, 'no FAQPage in the graph')
    assert.ok(faq.mainEntity.length >= 5, 'the graph carries fewer questions than the page')

    const body = page.split('<body')[1]
    for (const q of faq.mainEntity) {
      assert.equal(q['@type'], 'Question')
      assert.equal(q.acceptedAnswer['@type'], 'Answer')
      assert.ok(q.acceptedAnswer.text.trim(), `"${q.name}" has an empty answer in the graph`)
      // Both sides escape differently, so compare on the distinctive words.
      const stem = q.name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(w => w.length > 3)[0]
      assert.ok(body.includes(stem), `the graph asks "${q.name}" and the page does not`)
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the breadcrumb points at the district page, not at the query that redirects to it', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const page = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    const graph = JSON.parse(
      page.match(/id="site-schema">([\s\S]*?)<\/script>/)[1])['@graph']
    const crumbs = graph.find(n => n['@type'] === 'BreadcrumbList')
    const urls = crumbs.itemListElement.map(i => i.item)
    assert.ok(urls.some(u => u.endsWith('/districts/eluru')),
      `the district crumb is not the district page: ${urls.join(' ')}`)
    assert.ok(!urls.some(u => u.includes('?district=')),
      'the breadcrumb still publishes the query form, which canonicalises elsewhere')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a district page lists the projects filed under its other names', async () => {
  // Linking the project to its district page was only half the job. The page
  // picked its projects with an exact string comparison, so a page headed
  // Tirupati refused to list a project the register spells Tirupathi. 110 of
  // the 526 projects that carry a district were absent from the one page a
  // reader would look on, including 41 in Sri Potti Sriramulu Nellore.
  const { base, stop } = await stubApi({ folded: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const page = readFileSync(join(out, 'districts/tirupati/index.html'), 'utf8')
    assert.ok(page.includes('/projects/998'),
      'the district page does not list the project filed under its older name')
    assert.match(page, /A Project Filed Under an Older Name/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('every district in the catalogue is a page, even one with nothing in it', async () => {
  // The sitemap is built from the catalogue and the pages were built from the
  // projects, so the two disagreed by one district. Alluri Sitharama Raju was
  // published in the sitemap with no file behind it, and the six URLs served
  // the empty app shell to every crawler that does not run JavaScript.
  const { base, stop } = await stubApi({ catalogue: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    for (const slug of ['eluru', 'tirupati', 'alluri-sitharama-raju']) {
      assert.ok(existsSync(join(out, `districts/${slug}/index.html`)),
        `${slug} is in the catalogue and was never prerendered`)
    }

    // And the empty one says so in a sentence, rather than reading "0 tracked
    // government projects", which is a number pretending to be prose.
    const bare = readFileSync(join(out, 'districts/alluri-sitharama-raju/index.html'), 'utf8')
    assert.match(bare, /is tracked here yet/)
    assert.ok(!/>0 tracked/.test(bare), 'the empty district page still counts at the reader')
    // It is still a real page in the site, not a dead end.
    assert.ok(bare.includes('/projects'), 'the empty district page links nowhere')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the catalogue never costs a page when it is unreachable', async () => {
  // It is not load bearing. Without it the build must be exactly what it was:
  // every district that holds a project still gets its page.
  const { base, stop } = await stubApi()   // /projects/filters answers 404 here
  const out = outDir()
  try {
    const r = await runPrerender(base, out)
    assert.equal(r.status, 0, r.stderr)
    assert.ok(existsSync(join(out, 'districts/eluru/index.html')))
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('one work with two government records gets one page to rank, and both figures on it', async () => {
  // WHY
  //
  // Polavaram was in the register twice: the Socio-Economic Survey annexure at
  // ₹30,437 crore and the MoSPI flash report at ₹55,549 crore. Two pages, two
  // names, 25,000 crore apart. To a search engine they were near duplicates
  // competing for the same query, so neither won. To a reader who found both,
  // the site looked careless.
  //
  // The fix is not to delete a row or pick a winning number. Both are published
  // by the government and the gap between them is the most interesting fact the
  // site holds about that dam.
  const { base, stop } = await stubApi({ twin: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    const canonical = readFileSync(join(out, 'projects/613/index.html'), 'utf8')
    const duplicate = readFileSync(join(out, 'projects/1/index.html'), 'utf8')

    // The duplicate is still written. Its URL may already be indexed or shared,
    // and a crawler that finds it must be told where the work lives, not 404.
    assert.match(duplicate, /Polavaram/)
    assert.match(duplicate,
      /<link rel="canonical" href="https:\/\/apfactcheck\.dheeco\.com\/projects\/613"/,
      'the duplicate competes with the canonical page instead of handing it the ranking')
    assert.match(canonical,
      /<link rel="canonical" href="https:\/\/apfactcheck\.dheeco\.com\/projects\/613"/,
      'the canonical page must point at itself, or the chain never ends')

    // hreflang, whenever there is a set, is NOT redirected with the canonical:
    // it describes this page in its languages, and pointing it elsewhere would
    // claim another record's translation is this one's.
    for (const [, href] of duplicate.matchAll(/hreflang="[^"]+" href="([^"]+)"/g)) {
      assert.match(href, /\/projects\/1$/, `the duplicate's alternate points at ${href}`)
    }

    // Both figures are on the page that ranks, each next to the document it
    // came from. Neither is averaged away or quietly dropped.
    assert.match(canonical, /55,549/)
    assert.match(canonical, /30,437/)
    assert.match(canonical, /MoSPI flash report/)
    assert.match(canonical, /<table>/)

    // And the disagreement is asked as the question a reader would ask.
    assert.match(canonical, /<h2>Why do government sources give different figures/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a merged work is listed once, and every link to it points at the page that ranks', async () => {
  const { base, stop } = await stubApi({ twin: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)

    const register = readFileSync(join(out, 'projects/index.html'), 'utf8')
    assert.ok(register.includes('href="/projects/613"'), 'the work is missing from the register')
    assert.ok(!register.includes('href="/projects/1"'),
      'the register lists the same dam twice, at two costs, with no way to tell which to open')

    // The district page is the case that broke first. MoSPI files Polavaram
    // with no district, the survey files it in Eluru, so once the MoSPI record
    // became canonical the dam fell off Eluru's page: the page still linked
    // the survey record, which now points away from itself. A link a crawler
    // is told to leave again is worse than the duplicate it replaced.
    const eluru = readFileSync(join(out, 'districts/eluru/index.html'), 'utf8')
    assert.ok(eluru.includes('href="/projects/613"'),
      'the work is missing from the district page a reader would look on')
    assert.ok(!eluru.includes('href="/projects/1"'),
      'the district page links the record that hands its ranking away')

    // Nothing points at a page that does not exist, merged or not.
    const { dangling } = crawl(out)
    assert.deepEqual([...dangling].sort(), [])

    // And the build says a merge happened, because a silent merge is how a
    // real project disappears from a public register.
    const r = await runPrerender(base, out)
    assert.match(r.stdout + r.stderr, /\/projects\/1 -> \/projects\/613/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('what the record says about a project leads its page', async () => {
  // WHY
  //
  // Every scraper writes a description and they write good ones, from the
  // AMRUT milestone line to the multi-paragraph Government Order account
  // behind Ramayapatnam Port. None of it reached a page for months: the
  // prerenderer builds all 4,620 pages from the project list endpoint, whose
  // schema left description out to keep the register light on a phone. The
  // page had working code for it and printed nothing, on every project, in
  // six languages, and it read as missing data rather than a missing field.
  //
  // It leads now, as the first question, because "what is this" is the first
  // thing a reader asks and it is the only prose on the page.
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const body = readFileSync(join(out, 'projects/613/index.html'), 'utf8').split('<body')[1]

    const h2s = [...body.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1])
    assert.match(h2s[0], /^What is /, `the first heading is "${h2s[0]}"`)
    assert.match(body, /Central-sector project tracked in the MoSPI flash report/)

    // Once only. It used to have its own block at the foot of the page as
    // well, and two copies of one paragraph is duplicate content on 4,038
    // pages.
    const copies = body.split('Central-sector project tracked').length - 1
    assert.equal(copies, 1, `the description appears ${copies} times`)

    // And it reaches the machines too, not just the reader.
    const graph = JSON.parse(readFileSync(join(out, 'projects/613/index.html'), 'utf8')
      .match(/id="site-schema">([\s\S]*?)<\/script>/)[1])['@graph']
    const faq = graph.find(n => n['@type'] === 'FAQPage')
    assert.ok(faq.mainEntity.some(q => /^What is /.test(q.name)))
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a project with nothing written about it is not asked what it is', async () => {
  // The record decides. A blank heading over a blank paragraph on the projects
  // no scraper has described yet is exactly the boilerplate this work exists
  // to remove.
  const { base, stop } = await stubApi({ twin: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    // TWIN inherits PROJECT's description, so blank it through the register
    // instead: the guard is in projectSections, and ask() drops an empty answer.
    const body = readFileSync(join(out, 'projects/613/index.html'), 'utf8').split('<body')[1]
    assert.ok(!/<h2>[^<]*<\/h2>\s*<p>\s*<\/p>/.test(body), 'a question was asked with no answer')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

/**
 * TELUGU, READ AS A TELUGU READER READS IT
 *
 * Telugu went back into the index on one condition: that a Telugu page is
 * Telugu where it counts. The head is what a search result shows, so it is
 * checked first; then the district, which was English in every sentence;
 * then the pages whose text is still English, which must stay out.
 */
const TELUGU = /[\u0C00-\u0C7F]/
const visibleText = html => html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')

test('a Telugu project page has a Telugu head and Telugu place names', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const te = readFileSync(join(out, 'te/projects/613/index.html'), 'utf8')
    const en = readFileSync(join(out, 'projects/613/index.html'), 'utf8')

    const title = te.match(/<title>([^<]*)<\/title>/)[1]
    const description = te.match(/<meta name="description" content="([^"]*)"/)[1]
    assert.ok(TELUGU.test(title), `English title on a Telugu page: ${title}`)
    assert.ok(TELUGU.test(description), `English snippet on a Telugu page: ${description}`)
    assert.match(description, /ఏలూరు/, 'the snippet names the district in English')
    assert.match(description, /నిర్మాణంలో/, 'the status is not the catalogue\'s Telugu status')
    assert.ok(!/undefined|\{\w+\}/.test(title + description), 'an empty slot leaked into the head')

    const text = visibleText(te)
    assert.match(text, /ఏలూరు/, 'the district is not named in Telugu on the page')
    assert.ok(!/\bEluru\b/.test(text), 'the English district name is still in the Telugu page text')
    assert.match(te, /<h1 lang="en">/, 'the English project name is not marked as English')

    assert.deepEqual([...te.matchAll(/hreflang="([^"]+)"/g)].map(m => m[1]), ['en', 'te', 'x-default'])
    assert.match(en, /hreflang="te" href="https:\/\/apfactcheck\.dheeco\.com\/te\/projects\/613"/)
    assert.ok(!/<meta name="robots"/.test(te), 'an indexed Telugu project page says noindex')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a Telugu district page and section page are titled in Telugu', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const district = readFileSync(join(out, 'te/districts/eluru/index.html'), 'utf8')
    assert.match(district.match(/<title>([^<]*)<\/title>/)[1], /ఏలూరు/)
    assert.match(district, /<h1>[^<]*ఏలూరు[^<]*<\/h1>/)

    for (const path of ['te', 'te/projects', 'te/finances', 'te/about']) {
      const html = readFileSync(join(out, path, 'index.html'), 'utf8')
      const title = html.match(/<title>([^<]*)<\/title>/)[1]
      const h1 = html.match(/<h1>([^<]*)<\/h1>/)[1]
      assert.ok(TELUGU.test(title), `/${path} has an English title: ${title}`)
      assert.ok(TELUGU.test(h1), `/${path} has an English heading: ${h1}`)
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a Telugu page whose text is English stays out of the index, and out of the links', async () => {
  const { FACT_CHECKS, factCheckPath } = await import('../../src/lib/factcheck.js')
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const pages = [
      ['finances/departments/school-education', '/finances/departments/school-education'],
      [factCheckPath(FACT_CHECKS[0].slug).slice(1), factCheckPath(FACT_CHECKS[0].slug)],
    ]
    for (const [rel, path] of pages) {
      const te = readFileSync(join(out, 'te', rel, 'index.html'), 'utf8')
      const en = readFileSync(join(out, rel, 'index.html'), 'utf8')
      assert.match(te, /<meta name="robots" content="noindex, follow"/, `/te${path} is English text offered to Telugu search`)
      assert.ok(!/hreflang=/.test(te), `/te${path} is noindex and declares alternates`)
      assert.ok(!/hreflang=/.test(en), `${path} names a noindex Telugu page as its translation`)
      assert.ok(!linksOn(out, path).has(`/te${path}`), `${path} links its noindex Telugu page`)
      assert.ok(!/<meta name="robots"/.test(en), `${path} is English and must stay indexed`)
    }
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

/**
 * THE MoU REGISTER, AS A CRAWLER READS IT
 *
 * /investments was 83 words to anything that does not run JavaScript. The
 * commitments, the amounts and the companies were all fetched after load.
 */
test('the investments page lists every commitment, its amount and who says so', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const html = readFileSync(join(out, 'investments/index.html'), 'utf8')

    for (const m of MOUS) assert.match(html, new RegExp(m.company_name.replace(/[()]/g, '\\$&')), `${m.company_name} is not on the page`)
    assert.match(html, /1,35,000/, 'the amount is missing or not in Indian grouping')
    assert.match(html, /3 live commitments/, 'the headline is not the live count')
    assert.match(html, /6\.5% from government records/, 'the source shares are missing')

    // A status carries its authority unless a government record says it.
    assert.match(html, /Investment Started · company says/)
    assert.match(html, /Investment Started · press reports/)
    assert.match(html, /<td>Operational<\/td>/, 'a government-recorded status should be bare')

    // The cancelled one is on the page and out of the total.
    assert.match(html, /Lulu Group International/)
    assert.match(html, /Not counted in the total: 1 cancelled \(2,200 crore\)/)
    assert.ok(!/4 live commitments/.test(html))

    assert.match(html, /No reliable signing date published/, 'an undated commitment should say so')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('the Telugu investments page says the same things in Telugu', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const te = readFileSync(join(out, 'te/investments/index.html'), 'utf8')
    assert.match(te, /Google \(Alphabet Inc\.\)/)
    assert.match(te, /ప్రభుత్వ రికార్డు/, 'the government tier label is not in Telugu')
    assert.match(te, /పత్రికా వార్తల ప్రకారం/, 'the press attribution is not in Telugu')
    assert.match(te, /రద్దయినవి 1/, 'the cancelled line is not in Telugu')
    assert.ok(!/<meta name="robots"/.test(te), 'the Telugu investments page must be indexed')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a register that cannot be read costs the table, not the build', async () => {
  const { base, stop } = await stubApi({ noMous: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0, 'a broken MoU endpoint must not fail the build')
    const html = readFileSync(join(out, 'investments/index.html'), 'utf8')
    assert.match(html, /<h1>Investment MoUs signed by Andhra Pradesh<\/h1>/)
    assert.ok(!/<table>/.test(html), 'a table was written from a register that did not answer')
    assert.ok(!/live commitments/.test(html), 'a headline was invented with no stats to back it')
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})

test('a merged record names its district in the snippet, the way the page does', async () => {
  // /projects/1 is the Socio-Economic Survey row with no district of its own.
  // The page body already borrowed Eluru from the MoSPI row it is merged
  // with; the title and snippet said "Andhra Pradesh" until this.
  const { base, stop } = await stubApi({ twin: true })
  const out = outDir()
  try {
    assert.equal((await runPrerender(base, out)).status, 0)
    const en = readFileSync(join(out, 'projects/1/index.html'), 'utf8')
    assert.match(en.match(/<meta name="description" content="([^"]*)"/)[1], /in Eluru:/)
    const te = readFileSync(join(out, 'te/projects/1/index.html'), 'utf8')
    assert.match(te.match(/<meta name="description" content="([^"]*)"/)[1], /ఏలూరు జిల్లా/)
  } finally {
    stop(); rmSync(out, { recursive: true, force: true })
  }
})
