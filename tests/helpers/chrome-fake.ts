/**
 * In-memory fake of the chrome.* APIs Markscope uses. Deliberately small:
 * just enough behaviour for integration tests of background/content logic.
 */
import { vi } from 'vitest'

type Listener = (...args: any[]) => any

export function createEvent() {
  const listeners = new Set<Listener>()
  return {
    addListener: (l: Listener) => listeners.add(l),
    removeListener: (l: Listener) => listeners.delete(l),
    hasListener: (l: Listener) => listeners.has(l),
    emit: (...args: unknown[]) => [...listeners].map(l => l(...args)),
    listeners,
  }
}

function storageArea(name: string, onChanged: ReturnType<typeof createEvent>) {
  let data: Record<string, unknown> = {}
  return {
    async get(keys?: string | string[] | null) {
      if (keys === null || keys === undefined) return structuredClone(data)
      const list = Array.isArray(keys) ? keys : [keys]
      const out: Record<string, unknown> = {}
      for (const k of list) if (k in data) out[k] = structuredClone(data[k])
      return out
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: v }
        data = { ...data, [k]: structuredClone(v) }
      }
      onChanged.emit(changes, name)
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys]
      const changes: Record<string, unknown> = {}
      for (const k of list) {
        changes[k] = { oldValue: data[k] }
        const { [k]: _gone, ...rest } = data
        data = rest
      }
      onChanged.emit(changes, name)
    },
    async clear() {
      data = {}
    },
    setAccessLevel: vi.fn(async () => undefined),
  }
}

export function createChromeFake(extensionId = 'testextensionid') {
  const onChanged = createEvent()
  const base = `chrome-extension://${extensionId}/`
  const fake = {
    runtime: {
      id: extensionId,
      getURL: (path: string) => base + path.replace(/^\//, ''),
      onMessage: createEvent(),
      onConnect: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(async () => undefined),
      getManifest: () => ({ version: '1.0.0' }),
      setUninstallURL: vi.fn(),
      lastError: undefined as undefined | { message: string },
    },
    storage: {
      onChanged,
      local: storageArea('local', onChanged),
      sync: storageArea('sync', onChanged),
      session: storageArea('session', onChanged),
    },
    tabs: {
      update: vi.fn(async (_id: number, props: { url: string }) => ({
        id: _id,
        ...props,
      })),
      create: vi.fn(async (props: { url: string }) => ({ id: 99, ...props })),
      query: vi.fn(async () => []),
      get: vi.fn(async (id: number) => ({ id, url: 'https://example.com/readme.md' })),
    },
    scripting: {
      executeScript: vi.fn(async () => [] as unknown[]),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      getRegisteredContentScripts: vi.fn(async () => [] as unknown[]),
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn(async () => undefined),
      onClicked: createEvent(),
    },
    commands: { onCommand: createEvent() },
    permissions: {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => true),
      onAdded: createEvent(),
      onRemoved: createEvent(),
    },
    extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) },
    i18n: { getUILanguage: () => 'en' },
  }
  return fake
}

export type ChromeFake = ReturnType<typeof createChromeFake>

export function installChromeFake(): ChromeFake {
  const fake = createChromeFake()
  ;(globalThis as unknown as { chrome: unknown }).chrome = fake
  return fake
}
