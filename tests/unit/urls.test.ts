import {
  buildViewerUrl,
  describeSource,
  hasRawMarker,
  isMarkdownContentType,
  isMarkdownPath,
  markdownMatchPatterns,
  normalizeDocumentUrl,
  originPattern,
  parseViewerUrl,
  resolveLink,
  resolveMediaSrc,
  safeParseUrl,
  sourceProtocol,
  toRawUrl,
  withRawMarker,
} from '@/shared/urls'

const VIEWER = 'chrome-extension://abc/viewer.html'

describe('markdown detection', () => {
  test.each([
    ['https://x.com/README.md', true],
    ['https://x.com/docs/guide.MARKDOWN', true],
    ['https://x.com/a.mdx?raw=1', true],
    ['file:///Users/me/notes%20one.md', true],
    ['https://x.com/readme.html', false],
    ['https://x.com/md', false],
    ['not a url', false],
  ])('isMarkdownPath(%s) = %s', (url, expected) => {
    expect(isMarkdownPath(url)).toBe(expected)
  })

  test('content types', () => {
    expect(isMarkdownContentType('text/markdown; charset=utf-8')).toBe(true)
    expect(isMarkdownContentType('TEXT/PLAIN')).toBe(true)
    expect(isMarkdownContentType('text/html')).toBe(false)
    expect(isMarkdownContentType('')).toBe(false)
  })

  test('match patterns cover http(s) and file in both cases, with and without query', () => {
    const patterns = markdownMatchPatterns()
    expect(patterns).toContain('*://*/*.md')
    expect(patterns).toContain('*://*/*.MD?*')
    expect(patterns).toContain('file:///*.markdown')
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  test('sourceProtocol only accepts http, https and file', () => {
    expect(sourceProtocol('https://a.com/x.md')).toBe('http')
    expect(sourceProtocol('http://a.com/x.md')).toBe('http')
    expect(sourceProtocol('file:///x.md')).toBe('file')
    expect(sourceProtocol('javascript:alert(1)')).toBeNull()
    expect(sourceProtocol('chrome://settings')).toBeNull()
    expect(sourceProtocol('data:text/plain,hi')).toBeNull()
  })
})

describe('toRawUrl', () => {
  test('GitHub blob → raw', () => {
    expect(toRawUrl('https://github.com/acme/app/blob/main/docs/README.md')).toBe(
      'https://raw.githubusercontent.com/acme/app/main/docs/README.md',
    )
  })
  test('GitLab blob → raw, including subgroups', () => {
    expect(
      toRawUrl('https://gitlab.com/group/sub/proj/-/blob/main/README.md?ref_type=heads'),
    ).toBe('https://gitlab.com/group/sub/proj/-/raw/main/README.md')
  })
  test('self-hosted GitLab', () => {
    expect(toRawUrl('https://gitlab.example.org/a/b/-/blob/dev/x.md')).toBe(
      'https://gitlab.example.org/a/b/-/raw/dev/x.md',
    )
  })
  test('Bitbucket src → raw', () => {
    expect(toRawUrl('https://bitbucket.org/ws/repo/src/main/README.md')).toBe(
      'https://bitbucket.org/ws/repo/raw/main/README.md',
    )
  })
  test('non-blob URLs return null', () => {
    expect(toRawUrl('https://github.com/acme/app')).toBeNull()
    expect(toRawUrl('https://github.com/acme/app/tree/main/docs')).toBeNull()
    expect(toRawUrl('https://gist.github.com/x/y')).toBeNull()
    expect(toRawUrl('https://gitlab.com/a/b')).toBeNull()
    expect(toRawUrl('https://bitbucket.org/a')).toBeNull()
    expect(toRawUrl('https://example.com/a.md')).toBeNull()
    expect(toRawUrl('file:///a.md')).toBeNull()
    expect(toRawUrl('garbage')).toBeNull()
  })
  test('normalizeDocumentUrl falls back to the input', () => {
    expect(normalizeDocumentUrl('https://example.com/a.md')).toBe(
      'https://example.com/a.md',
    )
  })
})

describe('viewer URLs', () => {
  test('round trip', () => {
    const url = buildViewerUrl(
      VIEWER,
      { src: 'https://a.com/x.md', handoff: 'abcdef0123456789' },
      '#intro',
    )
    expect(url).toContain('#intro')
    expect(parseViewerUrl(url)).toEqual({
      src: 'https://a.com/x.md',
      handoff: 'abcdef0123456789',
    })
  })
  test('drops unsafe src and malformed ids', () => {
    expect(
      parseViewerUrl(`${VIEWER}?src=javascript:alert(1)&h=../../x&doc=<script>`),
    ).toEqual({})
  })
  test('doc and scratch params', () => {
    expect(
      parseViewerUrl(buildViewerUrl(VIEWER, { doc: 'abcdef0123', scratch: true })),
    ).toEqual({ doc: 'abcdef0123', scratch: true })
  })
  test('unparseable input', () => {
    expect(parseViewerUrl('::::')).toEqual({})
  })
})

describe('raw marker', () => {
  test('adds and detects', () => {
    const marked = withRawMarker('https://a.com/x.md#old')
    expect(marked).toBe('https://a.com/x.md#markscope-raw')
    expect(hasRawMarker(marked)).toBe(true)
    expect(hasRawMarker('https://a.com/x.md')).toBe(false)
    expect(withRawMarker('bad url')).toBe('bad url')
  })
})

describe('resolveLink', () => {
  const base = 'https://raw.githubusercontent.com/acme/app/main/docs/guide.md'
  test('anchors stay anchors', () => {
    expect(resolveLink('#install', base, VIEWER)).toEqual({
      kind: 'anchor',
      href: '#install',
    })
  })
  test('same-document absolute link with hash becomes anchor', () => {
    expect(resolveLink(`${base}#x`, base, VIEWER)).toEqual({ kind: 'anchor', href: '#x' })
  })
  test('relative markdown routes through the viewer and keeps the hash', () => {
    const r = resolveLink('../README.md#usage', base, VIEWER)
    expect(r.kind).toBe('document')
    if (r.kind !== 'document') return
    expect(r.target).toBe('https://raw.githubusercontent.com/acme/app/main/README.md')
    expect(r.href.endsWith('#usage')).toBe(true)
    expect(parseViewerUrl(r.href).src).toBe(r.target)
  })
  test('GitHub blob links are converted to raw', () => {
    const r = resolveLink('https://github.com/a/b/blob/main/x.md', base, VIEWER)
    expect(r.kind === 'document' && r.target).toBe(
      'https://raw.githubusercontent.com/a/b/main/x.md',
    )
  })
  test('external links', () => {
    expect(resolveLink('https://example.com/page', base, VIEWER)).toEqual({
      kind: 'external',
      href: 'https://example.com/page',
    })
    expect(resolveLink('mailto:a@b.c', base, VIEWER).kind).toBe('external')
  })
  test('dangerous schemes are invalid', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>',
      'vbscript:x',
      'chrome://settings',
      '',
    ]) {
      expect(resolveLink(href, base, VIEWER).kind).toBe('invalid')
    }
  })
  test('file links only allowed from file documents', () => {
    expect(resolveLink('file:///etc/passwd', base, VIEWER).kind).toBe('invalid')
    expect(resolveLink('./other.md', 'file:///docs/a.md', VIEWER).kind).toBe('document')
    expect(resolveLink('./img.png', 'file:///docs/a.md', VIEWER)).toEqual({
      kind: 'external',
      href: 'file:///docs/img.png',
    })
  })
  test('relative links without a base are invalid', () => {
    expect(resolveLink('other.md', null, VIEWER).kind).toBe('invalid')
  })
})

