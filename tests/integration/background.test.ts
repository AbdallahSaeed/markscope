import { createAIService, type PortLike } from '@/background/ai-service'
import { syncUserPatterns, DYNAMIC_SCRIPT_ID } from '@/background/content-scripts'
import {
  createMenus,
  menuTargetUrl,
  MENU_OPEN_LINK,
  MENU_OPEN_PAGE,
} from '@/background/context-menus'
import { createHandoffStore, HANDOFF_TTL_MS } from '@/background/handoff'
import { readTabDocument } from '@/background/read-tab'
import { createRouter } from '@/background/router'
import { classifySender } from '@/background/sender'
import type { AIProvider } from '@/ai/types'
import type { AIPortEvent } from '@/shared/messages'
import { defaultSettings, mergeSettings } from '@/shared/settings'
import { parseViewerUrl } from '@/shared/urls'
import { memoryArea } from '@/storage/area'

const ID = 'testextensionid'
const ORIGIN = `chrome-extension://${ID}/`
const VIEWER = `${ORIGIN}viewer.html`
const contentSender = (
  url = 'https://a.com/README.md',
  tabId = 7,
): chrome.runtime.MessageSender => ({
  id: ID,
  url,
  tab: { id: tabId } as chrome.tabs.Tab,
  frameId: 0,
})
const pageSender: chrome.runtime.MessageSender = {
  id: ID,
  url: `${ORIGIN}viewer.html?src=x`,
}

function setup(
  readTab = vi.fn(
    async () => null as null | { url: string; text: string; contentType: string },
  ),
) {
  const handoff = createHandoffStore(memoryArea())
  const tabs = {
    update: vi.fn(async () => ({}) as chrome.tabs.Tab),
    create: vi.fn(async () => ({}) as chrome.tabs.Tab),
  }
  const router = createRouter({
    handoff,
    runtimeId: ID,
    viewerBase: VIEWER,
    extensionOrigin: ORIGIN,
    tabs: tabs as never,
    readTab,
  })
  return { router, tabs, handoff, readTab }
}

describe('sender classification', () => {
  test.each([
    [{ id: 'other', url: ORIGIN }, 'untrusted'],
    [{ id: ID, url: `${ORIGIN}popup.html` }, 'extension-page'],
    [{ id: ID, url: 'https://a.com/x.md', tab: { id: 1 } }, 'content-script'],
    [{ id: ID, url: 'file:///x.md', tab: { id: 1 } }, 'content-script'],
    [{ id: ID, url: 'https://a.com/x.md' }, 'untrusted'],
    [{ id: ID, url: 'chrome://x', tab: { id: 1 } }, 'untrusted'],
  ])('%j → %s', (sender, kind) => {
    expect(classifySender(sender as chrome.runtime.MessageSender, ID, ORIGIN)).toBe(kind)
  })
})

