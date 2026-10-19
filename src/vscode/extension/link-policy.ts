/**
 * What the host will open or serve on behalf of the webview. Pure (no
 * `vscode` import) so the rules can be unit-tested.
 *
 * The webview never names a file by URI. It sends a path relative to the
 * document's folder root; the host re-normalizes it (no `..` can climb out),
 * joins it onto the root it chose itself, and then checks the real path.
 */
import { MARKDOWN_EXTENSIONS, normalizeWorkspacePath } from '@/shared/urls'

/** Id used in the `workspace://` base URL the webview resolves links and images against. */
export const DOC_ROOT_ID = 'vscodedoc'

export const MEDIA_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
  'svg',
  'mp4',
  'webm',
  'ogg',
  'mp3',
  'wav',
] as const

const MAX_PATH = 2048
const extensionOf = (path: string): string => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isMarkdownFileName = (path: string): boolean =>
  (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(path))

export const isMediaFileName = (path: string): boolean =>
  (MEDIA_EXTENSIONS as readonly string[]).includes(extensionOf(path))

/** A folder-relative path from the webview, normalized; null when unusable. */
export function safeRelativePath(input: string): string | null {
  if (input.length > MAX_PATH || input.includes('\0') || input.includes('\\')) return null
  const path = normalizeWorkspacePath(input)
  return path === '' ? null : path
}

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** Only these ever reach `env.openExternal`; everything else is refused. */
export function parseExternalHref(href: string): URL | null {
  try {
    const url = new URL(href)
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url : null
  } catch {
    return null
  }
}

/** Posix path of `docPath` relative to `rootPath`, or null if it is not inside it. */
export function relativeToRoot(rootPath: string, docPath: string): string | null {
  const root = rootPath.replace(/\/+$/, '')
  if (!docPath.startsWith(`${root}/`)) return null
  const rel = docPath.slice(root.length + 1)
  return rel === '' ? null : rel
}

/** Above this the preview shows a notice instead of rendering (every keystroke would re-send it). */
export const MAX_PREVIEW_CHARS = 10 * 1024 * 1024

/**
 * A folder too broad to serve media from: a filesystem or drive root, or the
 * home directory. A loose file there would otherwise expose everything below.
 */
export function isBroadRoot(path: string, homePath?: string): boolean {
  const p = path.replace(/\/+$/, '')
  if (p === '' || /^\/[a-zA-Z]:$/.test(p)) return true
  return homePath !== undefined && p === homePath.replace(/\/+$/, '')
}

const SMALL_DOC = 64 * 1024
const LARGE_DOC = 512 * 1024

/** Wait after typing before re-rendering; big documents wait longer (as the editor view does). */
export function updateDelayMs(length: number): number {
  return length > LARGE_DOC ? 600 : length > SMALL_DOC ? 300 : 120
}

/** A safe default name for the export dialog: no separators or control characters, always `.html`. */
export function exportFileName(raw: string): string {
  const base =
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\.html?$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'document'
  return `${base}.html`
}
