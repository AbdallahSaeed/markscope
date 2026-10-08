import {
  aiKeyOrigin,
  defaultSettings,
  isAllowedAIBaseUrl,
  isValidMatchPattern,
  mergeSettings,
  parseSettings,
  renderKey,
} from '@/shared/settings'

describe('parseSettings', () => {
  test('returns defaults for missing or garbage input', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings())
    expect(parseSettings('nope')).toEqual(defaultSettings())
    expect(parseSettings([1, 2])).toEqual(defaultSettings())
  })

  test('rejects unknown enum values and wrong types', () => {
    const s = parseSettings({
      theme: 'neon',
      autoRender: 'yes',
      typography: { fontFamily: 'comic' },
    })
    expect(s.theme).toBe('system')
    expect(s.autoRender).toBe(true)
    expect(s.typography.fontFamily).toBe('sans')
  })

  test('clamps numeric ranges', () => {
    const s = parseSettings({
      typography: { fontSize: 999, lineHeight: 0 },
      liveReload: { intervalMs: 1 },
    })
    expect(s.typography.fontSize).toBe(24)
    expect(s.typography.lineHeight).toBe(1.2)
    expect(s.liveReload.intervalMs).toBe(500)
  })

  test('ignores NaN and Infinity', () => {
    const s = parseSettings({
      typography: { fontSize: Number.NaN, lineHeight: Infinity },
    })
    expect(s.typography.fontSize).toBe(16)
    expect(s.typography.lineHeight).toBe(1.65)
  })

  test('filters invalid and duplicate URL patterns', () => {
    const s = parseSettings({
      urlPatterns: [
        'https://docs.example.com/*',
        'https://docs.example.com/*',
        '<all_urls>',
        'javascript:alert(1)',
        42,
        'file:///home/*',
      ],
    })
    expect(s.urlPatterns).toEqual(['https://docs.example.com/*', 'file:///home/*'])
  })

  test('rejects non-http AI base URLs but allows empty', () => {
    expect(
      parseSettings({ ai: { provider: 'custom', baseUrl: 'javascript:alert(1)' } }).ai
        .baseUrl,
    ).toBe('')
    expect(
      parseSettings({ ai: { provider: 'local', baseUrl: 'ftp://x' } }).ai.baseUrl,
    ).toBe('http://localhost:11434/v1')
    expect(parseSettings({ ai: { provider: 'custom', baseUrl: '' } }).ai.baseUrl).toBe('')
    expect(
      parseSettings({ ai: { baseUrl: 'https://proxy.example.com/v1' } }).ai.baseUrl,
    ).toBe('https://proxy.example.com/v1')
  })

  test('truncates long strings', () => {
    expect(parseSettings({ ai: { model: 'x'.repeat(500) } }).ai.model).toHaveLength(120)
  })
})

describe('mergeSettings', () => {
  test('deep merges without mutating the base', () => {
    const base = defaultSettings()
    const snapshot = structuredClone(base)
    const next = mergeSettings(base, {
      typography: { fontSize: 18 },
      markdown: { math: false },
    })
    expect(next.typography.fontSize).toBe(18)
    expect(next.typography.fontFamily).toBe('sans')
    expect(next.markdown.math).toBe(false)
    expect(next.markdown.mermaid).toBe(true)
    expect(base).toEqual(snapshot)
  })

  test('replaces arrays rather than merging them', () => {
    const base = mergeSettings(defaultSettings(), { urlPatterns: ['https://a.com/*'] })
    expect(mergeSettings(base, { urlPatterns: [] }).urlPatterns).toEqual([])
  })

  test('re-validates merged output', () => {
    const next = mergeSettings(defaultSettings(), { theme: 'bogus' as never })
    expect(next.theme).toBe('system')
  })
})

describe('isValidMatchPattern', () => {
  test.each([
    ['https://example.com/*', true],
    ['*://*.example.com/docs/*', true],
    ['http://localhost/*', true],
    ['file:///Users/*', true],
    ['<all_urls>', false],
    ['https:///*', false],
    ['ftp://example.com/*', false],
    ['https://example.com', false],
    ['file://host/*', false],
  ])('%s → %s', (pattern, valid) => {
    expect(isValidMatchPattern(pattern)).toBe(valid)
  })
})

test('renderKey changes only for render-affecting settings', () => {
  const a = defaultSettings()
  expect(renderKey(a)).toBe(
    renderKey(mergeSettings(a, { theme: 'dark', typography: { fontSize: 20 } })),
  )
  expect(renderKey(a)).not.toBe(
    renderKey(mergeSettings(a, { markdown: { math: false } })),
  )
  expect(renderKey(a)).not.toBe(
    renderKey(mergeSettings(a, { code: { highlight: false } })),
  )
})

describe('AI endpoint safety', () => {
  test.each([
    ['https://api.example.com/v1', true],
    ['http://localhost:11434/v1', true],
    ['http://127.0.0.1:1234/v1', true],
    ['http://[::1]:8080', true],
    ['http://api.example.com/v1', false],
    ['https://user:pass@api.example.com', false],
    ['ftp://x', false],
    ['nope', false],
  ])('isAllowedAIBaseUrl(%s) = %s', (url, ok) => {
    expect(isAllowedAIBaseUrl(url)).toBe(ok)
  })

  test('plain-http remote endpoints are rejected by settings validation', () => {
    expect(
      parseSettings({ ai: { provider: 'custom', baseUrl: 'http://evil.example/v1' } }).ai
        .baseUrl,
    ).toBe('')
  })

  test('aiKeyOrigin uses the preset when the base URL is empty', () => {
    expect(aiKeyOrigin('anthropic', '')).toBe('https://api.anthropic.com')
    expect(aiKeyOrigin('custom', 'https://gw.example.com/v1')).toBe(
      'https://gw.example.com',
    )
    expect(aiKeyOrigin('custom', '')).toBe('')
  })
})
