/**
 * Runs the real content-script entry against a jsdom "text/plain" page and
 * checks it hands the raw text to the service worker (or offers a banner).
 */
const flush = () => new Promise(r => setTimeout(r, 0))

async function loadContentScript(opts: {
  url: string
  text: string
  contentType?: string
  settings?: unknown
  navType?: string
}) {
  vi.resetModules()
  window.history.replaceState(null, '', opts.url)
  Object.defineProperty(document, 'contentType', {
    value: opts.contentType ?? 'text/plain',
    configurable: true,
  })
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type: opts.navType ?? 'navigate' } as unknown as PerformanceEntry,
  ])
  document.body.innerHTML = ''
  const pre = document.createElement('pre')
  pre.textContent = opts.text
  document.body.append(pre)
  if (opts.settings) await chrome.storage.sync.set({ settings: opts.settings })
  await import('@/content/index')
  await flush()
}

describe('content script', () => {
  test('hands off markdown text read from the page', async () => {
    await loadContentScript({
      url: 'http://localhost:3000/docs/README.md',
      text: '# Hello <b>raw</b>',
    })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'handoff',
      url: 'http://localhost:3000/docs/README.md',
      text: '# Hello <b>raw</b>',
      contentType: 'text/plain',
    })
    expect(document.querySelector('b')).toBeNull() // never parsed as HTML
  })

  test('shows an offer banner (not a redirect) when auto-render is off', async () => {
    await loadContentScript({
      url: 'http://localhost:3000/a.md',
      text: '# A',
      settings: { autoRender: false },
    })
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    const banner = document.getElementById('markscope-offer')
    expect(banner?.textContent).toContain('Open in Markscope')
    banner?.querySelector('button')?.dispatchEvent(new MouseEvent('click'))
    await flush()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'handoff', text: '# A' }),
    )
  })

  test('back/forward navigation does not trap the user in a redirect loop', async () => {
    await loadContentScript({
      url: 'http://localhost:3000/a.md',
      text: '# A',
      navType: 'back_forward',
    })
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(document.getElementById('markscope-offer')).not.toBeNull()
  })

  test('HTML documents are left alone', async () => {
    await loadContentScript({
      url: 'http://localhost:3000/a.md',
      text: 'x',
      contentType: 'text/html',
    })
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(document.getElementById('markscope-offer')).toBeNull()
  })
})
