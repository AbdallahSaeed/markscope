import { chromeArea } from './area'
import { createLibraryStore } from './library-store'
import { createSecretsStore } from './secrets-store'
import { createSettingsStore } from './settings-store'

/** Settings follow the user via sync storage when available. */
export function settingsStore() {
  return createSettingsStore(chromeArea(chrome.storage.sync ? 'sync' : 'local'))
}

export function libraryStore() {
  return createLibraryStore(chromeArea('local'))
}

export function secretsStore() {
  return createSecretsStore({
    local: chromeArea('local'),
    session: chromeArea('session'),
  })
}
