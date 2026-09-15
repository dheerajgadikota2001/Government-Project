/**
 * The questions under the numbers on the State Finances page.
 *
 * WHY THIS FILE EXISTS
 *
 * The finances page was 13,762px tall: a debt card, four tenure tiles, four
 * chart cards, and then nine long sections one after another, 3,566 words on
 * a single scroll. Every section was right and nobody could find the one they
 * came for. Measured on the live site before this file was written.
 *
 * The fix keeps everything above the sections exactly as it was and turns the
 * nine sections into a menu: pick a question, see only that answer. For that
 * to work the questions need a stable identity that three consumers agree on:
 *
 *   Finances.jsx       renders the menu and the one open answer
 *   prerender.mjs      writes one static page per question, in six languages
 *   generate-sitemap   lists each question page so search can find it
 *
 * One list here, and a test that the three agree. The same reasoning as
 * routes.js, and the same failure it prevents: a hand-maintained mirror drifts.
 *
 * WHY EACH QUESTION HAS ITS OWN ADDRESS
 *
 * A reader who searches "does Andhra Pradesh earn enough to run itself" should
 * land on that answer, not on a page that opens on a different one. So every
 * question is a URL, /finances/<slug>, and /finances itself opens on the first.
 *
 * Slugs are English and permanent. They are addresses, not copy: renaming one
 * breaks every link to it. The reader sees the translated question, never the
 * slug.
 */

/** Group order is the reading order of the menu. Labels are catalogue keys. */
export const FINANCE_GROUPS = [
  { key: 'howMuch', labelKey: 'finances.menu.group.howMuch' },
  { key: 'tooMuch', labelKey: 'finances.menu.group.tooMuch' },
  { key: 'used', labelKey: 'finances.menu.group.used' },
  { key: 'claims', labelKey: 'finances.menu.group.claims' },
]

/**
 *   slug          the address segment, permanent
 *   id            the section id Finances.jsx already used, kept so old
 *                 fragment links (/finances#ratio) still land somewhere
 *   group         one of FINANCE_GROUPS
 *   questionKey   the question as the reader sees it, translated
 *   answerKey     the one-paragraph answer, translated; null where the
 *                 component computes its own from the data
 *   title         the browser tab and search headline, English (see routes.js
 *                 for why titles are still English on every language)
 *   description   the search snippet, under about 155 characters
 */
