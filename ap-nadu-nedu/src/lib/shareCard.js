/**
 * What goes on a page's share card: the picture WhatsApp, Facebook and X show
 * when someone pastes one of this site's links.
 *
 * WHY THIS EXISTS
 *
 * No page on the site had an og:image. A link to the Polavaram page pasted
 * into a village WhatsApp group arrived as a line of grey text, beside a
 * forwarded image of a politician making a claim about the same dam. The
 * claim had a picture and the record did not. On a platform whose whole job
 * is to be the thing people check a claim against, that is the record losing
 * before anyone reads it.
 *
 * So every project and district page now carries a card that states the
 * figure and names the document it came from, drawn at build time from the
 * same record the page prints. A card is a picture of the page's own first
 * paragraph, not a poster: nothing on it is a figure the page does not show.
 *
 * WHAT THIS FILE IS
 *
 * The words and numbers only, as plain data. Drawing them is
 * scripts/share-cards.mjs. Kept apart so the content can be tested without a
 * browser, and so a card and its page are built from one set of helpers
 * (money.js for rounding, projectTitle.js for the name, the catalogue for
 * every label) and cannot disagree.
 *
 * THE RULE
 *
 * A field with no value leaves its space empty. A card never says "0%" for a
 * project with no progress on record, never prints a cost it does not have,
 * and never names a source it cannot cite. Same rule as every other part of
 * the site.
 */
import { displayTitle } from './projectTitle.js'
import { summarySource } from './sourceDocs.js'
import { croreAmount } from './money.js'

/** Card text is drawn at a fixed size, so a very long name is cut here, at a word. */
const MAX_TITLE = 200

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const cut = (s, max) => {
  const text = norm(s)
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const at = head.lastIndexOf(' ')
  return (at > max * 0.5 ? head.slice(0, at) : head).replace(/[\s,;:.(-]+$/, '') + '…'
}

/** A translator that answers null for a missing key instead of the key's name. */
const make = t => (key, vars) => {
  const s = t(key, vars)
  return typeof s === 'string' && s !== key.split('.').pop() ? s : null
}

const rupees = (value, tr) => {
  const amount = croreAmount(value)
  return amount == null ? null : `₹${amount} ${tr('unit.croreWord') || 'crore'}`
}

/**
 * A percentage as the page prints it: the record's own figure, no rounding.
 * The page says "86.15% built" and so does the card.
 */
const percent = v => (v == null || !Number.isFinite(Number(v)) ? null : `${Number(v)}%`)

/**
 * The words on the card's button. A preview is one tap target, so this is not
 * a real button: it tells the reader what the tap opens, in the page's own
 * terms ("See the documents" on a project, "See all 21" on a district).
 */
const CTA_FALLBACK = {
  project: 'See the documents', district: 'See all {count}', factcheck: 'Read the check',
  finances: 'See the figures', department: 'See the budget', section: 'Read more', site: 'Open the site',
}
export const CTA_KINDS = Object.keys(CTA_FALLBACK)
const action = (tr, kind, vars) => tr(`share.cta.${kind}`, vars) ||
  CTA_FALLBACK[kind].replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m))

/**
 * The card for one project.
 *
 * @param observation  the latest dated observation (the extras endpoint), or
 *                     null. It carries the spend figure and the name of the
 *                     report the figures came from.
 * @param district     where the work is, taken from the merged sibling when
 *                     this record has none (prerender.mjs workDistrict).
 */
export function projectCard({ project, observation = null, district = null, t, lang }) {
  if (!project?.title) return null
  const tr = make(t)
  const stats = []

  const pct = percent(project.completion_percentage)
  if (pct) stats.push({ value: pct, label: tr('share.built') || 'built' })
  else if (project.status) {
    const status = tr(`projects.status.${project.status}`)
    if (status) stats.push({ value: status, label: tr('share.status') || 'status' })
  }
  const cost = rupees(project.estimated_cost_crore, tr)
  if (cost) stats.push({ value: cost, label: tr('share.estimatedCost') || 'estimated cost' })
  const spent = rupees(observation?.cumulative_expenditure_crore, tr)
  if (spent) stats.push({ value: spent, label: tr('share.spent') || 'spent so far' })

  const where = district
    ? tr('share.district', { district }) || `${district} district`
    : tr('share.statewide') || 'Andhra Pradesh'
  const type = project.project_type ? tr(`projects.type.${project.project_type}`) : null

  // The document the figures on the card come from, by the same rule as the
  // page's own source line (sourceDocs.js), so the two cannot disagree.
  const sourceName = norm(summarySource({ project, observation })?.label)
  return {
    kind: 'project',
    lang,
    eyebrow: [type, where].filter(Boolean).join(' · '),
    title: cut(displayTitle(project.title), MAX_TITLE),
    // English on a Telugu card, on purpose: the project's name is the
    // register's until a checked Telugu name exists, and the page says so.
    titleLang: 'en',
    stats: stats.slice(0, 3),
    progress: pct ? Math.max(0, Math.min(100, Number(project.completion_percentage))) : null,
    cta: action(tr, 'project'),
    source: sourceName
      ? tr('share.source', { source: sourceName }) || `Source: ${sourceName}`
      : tr('share.sourceGeneric') || 'Every figure from a government document',
  }
}

