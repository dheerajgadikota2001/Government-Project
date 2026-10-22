import communityRaw from '@/data/community.json'
import legalRaw from '@/data/legal.json'

// The board's topic counts and the legal pages. Only the About, Community and policy pages use them.

export const community = communityRaw as any[]
export const legal = legalRaw as any
