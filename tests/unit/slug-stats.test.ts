import { createSlugger, slugify } from '@/shared/slug'
import { computeStats, countWords, formatReadingTime } from '@/shared/stats'
import { randomId } from '@/shared/ids'
import { errorMessage, PermissionNeededError, SourceLoadError } from '@/shared/errors'

describe('slugify (GitHub compatible)', () => {
  test.each([
    ['Hello World', 'hello-world'],
    ['  Trim me  ', 'trim-me'],
    ['C++ & Rust: a comparison!', 'c--rust-a-comparison'],
    ['Ünïcödé Héading', 'ünïcödé-héading'],
    ['日本語の見出し', '日本語の見出し'],
    ['snake_case_name', 'snake_case_name'],
    ['`code` in heading', 'code-in-heading'],
  ])('%s → %s', (input, slug) => {
    expect(slugify(input)).toBe(slug)
  })

  test('deduplicates like GitHub', () => {
    const s = createSlugger()
    expect(['Intro', 'Intro', 'Intro', 'Intro-1'].map(s)).toEqual([
      'intro',
      'intro-1',
      'intro-2',
      'intro-1-1',
    ])
  })

  test('empty headings get a fallback', () => {
    const s = createSlugger()
    expect(s('!!!')).toBe('section')
    expect(s('???')).toBe('section-1')
  })
})

describe('computeStats', () => {
  test('counts words outside code fences', () => {
    const src =
      '# Title\n\nOne two three.\n\n```js\nconst notCounted = words here\n```\n\n[link text](http://x) ![alt](i.png)\n'
    const s = computeStats(src)
    expect(s.codeBlocks).toBe(1)
    expect(s.headings).toBe(1)
    expect(s.links).toBe(1)
    expect(s.images).toBe(1)
    expect(s.words).toBe(6) // Title One two three link text
    expect(s.readingMinutes).toBe(1)
  })

  test('handles ~~~ fences and nested longer fences', () => {
    const s = computeStats('~~~\n# not heading\n~~~\n````\n```\ninner\n```\n````\n# Real')
    expect(s.codeBlocks).toBe(2)
    expect(s.headings).toBe(1)
  })

  test('empty document', () => {
    expect(computeStats('')).toMatchObject({ words: 0, lines: 0, readingMinutes: 0 })
  })

  test('CJK characters count individually', () => {
    expect(countWords('你好世界 hello')).toBe(5)
  })

  test('reading time formatting', () => {
    expect(formatReadingTime(0)).toBe('< 1 min')
    expect(formatReadingTime(12)).toBe('12 min')
    expect(formatReadingTime(60)).toBe('1 h')
    expect(formatReadingTime(75)).toBe('1 h 15 min')
  })
})

test('randomId is hex and unique', () => {
  const a = randomId()
  expect(a).toMatch(/^[a-f0-9]{32}$/)
  expect(randomId()).not.toBe(a)
  expect(randomId(4)).toHaveLength(8)
})

test('error helpers', () => {
  expect(errorMessage(new Error('x'))).toBe('x')
  expect(errorMessage('y')).toBe('y')
  expect(errorMessage(42)).toBe('Unexpected error')
  expect(new PermissionNeededError('https://a.com/*').origin).toBe('https://a.com/*')
  expect(new SourceLoadError('nope', 404).status).toBe(404)
})
