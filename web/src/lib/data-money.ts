import moneyRaw from '@/data/money.json'

// Debt, budgets and department spending (about 174 KB raw).
// Kept in its own module so only the pages that show it download it.

export const money = moneyRaw as any
