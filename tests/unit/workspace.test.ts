import {
  buildViewerUrl,
  normalizeWorkspacePath,
  parseViewerUrl,
  parseWorkspaceUrl,
  resolveLink,
  resolveMediaSrc,
  workspaceUrl,
} from '@/shared/urls'
import { parseLibrary, refKey } from '@/storage/library-store'
import { FolderAccessNeededError, FolderSession } from '@/viewer/folder-session'
import {
  ancestorsOf,
  defaultDocument,
  IGNORED_DIRS,
  resolveFile,
  scanTree,
  type Workspace,
} from '@/viewer/workspace'

const VIEWER = 'chrome-extension://id/viewer.html'
const WS = 'abcdef0123456789'

type FakeEntry = { [name: string]: FakeEntry | string }

/** Minimal FileSystemDirectoryHandle over a nested object. */
function fakeDir(
  name: string,
  tree: FakeEntry,
  perm: 'granted' | 'prompt' = 'granted',
): FileSystemDirectoryHandle {
  const dir = {
    kind: 'directory',
    name,
    queryPermission: async () => perm,
    async *values() {
      for (const [n, v] of Object.entries(tree))
        yield { kind: typeof v === 'string' ? 'file' : 'directory', name: n }
    },
    async getDirectoryHandle(n: string) {
      const v = tree[n]
      if (!v || typeof v === 'string') throw new DOMException(n, 'NotFoundError')
      return fakeDir(n, v, perm)
    },
    async getFileHandle(n: string) {
      const v = tree[n]
      if (typeof v !== 'string') throw new DOMException(n, 'NotFoundError')
      return {
        kind: 'file',
        name: n,
        getFile: async () => new File([v], n, { lastModified: 7 }),
      }
    },
  }
  return dir as unknown as FileSystemDirectoryHandle
}

const project: FakeEntry = {
  'README.md': '# Readme',
  'notes.txt': 'not markdown',
  docs: {
    'guide.md': '# Guide',
    'b.md': '# B',
    img: { 'x.png': 'png' },
    deep: { 'z.mdx': '# Z' },
  },
  empty: { 'only.txt': 'x' },
  node_modules: { 'pkg.md': '# skip' },
  '.github': { 'CONTRIBUTING.md': '# hidden' },
}

describe('workspace URLs', () => {
  test('normalize strips empty, . and .. segments', () => {
    expect(normalizeWorkspacePath('/a/./b/../c//d.md')).toBe('a/b/c/d.md')
  })
  test('round-trip with special characters', () => {
    const url = workspaceUrl(WS, 'docs/My Doc #1.md')
    expect(url).toBe(`workspace://${WS}/docs/My%20Doc%20%231.md`)
    expect(parseWorkspaceUrl(url)).toEqual({ id: WS, path: 'docs/My Doc #1.md' })
  })
  test('rejects other schemes and bad ids', () => {
    expect(parseWorkspaceUrl('https://x.com/a.md')).toBeNull()
    expect(parseWorkspaceUrl('workspace://bad!/a.md')).toBeNull()
  })
  test('viewer params carry ws + path; path is normalized and requires ws', () => {
    const url = buildViewerUrl(
      VIEWER,
      { ws: WS, path: 'docs/../docs/guide.md' },
      '#setup',
    )
    expect(parseViewerUrl(url)).toEqual({ ws: WS, path: 'docs/docs/guide.md' })
    expect(parseViewerUrl(`${VIEWER}?path=a.md`)).toEqual({})
    expect(parseViewerUrl(`${VIEWER}?ws=../x`)).toEqual({})
  })
})

describe('links and images inside a folder', () => {
  const base = workspaceUrl(WS, 'docs/guide.md')
  test('relative markdown links stay in the folder, keeping the anchor', () => {
    const r = resolveLink('../README.md#install', base, VIEWER)
    expect(r.kind).toBe('document')
    if (r.kind !== 'document') return
    expect(parseViewerUrl(r.href)).toEqual({ ws: WS, path: 'README.md' })
    expect(r.href.endsWith('#install')).toBe(true)
    expect(r.target).toBe(workspaceUrl(WS, 'README.md'))
  })
  test('same-document links are anchors; non-markdown files are not linked', () => {
    expect(resolveLink('guide.md#x', base, VIEWER)).toEqual({
      kind: 'anchor',
      href: '#x',
    })
    expect(resolveLink('../LICENSE', base, VIEWER).kind).toBe('invalid')
  })
  test('links into another workspace are refused', () => {
    expect(resolveLink('workspace://ffffffff00000000/a.md', base, VIEWER).kind).toBe(
      'invalid',
    )
  })
  test('images resolve inside the folder and can never escape it', () => {
    expect(resolveMediaSrc('img/x.png', base)).toBe(workspaceUrl(WS, 'docs/img/x.png'))
    expect(resolveMediaSrc('../../../../etc/passwd', base)).toBe(
      workspaceUrl(WS, 'etc/passwd'),
    )
    expect(resolveMediaSrc('workspace://ffffffff00000000/x.png', base)).toBeNull()
    expect(resolveMediaSrc('https://cdn.example/x.png', base)).toBe(
      'https://cdn.example/x.png',
    )
  })
})

