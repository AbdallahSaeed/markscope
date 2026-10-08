/**
 * File System Access helpers for reading and saving local files.
 *
 * Chrome keeps a handle's permission only for the current page session. A
 * handle restored from IndexedDB after a reload is in the "prompt" state, and
 * calling getFile() on it throws "The request is not allowed by the user agent
 * or the platform in the current context". Permission can only be re-granted
 * from a user gesture (click/keypress), so callers must check first and ask
 * the user to reconnect.
 */

export type AccessMode = 'read' | 'readwrite'

type PermissionState = 'granted' | 'denied' | 'prompt'

/** Methods that exist in Chromium but are missing from TypeScript's DOM lib. */
interface PermissionedHandle {
  queryPermission?: (d: { mode: AccessMode }) => Promise<PermissionState>
  requestPermission?: (d: { mode: AccessMode }) => Promise<PermissionState>
}

interface WritableHandle {
  createWritable?: () => Promise<{
    write(data: string): Promise<void>
    close(): Promise<void>
  }>
}

type SavePicker = (options: unknown) => Promise<FileSystemFileHandle>

/** Thrown when a stored handle needs the user to grant access again. */
export class FileAccessNeededError extends Error {
  constructor(readonly fileName: string) {
    super(`Markscope needs your permission to read ${fileName} again.`)
    this.name = 'FileAccessNeededError'
  }
}

export async function hasPermission(
  handle: FileSystemHandle,
  mode: AccessMode,
): Promise<boolean> {
  const query = (handle as unknown as PermissionedHandle).queryPermission
  // Browsers without the permission API (or handles from a fresh pick) just work.
  if (!query) return true
  try {
    return (await query.call(handle, { mode })) === 'granted'
  } catch {
    return false
  }
}

/** Must be called from a user gesture when permission is not yet granted. */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: AccessMode,
): Promise<boolean> {
  if (await hasPermission(handle, mode)) return true
  const request = (handle as unknown as PermissionedHandle).requestPermission
  if (!request) return false
  try {
    return (await request.call(handle, { mode })) === 'granted'
  } catch {
    return false
  }
}

/** Reads a handle only if access is already granted (safe from timers). */
export async function readIfPermitted(handle: FileSystemFileHandle): Promise<File> {
  if (!(await hasPermission(handle, 'read'))) throw new FileAccessNeededError(handle.name)
  return handle.getFile()
}

export function canWrite(handle: FileSystemFileHandle): boolean {
  return typeof (handle as unknown as WritableHandle).createWritable === 'function'
}

export async function writeText(
  handle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const create = (handle as unknown as WritableHandle).createWritable
  if (!create) throw new Error('This browser cannot write to files.')
  const writable = await create.call(handle)
  await writable.write(text)
  await writable.close()
}

export function supportsSavePicker(): boolean {
  return (
    typeof (window as unknown as { showSaveFilePicker?: SavePicker })
      .showSaveFilePicker === 'function'
  )
}

/** Opens the native "Save as" dialog; resolves null if the user cancels. */
export async function pickSaveTarget(
  suggestedName: string,
): Promise<FileSystemFileHandle | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker
  if (!picker) return null
  try {
    return await picker({
      suggestedName,
      types: [
        {
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] },
        },
      ],
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

/** File name to suggest for "Save as", always ending in a Markdown extension. */
export function suggestedFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'document'
  return /\.(md|markdown|mdown|mkdn?|mdx|txt)$/i.test(base) ? base : `${base}.md`
}
