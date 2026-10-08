/**
 * IndexedDB store for documents that have no URL: dropped/picked files and
 * scratch documents. File System Access handles are kept when available so
 * a picked file can be live-reloaded without file:// permissions.
 */
import { randomId } from '@/shared/ids'

export interface LocalDoc {
  id: string
  name: string
  text: string
  updatedAt: number
  handle?: FileSystemFileHandle
  lastModified?: number
  scratch?: boolean
  /** Original URL, kept so relative links/images still resolve after "Save as". */
  baseUrl?: string
}

const DB_NAME = 'markscope'
const STORE = 'docs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'))
  })
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const req = fn(transaction.objectStore(STORE))
      // Resolve on commit, so navigating right after a write cannot lose it.
      transaction.oncomplete = () => resolve(req.result)
      transaction.onerror = () =>
        reject(transaction.error ?? req.error ?? new Error('IndexedDB request failed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

export const localDocs = {
  get: (id: string) =>
    tx<LocalDoc | undefined>(
      'readonly',
      s => s.get(id) as IDBRequest<LocalDoc | undefined>,
    ),
  async put(doc: LocalDoc): Promise<LocalDoc> {
    try {
      await tx('readwrite', s => s.put(doc))
    } catch (error) {
      // A handle that can't be structured-cloned must not lose the text.
      if (
        !(error instanceof DOMException && error.name === 'DataCloneError') ||
        !doc.handle
      )
        throw error
      const { handle: _unstorable, ...rest } = doc
      await tx('readwrite', s => s.put(rest))
    }
    return doc
  },
  delete: (id: string) => tx('readwrite', s => s.delete(id)).then(() => undefined),
  async create(init: Omit<LocalDoc, 'id' | 'updatedAt'>): Promise<LocalDoc> {
    return this.put({ ...init, id: randomId(), updatedAt: Date.now() })
  },
}

export const ACCEPTED_FILE_TYPES = [
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx',
  '.txt',
]

export function isAcceptedFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_FILE_TYPES.some(ext => lower.endsWith(ext))
}

/** Uses the File System Access picker when available (keeps a handle for live reload). */
export async function pickLocalFile(): Promise<{
  file: File
  handle?: FileSystemFileHandle
} | null> {
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>
    }
  ).showOpenFilePicker
  if (picker) {
    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          { description: 'Markdown', accept: { 'text/markdown': ACCEPTED_FILE_TYPES } },
        ],
      })
      if (!handle) return null
      return { file: await handle.getFile(), handle }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      throw error
    }
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPTED_FILE_TYPES.join(',')
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      resolve(file ? { file } : null)
    })
    input.click()
  })
}
