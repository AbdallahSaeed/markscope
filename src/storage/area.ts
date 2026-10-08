/**
 * Minimal key-value storage abstraction over chrome.storage areas so stores
 * can be unit-tested with an in-memory implementation.
 */
export type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
) => void

export interface KeyValueArea {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  subscribe(listener: ChangeListener): () => void
}

export type ChromeAreaName = 'local' | 'sync' | 'session'

export function chromeArea(name: ChromeAreaName): KeyValueArea {
  const area = chrome.storage[name]
  return {
    async get(key) {
      const out = await area.get(key)
      return out[key]
    },
    async set(key, value) {
      await area.set({ [key]: value })
    },
    async remove(key) {
      await area.remove(key)
    },
    subscribe(listener) {
      const handler = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === name) listener(changes)
      }
      chrome.storage.onChanged.addListener(handler)
      return () => chrome.storage.onChanged.removeListener(handler)
    },
  }
}

export function memoryArea(initial: Record<string, unknown> = {}): KeyValueArea {
  let data: Record<string, unknown> = structuredClone(initial)
  const listeners = new Set<ChangeListener>()
  const emit = (key: string, oldValue: unknown, newValue: unknown) => {
    for (const l of listeners) l({ [key]: { oldValue, newValue } })
  }
  return {
    async get(key) {
      return structuredClone(data[key])
    },
    async set(key, value) {
      const oldValue = data[key]
      data = { ...data, [key]: structuredClone(value) }
      emit(key, oldValue, value)
    },
    async remove(key) {
      const oldValue = data[key]
      const { [key]: _removed, ...rest } = data
      data = rest
      emit(key, oldValue, undefined)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
