import claimsRaw from '@/data/claims.json'

// Claims checked against official papers.
// Kept in its own module so only the pages that show it download it.

export const claims = claimsRaw as any[]
