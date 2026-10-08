/**
 * Runtime message contracts between extension contexts.
 *
 * Every incoming message is validated with `parseMessage` before use, and the
 * background additionally checks *who* sent it (see background/router.ts).
 */

import { MARKDOWN_CONTENT_TYPES, sourceProtocol } from './urls'

/** 25 MB: larger documents are fetched by the viewer instead of handed over. */
export const MAX_HANDOFF_BYTES = 25 * 1024 * 1024

export const AI_TASKS = [
  'summarize',
  'outline',
  'review',
  'explain',
  'explain-code',
  'ask',
  'improve',
  'diagram',
] as const
export type AITask = (typeof AI_TASKS)[number]

export interface HandoffMessage {
  type: 'handoff'
  url: string
  text: string
  contentType: string
}

export interface ClaimHandoffMessage {
  type: 'handoff.claim'
  id: string
}

export interface RenderActiveTabMessage {
  type: 'render-active-tab'
  tabId: number
}

export interface OpenViewerMessage {
  type: 'open-viewer'
  src?: string
}

export type RuntimeMessage =
  HandoffMessage | ClaimHandoffMessage | RenderActiveTabMessage | OpenViewerMessage

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AIRunMessage {
  type: 'ai.run'
  /** Client-chosen request id; every event for this request echoes it. */
  id: number
  task: AITask
  document: string
  title: string
  selection?: string
  question?: string
  history?: ChatTurn[]
}

export interface AITestMessage {
  type: 'ai.test'
  id: number
}

export interface AIAbortMessage {
  type: 'ai.abort'
}

export type AIPortRequest = AIRunMessage | AITestMessage | AIAbortMessage

export type AIPortEvent =
  | { type: 'delta'; id: number; text: string }
  | { type: 'done'; id: number; truncated: boolean }
  | { type: 'error'; id: number; message: string }

export const AI_PORT_NAME = 'markscope.ai'

const MAX_DOC = 2_000_000
const MAX_FIELD = 200_000
const MAX_HISTORY = 40

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max

export function parseRuntimeMessage(raw: unknown): RuntimeMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null
  switch (raw.type) {
    case 'handoff': {
      if (!isString(raw.url, 8192) || !sourceProtocol(raw.url)) return null
      if (!isString(raw.text, MAX_HANDOFF_BYTES)) return null
      if (!isString(raw.contentType, 200)) return null
      const base = raw.contentType.split(';')[0]?.trim().toLowerCase() ?? ''
      if (!(MARKDOWN_CONTENT_TYPES as readonly string[]).includes(base)) return null
      return { type: 'handoff', url: raw.url, text: raw.text, contentType: base }
    }
    case 'handoff.claim':
      return isString(raw.id, 64) && /^[a-f0-9]{8,64}$/.test(raw.id)
        ? { type: 'handoff.claim', id: raw.id }
        : null
    case 'render-active-tab':
      return Number.isInteger(raw.tabId) && (raw.tabId as number) >= 0
        ? { type: 'render-active-tab', tabId: raw.tabId as number }
        : null
    case 'open-viewer':
      if (raw.src === undefined) return { type: 'open-viewer' }
      return isString(raw.src, 8192) && sourceProtocol(raw.src)
        ? { type: 'open-viewer', src: raw.src }
        : null
    default:
      return null
  }
}

function parseHistory(v: unknown): ChatTurn[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > MAX_HISTORY) return null
  const turns: ChatTurn[] = []
  for (const t of v) {
    if (!isRecord(t)) return null
    if (t.role !== 'user' && t.role !== 'assistant') return null
    if (!isString(t.content, MAX_FIELD)) return null
    turns.push({ role: t.role, content: t.content })
  }
  return turns
}

export function parseAIRequest(raw: unknown): AIPortRequest | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'ai.abort') return { type: 'ai.abort' }
  const id = raw.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) return null
  if (raw.type === 'ai.test') return { type: 'ai.test', id }
  if (raw.type !== 'ai.run') return null
  if (!(AI_TASKS as readonly unknown[]).includes(raw.task)) return null
  if (!isString(raw.document, MAX_DOC) || !isString(raw.title, 500)) return null
  if (raw.selection !== undefined && !isString(raw.selection, MAX_FIELD)) return null
  if (raw.question !== undefined && !isString(raw.question, 10_000)) return null
  const history = parseHistory(raw.history)
  if (history === null) return null
  return {
    type: 'ai.run',
    id,
    task: raw.task as AITask,
    document: raw.document,
    title: raw.title,
    ...(raw.selection !== undefined ? { selection: raw.selection as string } : {}),
    ...(raw.question !== undefined ? { question: raw.question as string } : {}),
    history,
  }
}
