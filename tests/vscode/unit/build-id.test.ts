import { describe, expect, test } from 'vitest'
import { BUILD_ID, sameBuild } from '@/vscode/build-id'

describe('build id', () => {
  test('falls back to "dev" outside a bundled build', () => {
    expect(BUILD_ID).toBe('dev')
  })

  test('only an identical id counts as the same build; empty means an old host', () => {
    expect(sameBuild(BUILD_ID)).toBe(true)
    expect(sameBuild('')).toBe(false)
    expect(sameBuild(undefined)).toBe(false)
    expect(sameBuild('1.0.0+other')).toBe(false)
  })
})
