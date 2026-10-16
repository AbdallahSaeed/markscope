/**
 * Crash backup for unsaved edits. While a document has unsaved edits, its
 * text is copied to IndexedDB (debounced); the copy is removed on save or
 * discard. If the tab closes or crashes first, reopening the document
 * offers to restore it. Scratch documents autosave already and are skipped.
 */
import { tx as idbTx } from './idb'

export interface Draft {
  /** Document identity, see `draftKey`. */
  key: string
  text: string
  /** Hash of the saved text the edits started from (detects later changes). */
  baseHash: string
  updatedAt: number
}

/** The parts of a loaded document that identify it. */
export interface DraftDoc {
  scratch: boolean
  localId: string | null
  sourceUrl: string | null
  folder?: { id: string; path: string }
}

/** Debounce for draft writes: often enough to lose little, rarely enough to be cheap. */
export const DRAFT_DELAY_MS = 1000
/** Drafts older than this are dropped on startup. */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function draftKey(doc: DraftDoc): string | null {
  if (doc.scratch) return null
  if (doc.folder) return `folder:${doc.folder.id}:${doc.folder.path}`
  if (doc.localId) return `local:${doc.localId}`
  if (doc.sourceUrl) return `url:${doc.sourceUrl}`
  return null
}

/** FNV-1a (32-bit) plus length: cheap change detection, not security. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(16)}:${text.length}`
}

/** "3 minutes ago", "yesterday", … */
export function formatAgo(then: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const seconds = Math.round((then - now) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  return rtf.format(0, 'minute')
}

const tx = <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) =>
  idbTx<T>('drafts', mode, fn)

export const draftStore = {
  get: (key: string) =>
    tx<Draft | undefined>('readonly', s => s.get(key) as IDBRequest<Draft | undefined>),
  put: (draft: Draft) => tx('readwrite', s => s.put(draft)),
  delete: (key: string) => tx('readwrite', s => s.delete(key)),
  async prune(now = Date.now()): Promise<void> {
    const all = await tx<Draft[]>('readonly', s => s.getAll() as IDBRequest<Draft[]>)
    const stale = all.filter(d => now - d.updatedAt > DRAFT_MAX_AGE_MS)
    for (const d of stale) await draftStore.delete(d.key)
  },
}

export type DraftStore = typeof draftStore

/** Debounced writer: one pending write per session, flushed on page hide. */
export class DraftSaver {
  private timer: ReturnType<typeof setTimeout> | undefined
  private pending: Draft | null = null
  private baseText = ''
  private baseHash = hashText('')

  constructor(
    private readonly store: Pick<DraftStore, 'put' | 'delete'> = draftStore,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  /** Schedules a backup of `text`, made from the saved text `base`. */
  schedule(key: string, text: string, base: string): void {
    if (base !== this.baseText) {
      this.baseText = base
      this.baseHash = hashText(base)
    }
    this.pending = { key, text, baseHash: this.baseHash, updatedAt: Date.now() }
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), DRAFT_DELAY_MS)
  }

  /** Writes a pending backup now (e.g. when the page is hidden). */
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    const draft = this.pending
    this.pending = null
    if (draft) await this.store.put(draft).catch(this.onError)
  }

  /** The edits were saved or discarded: drop the backup. */
  async clear(key: string): Promise<void> {
    clearTimeout(this.timer)
    if (this.pending?.key === key) this.pending = null
    await this.store.delete(key).catch(this.onError)
  }
}
