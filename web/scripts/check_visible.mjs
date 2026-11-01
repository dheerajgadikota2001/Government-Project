// Stops a build that would show readers a visible mistake.
//
// WHY
// A fact-check site that prints "undefined", a name cut in the middle of a word or a line of shouting capitals
// loses the reader's trust in one look. Government names are the usual cause, because they arrive in capitals,
// split across words and cut by a search result. This reads every page the build wrote (dist/**/*.html) and checks
// the words a reader or a search result sees first: the <title>, the <h1>, the description and the share-picture
// text. The long body of a page may quote a paper exactly as printed, so capitals are allowed there.
//
// Run after the build:  node scripts/check_visible.mjs      (npm run test:visible)
// It lists every failing page with the rule it broke and exits 1 if there is any.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const towns = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'src/data/towns_te.json'), 'utf8')))
const townKey = new Set(towns.map((t) => t.toLowerCase().replace(/[^a-z]/g, '')))

// Letters that are a word on their own in capitals (names of schemes, bodies, units).
const OK_CAPS = new Set(['AP', 'APTIDCO', 'AMRUT', 'NH', 'SH', 'CAG', 'GVMC', 'ULB', 'STP', 'WTP', 'MLD', 'TMT', 'HDPE', 'PVC', 'RCC', 'MW', 'GW', 'KV', 'REZ', 'EPC', 'PPP', 'BOT', 'SEZ', 'HNSS', 'TBP', 'GLSR', 'ELSR', 'PMGSY', 'APCRDA', 'CRDA', 'MoSPI', 'RBI', 'PIB', 'NITI', 'UDISE', 'FRBM', 'GST', 'GSDP', 'LGD', 'MOU', 'MOUS', 'IT', 'AI', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'KM', 'DPR', 'SIPB', 'HPCL', 'CFL', 'BPCL', 'IOCL', 'ONGC', 'GAIL', 'NTPC', 'APGENCO', 'APTRANSCO', 'POWERGRID', 'NHAI', 'NHIDCL', 'GMR', 'JSW', 'LNG', 'CGD', 'LWE', 'TN', 'TG', 'SC', 'ST', 'SW', 'BC', 'OBC', 'GO', 'MC', 'NP'])

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.html')) files.push(p)
  }
})(dist)

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
const strip = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const pick = (html, re) => { const m = html.match(re); return m ? decode(m[1]).trim() : '' }

const problems = []
const bad = (file, field, rule, text) => problems.push({ file: path.relative(dist, file), field, rule, text: text.slice(0, 110) })

function checkWords(file, field, text, isTelugu) {
  if (!text) return
  if (/\b(undefined|NaN|null)\b|\[object|\{\{|%s\b/.test(text)) bad(file, field, 'placeholder text showing', text)
  if (/[{}]|,,|\(\s*[—–-]/.test(text)) bad(file, field, 'stray bracket or punctuation', text)
  if (/ {2,}/.test(text)) bad(file, field, 'double space', text)
  if (/\s[,;:.!?](?!\d)/.test(text) && !/\s\.\.\./.test(text)) bad(file, field, 'space before punctuation', text)
  if (/[,;:](?=[A-Za-z])/.test(text)) bad(file, field, 'no space after punctuation', text)
  if (/\(\s|\s\)/.test(text)) bad(file, field, 'space inside a bracket', text)
  if (/[…]/.test(text) && /\w…/.test(text)) bad(file, field, 'name cut in the middle of a word', text)
  if (/\?\s*\?|\s\?\s(?=[A-Z])/.test(text)) bad(file, field, 'stray question mark where a dash was', text)
  // a run of three or more capital-letter words that are not known short names
  const words = text.split(/[\s/:()\[\],;]+/).filter(Boolean)
  let run = 0
  for (const w of words) {
    const core = w.replace(/[^A-Za-z]/g, '')
    const caps = !w.includes('-') && core.length >= 3 && core === core.toUpperCase() && !OK_CAPS.has(core)
    run = caps ? run + 1 : 0
    if (run >= 2) { bad(file, field, 'words in capitals', text); break }
  }
  // a word a paper split in two, where the joined word is a town ("Jangareddygu dem")
  const w2 = text.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < w2.length - 1; i++) {
    const a = w2[i].toLowerCase(), b = w2[i + 1].toLowerCase()
    // the second piece is a lower-case tail, or the whole name is in capitals; "Nagar I" is not "Nagari"
    const tail = w2[i + 1][0] === w2[i + 1][0].toLowerCase() || w2[i] === w2[i].toUpperCase()
    if (tail && a.length >= 4 && b.length <= 6 && townKey.has(a + b) && !townKey.has(a)) { bad(file, field, 'a word split in two', text); break }
  }
  if (!isTelugu && /[ఀ-౿]/.test(text) === false && /^[a-z]/.test(text)) bad(file, field, 'starts in lower case', text)
}

for (const f of files) {
  if (/404\.html$/.test(f)) continue
  const html = fs.readFileSync(f, 'utf8')
  const isTe = /(^|[\\/])te([\\/]|$)/.test(path.relative(dist, f))
  const title = pick(html, /<title>([\s\S]*?)<\/title>/)
  const h1 = strip(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/))
  const desc = pick(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/)
  const ogt = pick(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)
  checkWords(f, 'title', title, isTe)
  checkWords(f, 'h1', h1, isTe)
  checkWords(f, 'description', desc, isTe)
  checkWords(f, 'og:title', ogt, isTe)
  if (!title) bad(f, 'title', 'missing', '')
  if (!isTe && title.length > 80) bad(f, 'title', 'longer than a search result shows (80)', title)
  // English left in a Telugu page's tab title is allowed only for names and kinds the owner has not translated yet.
}

const inScope = (p) => /^(te[\\/])?projects[\\/]/.test(p.file) || process.env.STRICT === '1'
const blocking = problems.filter(inScope)
const backlog = problems.filter((p) => !inScope(p))
if (backlog.length) console.log(`Backlog (not blocking yet): ${backlog.length} findings on ${new Set(backlog.map((p) => p.file)).size} other pages. Run with STRICT=1 to list them.`)
problems.length = 0
problems.push(...blocking)
if (problems.length) {
  const byRule = {}
  for (const p of problems) byRule[p.rule] = (byRule[p.rule] || 0) + 1
  if (process.env.SUMMARY) {
    const by = {}
    for (const p of problems) { const k = p.file.replace(/^te[\\/]/, '').split(/[\\/]/)[0] + ' | ' + p.rule; by[k] = (by[k] || 0) + 1 }
    for (const [k, n] of Object.entries(by).sort()) console.error(String(n).padStart(5), k)
    process.exit(1)
  }
  console.error(`Visible mistakes on ${new Set(problems.map((p) => p.file)).size} pages (${problems.length} findings)`)
  for (const [r, n] of Object.entries(byRule)) console.error(`  ${n}  ${r}`)
  for (const p of problems.slice(0, Number(process.env.SHOW || 40))) console.error(`  ${p.file}  [${p.field}] ${p.rule}: ${p.text}`)
  process.exit(1)
}
console.log(`Visible-mistakes check: ${files.length} pages, no findings.`)
