import factsRaw from '@/data/statefacts.json'

// State indicators year by year (about 98 KB raw).
// Kept in its own module so only the pages that show it download it.

export const facts = factsRaw as any
