import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { toDiagnosticSpecs } from '@/vscode/extension/diagnostic-map'
import { isRealPathInside } from '@/vscode/extension/confine'
import { buildCsp, buildWebviewHtml, makeNonce } from '@/vscode/extension/html'
import {
  exportFileName,
  isBroadRoot,
  isMarkdownFileName,
  isMediaFileName,
  parseExternalHref,
  relativeToRoot,
  safeRelativePath,
  updateDelayMs,
} from '@/vscode/extension/link-policy'

describe('link policy', () => {
  test('relative paths are normalized and cannot climb out', () => {
    expect(safeRelativePath('docs/a.md')).toBe('docs/a.md')
    expect(safeRelativePath('../../etc/passwd')).toBe('etc/passwd')
    expect(safeRelativePath('/abs/./x//y.md')).toBe('abs/x/y.md')
    for (const bad of ['', '..', '.', 'a\0b', 'a\\b', 'x'.repeat(3000)])
      expect(safeRelativePath(bad)).toBeNull()
  })

  test('file kinds', () => {
    expect(isMarkdownFileName('a/B.MD')).toBe(true)
    expect(isMarkdownFileName('a/b.mdx')).toBe(true)
    expect(isMarkdownFileName('a/b.ts')).toBe(false)
    expect(isMarkdownFileName('a/.md')).toBe(false)
    expect(isMediaFileName('img/x.PNG')).toBe(true)
    expect(isMediaFileName('.env')).toBe(false)
    expect(isMediaFileName('secrets.json')).toBe(false)
  })

  test('only web, mail and phone links may be opened externally', () => {
    for (const ok of ['https://a.test/x', 'http://a.test', 'mailto:a@b.test', 'tel:+123'])
      expect(parseExternalHref(ok)).not.toBeNull()
    for (const bad of [
      'command:workbench.action.reloadWindow',
      'vscode://file/etc/passwd',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
    ])
      expect(parseExternalHref(bad)).toBeNull()
  })

  test('relativeToRoot', () => {
    expect(relativeToRoot('/w/proj', '/w/proj/docs/a.md')).toBe('docs/a.md')
    expect(relativeToRoot('/w/proj/', '/w/proj/a.md')).toBe('a.md')
    expect(relativeToRoot('/w/proj', '/w/project/a.md')).toBeNull()
    expect(relativeToRoot('/w/proj', '/other/a.md')).toBeNull()
  })

  test('big documents wait longer before re-rendering', () => {
    expect(updateDelayMs(100)).toBeLessThan(updateDelayMs(100_000))
    expect(updateDelayMs(100_000)).toBeLessThan(updateDelayMs(1_000_000))
  })
})

describe('roots too broad to serve from', () => {
  test('filesystem roots, drive roots and the home folder', () => {
    for (const p of ['/', '', '/c:', '/c:/', '/home/me', '/home/me/'])
      expect(isBroadRoot(p, '/home/me'), p).toBe(true)
    for (const p of ['/home/me/proj', '/c:/work', '/srv/docs'])
      expect(isBroadRoot(p, '/home/me'), p).toBe(false)
    expect(isBroadRoot('/home/me')).toBe(false) // no home known: only roots count
  })
})

describe('webview HTML and CSP', () => {
  test('closes the directives default-src does not cover', () => {
    const csp = buildCsp({ cspSource: 'https://x', nonce: 'n', remoteImages: 'block' })
    for (const d of [
      "base-uri 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "object-src 'none'",
    ])
      expect(csp).toContain(d)
  })

  const base = { cspSource: 'https://x.vscode-cdn.net', nonce: 'N0nce' }

  test('blocks remote images unless allowed', () => {
    expect(buildCsp({ ...base, remoteImages: 'allow' })).toMatch(/img-src [^;]*https:/)
    expect(buildCsp({ ...base, remoteImages: 'block' })).not.toMatch(
      /img-src [^;]*\shttps:/,
    )
  })

  test('no unsafe-eval, no inline script, no remote script or connect', () => {
    const csp = buildCsp({ ...base, remoteImages: 'allow' })
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toMatch(
      /script-src 'nonce-N0nce' https:\/\/x\.vscode-cdn\.net 'wasm-unsafe-eval'/,
    )
    expect(csp).toMatch(/connect-src https:\/\/x\.vscode-cdn\.net(;|$)/)
    expect(csp).toContain('worker-src blob:')
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toMatch(/https:(?!\/\/x)/)
  })

  test('the only script tag carries the nonce and attributes are escaped', () => {
    const html = buildWebviewHtml({
      ...base,
      scriptUri: 'https://x/p.js?a=1&b="2"',
      styleUris: ['https://x/a.css'],
      remoteImages: 'block',
    })
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html).toContain('<script type="module" nonce="N0nce"')
    expect(html).toContain('src="https://x/p.js?a=1&amp;b=&quot;2&quot;"')
    expect(html).toContain('<link rel="stylesheet" href="https://x/a.css">')
  })

  test('nonces are unique and unguessable-looking', () => {
    const a = makeNonce()
    expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(makeNonce()).not.toBe(a)
  })
})

