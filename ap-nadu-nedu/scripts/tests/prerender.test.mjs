import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

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

/** A stub register. Shapes copied from the live API, not invented. */
function stubApi({ empty = false, breakExtras = false } = {}) {
  return new Promise(resolve_ => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      res.setHeader('content-type', 'application/json')
      if (url.pathname === '/api/v1/projects/') {
        const items = empty ? [] : [PROJECT]
        return res.end(JSON.stringify({ items, total: items.length, page: 1, page_size: 100, has_next: false }))
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
    assert.match(html, /POLAVARAM IRRIGATION PROJECT/)
    assert.match(html, /23,776/, 'the spend figure is not in the HTML')
    assert.match(html, /55,549/, 'the cost figure is not in the HTML')
    assert.match(html, /76%/)
    assert.match(html, /MoSPI flash report, June 2025/, 'the citation is missing')
    assert.match(html, /mospi\.gov\.in/, 'nothing links to the source document')

    // And it is a real body, not a shell.
    const body = html.split('<body')[1] || ''
    assert.ok(body.length > 800, `body is only ${body.length} bytes; it was 46 before`)
    assert.match(html, /<h1>POLAVARAM IRRIGATION PROJECT<\/h1>/)
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
    assert.match(ogTitles[0], /POLAVARAM/, 'the preview still shows the site, not the page')

    const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)[1]
    assert.match(ogDesc, /55,549|Polavaram|POLAVARAM/i)

    assert.match(html, /<meta property="og:url" content="[^"]*\/projects\/613"/)
    assert.match(html, /<title>POLAVARAM[^<]*<\/title>/)
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

test('each page carries its own canonical and the full hreflang set', async () => {
  const { base, stop } = await stubApi()
  const out = outDir()
  try {
    await runPrerender(base, out)
    const te = readFileSync(join(out, 'te/projects/613/index.html'), 'utf8')

    assert.match(te, /<link rel="canonical" href="[^"]*\/te\/projects\/613"/,
      'the Telugu page canonicalises somewhere other than itself')

    const langs = [...te.matchAll(/hreflang="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(langs, ['en', 'te', 'hi', 'ur', 'ta', 'or', 'x-default'])
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
    assert.match(html, /<div id="root">\s*<h1>/,
      'the static body is outside #root; React will not replace it and the ' +
      'page will show the prerendered copy under the real one')
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
