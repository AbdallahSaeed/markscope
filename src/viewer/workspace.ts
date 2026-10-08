/**
 * Opened folders ("workspaces"): a directory handle from the File System
 * Access API, a scan of its Markdown files, and safe path resolution for the
 * documents, links and images inside it.
 *
 * Paths are always folder-relative and normalized, so a document can never
 * read files outside the folder the user picked.
 */
import { randomId } from '@/shared/ids'
import { isMarkdownPath, normalizeWorkspacePath } from '@/shared/urls'
import { tx } from './idb'

export interface Workspace {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

export interface TreeNode {
  name: string
  path: string
  kind: 'file' | 'dir'
  /** Files only: whether Markscope can open it. */
  markdown?: boolean
  children?: TreeNode[]
}

export interface WorkspaceTree {
  /** Every (non-ignored) file and folder; filter with `markdownOnly`. */
  nodes: TreeNode[]
  /** Flat list of Markdown file paths (for the command palette). */
  files: string[]
  /** Flat list of every file path (for "show all files" filtering). */
  allFiles: string[]
  truncated: boolean
}

export const isMarkdownName = (name: string) =>
  isMarkdownPath(`https://x.invalid/${encodeURIComponent(name)}`)

/** The tree pruned to Markdown files and the folders that contain them. */
export function markdownOnly(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (node.markdown) out.push(node)
      continue
    }
    const children = markdownOnly(node.children ?? [])
    if (children.length) out.push({ ...node, children })
  }
  return out
}

/** Folders skipped while scanning: dependencies, VCS data, build output. */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  '.idea',
  '.vscode',
  '.cache',
  '.turbo',
])

export const MAX_SCAN_ENTRIES = 5000
export const MAX_SCAN_DEPTH = 12

type DirLike = {
  kind: 'directory'
  name: string
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>
  getDirectoryHandle(name: string): Promise<DirLike>
  getFileHandle(name: string): Promise<FileSystemFileHandle>
}

const asDir = (h: FileSystemDirectoryHandle) => h as unknown as DirLike

/** Walks the folder and returns only Markdown files and the folders containing them. */
export async function scanTree(
  root: FileSystemDirectoryHandle,
  limits = { maxEntries: MAX_SCAN_ENTRIES, maxDepth: MAX_SCAN_DEPTH },
): Promise<WorkspaceTree> {
  const files: string[] = []
  const allFiles: string[] = []
  let seen = 0
  let truncated = false

  async function walk(dir: DirLike, prefix: string, depth: number): Promise<TreeNode[]> {
    const entries: { kind: 'file' | 'directory'; name: string }[] = []
    for await (const entry of dir.values()) {
      if (++seen > limits.maxEntries) {
        truncated = true
        break
      }
      entries.push(entry)
    }
    entries.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : a.kind === 'directory'
          ? -1
          : 1,
    )
    const nodes: TreeNode[] = []
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        if (depth >= limits.maxDepth) {
          truncated = true
          continue
        }
        const children = await walk(
          await dir.getDirectoryHandle(entry.name),
          path,
          depth + 1,
        )
        if (children.length) nodes.push({ name: entry.name, path, kind: 'dir', children })
      } else {
        const markdown = isMarkdownName(entry.name)
        if (markdown) files.push(path)
        allFiles.push(path)
        nodes.push({ name: entry.name, path, kind: 'file', markdown })
      }
    }
    return nodes
  }

  const nodes = await walk(asDir(root), '', 0)
  return { nodes, files, allFiles, truncated }
}

/** Resolves a folder-relative path to a file handle (throws NotFoundError). */
export async function resolveFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const segments = normalizeWorkspacePath(path).split('/').filter(Boolean)
  const name = segments.pop()
  if (!name) throw new DOMException('Empty path', 'NotFoundError')
  let dir = asDir(root)
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment)
  return dir.getFileHandle(name)
}

/** The document to show when a folder is opened without a specific file. */
export function defaultDocument(files: string[]): string | null {
  const rootFiles = files.filter(f => !f.includes('/'))
  const pick = (list: string[]) =>
    list.find(f => /^readme\.(md|markdown|mdx)$/i.test(f.split('/').pop() ?? '')) ??
    list.find(f => /^index\.(md|markdown|mdx)$/i.test(f.split('/').pop() ?? ''))
  return pick(rootFiles) ?? pick(files) ?? files[0] ?? null
}

/** Paths of the folders that contain `path` (to expand them in the tree). */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}

type WorkspaceRecord = Workspace

export const workspaces = {
  get: (id: string) =>
    tx<WorkspaceRecord | undefined>(
      'workspaces',
      'readonly',
      s => s.get(id) as IDBRequest<WorkspaceRecord | undefined>,
    ),
  list: async (): Promise<Workspace[]> => {
    const all = await tx<WorkspaceRecord[]>(
      'workspaces',
      'readonly',
      s => s.getAll() as IDBRequest<WorkspaceRecord[]>,
    )
    return [...all].sort((a, b) => b.openedAt - a.openedAt)
  },
  remove: (id: string) =>
    tx('workspaces', 'readwrite', s => s.delete(id)).then(() => undefined),
  touch: async (ws: Workspace): Promise<void> => {
    await tx('workspaces', 'readwrite', s => s.put({ ...ws, openedAt: Date.now() }))
  },
  /** Stores a picked folder, reusing the existing record if it is the same folder. */
  async add(handle: FileSystemDirectoryHandle): Promise<Workspace> {
    for (const existing of await this.list()) {
      if (await handle.isSameEntry(existing.handle).catch(() => false)) {
        const ws = { ...existing, handle, name: handle.name, openedAt: Date.now() }
        await tx('workspaces', 'readwrite', s => s.put(ws))
        return ws
      }
    }
    const ws: Workspace = {
      id: randomId(),
      name: handle.name,
      handle,
      openedAt: Date.now(),
    }
    await tx('workspaces', 'readwrite', s => s.put(ws))
    return ws
  },
}

type DirectoryPicker = (options?: unknown) => Promise<FileSystemDirectoryHandle>

export function supportsFolders(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: DirectoryPicker })
      .showDirectoryPicker === 'function'
  )
}

/** Opens the native folder picker; resolves null if the user cancels. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker
  if (!picker) return null
  try {
    return await picker({ id: 'markscope-folder', mode: 'read' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}
