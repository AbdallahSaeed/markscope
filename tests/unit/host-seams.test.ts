import { describe, expect, test, vi } from 'vitest'
import { AIClient, type AITransport } from '@/viewer/ai-client'
import type { AIPortEvent } from '@/shared/messages'
import { buildLayout } from '@/viewer/layout'
import { DocumentView } from '@/viewer/document-view'
import { defaultSettings } from '@/shared/settings'
import { resolvedTheme, setHostTheme, themeFromVsCodeClasses } from '@/viewer/theme'
import { renderDocument } from '@/engine/render'
import { renderExportHtml } from '@/viewer/export'

function fakeTransport() {
  let emit: (e: AIPortEvent) => void = () => undefined
  let close: () => void = () => undefined
  const sent: unknown[] = []
  const transport: AITransport = {
    connect(onEvent, onClose) {
      emit = onEvent
      close = onClose
    },
    send: m => void sent.push(m),
    dispose: vi.fn(),
  }
  return { transport, sent, emit: (e: AIPortEvent) => emit(e), close: () => close() }
}

describe('AIClient over a custom transport', () => {
  test('streams events and ignores stale request ids', () => {
    const t = fakeTransport()
    const client = new AIClient(t.transport)
    const onDelta = vi.fn()
    const onDone = vi.fn()
    client.run({ type: 'ai.test' }, { onDelta, onDone, onError: vi.fn() })
    expect(t.sent[0]).toMatchObject({ type: 'ai.test', id: 1 })
    t.emit({ type: 'delta', id: 99, text: 'stale' })
    t.emit({ type: 'delta', id: 1, text: 'hi' })
    t.emit({ type: 'done', id: 1, truncated: false })
    expect(onDelta).toHaveBeenCalledOnce()
    expect(onDelta).toHaveBeenCalledWith('hi')
    expect(onDone).toHaveBeenCalledWith(false)
  })

  test('a lost connection reports an error and reconnects on the next run', () => {
    const t = fakeTransport()
    const client = new AIClient(t.transport)
    const onError = vi.fn()
    client.run({ type: 'ai.test' }, { onDelta: vi.fn(), onDone: vi.fn(), onError })
    t.close()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('lost'))
    client.run({ type: 'ai.test' }, { onDelta: vi.fn(), onDone: vi.fn(), onError })
    expect(t.sent).toHaveLength(2)
  })

  test('abort tells the service and dispose closes the transport', () => {
    const t = fakeTransport()
    const client = new AIClient(t.transport)
    client.run(
      { type: 'ai.test' },
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    )
    client.abort()
    expect(t.sent.at(-1)).toEqual({ type: 'ai.abort' })
    client.dispose()
    expect(t.transport.dispose).toHaveBeenCalled()
  })
})

describe('host theme', () => {
  test('maps VS Code body classes', () => {
    expect(themeFromVsCodeClasses(['vscode-dark'])).toEqual({
      theme: 'dark',
      highContrast: false,
    })
    expect(themeFromVsCodeClasses(['vscode-light'])).toEqual({
      theme: 'light',
      highContrast: false,
    })
    expect(themeFromVsCodeClasses(['vscode-high-contrast'])).toEqual({
      theme: 'dark',
      highContrast: true,
    })
    expect(themeFromVsCodeClasses(['vscode-high-contrast-light'])).toEqual({
      theme: 'light',
      highContrast: true,
    })
  })

  test('only decides what "system" means', () => {
    setHostTheme('light')
    try {
      expect(resolvedTheme({ ...defaultSettings(), theme: 'system' })).toBe('light')
      expect(resolvedTheme({ ...defaultSettings(), theme: 'dark' })).toBe('dark')
    } finally {
      setHostTheme(null)
    }
  })
})

describe('layout hide option', () => {
  test('marks the requested controls and nothing else', () => {
    const layout = buildLayout(document.createElement('div'), {
      hide: ['home', 'favorite', 'save', 'modes', 'palette', 'theme', 'more'],
    })
    for (const el of [
      layout.homeBtn,
      layout.favoriteBtn,
      layout.saveBtn,
      layout.discardBtn,
      layout.paletteBtn,
      layout.themeBtn,
      layout.moreBtn,
      layout.modeButtons.read.parentElement!,
    ])
      expect(el.hasAttribute('data-host-hidden')).toBe(true)
    expect(layout.searchBtn.hasAttribute('data-host-hidden')).toBe(false)
    expect(layout.sidebarBtn.hasAttribute('data-host-hidden')).toBe(false)
  })

  test('hides nothing by default', () => {
    const layout = buildLayout(document.createElement('div'))
    expect(layout.root.querySelector('[data-host-hidden]')).toBeNull()
  })
})

describe('DocumentView host link hooks', () => {
  function view(hooks: ConstructorParameters<typeof DocumentView>[2]) {
    const article = document.createElement('article')
    document.body.append(article)
    const dv = new DocumentView(article, 'chrome-extension://x/viewer.html', hooks)
    const settings = defaultSettings()
    const result = renderDocument(
      '[other](other.md#top) [site](https://example.com) [here](#a)\n\n## A',
      { markdown: settings.markdown } as never,
    )
    dv.render(result, {
      settings,
      baseUrl: 'https://example.org/docs/readme.md',
      sourceLength: 10,
      dark: false,
      aiEnabled: false,
    })
    return article
  }
  const click = (el: Element) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

  test('document links go to the host with target and hash', () => {
    const onNavigateDocument = vi.fn(() => true)
    const article = view({ onNavigateDocument })
    const ev = click(article.querySelector('a[data-ms-doc]')!)
    expect(onNavigateDocument).toHaveBeenCalledWith(
      'https://example.org/docs/other.md',
      '#top',
    )
    expect(ev).toBe(false)
  })

  test('external links go to the host', () => {
    const onOpenExternal = vi.fn(() => true)
    const article = view({ onOpenExternal })
    expect(click(article.querySelector('a.ms-external')!)).toBe(false)
    expect(onOpenExternal).toHaveBeenCalledWith('https://example.com/')
  })

  test('without a host hook the default navigation is untouched', () => {
    const article = view({})
    expect(click(article.querySelector('a.ms-external')!)).toBe(true)
  })
})

describe('renderExportHtml', () => {
  test('builds the self-contained document from an article without downloading', () => {
    const article = document.createElement('article')
    article.innerHTML = '<h1 id="t">Hi</h1><p class="ms-ui">chrome</p>'
    const html = renderExportHtml(article, 'T <1>', 'dark', 'body{}')
    expect(html).toContain('<title>T &lt;1&gt;</title>')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('<h1 id="t">Hi</h1>')
    expect(html).not.toContain('chrome')
  })
})