describe('diagnostics mapping', () => {
  test('1-based issue lines become 0-based ranges; stale lines are dropped', () => {
    const specs = toDiagnosticSpecs(
      [
        { rule: 'r1', severity: 'error', message: 'a', line: 1 },
        { rule: 'r2', severity: 'info', message: 'b', line: 3 },
        { rule: 'r3', severity: 'warning', message: 'c', line: 4 },
        { rule: 'r4', severity: 'warning', message: 'd', line: 0 },
      ],
      3,
      i => 10 + i,
    )
    expect(specs).toEqual([
      { line: 0, endCharacter: 10, severity: 'error', message: 'a', code: 'r1' },
      { line: 2, endCharacter: 12, severity: 'info', message: 'b', code: 'r2' },
    ])
  })
})

describe('symlink-safe confinement', () => {
  let dir = ''
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ms-confine-'))
    await mkdir(path.join(dir, 'root', 'docs'), { recursive: true })
    await mkdir(path.join(dir, 'outside'))
    await writeFile(path.join(dir, 'root', 'docs', 'a.png'), 'x')
    await writeFile(path.join(dir, 'outside', 'secret.png'), 'x')
    await symlink(path.join(dir, 'outside'), path.join(dir, 'root', 'link'))
    await symlink(
      path.join(dir, 'outside', 'secret.png'),
      path.join(dir, 'root', 'docs', 'leak.png'),
    )
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  const root = () => path.join(dir, 'root')

  test('allows real files inside the root', async () => {
    expect(await isRealPathInside(root(), path.join(root(), 'docs', 'a.png'))).toBe(true)
  })
  test('refuses symlinked directories and files that resolve outside', async () => {
    expect(await isRealPathInside(root(), path.join(root(), 'link', 'secret.png'))).toBe(
      false,
    )
    expect(await isRealPathInside(root(), path.join(root(), 'docs', 'leak.png'))).toBe(
      false,
    )
  })
  test('a name that merely starts with two dots is not a climb', async () => {
    await mkdir(path.join(root(), '..notes'))
    await writeFile(path.join(root(), '..notes', 'a.png'), 'x')
    expect(await isRealPathInside(root(), path.join(root(), '..notes', 'a.png'))).toBe(
      true,
    )
  })
  test('refuses missing files, the root itself and outside paths', async () => {
    expect(await isRealPathInside(root(), path.join(root(), 'nope.png'))).toBe(false)
    expect(await isRealPathInside(root(), root())).toBe(false)
    expect(await isRealPathInside(root(), path.join(dir, 'outside', 'secret.png'))).toBe(
      false,
    )
  })
})

describe('exportFileName', () => {
  test('strips separators and control characters and always ends in .html', () => {
    expect(exportFileName('My Doc')).toBe('My Doc.html')
    expect(exportFileName('a/b\\c:d.html')).toBe('a b c d.html')
    expect(exportFileName('../../etc/passwd')).toBe('.. .. etc passwd.html')
    expect(exportFileName('x\u0000y\u001fz')).toBe('x y z.html')
    expect(exportFileName('')).toBe('document.html')
    expect(exportFileName('///')).toBe('document.html')
    expect(exportFileName('a'.repeat(300)).length).toBe(85)
  })
})
