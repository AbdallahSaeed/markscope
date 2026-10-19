/**
 * Messages between the VS Code extension host and the preview webview.
 *
 * The webview is untrusted input to the host: every message it sends goes
 * through `parseWebviewMessage`, and the host re-derives what to do from the
 * validated data (never from a field that says "run this command"). Messages
 * from the host are validated too, so a bug on either side fails closed.
 *
 * Line numbers are 1-based (as everywhere in the viewer); the host converts
 * to VS Code's 0-based lines.
 */
import type { DoctorIssue, Severity } from '@/analysis/doctor'
import { parseAIRequest, type AIPortEvent, type AIPortRequest } from '@/shared/messages'
import { parseSettings, type Settings } from '@/shared/settings'

export const PROTOCOL_VERSION = 1

export const MAX_DOCUMENT_CHARS = 50 * 1024 * 1024
export const MAX_EXPORT_CHARS = 20 * 1024 * 1024
export const MAX_COPY_CHARS = 10 * 1024 * 1024
export const MAX_DOCTOR_ISSUES = 500

/** Commands the host can forward into the webview. */
export const WEBVIEW_COMMANDS = [
  'find',
  'toggleSidebar',
  'focusMode',
  'runDoctor',
  'exportHtml',
  'copyHtml',
  'toggleAI',
] as const
export type WebviewCommand = (typeof WEBVIEW_COMMANDS)[number]

// ---------------------------------------------------------------- host → webview

export interface WebviewAssets {
  /** Webview URI of the classic render worker script. */
  worker: string
  /** Webview URI of the compiled document stylesheet (used for HTML export). */
  documentCss: string
  /** Webview URI of KaTeX's stylesheet (its fonts resolve relative to it). */
  katexCss: string
}

export type HostMessage =
  | { type: 'init'; settings: Settings; assets: WebviewAssets; aiAvailable: boolean }
  | {
      type: 'document'
      /** Document URI as a string; echoed back with doctor results. */
      uri: string
      version: number
      text: string
      fileName: string
      /** `workspace:` URL of the document inside its folder root; null when it has none. */
      baseUri: string | null
      /** Anchor to scroll to after rendering (from a link), with its leading `#`, or ''. */
      hash: string
    }
  | { type: 'lock'; locked: boolean }
  | { type: 'settings'; settings: Settings }
  | { type: 'scrollToLine'; line: number }
  | { type: 'cursorLine'; line: number }
  | { type: 'media'; requestId: number; url: string | null }
  | { type: 'command'; name: WebviewCommand }
  | { type: 'ai.event'; event: AIPortEvent }
  | { type: 'banner'; message: string }

// ---------------------------------------------------------------- webview → host

export type WebviewMessage =
  | { type: 'ready' }
  | {
      type: 'openLink'
      kind: 'document' | 'external' | 'file'
      target: string
      hash: string
    }
  | { type: 'revealLine'; line: number }
  | { type: 'scrolled'; line: number }
  | { type: 'resolveMedia'; requestId: number; path: string }
  | { type: 'doctor'; uri: string; version: number; issues: DoctorIssue[] }
  | { type: 'exportHtml'; html: string; fileName: string }
  | { type: 'copy'; text: string }
  | { type: 'ai'; request: AIPortRequest }

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max
const isLine = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= 100_000_000
const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info']

/** Wraps a message for sending; both sides reject any other version. */
export function envelope<T extends { type: string }>(message: T): T & { v: number } {
  return { v: PROTOCOL_VERSION, ...message }
}

function parseIssues(raw: unknown): DoctorIssue[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_DOCTOR_ISSUES) return null
  const issues: DoctorIssue[] = []
  for (const i of raw) {
    if (!isRecord(i)) return null
    if (!isString(i.rule, 64) || !isString(i.message, 1000)) return null
    if (!SEVERITIES.includes(i.severity as Severity) || !isLine(i.line)) return null
    issues.push({
      rule: i.rule,
      message: i.message,
      severity: i.severity as Severity,
      line: i.line,
    })
  }
  return issues
}

