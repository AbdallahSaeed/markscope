/**
 * URL utilities: markdown detection, GitHub/GitLab raw conversion,
 * viewer URL construction/parsing and safe relative resolution.
 */

export const MARKDOWN_EXTENSIONS = [
  'md',
  'markdown',
  'mdown',
  'mkd',
  'mkdn',
  'mdx',
] as const

export const MARKDOWN_CONTENT_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/plain',
] as const

const MD_PATH_RE = new RegExp(`\\.(${MARKDOWN_EXTENSIONS.join('|')})$`, 'i')

/** Static content-script match patterns (http, https, file) for every extension. */
export function markdownMatchPatterns(): string[] {
  const exts = MARKDOWN_EXTENSIONS.flatMap(e => [e, e.toUpperCase()])
  return ['*', 'file'].flatMap(scheme =>
    exts.flatMap(ext => {
      const prefix = scheme === 'file' ? 'file:///' : '*://*/'
      return [`${prefix}*.${ext}`, `${prefix}*.${ext}?*`]
    }),
  )
}

export function safeParseUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base)
  } catch {
    return null
  }
}

/** True when the URL path ends in a known Markdown extension. */
export function isMarkdownPath(url: string): boolean {
  const u = safeParseUrl(url)
  if (!u) return false
  let path = u.pathname
  try {
    path = decodeURIComponent(path)
  } catch {
    // keep the raw path
  }
  return MD_PATH_RE.test(path)
}

export function isMarkdownContentType(contentType: string): boolean {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return (MARKDOWN_CONTENT_TYPES as readonly string[]).includes(base)
}

export type SourceProtocol = 'http' | 'file'

/** Protocols Markscope is willing to load documents from. */
export function sourceProtocol(url: string): SourceProtocol | null {
  const u = safeParseUrl(url)
  if (!u) return null
  if (u.protocol === 'http:' || u.protocol === 'https:') return 'http'
  if (u.protocol === 'file:') return 'file'
  return null
}

/**
 * Converts GitHub / GitLab / Bitbucket "blob" page URLs (HTML) to the raw
 * file URL. Returns null when the URL is not a recognised repository blob.
 */
export function toRawUrl(url: string): string | null {
  const u = safeParseUrl(url)
  if (!u || !/^https?:$/.test(u.protocol)) return null
  const parts = u.pathname.split('/').filter(Boolean)

  if (u.hostname === 'github.com') {
    // /owner/repo/blob/ref/path...
    if (parts.length >= 5 && parts[2] === 'blob') {
      const [owner, repo, , ...rest] = parts
      return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join('/')}`
    }
    return null
  }

  if (u.hostname === 'gist.github.com') return null

  if (u.hostname === 'gitlab.com' || u.hostname.startsWith('gitlab.')) {
    // /group/(subgroup/)project/-/blob/ref/path
    const i = parts.indexOf('-')
    if (i > 0 && parts[i + 1] === 'blob' && parts.length > i + 3) {
      const out = new URL(u.toString())
      out.pathname =
        '/' + [...parts.slice(0, i), '-', 'raw', ...parts.slice(i + 2)].join('/')
      out.search = ''
      out.hash = ''
      return out.toString()
    }
    return null
  }

  if (u.hostname === 'bitbucket.org') {
    // /workspace/repo/src/ref/path
    if (parts.length >= 5 && parts[2] === 'src') {
      const out = new URL(u.toString())
      out.pathname = '/' + [parts[0], parts[1], 'raw', ...parts.slice(3)].join('/')
      out.search = ''
      out.hash = ''
      return out.toString()
    }
  }
  return null
}

/** URL that Markscope should load for a link: raw URL for repo blobs, else itself. */
export function normalizeDocumentUrl(url: string): string {
  return toRawUrl(url) ?? url
}

export interface ViewerParams {
  /** Source URL of the document (http/https/file). */
  src?: string
  /** One-time handoff id issued by the background for content already read. */
  handoff?: string
  /** Local document id (dropped/picked/pasted files stored in IndexedDB). */
  doc?: string
  /** Open the scratch editor. */
  scratch?: boolean
}

export function buildViewerUrl(
  viewerBase: string,
  params: ViewerParams,
  hash = '',
): string {
  const u = new URL(viewerBase)
  if (params.src) u.searchParams.set('src', params.src)
  if (params.handoff) u.searchParams.set('h', params.handoff)
  if (params.doc) u.searchParams.set('doc', params.doc)
  if (params.scratch) u.searchParams.set('scratch', '1')
  u.hash = hash
  return u.toString()
}

export function parseViewerUrl(href: string): ViewerParams {
  const u = safeParseUrl(href)
  if (!u) return {}
  const params: ViewerParams = {}
  const src = u.searchParams.get('src')
  if (src && sourceProtocol(src)) params.src = src
  const handoff = u.searchParams.get('h')
  if (handoff && /^[A-Za-z0-9_-]{8,64}$/.test(handoff)) params.handoff = handoff
  const doc = u.searchParams.get('doc')
  if (doc && /^[A-Za-z0-9_-]{8,64}$/.test(doc)) params.doc = doc
  if (u.searchParams.get('scratch') === '1') params.scratch = true
  return params
}

/** Marker appended to a source URL to ask the content script to leave it raw. */
export const RAW_MARKER = 'markscope-raw'

export function withRawMarker(url: string): string {
  const u = safeParseUrl(url)
  if (!u) return url
  u.hash = RAW_MARKER
  return u.toString()
}

export function hasRawMarker(url: string): boolean {
  return safeParseUrl(url)?.hash === `#${RAW_MARKER}`
}

export type ResolvedLink =
  | { kind: 'anchor'; href: string }
  | { kind: 'document'; href: string; target: string }
  | { kind: 'external'; href: string }
  | { kind: 'invalid' }

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'file:'])

