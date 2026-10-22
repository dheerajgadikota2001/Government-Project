import papersRaw from '@/data/papers.json'
import registerRaw from '@/data/register_papers.json'
import tendersRaw from '@/data/tenders.json'
import updatesRaw from '@/data/updates.json'

// Papers, the register, tenders and the refresh log. Each JSON file still becomes its own
// cached file (see manualChunks in vite.config.ts), so a new tender does not invalidate the
// 450 KB register.

export const papers = papersRaw as any
/** The papers register, without the voter-roll-like papers and the lists of names (pending the owner's go). */
export const registerPapers = registerRaw as any
export const tenders = tendersRaw as any
export const updates = updatesRaw as any