/** Validates a message received FROM the (untrusted) webview. */
export function parseWebviewMessage(raw: unknown): WebviewMessage | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.type !== 'string')
    return null
  switch (raw.type) {
    case 'ready':
      return { type: 'ready' }
    case 'openLink': {
      if (raw.kind !== 'document' && raw.kind !== 'external' && raw.kind !== 'file')
        return null
      if (!isString(raw.target, 8192) || raw.target === '') return null
      const hash = raw.hash === undefined ? '' : raw.hash
      if (!isString(hash, 2048) || (hash !== '' && !hash.startsWith('#'))) return null
      return { type: 'openLink', kind: raw.kind, target: raw.target, hash }
    }
    case 'revealLine':
    case 'scrolled':
      return isLine(raw.line) ? { type: raw.type, line: raw.line } : null
    case 'resolveMedia':
      return isId(raw.requestId) && isString(raw.path, 8192) && raw.path !== ''
        ? { type: 'resolveMedia', requestId: raw.requestId, path: raw.path }
        : null
    case 'doctor': {
      const issues = parseIssues(raw.issues)
      return issues &&
        isString(raw.uri, 8192) &&
        typeof raw.version === 'number' &&
        Number.isSafeInteger(raw.version)
        ? { type: 'doctor', uri: raw.uri, version: raw.version, issues }
        : null
    }
    case 'exportHtml':
      return isString(raw.html, MAX_EXPORT_CHARS) && isString(raw.fileName, 200)
        ? { type: 'exportHtml', html: raw.html, fileName: raw.fileName }
        : null
    case 'copy':
      return isString(raw.text, MAX_COPY_CHARS) ? { type: 'copy', text: raw.text } : null
    case 'ai': {
      const request = parseAIRequest(raw.request)
      return request ? { type: 'ai', request } : null
    }
    default:
      return null
  }
}

function parseAssets(raw: unknown): WebviewAssets | null {
  if (!isRecord(raw)) return null
  return isString(raw.worker, 8192) &&
    isString(raw.documentCss, 8192) &&
    isString(raw.katexCss, 8192)
    ? { worker: raw.worker, documentCss: raw.documentCss, katexCss: raw.katexCss }
    : null
}

const isAIEvent = (e: unknown): e is AIPortEvent =>
  isRecord(e) &&
  typeof e.id === 'number' &&
  ((e.type === 'delta' && typeof e.text === 'string') ||
    (e.type === 'done' && typeof e.truncated === 'boolean') ||
    (e.type === 'error' && typeof e.message === 'string'))

/** Validates a message received FROM the host (defence in depth). */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.type !== 'string')
    return null
  switch (raw.type) {
    case 'init': {
      const assets = parseAssets(raw.assets)
      return assets && typeof raw.aiAvailable === 'boolean'
        ? {
            type: 'init',
            settings: parseSettings(raw.settings),
            assets,
            aiAvailable: raw.aiAvailable,
          }
        : null
    }
    case 'document':
      return isString(raw.uri, 8192) &&
        typeof raw.version === 'number' &&
        Number.isSafeInteger(raw.version) &&
        isString(raw.text, MAX_DOCUMENT_CHARS) &&
        isString(raw.fileName, 1000) &&
        (raw.baseUri === null || isString(raw.baseUri, 8192)) &&
        (raw.hash === undefined || isString(raw.hash, 2048))
        ? {
            type: 'document',
            uri: raw.uri,
            version: raw.version,
            text: raw.text,
            fileName: raw.fileName,
            baseUri: raw.baseUri,
            hash: raw.hash ?? '',
          }
        : null
    case 'lock':
      return typeof raw.locked === 'boolean' ? { type: 'lock', locked: raw.locked } : null
    case 'settings':
      return { type: 'settings', settings: parseSettings(raw.settings) }
    case 'scrollToLine':
    case 'cursorLine':
      return isLine(raw.line) ? { type: raw.type, line: raw.line } : null
    case 'media':
      return isId(raw.requestId) && (raw.url === null || isString(raw.url, 8192))
        ? { type: 'media', requestId: raw.requestId, url: raw.url }
        : null
    case 'command':
      return (WEBVIEW_COMMANDS as readonly unknown[]).includes(raw.name)
        ? { type: 'command', name: raw.name as WebviewCommand }
        : null
    case 'ai.event':
      return isAIEvent(raw.event) ? { type: 'ai.event', event: raw.event } : null
    case 'banner':
      return isString(raw.message, 2000) ? { type: 'banner', message: raw.message } : null
    default:
      return null
  }
}
