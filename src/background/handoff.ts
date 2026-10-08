/**
 * One-time handoff of document text from a content script to the viewer.
 * Entries live in chrome.storage.session (memory-only, cleared on browser
 * exit, not readable by content scripts) with an in-memory fallback for
 * very large documents. Each id can be claimed once and expires.
 */
import { randomId } from '@/shared/ids'
import type { KeyValueArea } from '@/storage/area'

export const HANDOFF_TTL_MS = 5 * 60 * 1000
const SESSION_LIMIT = 8 * 1024 * 1024
const PREFIX = 'handoff:'

export interface HandoffEntry {
  url: string
  text: string
  createdAt: number
}

export interface HandoffStore {
  put(url: string, text: string): Promise<string>
  claim(id: string): Promise<HandoffEntry | null>
}

export function createHandoffStore(
  session: KeyValueArea,
  now: () => number = Date.now,
): HandoffStore {
  const memory = new Map<string, HandoffEntry>()
  const fresh = (e: HandoffEntry | undefined | null) =>
    !!e && now() - e.createdAt <= HANDOFF_TTL_MS

  return {
    async put(url, text) {
      const id = randomId()
      const entry: HandoffEntry = { url, text, createdAt: now() }
      if (text.length * 2 < SESSION_LIMIT) {
        try {
          await session.set(PREFIX + id, entry)
          return id
        } catch {
          // quota exceeded: fall through to memory
        }
      }
      memory.set(id, entry)
      return id
    },
    async claim(id) {
      const mem = memory.get(id)
      if (mem) {
        memory.delete(id)
        return fresh(mem) ? mem : null
      }
      const stored = (await session.get(PREFIX + id)) as HandoffEntry | undefined
      if (!stored) return null
      await session.remove(PREFIX + id)
      return fresh(stored) ? stored : null
    },
  }
}
