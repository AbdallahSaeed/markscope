/** chrome.storage adapter for the browser extension. */
import type { KeyValueArea } from './area'

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
