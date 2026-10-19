import { describe, expect, test, vi } from 'vitest'
import type { AIProvider } from '@/ai/types'
import type { AIPortEvent, AIPortRequest } from '@/shared/messages'
import { AI_PRESETS, defaultSettings, type Settings } from '@/shared/settings'
import { memoryArea } from '@/storage/area'
import { createSecretsStore } from '@/storage/secrets-store'
import { createPanelAI } from '@/vscode/extension/ai-host'
import {
  createVscodeSecrets,
  secretStorageArea,
  type SecretStorageLike,
} from '@/vscode/extension/secret-area'

function fakeSecretStorage(): SecretStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: async k => data.get(k),
    store: async (k, v) => void data.set(k, v),
    delete: async k => void data.delete(k),
  }
}

function aiSettings(overrides: Partial<Settings['ai']> = {}): Settings {
  const d = defaultSettings()
  return {
    ...d,
    ai: {
      ...d.ai,
      enabled: true,
      model: 'm',
      baseUrl: AI_PRESETS.anthropic.baseUrl,
      ...overrides,
    },
  }
}

const run = (id = 1): AIPortRequest => ({
  type: 'ai.run',
  id,
  task: 'summarize',
  document: '# Title\n\nSecret document text.',
  title: 'T',
  history: [],
})

async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 20))
}

function setup(opts: { settings?: Settings; key?: string; chunks?: string[] } = {}) {
  const events: AIPortEvent[] = []
  const seen: { apiKey: string; baseUrl: string; prompt: string }[] = []
  const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
  const makeProvider = vi.fn(
    (config: { apiKey: string; baseUrl: string }): AIProvider => ({
      id: 'anthropic',
      async *stream(request) {
        seen.push({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          prompt: JSON.stringify(request.messages),
        })
        for (const c of opts.chunks ?? ['Hello', ' world']) yield c
      },
    }),
  )
  const ai = createPanelAI({
    loadSettings: async () => opts.settings ?? aiSettings(),
    secrets,
    post: e => events.push(e),
    makeProvider: makeProvider as never,
  })
  return { ai, events, seen, secrets, makeProvider }
}

describe('createPanelAI', () => {
  test('streams text back, and the key reaches the provider but never the webview', async () => {
    const t = setup()
    await t.secrets.setApiKey('sk-ant-supersecret', 'local', AI_PRESETS.anthropic.baseUrl)
    t.ai.handle(run())
    await settle()
    expect(t.events).toEqual([
      { type: 'delta', id: 1, text: 'Hello' },
      { type: 'delta', id: 1, text: ' world' },
      { type: 'done', id: 1, truncated: false },
    ])
    expect(t.seen[0]!.apiKey).toBe('sk-ant-supersecret')
    expect(JSON.stringify(t.events)).not.toContain('supersecret')
  })

  test('is refused while AI is disabled and sends nothing to a provider', async () => {
    const t = setup({ settings: aiSettings({ enabled: false }) })
    t.ai.handle(run())
    await settle()
    expect(t.events).toHaveLength(1)
    expect(t.events[0]).toMatchObject({ type: 'error', id: 1 })
    expect(t.makeProvider).not.toHaveBeenCalled()
  })

  test('a key saved for one endpoint is withheld from another', async () => {
    const t = setup({
      settings: aiSettings({
        provider: 'custom',
        baseUrl: 'https://attacker.example/v1',
      }),
    })
    await t.secrets.setApiKey('sk-real', 'local', AI_PRESETS.anthropic.baseUrl)
    t.ai.handle(run())
    await settle()
    expect(t.seen[0]?.apiKey ?? '').toBe('')
  })

  test('invalid requests are answered with an error, not passed on', async () => {
    const t = setup()
    t.ai.handle({ type: 'ai.run', id: 3 } as unknown as AIPortRequest)
    await settle()
    expect(t.events[0]).toMatchObject({ type: 'error' })
    expect(t.makeProvider).not.toHaveBeenCalled()
  })

  test('a new request supersedes the one in flight, and dispose aborts quietly', async () => {
    const events: AIPortEvent[] = []
    let aborted = 0
    const ai = createPanelAI({
      loadSettings: async () => aiSettings(),
      secrets: { getApiKey: async () => 'k' },
      post: e => events.push(e),
      makeProvider: (() => ({
        id: 'anthropic',
        async *stream(_r: unknown, signal: AbortSignal) {
          signal.addEventListener('abort', () => aborted++)
          yield 'a'
          await new Promise(r => setTimeout(r, 30))
          yield 'b'
        },
      })) as never,
    })
    ai.handle(run(1))
    await new Promise(r => setTimeout(r, 5))
    ai.handle(run(2))
    await new Promise(r => setTimeout(r, 80))
    expect(aborted).toBeGreaterThanOrEqual(1)
    expect(events.filter(e => e.id === 1 && e.type === 'done')).toHaveLength(0)
    expect(events.filter(e => e.id === 2 && e.type === 'done')).toHaveLength(1)
    ai.handle(run(3))
    ai.dispose()
    await new Promise(r => setTimeout(r, 80))
    expect(events.filter(e => e.id === 3 && e.type === 'done')).toHaveLength(0)
  })
})

describe('SecretStorage adapter', () => {
  test('round-trips JSON under a prefix and tolerates garbage', async () => {
    const storage = fakeSecretStorage()
    const area = secretStorageArea(storage)
    await area.set('ai.apiKey', { key: 'k', origin: 'https://x.test' })
    expect([...storage.data.keys()]).toEqual(['markscope.ai.apiKey'])
    expect(await area.get('ai.apiKey')).toEqual({ key: 'k', origin: 'https://x.test' })
    storage.data.set('markscope.bad', '{not json')
    expect(await area.get('bad')).toBeUndefined()
    expect(await area.get('missing')).toBeUndefined()
    await area.remove('ai.apiKey')
    expect(storage.data.size).toBe(1)
  })

  test('the secrets store keeps its origin binding on top of it', async () => {
    const storage = fakeSecretStorage()
    const secrets = createVscodeSecrets(storage)
    await secrets.setApiKey('sk-x', 'local', 'https://api.anthropic.com')
    expect(await secrets.getApiKey('https://api.anthropic.com')).toBe('sk-x')
    expect(await secrets.getApiKey('https://evil.example')).toBe('')
    expect(await secrets.storedOrigin()).toBe('https://api.anthropic.com')
    await secrets.clear()
    expect(await secrets.getApiKey('https://api.anthropic.com')).toBe('')
    expect(storage.data.size).toBe(0)
  })

  test('session mode keeps the key in memory only, out of the keychain', async () => {
    const storage = fakeSecretStorage()
    const secrets = createVscodeSecrets(storage)
    await secrets.setApiKey('sk-x', 'session', 'https://api.anthropic.com')
    expect(storage.data.size).toBe(0)
    expect(await secrets.getApiKey('https://api.anthropic.com')).toBe('sk-x')
  })
})
