/**
 * Loads document text from http(s) and file: URLs with conditional
 * requests, so live reload is cheap (304 Not Modified on unchanged files).
 */
import { PermissionNeededError, SourceLoadError } from '@/shared/errors'
import { originPattern, sourceProtocol } from '@/shared/urls'

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024

export interface Validators {
  etag?: string
  lastModified?: string
}

export type LoadResult =
  | { changed: true; text: string; validators: Validators }
  | { changed: false; validators: Validators }

export interface LoaderDeps {
  fetch: typeof fetch
  readFile: (url: string) => Promise<string>
  /** Whether the extension already holds host permission for an origin pattern. */
  hasPermission: (origin: string) => Promise<boolean>
}

export function defaultLoaderDeps(): LoaderDeps {
  return {
    fetch: fetch.bind(globalThis),
    readFile: readFileViaXhr,
    hasPermission: origin =>
      chrome.permissions.contains({ origins: [origin] }).catch(() => false),
  }
}

/** fetch() does not support file: URLs in Chromium; XHR does for extensions with file access. */
export function readFileViaXhr(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.overrideMimeType('text/plain; charset=utf-8')
    xhr.onload = () =>
      xhr.status === 0 || xhr.status === 200
        ? resolve(xhr.responseText)
        : reject(new SourceLoadError(`Could not read file (${xhr.status})`, xhr.status))
    xhr.onerror = () =>
      reject(
        new SourceLoadError(
          'Could not read the local file. Make sure “Allow access to file URLs” is enabled for Markscope.',
        ),
      )
    xhr.send()
  })
}

export async function loadSource(
  url: string,
  previous: Validators | null,
  deps: LoaderDeps,
): Promise<LoadResult> {
  const protocol = sourceProtocol(url)
  if (protocol === 'file') {
    return { changed: true, text: await deps.readFile(url), validators: {} }
  }
  if (protocol !== 'http') throw new SourceLoadError('Unsupported URL scheme')

  const headers: Record<string, string> = {
    Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1',
  }
  if (previous?.etag) headers['If-None-Match'] = previous.etag
  if (previous?.lastModified) headers['If-Modified-Since'] = previous.lastModified

  let res: Response
  try {
    res = await deps.fetch(url, {
      headers,
      cache: 'no-cache',
      credentials: 'omit',
      redirect: 'follow',
    })
  } catch {
    // A network-level failure is usually CORS (no host permission for this
    // origin) — unless we already hold the permission, in which case the
    // server is simply unreachable and the watcher should retry with backoff.
    const origin = originPattern(url)
    if (origin && !(await deps.hasPermission(origin)))
      throw new PermissionNeededError(origin)
    throw new SourceLoadError('Network error: the server could not be reached')
  }
  const validators: Validators = {
    ...(res.headers.get('etag') ? { etag: res.headers.get('etag') as string } : {}),
    ...(res.headers.get('last-modified')
      ? { lastModified: res.headers.get('last-modified') as string }
      : {}),
  }
  if (res.status === 304) return { changed: false, validators: previous ?? validators }
  if (!res.ok)
    throw new SourceLoadError(
      `Server responded ${res.status} ${res.statusText}`.trim(),
      res.status,
    )
  const length = Number(res.headers.get('content-length') ?? '0')
  if (length > MAX_DOCUMENT_BYTES)
    throw new SourceLoadError('Document is larger than 50 MB')
  const text = await res.text()
  if (text.length > MAX_DOCUMENT_BYTES)
    throw new SourceLoadError('Document is larger than 50 MB')
  return { changed: true, text, validators }
}
