import periodsRaw from '@/data/periods.json'

// Government periods by date and Chief Minister.
// Kept in its own module so only the pages that show it download it.

export const periods = periodsRaw as any
