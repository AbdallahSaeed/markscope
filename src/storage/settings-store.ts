import {
  mergeSettings,
  parseSettings,
  type DeepPartial,
  type Settings,
} from '@/shared/settings'
import type { KeyValueArea } from './area'

export const SETTINGS_KEY = 'settings'

export interface SettingsStore {
  load(): Promise<Settings>
  update(patch: DeepPartial<Settings>): Promise<Settings>
  replace(next: unknown): Promise<Settings>
  reset(): Promise<Settings>
  subscribe(listener: (settings: Settings) => void): () => void
}

export function createSettingsStore(area: KeyValueArea): SettingsStore {
  // Serialise writes so rapid UI changes can't interleave read-modify-write.
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }

  const load = async () => parseSettings(await area.get(SETTINGS_KEY))

  return {
    load,
    update: patch =>
      enqueue(async () => {
        const next = mergeSettings(await load(), patch)
        await area.set(SETTINGS_KEY, next)
        return next
      }),
    replace: raw =>
      enqueue(async () => {
        const next = parseSettings(raw)
        await area.set(SETTINGS_KEY, next)
        return next
      }),
    reset: () =>
      enqueue(async () => {
        await area.remove(SETTINGS_KEY)
        return parseSettings(undefined)
      }),
    subscribe(listener) {
      return area.subscribe(changes => {
        const change = changes[SETTINGS_KEY]
        if (change) listener(parseSettings(change.newValue))
      })
    },
  }
}
