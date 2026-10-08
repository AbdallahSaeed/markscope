/**
 * AI provider API keys. Never stored in sync storage and never exported.
 * The user chooses `local` (persists on this device) or `session` (memory
 * only, cleared when the browser closes).
 *
 * Each key is bound to the origin it was saved for. If settings later point
 * the provider at a different origin (e.g. via an imported settings file),
 * the key is withheld until the user re-enters it — so a key can never be
 * redirected to an attacker-controlled endpoint.
 */
import type { KeyStorageMode } from '@/shared/settings'
import type { KeyValueArea } from './area'

export const SECRET_KEY = 'ai.apiKey'
const MAX_KEY_LENGTH = 512

interface StoredSecret {
  key: string
  origin: string
}

export interface SecretsStore {
  /** Returns the key only if it was saved for `origin`. */
  getApiKey(origin: string): Promise<string>
  setApiKey(key: string, mode: KeyStorageMode, origin: string): Promise<void>
  clear(): Promise<void>
  /** Origin the stored key is bound to, or null when no key is stored. */
  storedOrigin(): Promise<string | null>
}

function parse(v: unknown): StoredSecret | null {
  if (typeof v !== 'object' || v === null) return null
  const { key, origin } = v as Record<string, unknown>
  return typeof key === 'string' && key !== '' && typeof origin === 'string'
    ? { key, origin }
    : null
}

export function createSecretsStore(
  areas: Record<KeyStorageMode, KeyValueArea>,
): SecretsStore {
  const read = async (): Promise<StoredSecret | null> => {
    // Session takes priority: it's the more recent, more restrictive choice.
    for (const area of [areas.session, areas.local]) {
      const s = parse(await area.get(SECRET_KEY))
      if (s) return s
    }
    return null
  }
  return {
    async getApiKey(origin) {
      const s = await read()
      return s && origin !== '' && s.origin === origin ? s.key : ''
    },
    async setApiKey(key, mode, origin) {
      const clean = key.trim()
      if (clean.length > MAX_KEY_LENGTH || /\s/.test(clean)) {
        throw new Error('API key looks malformed')
      }
      if (clean !== '' && !origin)
        throw new Error('Set a valid provider base URL before saving a key')
      // Remove from both areas first so a key never lingers in the other one.
      await Promise.all([
        areas.local.remove(SECRET_KEY),
        areas.session.remove(SECRET_KEY),
      ])
      if (clean !== '')
        await areas[mode].set(SECRET_KEY, { key: clean, origin } satisfies StoredSecret)
    },
    async clear() {
      await Promise.all([
        areas.local.remove(SECRET_KEY),
        areas.session.remove(SECRET_KEY),
      ])
    },
    async storedOrigin() {
      return (await read())?.origin ?? null
    },
  }
}
