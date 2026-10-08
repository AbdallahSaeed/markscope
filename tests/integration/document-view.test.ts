/**
 * Render pipeline end-to-end in a DOM: markdown → worker-safe renderer →
 * sanitizer → DocumentView decorations (links, media, code chrome).
 */
import { DocumentView } from '@/viewer/document-view'
import { RenderClient } from '@/engine/render-client'
import { defaultSettings, mergeSettings, type Settings } from '@/shared/settings'
import { parseViewerUrl } from '@/shared/urls'
import { render } from '../helpers/render'

const VIEWER = 'chrome-extension://testextensionid/viewer.html'

class FakeIO {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeAll(() => {
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    FakeIO
})

function mount(
  source: string,
  opts: { settings?: Settings; baseUrl?: string | null; ai?: boolean } = {},
) {
  const article = document.createElement('article')
  document.body.replaceChildren(article)
  const hooks = {
    onExplainCode: vi.fn(),
    onImageError: vi.fn(),
    onNavigateAnchor: vi.fn(),
  }
  const view = new DocumentView(article, VIEWER, hooks)
  const settings = opts.settings ?? defaultSettings()
  view.render(render(source, settings.markdown), {
    settings,
    baseUrl:
      opts.baseUrl === undefined
        ? 'https://raw.example.com/repo/docs/guide.md'
        : opts.baseUrl,
    sourceLength: source.length,
    dark: false,
    aiEnabled: opts.ai ?? false,
  })
  return { article, view, hooks }
}

describe('DocumentView', () => {
  test('rewrites relative markdown links to the viewer and keeps anchors', () => {
    const { article } = mount(
      '[next](./next.md#part) [top](#top) [ext](https://example.com) [bad](javascript:alert(1))',
    )
    const links = article.querySelectorAll('a')
    expect(parseViewerUrl(links[0]!.getAttribute('href')!).src).toBe(
      'https://raw.example.com/repo/docs/next.md',
    )
    expect(links[0]!.getAttribute('href')).toMatch(/#part$/)
    expect(links[1]!.getAttribute('href')).toBe('#top')
    expect(links[2]!.classList.contains('ms-external')).toBe(true)
    expect(links[2]!.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('raw HTML javascript: links are neutralised', () => {
    const { article } = mount('<a href="javascript:alert(1)">x</a>')
    expect(article.querySelector('a')?.hasAttribute('href')).toBe(false)
  })

  test('resolves relative images against the source URL', () => {
    const { article } = mount('![logo](../img/logo.png)')
    expect(article.querySelector('img')?.getAttribute('src')).toBe(
      'https://raw.example.com/repo/img/logo.png',
    )
  })

  test('blocks third-party images when privacy mode is on, and loads on click', () => {
    const settings = mergeSettings(defaultSettings(), {
      privacy: { remoteImages: 'block' },
    })
    const { article } = mount(
      '![same](a.png) ![tracker](https://tracker.example/p.gif)',
      { settings },
    )
    expect(article.querySelectorAll('img')).toHaveLength(1)
    const btn = article.querySelector<HTMLButtonElement>('.ms-blocked-image')
    expect(btn?.textContent).toContain('tracker.example')
    btn?.click()
    expect(
      article.querySelector('img[src="https://tracker.example/p.gif"]'),
    ).not.toBeNull()
  })

  test('broken images become placeholders and are reported', () => {
    const { article, hooks, view } = mount('![missing](nope.png)')
    article.querySelector('img')?.dispatchEvent(new Event('error'))
    expect(article.querySelector('.ms-broken-image')?.textContent).toContain('missing')
    expect(hooks.onImageError).toHaveBeenCalledWith('nope.png')
    expect(view.failedImages.has('nope.png')).toBe(true)
  })

  test('srcset candidates are resolved or dropped', () => {
    const { article } = mount(
      '<img src="a.png" srcset="b.png 2x, javascript:alert(1) 3x" alt="x">',
    )
    expect(article.querySelector('img')?.getAttribute('srcset')).toBe(
      'https://raw.example.com/repo/docs/b.png 2x',
    )
  })

  test('code blocks get a toolbar with language, line count and copy', async () => {
    const write = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    })
    const { article } = mount('```ts\nconst a = 1\nconst b = 2\n```')
    expect(article.querySelector('.ms-code__lang')?.textContent).toBe('TypeScript')
    expect(article.querySelector('.ms-code__meta')?.textContent).toBe('2 lines')
    article.querySelector<HTMLButtonElement>('[data-action="copy"]')?.click()
    await new Promise(r => setTimeout(r, 0))
    expect(write).toHaveBeenCalledWith('const a = 1\nconst b = 2')
    expect(article.querySelector('[data-action="explain"]')).toBeNull()
  })

  test('explain button appears only with AI enabled and calls the hook', () => {
    const { article, hooks } = mount('```py\nprint(1)\n```', { ai: true })
    article.querySelector<HTMLButtonElement>('[data-action="explain"]')?.click()
    expect(hooks.onExplainCode).toHaveBeenCalledWith('print(1)\n', 'py')
  })

  test('line numbers and wrapping settings', () => {
    const numbered = mount('```js\na\nb\nc\n```', {
      settings: mergeSettings(defaultSettings(), { code: { lineNumbers: true } }),
    })
    expect(numbered.article.querySelector('.ms-gutter')?.textContent).toBe('1\n2\n3')
    const wrapped = mount('```js\na\nb\n```', {
      settings: mergeSettings(defaultSettings(), { code: { wrap: true } }),
    })
    expect(wrapped.article.querySelector('pre.is-wrapped')).not.toBeNull()
  })

  test('headings get § anchors, tables are wrapped, anchor clicks are routed', () => {
    const { article, hooks, view } = mount(
      '# Title\n\n| a |\n|---|\n| 1 |\n\n[go](#title)',
    )
    expect(article.querySelector('h1 .ms-anchor')?.getAttribute('href')).toBe('#title')
    expect(article.querySelector('.ms-table-wrap > table')).not.toBeNull()
    article
      .querySelector<HTMLAnchorElement>('p a')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(hooks.onNavigateAnchor).toHaveBeenCalledWith('title')
    expect(view.knownIds().has('title')).toBe(true)
  })

  test('large documents are flagged for content-visibility', () => {
    const big = `${'word '.repeat(90_000)}\n`
    expect(mount(big).article.classList.contains('is-large')).toBe(true)
  })

  test('diagrams are observed lazily (not rendered eagerly)', () => {
    const { article } = mount('```mermaid\ngraph TD; A-->B\n```')
    expect(article.querySelector('.ms-diagram')?.getAttribute('data-state')).toBeNull()
  })

  test('math loads KaTeX CSS lazily', () => {
    mount('$x$')
    expect(
      document.head.querySelector('link[href="vendor/katex/katex.min.css"]'),
    ).not.toBeNull()
  })
})

describe('RenderClient', () => {
  test('renders small docs in-thread and falls back when no worker', async () => {
    const client = new RenderClient(null)
    const result = await client.render('# Hi', {
      markdown: defaultSettings().markdown,
      highlight: true,
    })
    expect(result.headings[0]?.id).toBe('hi')
    const big = await client.render('x\n\n'.repeat(40_000), {
      markdown: defaultSettings().markdown,
      highlight: true,
    })
    expect(big.html.length).toBeGreaterThan(0)
    client.dispose()
  })
})