/** The card for one district page. */
export function districtCard({ district, count, costCrore, t, lang }) {
  if (!district) return null
  const tr = make(t)
  const stats = []
  if (Number.isFinite(count)) {
    stats.push({ value: String(count), label: tr('share.projectsTracked') || 'projects tracked' })
  }
  const cost = count ? rupees(costCrore, tr) : null
  if (cost) stats.push({ value: cost, label: tr('share.combinedCost') || 'combined estimated cost' })
  return {
    kind: 'district',
    lang,
    eyebrow: tr('share.kind.district') || 'District',
    title: tr('projects.district.heading', { district }) || `Government projects in ${district}`,
    stats,
    progress: null,
    // "See all 0" would be a promise the page cannot keep.
    cta: count > 0 ? action(tr, 'district', { count }) : action(tr, 'section'),
    source: tr('share.sourceGeneric') || 'Every figure from a government document',
  }
}

/**
 * The card for any other page: its heading and its one-line description.
 * Used for sections, finance questions, fact checks and department budgets.
 *
 * @param kind  which button words to use: 'section' (default), 'finances',
 *              'factcheck' or 'department'
 */
export function sectionCard({ title, subtitle, eyebrow, kind = 'section', t, lang }) {
  if (!norm(title)) return null
  const tr = make(t)
  return {
    kind: 'section',
    lang,
    eyebrow: norm(eyebrow),
    title: cut(title, MAX_TITLE),
    subtitle: cut(subtitle, 220),
    stats: [],
    progress: null,
    cta: action(tr, CTA_FALLBACK[kind] ? kind : 'section'),
    source: tr('share.sourceGeneric') || 'Every figure from a government document',
  }
}

/** The fallback card: the site itself. */
export function siteCard({ t, lang }) {
  const tr = make(t)
  return {
    kind: 'site',
    lang,
    eyebrow: '',
    title: tr('share.siteTitle') || 'Andhra Pradesh projects, budget and debt',
    subtitle: tr('share.tagline') || 'Every figure from a government document, with the document linked.',
    stats: [],
    progress: null,
    cta: action(tr, 'site'),
    source: tr('share.sourceGeneric') || 'Every figure from a government document',
  }
}

/**
 * The text a screen reader, and a platform that cannot load the image, gets
 * instead of the picture. Everything the card says, in reading order.
 */
export function cardAlt(card) {
  if (!card) return ''
  const figures = (card.stats || []).map(s => `${s.value} ${s.label}`).join(', ')
  return [card.title, figures, card.subtitle, card.source]
    .map(norm).filter(Boolean).join('. ').replace(/\.\./g, '.')
}

/**
 * The homepage's card: what the site holds, counted at build time from the
 * same register the pages are written from. The committed site card in
 * public/og cannot carry counts, because it is not redrawn when they change.
 */
export function homeCard({ projects, districts, departments, t, lang }) {
  const tr = make(t)
  const stats = []
  if (Number.isFinite(projects) && projects > 0) stats.push({ value: projects.toLocaleString('en-IN'), label: tr('share.projectsTracked') || 'projects tracked' })
  if (Number.isFinite(districts) && districts > 0) stats.push({ value: String(districts), label: tr('share.districtsCovered') || 'districts' })
  if (Number.isFinite(departments) && departments > 0) stats.push({ value: String(departments), label: tr('share.departmentBudgets') || 'department budgets' })
  return { ...siteCard({ t, lang }), kind: 'home', subtitle: '', stats }
}