export const FINANCE_QUESTIONS = [
  {
    slug: 'whose-number-is-right',
    id: 'three-sources',
    group: 'howMuch',
    questionKey: 'finances.q.threeSources',
    answerKey: 'finances.a.threeSources',
    title: 'Whose debt figure is right? RBI, CAG and the AP budget compared',
    description:
      'Three official sources publish a different total for Andhra Pradesh\'s debt on the same 31 March. Each is shown side by side, year by year, with the reason they differ.',
  },
  {
    slug: 'what-is-the-debt-made-of',
    id: 'debt-composition',
    group: 'howMuch',
    questionKey: 'finances.q.composition',
    answerKey: 'finances.a.composition',
    title: 'What Andhra Pradesh\'s debt is made of, from the audited accounts',
    description:
      'Market loans, central government loans, provident funds and deposits: what makes up Andhra Pradesh\'s debt each year, from CAG and RBI, with the largest piece named.',
  },
  {
    slug: 'what-is-not-in-the-debt-figure',
    id: 'off-budget',
    group: 'howMuch',
    questionKey: 'finances.q.hidden',
    answerKey: 'finances.a.hidden',
    title: 'What the Andhra Pradesh debt figure leaves out: corporations and guarantees',
    description:
      'Borrowing through state corporations and guarantees given for others are real obligations that never appear in the headline debt. What CAG and RBI record for each, year by year.',
  },
  {
    slug: 'is-the-debt-too-big',
    id: 'ratio',
    group: 'tooMuch',
    questionKey: 'finances.q.tooBig',
    answerKey: 'finances.a.tooBig',
    title: 'Is Andhra Pradesh\'s debt too big for the state? Debt against GSDP',
    description:
      'Andhra Pradesh\'s debt compared with everything the state produces in a year, the way a bank compares a loan with an income. RBI debt over NSO GSDP, every year since 2014-15.',
  },
  {
    slug: 'where-does-the-money-go-first',
    id: 'committed',
    group: 'tooMuch',
    questionKey: 'finances.committed.title',
    answerKey: null,
    title: 'How much of Andhra Pradesh\'s revenue goes to interest before anything is built',
    description:
      'Interest on debt already taken is the first claim on what Andhra Pradesh earns. The share of revenue it takes each year since 2014-15, from the state\'s own budget documents.',
  },
  {
    slug: 'does-the-state-earn-enough',
    id: 'deficits',
    group: 'tooMuch',
    questionKey: 'finances.q.deficits',
    answerKey: 'finances.a.deficits',
    title: 'Does Andhra Pradesh earn enough to run itself? Fiscal and revenue deficit',
    description:
      'Andhra Pradesh has run a revenue deficit in every year since bifurcation: it borrows to pay salaries, pensions and interest. Both deficits, year by year, from the budget books.',
  },
  {
    slug: 'was-the-voted-money-spent',
    id: 'promised',
    group: 'used',
    questionKey: 'finances.promised.title',
    answerKey: null,
    title: 'Did Andhra Pradesh spend the money its Assembly voted? Budgeted against actual',
    description:
      'What the Andhra Pradesh Assembly voted for building and for running the state each year, against what the audited accounts say was actually spent. Appropriation Accounts, every year.',
  },
  {
    slug: 'which-departments',
    id: 'departments',
    group: 'used',
    questionKey: 'finances.q.departments',
    answerKey: 'finances.a.departments',
    title: 'Which Andhra Pradesh departments the money was voted for, and what each spent',
    description:
      'Forty Andhra Pradesh departments, each with what the Assembly voted and what the audited accounts record as spent, year by year, from the Demands for Grants.',
  },
  {
    slug: 'what-the-governments-claim',
    id: 'claims',
    group: 'claims',
    questionKey: 'finances.q.claims',
    answerKey: 'finances.a.claims',
    title: 'What Andhra Pradesh\'s governments claimed about each other\'s debt, checked',
    description:
      'The 2019 and 2024 white papers each put a number on the previous government\'s debt. Each claim is set beside what RBI, CAG and the accounts record for the same date.',
  },
]

export const financeQuestionPath = slug => `/finances/${slug}`

export function findFinanceQuestion(slug) {
  return FINANCE_QUESTIONS.find(q => q.slug === slug) || null
}

/** The question before and after this one in menu order, for the footer links. */
export function financeNeighbours(slug) {
  const i = FINANCE_QUESTIONS.findIndex(q => q.slug === slug)
  return {
    prev: i > 0 ? FINANCE_QUESTIONS[i - 1] : null,
    next: i >= 0 && i < FINANCE_QUESTIONS.length - 1 ? FINANCE_QUESTIONS[i + 1] : null,
  }
}

/**
 * What a broken entry would look like, in words, so the test can print it.
 * The same shape as validateFactCheck: an empty list means publishable.
 */
export function validateFinanceQuestions(questions = FINANCE_QUESTIONS, groups = FINANCE_GROUPS) {
  const problems = []
  const slugs = new Set()
  const ids = new Set()
  const groupKeys = new Set(groups.map(g => g.key))
  const used = new Set()
  for (const q of questions) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.slug || '')) problems.push(`${q.slug}: slug is not a clean kebab-case address`)
    if (slugs.has(q.slug)) problems.push(`${q.slug}: slug is used twice`)
    slugs.add(q.slug)
    if (!q.id || ids.has(q.id)) problems.push(`${q.slug}: section id missing or reused`)
    ids.add(q.id)
    if (!groupKeys.has(q.group)) problems.push(`${q.slug}: group "${q.group}" is not in FINANCE_GROUPS`)
    used.add(q.group)
    if (!q.questionKey) problems.push(`${q.slug}: no questionKey`)
    if (!q.title || q.title.length > 90) problems.push(`${q.slug}: title missing or over 90 characters`)
    if (!q.description || q.description.length > 200) problems.push(`${q.slug}: description missing or over 200 characters`)
  }
  for (const g of groups) {
    if (!used.has(g.key)) problems.push(`group "${g.key}" has no questions`)
  }
  return problems
}
