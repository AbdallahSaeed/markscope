/**
 * Minimal key-value storage abstraction so stores can be unit-tested with an
 * in-memory implementation. Free of browser-extension APIs: the chrome.storage
 * adapter lives in chrome-area.ts (the VS Code extension supplies its own).
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