describe('resolveMediaSrc', () => {
  test('resolves relative to base', () => {
    expect(resolveMediaSrc('img/a.png', 'https://x.com/docs/r.md')).toBe(
      'https://x.com/docs/img/a.png',
    )
  })
  test('allows data images, blocks other data URLs', () => {
    expect(resolveMediaSrc('data:image/png;base64,AAAA', null)).toBe(
      'data:image/png;base64,AAAA',
    )
    expect(resolveMediaSrc('data:text/html,<b>', null)).toBeNull()
  })
  test('file images only for file documents', () => {
    expect(resolveMediaSrc('a.png', 'file:///d/r.md')).toBe('file:///d/a.png')
    expect(resolveMediaSrc('file:///etc/x.png', 'https://x.com/r.md')).toBeNull()
  })
  test('rejects javascript and garbage', () => {
    expect(resolveMediaSrc('javascript:alert(1)', 'https://x.com/r.md')).toBeNull()
    expect(resolveMediaSrc('relative.png', null)).toBeNull()
  })
})

test('describeSource', () => {
  expect(
    describeSource('https://raw.githubusercontent.com/a/b/main/My%20Doc.md'),
  ).toEqual({
    host: 'raw.githubusercontent.com',
    path: '/a/b/main/My Doc.md',
    name: 'My Doc.md',
  })
  expect(describeSource('file:///Users/me/n.md').host).toBe('Local file')
  expect(describeSource('nope').name).toBe('nope')
})

test('originPattern', () => {
  expect(originPattern('https://api.anthropic.com/v1/messages')).toBe(
    'https://api.anthropic.com/*',
  )
  expect(originPattern('http://localhost:11434/v1')).toBe('http://localhost/*')
  expect(originPattern('file:///x')).toBeNull()
  expect(originPattern('nope')).toBeNull()
})

test('safeParseUrl', () => {
  expect(safeParseUrl('https://a.com')?.host).toBe('a.com')
  expect(safeParseUrl('::')).toBeNull()
})
