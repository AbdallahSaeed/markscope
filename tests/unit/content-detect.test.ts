import { decide, readPlainText } from '@/content/detect'

const page = (over = {}) => ({
  url: 'https://a.com/README.md',
  contentType: 'text/plain',
  navigationType: 'navigate',
  isPlainTextDocument: true,
  ...over,
})
const opts = { autoRender: true, userPattern: false }

describe('content script decision', () => {
  test('renders plain-text markdown URLs', () => {
    expect(decide(page(), opts)).toEqual({ action: 'render' })
    expect(decide(page({ contentType: 'text/markdown' }), opts)).toEqual({
      action: 'render',
    })
  })
  test('skips HTML pages such as GitHub blob views', () => {
    expect(decide(page({ contentType: 'text/html' }), opts).action).toBe('skip')
    expect(decide(page({ isPlainTextDocument: false }), opts).action).toBe('skip')
  })
  test('skips non-markdown URLs unless matched by a user pattern', () => {
    expect(decide(page({ url: 'https://a.com/notes.txt' }), opts).action).toBe('skip')
    expect(
      decide(page({ url: 'https://a.com/docs/intro' }), { ...opts, userPattern: true })
        .action,
    ).toBe('render')
  })
  test('offers instead of redirecting on back/forward, raw marker or auto-render off', () => {
    expect(decide(page({ navigationType: 'back_forward' }), opts)).toEqual({
      action: 'offer',
      reason: 'history-navigation',
    })
    expect(decide(page({ url: 'https://a.com/README.md#markscope-raw' }), opts)).toEqual({
      action: 'offer',
      reason: 'raw-requested',
    })
    expect(decide(page(), { ...opts, autoRender: false })).toEqual({
      action: 'offer',
      reason: 'auto-render-off',
    })
  })
})

describe('readPlainText', () => {
  test('reads the single <pre> browsers create for text/plain', () => {
    document.body.innerHTML = '<pre># Title\n&lt;b&gt;not html&lt;/b&gt;</pre>'
    expect(readPlainText(document)).toEqual({
      text: '# Title\n<b>not html</b>',
      isPlainText: true,
    })
  })
  test('rejects arbitrary pages', () => {
    document.body.innerHTML = '<div><pre>x</pre></div>'
    expect(readPlainText(document).isPlainText).toBe(false)
  })
})