describe('handoff flow: content script → service worker → viewer', () => {
  test('content script hands off its own document and the tab navigates to the viewer', async () => {
    const { router, tabs } = setup()
    const res = await router.handle(
      {
        type: 'handoff',
        url: 'https://a.com/README.md#install',
        text: '# Hello',
        contentType: 'text/plain',
      },
      contentSender('https://a.com/README.md#install'),
    )
    expect(res).toEqual({ ok: true })
    const [tabId, { url }] = tabs.update.mock.calls[0] as unknown as [
      number,
      { url: string },
    ]
    expect(tabId).toBe(7)
    expect(url.startsWith(VIEWER)).toBe(true)
    expect(url.endsWith('#install')).toBe(true)
    const params = parseViewerUrl(url)
    expect(params.src).toBe('https://a.com/README.md')

    // The viewer claims the text exactly once.
    const claim = await router.handle(
      { type: 'handoff.claim', id: params.handoff },
      pageSender,
    )
    expect(claim).toEqual({
      ok: true,
      data: { url: 'https://a.com/README.md#install', text: '# Hello' },
    })
    expect(
      await router.handle({ type: 'handoff.claim', id: params.handoff }, pageSender),
    ).toEqual({ ok: false, error: 'Expired' })
  })

  test('a page cannot hand off a different URL than its own', async () => {
    const { router, tabs } = setup()
    const res = await router.handle(
      {
        type: 'handoff',
        url: 'https://victim.com/secret.md',
        text: 'x',
        contentType: 'text/plain',
      },
      contentSender('https://a.com/README.md'),
    )
    expect(res).toEqual({ ok: false, error: 'URL mismatch' })
    expect(tabs.update).not.toHaveBeenCalled()
  })

  test('sub-frames cannot hand off', async () => {
    const { router } = setup()
    const sender = { ...contentSender(), frameId: 3 }
    expect(
      await router.handle(
        {
          type: 'handoff',
          url: 'https://a.com/README.md',
          text: 'x',
          contentType: 'text/plain',
        },
        sender,
      ),
    ).toEqual({ ok: false, error: 'Top frame only' })
  })

  test('content scripts cannot claim handoffs or use privileged messages', async () => {
    const { router } = setup()
    expect(
      await router.handle(
        { type: 'handoff.claim', id: 'abcdef0123456789' },
        contentSender(),
      ),
    ).toEqual({ ok: false, error: 'Forbidden' })
    expect(
      await router.handle({ type: 'render-active-tab', tabId: 1 }, contentSender()),
    ).toEqual({ ok: false, error: 'Forbidden' })
    expect(await router.handle({ type: 'open-viewer' }, contentSender())).toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  test('extension pages cannot forge handoffs; other extensions are rejected', async () => {
    const { router } = setup()
    expect(
      await router.handle(
        {
          type: 'handoff',
          url: 'https://a.com/x.md',
          text: 'x',
          contentType: 'text/plain',
        },
        pageSender,
      ),
    ).toEqual({ ok: false, error: 'Forbidden' })
    expect(
      await router.handle(
        { type: 'open-viewer' },
        { id: 'evil', url: 'chrome-extension://evil/' },
      ),
    ).toEqual({ ok: false, error: 'Untrusted sender' })
    expect(await router.handle({ type: 'bogus' }, pageSender)).toEqual({
      ok: false,
      error: 'Invalid message',
    })
  })

  test('popup can render the active tab via activeTab', async () => {
    const readTab = vi.fn(async () => ({
      url: 'https://a.com/notes',
      text: '# Notes',
      contentType: 'text/plain',
    }))
    const { router, tabs } = setup(readTab)
    expect(
      await router.handle({ type: 'render-active-tab', tabId: 3 }, pageSender),
    ).toEqual({ ok: true })
    expect(
      parseViewerUrl(
        (tabs.update.mock.calls[0] as unknown as [number, { url: string }])[1].url,
      ).src,
    ).toBe('https://a.com/notes')
  })

  test('render-active-tab refuses HTML pages', async () => {
    const { router } = setup(
      vi.fn(async () => ({
        url: 'https://a.com/',
        text: '<html>',
        contentType: 'text/html',
      })),
    )
    expect(
      await router.handle({ type: 'render-active-tab', tabId: 3 }, pageSender),
    ).toMatchObject({ ok: false })
    const { router: r2 } = setup(vi.fn(async () => null))
    expect(
      await r2.handle({ type: 'render-active-tab', tabId: 3 }, pageSender),
    ).toMatchObject({ ok: false })
  })

  test('open-viewer normalises repository URLs', async () => {
    const { router, tabs } = setup()
    await router.handle(
      { type: 'open-viewer', src: 'https://github.com/a/b/blob/main/README.md' },
      pageSender,
    )
    expect(
      parseViewerUrl((tabs.create.mock.calls[0] as unknown as [{ url: string }])[0].url)
        .src,
    ).toBe('https://raw.githubusercontent.com/a/b/main/README.md')
    await router.handle({ type: 'open-viewer' }, pageSender)
    expect((tabs.create.mock.calls[1] as unknown as [{ url: string }])[0].url).toBe(
      VIEWER,
    )
  })
})

describe('handoff store', () => {
  test('entries expire', async () => {
    let now = 1000
    const store = createHandoffStore(memoryArea(), () => now)
    const id = await store.put('https://a.com/x.md', 'x')
    now += HANDOFF_TTL_MS + 1
    expect(await store.claim(id)).toBeNull()
  })
  test('huge documents fall back to memory', async () => {
    const session = memoryArea()
    const store = createHandoffStore(session)
    const big = 'x'.repeat(5 * 1024 * 1024)
    const id = await store.put('https://a.com/x.md', big)
    expect(await session.get(`handoff:${id}`)).toBeUndefined()
    expect((await store.claim(id))?.text.length).toBe(big.length)
  })
  test('quota errors fall back to memory', async () => {
    const session = {
      ...memoryArea(),
      set: vi.fn(async () => {
        throw new Error('QUOTA')
      }),
    }
    const store = createHandoffStore(session)
    const id = await store.put('u', 't')
    expect((await store.claim(id))?.text).toBe('t')
    expect(await store.claim('unknown')).toBeNull()
  })
})

describe('AI service over a port', () => {
  function fakePort(url = `${ORIGIN}viewer.html`) {
    const posted: AIPortEvent[] = []
    const listeners: ((m: unknown) => void)[] = []
    const disconnects: (() => void)[] = []
    const port: PortLike = {
      name: 'markscope.ai',
      sender: { id: ID, url },
      postMessage: m => posted.push(m),
      onMessage: { addListener: cb => listeners.push(cb) },
      onDisconnect: { addListener: cb => disconnects.push(cb) },
      disconnect: vi.fn(),
    }
    return {
      port,
      posted,
      send: (m: unknown) => listeners.forEach(l => l(m)),
      disconnect: () => disconnects.forEach(d => d()),
    }
  }
  const flush = () => new Promise(r => setTimeout(r, 0))
  const enabled = mergeSettings(defaultSettings(), {
    ai: {
      enabled: true,
      provider: 'local',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama',
    },
  })
  const provider = (chunks: string[]): AIProvider => ({
    id: 'local',
    async *stream() {
      for (const c of chunks) yield c
    },
  })

  test('streams deltas then done', async () => {
    const make = vi.fn(() => provider(['Hello', ' world']))
    const getApiKey = vi.fn(async () => '')
    const svc = createAIService({
      loadSettings: async () => enabled,
      getApiKey,
      extensionOrigin: ORIGIN,
      makeProvider: make,
    })
    const { port, posted, send } = fakePort()
    svc.onConnect(port)
    send({ type: 'ai.run', id: 1, task: 'summarize', document: '# D', title: 'D' })
    await flush()
    await flush()
    expect(posted).toEqual([
      { type: 'delta', id: 1, text: 'Hello' },
      { type: 'delta', id: 1, text: ' world' },
      { type: 'done', id: 1, truncated: false },
    ])
    expect(make).toHaveBeenCalledWith({
      provider: 'local',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
    })
    // The key is requested for the configured origin only.
    expect(getApiKey).toHaveBeenCalledWith('http://localhost:11434')
  })

  test('refuses when AI is disabled', async () => {
    const svc = createAIService({
      loadSettings: async () => defaultSettings(),
      getApiKey: async () => '',
      extensionOrigin: ORIGIN,
      makeProvider: () => provider(['x']),
    })
    const { port, posted, send } = fakePort()
    svc.onConnect(port)
    send({ type: 'ai.run', id: 2, task: 'summarize', document: 'x', title: 'x' })
    await flush()
    expect(posted[0]).toMatchObject({
      type: 'error',
      id: 2,
      message: expect.stringMatching(/turned off/),
    })
  })

  test('content scripts (web origins) are disconnected', () => {
    const svc = createAIService({
      loadSettings: async () => enabled,
      getApiKey: async () => 'k',
      extensionOrigin: ORIGIN,
    })
    const { port } = fakePort('https://evil.com/x.md')
    svc.onConnect(port)
    expect(port.disconnect).toHaveBeenCalled()
  })

  test('invalid requests and provider errors are reported', async () => {
    const failing: AIProvider = {
      id: 'local',
      async *stream() {
        throw new Error('boom')
      },
    }
    const svc = createAIService({
      loadSettings: async () => enabled,
      getApiKey: async () => '',
      extensionOrigin: ORIGIN,
      makeProvider: () => failing,
    })
    const { port, posted, send } = fakePort()
    svc.onConnect(port)
    send({ type: 'ai.run', task: 'nope' })
    send({ type: 'ai.test', id: 9 })
    await flush()
    await flush()
    expect(posted.map(p => p.type)).toContain('error')
    expect(
      posted.some(p => p.type === 'error' && p.id === 9 && p.message === 'boom'),
    ).toBe(true)
  })

  test('abort stops streaming without an error', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const slow: AIProvider = {
      id: 'local',
      async *stream(_r, signal) {
        yield 'a'
        await gate
        if (!signal.aborted) yield 'b'
      },
    }
    const svc = createAIService({
      loadSettings: async () => enabled,
      getApiKey: async () => '',
      extensionOrigin: ORIGIN,
      makeProvider: () => slow,
    })
    const { port, posted, send } = fakePort()
    svc.onConnect(port)
    send({ type: 'ai.run', id: 5, task: 'summarize', document: 'x', title: 'x' })
    await flush()
    send({ type: 'ai.abort' })
    release()
    await flush()
    await flush()
    expect(posted.filter(p => p.type === 'delta')).toEqual([
      { type: 'delta', id: 5, text: 'a' },
    ])
    // An aborted run must not emit `done` (it would complete the next request).
    expect(posted.some(p => p.type === 'error' || p.type === 'done')).toBe(false)
  })

  test('ignores ports with other names', () => {
    const svc = createAIService({
      loadSettings: async () => enabled,
      getApiKey: async () => '',
      extensionOrigin: ORIGIN,
    })
    const { port } = fakePort()
    svc.onConnect({ ...port, name: 'other' })
    expect(port.disconnect).not.toHaveBeenCalled()
  })
})

describe('dynamic content scripts for user URL patterns', () => {
  test('registers only granted, valid patterns and replaces old registrations', async () => {
    const api = {
      scripting: chrome.scripting,
      permissions: {
        contains: vi.fn(
          async ({ origins }: { origins: string[] }) =>
            origins[0] !== 'https://denied.com/*',
        ),
      },
    }
    vi.mocked(chrome.scripting.getRegisteredContentScripts).mockResolvedValueOnce([
      { id: DYNAMIC_SCRIPT_ID },
    ] as never)
    const granted = await syncUserPatterns(
      ['https://docs.a.com/*', 'https://denied.com/*', '<all_urls>'],
      api as never,
    )
    expect(granted).toEqual(['https://docs.a.com/*'])
    expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [DYNAMIC_SCRIPT_ID],
    })
    expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: DYNAMIC_SCRIPT_ID,
        matches: ['https://docs.a.com/*'],
        js: ['js/content.js'],
      }),
    ])
  })

  test('registers nothing when no pattern is granted', async () => {
    const api = {
      scripting: chrome.scripting,
      permissions: { contains: vi.fn(async () => false) },
    }
    expect(await syncUserPatterns(['https://x.com/*'], api as never)).toEqual([])
    expect(chrome.scripting.registerContentScripts).not.toHaveBeenCalled()
  })
})

