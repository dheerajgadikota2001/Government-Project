/**
 * What a department's budget page says about itself.
 *
 * WHY THIS FILE EXISTS
 *
 * The register already held forty departments, thirteen years each, every row
 * carrying the URL of the budget volume it was read from. None of it had an
 * address. "Andhra Pradesh school education budget" is a search people type
 * and the answer was sitting inside one chart on one page, unreachable.
 *
 * THE FACT THAT MAKES THESE PAGES WORTH READING
 *
 * For two departments the collection has audited actuals as well as budget
 * estimates. That allows the one sentence nobody else in Andhra Pradesh
 * publishes: the state budgeted X for school education in a given year and the
 * audited accounts recorded Y spent. Not an accusation, not an interpretation.
 * Two numbers from two government books, named.
 *
 * THE RULES IT WILL NOT BREAK
 *
 *  - A gap is only ever computed between a BE and an Actual for the SAME year.
 *    Comparing one year's plan with another year's outcome is meaningless and
 *    is the mistake this kind of page usually makes.
 *  - A plan and an outcome are never added together into a total.
 *  - Revenue and Capital are never carried back before 2017-18. Until then the
 *    books published Plan and Non-Plan, which answers a different question.
 *  - Tenures are compared per year, never by total, because the 2014 and 2019
 *    governments had five budgets and the present one has three.
 *  - Every clause disappears when its figure is missing. A department with
 *    only budget estimates gets a shorter page, not an invented one.
 */
import { croreAmount } from './money.js'

export const departmentSlug = name => String(name || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

export function departmentPath(name) {
  const slug = departmentSlug(name)
  return slug ? `/finances/departments/${slug}` : '/finances'
}

/** Sortable, because "2026-27" sorts correctly as a string but a year does not. */
const startYear = row => Number(String(row?.year || '').slice(0, 4)) || 0

const byStage = (rows, stage) => (rows || []).filter(r => r.stage === stage && r.total_crore != null)

/**
 * The tenure a year belongs to, as the register recorded it. Not derived here:
 * a tenure boundary falls mid financial year and the register has already made
 * that call once, carefully.
 */
export const TENURE_KEYS = ['tdp1', 'ysrcp', 'tdp2']

/**
 * Everything a department page needs, computed once.
 * Returns nulls rather than guesses, so the caller drops clauses.
 */
export function departmentFacts(department) {
  const rows = department?.rows || []
  const budgets = byStage(rows, 'BE').sort((a, b) => startYear(a) - startYear(b))
  const actuals = byStage(rows, 'Actual')

  const latest = budgets.length ? budgets[budgets.length - 1] : null
  const largest = budgets.reduce((best, r) => (!best || r.total_crore > best.total_crore ? r : best), null)

  // The gap, only where the same year has both a plan and an audited outcome.
  const gaps = actuals
    .map(actual => {
      const budget = budgets.find(b => b.year === actual.year)
      if (!budget) return null
      return {
        year: actual.year,
        budgeted: budget.total_crore,
        spent: actual.total_crore,
        gap: budget.total_crore - actual.total_crore,
        tenure: actual.tenure || budget.tenure || null,
        source_url: actual.source_url || budget.source_url || null,
      }
    })
    .filter(Boolean)

  // The largest shortfall, which is the one worth a sentence. A year where more
  // was spent than budgeted is a real finding too and keeps its sign.
  const widest = gaps.reduce((best, g) => (!best || g.gap > best.gap ? g : best), null)

  // Per year, never per tenure total: the governments served different lengths.
  const perTenure = TENURE_KEYS.map(key => {
    const years = budgets.filter(b => b.tenure === key)
    if (!years.length) return null
    const total = years.reduce((sum, r) => sum + r.total_crore, 0)
    return { tenure: key, years: years.length, perYear: total / years.length }
  }).filter(Boolean)

  return {
    name: department?.department || null,
    demand: department?.demand_no || department?.demand_number || null,
    latest,
    largest,
    firstYear: budgets.length ? budgets[0].year : null,
    yearCount: budgets.length,
    gaps,
    widest,
    perTenure,
    hasActuals: actuals.length > 0,
  }
}

/**
 * @returns string[] sentences, in order, each dropped when its figure is absent.
 */
export function departmentSummary({ department, t, fmtNum }) {
  const f = departmentFacts(department)
  if (!f.name || !f.latest) return []

  const unit = t('unit.croreWord')
  const money = v => croreAmount(v, fmtNum)
  const out = []

  out.push(t('finances.dept.latest', {
    department: f.name,
    year: f.latest.year,
    amount: money(f.latest.total_crore),
    unit,
  }))

  if (f.yearCount > 1 && f.firstYear) {
    out.push(t('finances.dept.span', {
      count: f.yearCount,
      first: f.firstYear,
      last: f.latest.year,
    }))
  }

  // The sentence this page exists for.
  if (f.widest && f.widest.gap > 0) {
    out.push(t('finances.dept.gap', {
      year: f.widest.year,
      budgeted: money(f.widest.budgeted),
      spent: money(f.widest.spent),
      gap: money(f.widest.gap),
      unit,
    }))
  } else if (!f.hasActuals) {
    out.push(t('finances.dept.noActuals'))
  }

  if (f.perTenure.length > 1) {
    out.push(t('finances.dept.perTenure', {
      parts: f.perTenure
        .map(p => t(`finances.dept.tenure.${p.tenure}`, { amount: money(p.perYear), unit }))
        .join('; '),
    }))
  }

  return out
}
