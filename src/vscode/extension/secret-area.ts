/**
 * VS Code's SecretStorage (the OS keychain) as a `KeyValueArea`, so the same
 * `createSecretsStore` that guards the browser extension's key guards this one:
 * a key is bound to the endpoint origin it was saved for and withheld otherwise.
 */
import { memoryArea, type KeyValueArea } from '@/storage/area'
import { createSecretsStore, type SecretsStore } from '@/storage/secrets-store'

/** The slice of `vscode.SecretStorage` this needs. */
export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>
  store(key: string, value: string): PromiseLike<void>
  delete(key: string): PromiseLike<void>
}

const PREFIX = 'markscope.'

export function secretStorageArea(storage: SecretStorageLike): KeyValueArea {
  return {
    async get(key) {
      const raw = await storage.get(PREFIX + key)
      if (raw === undefined) return undefined
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return undefined
      }
    },
    async set(key, value) {
      await storage.store(PREFIX + key, JSON.stringify(value))
    },
    async remove(key) {
      await storage.delete(PREFIX + key)
    },
    subscribe: () => () => undefined,
  }
}

/** Persistent keys live in the keychain; the browser's "session only" mode is memory. */
export function createVscodeSecrets(storage: SecretStorageLike): SecretsStore {
  return createSecretsStore({ local: secretStorageArea(storage), session: memoryArea() })
}
