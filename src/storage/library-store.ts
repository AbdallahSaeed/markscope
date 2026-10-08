/**
 * Recent documents and favorites. Entries are small metadata records; local
 * file contents live in IndexedDB (see viewer/local-docs.ts).
 */
import type { KeyValueArea } from './area'

export const LIBRARY_KEY = 'library'
export const MAX_RECENTS = 50
export const MAX_FAVORITES = 200

export type DocumentRef =
  | { kind: 'url'; url: string }
  | { kind: 'local'; id: string; name: string }
  /** A document inside an opened folder; `name` is the folder's name. */
  | { kind: 'workspace'; id: string; path: string; name: string }

export interface LibraryEntry {
  ref: DocumentRef
  title: string
  openedAt: number
  favorite: boolean
}

export interface Library {
  entries: LibraryEntry[]
}

export function refKey(ref: DocumentRef): string {
  if (ref.kind === 'url') return `url:${ref.url}`
  if (ref.kind === 'workspace') return `ws:${ref.id}:${ref.path}`
  return `local:${ref.id}`
}

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null

function parseRef(v: unknown): DocumentRef | null {
  if (!isRecord(v)) return null
  if (v.kind === 'url' && typeof v.url === 'string' && v.url.length < 8192) {
    return { kind: 'url', url: v.url }
  }
  if (
    v.kind === 'workspace' &&
    typeof v.id === 'string' &&
    typeof v.path === 'string' &&
    typeof v.name === 'string'
  ) {
    return {
      kind: 'workspace',
      id: v.id,
      path: v.path.slice(0, 2048),
      name: v.name.slice(0, 500),
    }
  }
  if (v.kind === 'local' && typeof v.id === 'string' && typeof v.name === 'string') {
    return { kind: 'local', id: v.id, name: v.name.slice(0, 500) }
  }
  return null
}

export function parseLibrary(raw: unknown): Library {
  const list = isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : []
  const entries: LibraryEntry[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!isRecord(item)) continue
    const ref = parseRef(item.ref)
    if (!ref || seen.has(refKey(ref))) continue
    seen.add(refKey(ref))
    entries.push({
      ref,
      title: typeof item.title === 'string' ? item.title.slice(0, 500) : '',
      openedAt: typeof item.openedAt === 'number' ? item.openedAt : 0,
      favorite: item.favorite === true,
    })
  }
  return { entries: sortEntries(entries) }
}

const sortEntries = (entries: LibraryEntry[]) =>
  [...entries].sort((a, b) => b.openedAt - a.openedAt)

/** Keeps every favorite plus the newest MAX_RECENTS non-favorites. */
function prune(entries: LibraryEntry[]): LibraryEntry[] {
  const sorted = sortEntries(entries)
  const favorites = sorted.filter(e => e.favorite).slice(0, MAX_FAVORITES)
  const recents = sorted.filter(e => !e.favorite).slice(0, MAX_RECENTS)
  return sortEntries([...favorites, ...recents])
}

export function recordVisit(
  lib: Library,
  ref: DocumentRef,
  title: string,
  now: number,
): Library {
  const key = refKey(ref)
  const existing = lib.entries.find(e => refKey(e.ref) === key)
  const entry: LibraryEntry = {
    ref,
    title: title || existing?.title || '',
    openedAt: now,
    favorite: existing?.favorite ?? false,
  }
  return { entries: prune([entry, ...lib.entries.filter(e => refKey(e.ref) !== key)]) }
}

export function setFavorite(
  lib: Library,
  ref: DocumentRef,
  favorite: boolean,
  title = '',
): Library {
  const key = refKey(ref)
  const existing = lib.entries.find(e => refKey(e.ref) === key)
  const entry: LibraryEntry = existing
    ? { ...existing, favorite }
    : { ref, title, openedAt: Date.now(), favorite }
  return { entries: prune([entry, ...lib.entries.filter(e => refKey(e.ref) !== key)]) }
}

export function removeEntry(lib: Library, ref: DocumentRef): Library {
  const key = refKey(ref)
  return { entries: lib.entries.filter(e => refKey(e.ref) !== key) }
}

export function clearRecents(lib: Library): Library {
  return { entries: lib.entries.filter(e => e.favorite) }
}

export interface LibraryStore {
  load(): Promise<Library>
  visit(ref: DocumentRef, title: string): Promise<Library>
  favorite(ref: DocumentRef, favorite: boolean, title?: string): Promise<Library>
  remove(ref: DocumentRef): Promise<Library>
  clearRecents(): Promise<Library>
  subscribe(listener: (lib: Library) => void): () => void
}

export function createLibraryStore(
  area: KeyValueArea,
  now: () => number = Date.now,
): LibraryStore {
  let queue: Promise<unknown> = Promise.resolve()
  const mutate = (fn: (lib: Library) => Library): Promise<Library> => {
    const run = async () => {
      const next = fn(parseLibrary(await area.get(LIBRARY_KEY)))
      await area.set(LIBRARY_KEY, next)
      return next
    }
    const p = queue.then(run, run)
    queue = p.catch(() => undefined)
    return p
  }
  return {
    load: async () => parseLibrary(await area.get(LIBRARY_KEY)),
    visit: (ref, title) => mutate(lib => recordVisit(lib, ref, title, now())),
    favorite: (ref, fav, title) => mutate(lib => setFavorite(lib, ref, fav, title)),
    remove: ref => mutate(lib => removeEntry(lib, ref)),
    clearRecents: () => mutate(clearRecents),
    subscribe(listener) {
      return area.subscribe(changes => {
        const change = changes[LIBRARY_KEY]
        if (change) listener(parseLibrary(change.newValue))
      })
    },
  }
}
