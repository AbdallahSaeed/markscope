import { chromeArea, memoryArea } from '@/storage/area'
import {
  createLibraryStore,
  MAX_RECENTS,
  parseLibrary,
  refKey,
} from '@/storage/library-store'
import { createSecretsStore, SECRET_KEY } from '@/storage/secrets-store'
import { createSettingsStore, SETTINGS_KEY } from '@/storage/settings-store'

describe('settings store', () => {
  test('load returns defaults, update persists validated values', async () => {
    const area = memoryArea()
    const store = createSettingsStore(area)
    expect((await store.load()).theme).toBe('system')
    await store.update({ theme: 'dark', typography: { fontSize: 99 } })
    const stored = (await area.get(SETTINGS_KEY)) as {
      theme: string
      typography: { fontSize: number }
    }
    expect(stored.theme).toBe('dark')
    expect(stored.typography.fontSize).toBe(24)
  })

  test('concurrent updates are serialised (no lost writes)', async () => {
    const store = createSettingsStore(memoryArea())
    await Promise.all([
      store.update({ theme: 'dark' }),
      store.update({ autoRender: false }),
      store.update({ code: { lineNumbers: true } }),
    ])
    const s = await store.load()
    expect([s.theme, s.autoRender, s.code.lineNumbers]).toEqual(['dark', false, true])
  })

  test('replace validates imported data; reset restores defaults', async () => {
    const store = createSettingsStore(memoryArea())
    expect(
      (await store.replace({ theme: 'light', urlPatterns: ['<all_urls>'] })).urlPatterns,
    ).toEqual([])
    expect((await store.reset()).theme).toBe('system')
  })

  test('subscribe receives parsed settings', async () => {
    const store = createSettingsStore(memoryArea())
    const seen: string[] = []
    const off = store.subscribe(s => seen.push(s.theme))
    await store.update({ theme: 'light' })
    off()
    await store.update({ theme: 'dark' })
    expect(seen).toEqual(['light'])
  })
})

describe('library', () => {
  const url = (u: string) => ({ kind: 'url' as const, url: u })

  test('visits move entries to the top and keep titles', async () => {
    let t = 0
    const lib = createLibraryStore(memoryArea(), () => ++t)
    await lib.visit(url('a'), 'A')
    await lib.visit(url('b'), 'B')
    await lib.visit(url('a'), '')
    const { entries } = await lib.load()
    expect(entries.map(e => [refKey(e.ref), e.title])).toEqual([
      ['url:a', 'A'],
      ['url:b', 'B'],
    ])
  })

  test('recents are capped but favorites are kept', async () => {
    let t = 0
    const lib = createLibraryStore(memoryArea(), () => ++t)
    await lib.favorite(url('fav'), true, 'Fav')
    for (let i = 0; i < MAX_RECENTS + 10; i++) await lib.visit(url(`d${i}`), '')
    const { entries } = await lib.load()
    expect(entries.filter(e => !e.favorite)).toHaveLength(MAX_RECENTS)
    expect(entries.some(e => e.favorite && refKey(e.ref) === 'url:fav')).toBe(true)
  })

  test('unfavorite, remove, clear recents', async () => {
    const lib = createLibraryStore(memoryArea())
    await lib.visit(url('a'), 'A')
    await lib.favorite(url('a'), true)
    await lib.visit({ kind: 'local', id: 'abc12345', name: 'n.md' }, 'N')
    expect((await lib.clearRecents()).entries.map(e => refKey(e.ref))).toEqual(['url:a'])
    await lib.favorite(url('a'), false)
    expect((await lib.remove(url('a'))).entries).toEqual([])
  })

  test('parseLibrary drops malformed and duplicate entries', () => {
    const lib = parseLibrary({
      entries: [
        { ref: { kind: 'url', url: 'x' }, title: 'X', openedAt: 2 },
        { ref: { kind: 'url', url: 'x' } },
        { ref: { kind: 'evil' } },
        'junk',
        { ref: { kind: 'local', id: 'i', name: 'n' }, openedAt: 5, favorite: true },
      ],
    })
    expect(lib.entries.map(e => refKey(e.ref))).toEqual(['local:i', 'url:x'])
    expect(parseLibrary(null).entries).toEqual([])
  })

  test('subscribe emits parsed library', async () => {
    const lib = createLibraryStore(memoryArea())
    const fn = vi.fn()
    lib.subscribe(fn)
    await lib.visit(url('a'), 'A')
    expect(fn).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ title: 'A' })],
    })
  })
})

describe('secrets', () => {
  const A = 'https://api.anthropic.com'
  test('keys live in exactly one area and session wins', async () => {
    const local = memoryArea()
    const session = memoryArea()
    const secrets = createSecretsStore({ local, session })
    await secrets.setApiKey('  sk-local  ', 'local', A)
    expect(await local.get(SECRET_KEY)).toEqual({ key: 'sk-local', origin: A })
    await secrets.setApiKey('sk-session', 'session', A)
    expect(await local.get(SECRET_KEY)).toBeUndefined()
    expect(await secrets.getApiKey(A)).toBe('sk-session')
    expect(await secrets.storedOrigin()).toBe(A)
    await secrets.clear()
    expect(await secrets.getApiKey(A)).toBe('')
    expect(await secrets.storedOrigin()).toBeNull()
  })

  test('a key is never released to a different origin', async () => {
    const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
    await secrets.setApiKey('sk-real', 'local', A)
    expect(await secrets.getApiKey('https://evil.example')).toBe('')
    expect(await secrets.getApiKey('')).toBe('')
  })

  test('rejects malformed keys, keys without origin, and treats empty as delete', async () => {
    const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
    await expect(secrets.setApiKey('has space', 'local', A)).rejects.toThrow(/malformed/)
    await expect(secrets.setApiKey('x'.repeat(600), 'local', A)).rejects.toThrow()
    await expect(secrets.setApiKey('sk', 'local', '')).rejects.toThrow(/base URL/)
    await secrets.setApiKey('', 'local', A)
    expect(await secrets.storedOrigin()).toBeNull()
  })

  test('legacy/garbage stored values are ignored', async () => {
    const local = memoryArea({ [SECRET_KEY]: 'plain-string-key' })
    expect(await createSecretsStore({ local, session: memoryArea() }).getApiKey(A)).toBe(
      '',
    )
  })
})

describe('chromeArea adapter', () => {
  test('reads, writes and filters change events by area', async () => {
    const area = chromeArea('local')
    const seen: unknown[] = []
    const off = area.subscribe(c => seen.push(c))
    await area.set('k', 1)
    expect(await area.get('k')).toBe(1)
    await chrome.storage.sync.set({ other: 2 })
    await area.remove('k')
    off()
    expect(seen).toHaveLength(2)
    expect(await area.get('k')).toBeUndefined()
  })
})

test('memoryArea isolates stored values from caller mutation', async () => {
  const area = memoryArea()
  const value = { a: 1 }
  await area.set('x', value)
  value.a = 2
  expect(await area.get('x')).toEqual({ a: 1 })
})
