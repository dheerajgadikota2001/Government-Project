import eventsRaw from '@/data/events.json'
import type { Event } from '@/lib/data'

// Each work's dated history (about 265 KB raw). Only the project page and the city of works use it.
// Kept in its own module so only the pages that show it download it.

export const events = eventsRaw as unknown as Record<string, Event[]>
