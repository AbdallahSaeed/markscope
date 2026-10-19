import { describe, expect, test } from 'vitest'
import { statusText } from '@/vscode/extension/status-text'

describe('statusText', () => {
  test('words, reading time and no problems', () => {
    const { text, tooltip } = statusText({ words: 1234, readingMinutes: 6 }, 0)
    expect(text).toBe('$(book) 1,234 words · 6 min')
    expect(tooltip).toContain('No documentation problems')
  })

  test('problems are counted and singular/plural is right', () => {
    expect(statusText({ words: 10, readingMinutes: 0 }, 1).text).toBe(
      '$(book) 10 words · < 1 min  $(warning) 1',
    )
    expect(statusText({ words: 10, readingMinutes: 0 }, 1).tooltip).toContain(
      '1 documentation problem;',
    )
    expect(statusText({ words: 10, readingMinutes: 0 }, 3).tooltip).toContain(
      '3 documentation problems;',
    )
  })

  test('without stats (a huge file) it still shows problems, or just the name', () => {
    expect(statusText(null, 2).text).toBe('$(warning) 2')
    expect(statusText(null, 0).text).toBe('$(book) Markscope')
  })

  test('long documents read in hours', () => {
    expect(statusText({ words: 100_000, readingMinutes: 435 }, 0).text).toContain(
      '7 h 15 min',
    )
  })
})
