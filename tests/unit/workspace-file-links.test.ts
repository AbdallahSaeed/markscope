import { describe, expect, test } from 'vitest'
import { resolveLink, workspaceUrl } from '@/shared/urls'

const base = workspaceUrl('vscodedoc', 'docs/readme.md')
const viewer = 'chrome-extension://x/viewer.html'

describe('links to non-Markdown files in an opened folder', () => {
  test('are removed by default, as in the browser (non-Markdown files are never linked)', () => {
    expect(resolveLink('../src/app.ts', base, viewer).kind).toBe('invalid')
    expect(resolveLink('img/logo.png', base, viewer).kind).toBe('invalid')
  })

  test('become file links when a host opts in, clamped at the folder root', () => {
    const opts = { workspaceFiles: true }
    expect(resolveLink('../src/app.ts#L42', base, viewer, opts)).toEqual({
      kind: 'file',
      href: workspaceUrl('vscodedoc', 'src/app.ts') + '#L42',
      target: workspaceUrl('vscodedoc', 'src/app.ts'),
    })
    // ".." cannot climb above the root
    expect(resolveLink('../../../../etc/passwd', base, viewer, opts)).toMatchObject({
      kind: 'file',
      target: workspaceUrl('vscodedoc', 'etc/passwd'),
    })
  })

  test('Markdown links, anchors and external links are unaffected by the option', () => {
    const opts = { workspaceFiles: true }
    expect(resolveLink('other.md#x', base, viewer, opts).kind).toBe('document')
    expect(resolveLink('#top', base, viewer, opts).kind).toBe('anchor')
    expect(resolveLink('https://example.com/a.ts', base, viewer, opts).kind).toBe(
      'external',
    )
    expect(
      resolveLink('command:workbench.action.reloadWindow', base, viewer, opts).kind,
    ).toBe('invalid')
  })
})