describe('context menus', () => {
  test('creates link and page menus', async () => {
    await createMenus(chrome.contextMenus)
    expect(chrome.contextMenus.create).toHaveBeenCalledTimes(2)
  })
  test('resolves menu targets to viewer URLs', () => {
    expect(
      parseViewerUrl(
        menuTargetUrl(
          {
            menuItemId: MENU_OPEN_LINK,
            linkUrl: 'https://github.com/a/b/blob/main/x.md',
          } as chrome.contextMenus.OnClickData,
          VIEWER,
        ) ?? '',
      ).src,
    ).toBe('https://raw.githubusercontent.com/a/b/main/x.md')
    expect(
      menuTargetUrl(
        {
          menuItemId: MENU_OPEN_PAGE,
          pageUrl: 'https://a.com/y.md',
        } as chrome.contextMenus.OnClickData,
        VIEWER,
      ),
    ).toContain('src=')
    expect(
      menuTargetUrl({ menuItemId: 'other' } as chrome.contextMenus.OnClickData, VIEWER),
    ).toBeNull()
    expect(
      menuTargetUrl(
        {
          menuItemId: MENU_OPEN_LINK,
          linkUrl: 'javascript:x',
        } as chrome.contextMenus.OnClickData,
        VIEWER,
      ),
    ).toBeNull()
  })
})

describe('readTabDocument', () => {
  test('returns validated script results', async () => {
    const scripting = {
      executeScript: vi.fn(async () => [
        { result: { url: 'https://a.com/x', text: '# x', contentType: 'text/plain' } },
      ]),
    }
    expect(await readTabDocument(1, scripting as never)).toEqual({
      url: 'https://a.com/x',
      text: '# x',
      contentType: 'text/plain',
    })
  })
  test('rejects malformed results', async () => {
    const scripting = { executeScript: vi.fn(async () => [{ result: { url: 5 } }]) }
    expect(await readTabDocument(1, scripting as never)).toBeNull()
  })
})
