import investRaw from '@/data/investments.json'

// Investment promise records.
// Kept in its own module so only the pages that show it download it.

export const invest = investRaw as any
