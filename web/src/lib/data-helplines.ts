import helplinesRaw from '@/data/helplines.json'

// Official helplines and offices (about 83 KB raw).
// Kept in its own module so only the pages that show it download it.

export const helplines = helplinesRaw as any
