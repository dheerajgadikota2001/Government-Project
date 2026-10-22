import polavaramRaw from '@/data/polavaram.json'

// Polavaram in full: progress readings, papers, the story (about 116 KB raw).
// Kept in its own module so only the pages that show it download it.

export const pol = polavaramRaw as any
