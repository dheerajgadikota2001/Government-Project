import papersRaw from '@/data/papers.json'
import registerRaw from '@/data/register_papers.json'

// Papers and the register. Each JSON file becomes its own cached file (see manualChunks in
// vite.config.ts). Tenders and the refresh log are live, read from the API (src/lib/live.ts).

export const papers = papersRaw as any
/** The papers register, without the voter-roll-like papers and the lists of names (pending the owner's go). */
export const registerPapers = registerRaw as any