/**
 * Resolves a link found in a rendered document. Markdown targets are routed
 * back through the viewer so navigation between docs stays in Markscope.
 */
export function resolveLink(
  href: string,
  baseUrl: string | null,
  viewerBase: string,
): ResolvedLink {
  const trimmed = href.trim()
  if (trimmed === '') return { kind: 'invalid' }
  if (trimmed.startsWith('#')) return { kind: 'anchor', href: trimmed }

  const u = safeParseUrl(trimmed, baseUrl ?? undefined)
  if (!u || !SAFE_LINK_PROTOCOLS.has(u.protocol)) return { kind: 'invalid' }
  // file: links are only meaningful when the document itself is local.
  if (u.protocol === 'file:' && sourceProtocol(baseUrl ?? '') !== 'file') {
    return { kind: 'invalid' }
  }

  if (baseUrl && sameDocument(u, baseUrl) && u.hash) {
    return { kind: 'anchor', href: u.hash }
  }

  const target = normalizeDocumentUrl(u.toString())
  if (sourceProtocol(target) && isMarkdownPath(target)) {
    const t = new URL(target)
    const hash = t.hash
    t.hash = ''
    return {
      kind: 'document',
      href: buildViewerUrl(viewerBase, { src: t.toString() }, hash),
      target: t.toString(),
    }
  }
  return { kind: 'external', href: u.toString() }
}

function sameDocument(u: URL, baseUrl: string): boolean {
  const b = safeParseUrl(baseUrl)
  if (!b) return false
  return u.origin === b.origin && u.pathname === b.pathname && u.search === b.search
}

/** Resolves an image/media source; returns null for disallowed schemes. */
export function resolveMediaSrc(src: string, baseUrl: string | null): string | null {
  const trimmed = src.trim()
  if (trimmed.startsWith('data:image/')) return trimmed
  const u = safeParseUrl(trimmed, baseUrl ?? undefined)
  if (!u) return null
  if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'blob:') {
    return u.toString()
  }
  if (u.protocol === 'file:' && sourceProtocol(baseUrl ?? '') === 'file')
    return u.toString()
  return null
}

export function isRemoteUrl(url: string): boolean {
  return sourceProtocol(url) === 'http'
}

/** Short human label for a source URL: host + last path segments. */
export function describeSource(url: string): {
  host: string
  path: string
  name: string
} {
  const u = safeParseUrl(url)
  if (!u) return { host: '', path: url, name: url }
  let path = u.pathname
  try {
    path = decodeURIComponent(path)
  } catch {
    // keep encoded
  }
  const name = path.split('/').filter(Boolean).pop() ?? path
  return { host: u.protocol === 'file:' ? 'Local file' : u.host, path, name }
}

/** Origin pattern used for optional host permission requests. */
export function originPattern(url: string): string | null {
  const u = safeParseUrl(url)
  if (!u || !/^https?:$/.test(u.protocol)) return null
  return `${u.protocol}//${u.hostname}/*`
}
