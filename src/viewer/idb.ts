/** Shared IndexedDB access for the viewer's local stores. */
const DB_NAME = 'markscope'
const DB_VERSION = 2

export type StoreName = 'docs' | 'workspaces'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1: docs. v2: workspaces (opened folders).
      if (!db.objectStoreNames.contains('docs'))
        db.createObjectStore('docs', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('workspaces'))
        db.createObjectStore('workspaces', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'))
  })
}

export async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode)
      const req = fn(transaction.objectStore(store))
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