describe('folder scanning', () => {
  test('lists Markdown files only, skipping dependency and hidden folders', async () => {
    const tree = await scanTree(fakeDir('project', project))
    expect(tree.files).toEqual([
      'docs/deep/z.mdx',
      'docs/b.md',
      'docs/guide.md',
      'README.md',
    ])
    expect(tree.nodes.map(n => n.name)).toEqual(['docs', 'README.md']) // empty/ has no markdown
    expect(tree.truncated).toBe(false)
    expect(IGNORED_DIRS.has('node_modules')).toBe(true)
  })
  test('respects entry and depth limits', async () => {
    expect(
      (await scanTree(fakeDir('p', project), { maxEntries: 3, maxDepth: 12 })).truncated,
    ).toBe(true)
    const shallow = await scanTree(fakeDir('p', project), {
      maxEntries: 100,
      maxDepth: 1,
    })
    expect(shallow.files).not.toContain('docs/deep/z.mdx')
    expect(shallow.truncated).toBe(true)
  })
  test('resolves paths to files and reports missing ones', async () => {
    const root = fakeDir('project', project)
    expect((await (await resolveFile(root, 'docs/./guide.md')).getFile()).name).toBe(
      'guide.md',
    )
    await expect(resolveFile(root, 'docs/missing.md')).rejects.toThrow()
    await expect(resolveFile(root, '')).rejects.toThrow()
  })
  test('default document prefers a root README, then index, then the first file', () => {
    expect(defaultDocument(['docs/a.md', 'README.md'])).toBe('README.md')
    expect(defaultDocument(['docs/index.md', 'docs/a.md'])).toBe('docs/index.md')
    expect(defaultDocument(['b.md', 'a.md'])).toBe('b.md')
    expect(defaultDocument([])).toBeNull()
  })
  test('ancestors of a path', () => {
    expect(ancestorsOf('a/b/c.md')).toEqual(['a', 'a/b'])
  })
})

describe('folder sessions', () => {
  const ws = (perm: 'granted' | 'prompt'): Workspace => ({
    id: WS,
    name: 'project',
    handle: fakeDir('project', project, perm),
    openedAt: 0,
  })

  test('opening without permission asks the user to reconnect', async () => {
    await expect(FolderSession.open(ws('prompt'))).rejects.toBeInstanceOf(
      FolderAccessNeededError,
    )
  })

  test('loads documents with a folder base URL and workspace ref', async () => {
    const session = await FolderSession.open(ws('granted'))
    const doc = await session.loadDocument('docs/guide.md')
    expect(doc).toMatchObject({
      title: 'guide.md',
      source: '# Guide',
      baseUrl: workspaceUrl(WS, 'docs/guide.md'),
      ref: { kind: 'workspace', id: WS, path: 'docs/guide.md', name: 'project' },
      folder: { id: WS, name: 'project', path: 'docs/guide.md' },
      lastModified: 7,
    })
  })

  test('loads folder images as blob URLs, refusing other workspaces', async () => {
    const session = await FolderSession.open(ws('granted'))
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    expect(await session.loadMedia(workspaceUrl(WS, 'docs/img/x.png'))).toBe('blob:x')
    expect(
      await session.loadMedia(workspaceUrl('ffffffff00000000', 'docs/img/x.png')),
    ).toBeNull()
    created.mockRestore()
  })
})

test('library stores and validates folder document refs', () => {
  const lib = parseLibrary({
    entries: [
      {
        ref: { kind: 'workspace', id: WS, path: 'docs/a.md', name: 'p' },
        title: 'A',
        openedAt: 1,
      },
    ],
  })
  expect(refKey(lib.entries[0]!.ref)).toBe(`ws:${WS}:docs/a.md`)
  expect(
    parseLibrary({ entries: [{ ref: { kind: 'workspace', id: WS } }] }).entries,
  ).toEqual([])
})
