/**
 * Runtime message router. Validates message shape AND sender:
 *  - content scripts may only hand off documents for their own tab URL;
 *  - privileged operations require an extension page sender.
 */
import { parseRuntimeMessage, type RuntimeMessage } from '@/shared/messages'
import {
  buildViewerUrl,
  isMarkdownContentType,
  normalizeDocumentUrl,
  sourceProtocol,
} from '@/shared/urls'
import type { HandoffStore } from './handoff'
import { classifySender } from './sender'

export interface RouterDeps {
  handoff: HandoffStore
  runtimeId: string
  viewerBase: string
  extensionOrigin: string
  tabs: Pick<typeof chrome.tabs, 'update' | 'create'>
  /** Reads markdown text from a tab the user explicitly invoked us on. */
  readTab: (
    tabId: number,
  ) => Promise<{ url: string; text: string; contentType: string } | null>
}

export type RouterResponse = { ok: true; data?: unknown } | { ok: false; error: string }

export function createRouter(deps: RouterDeps) {
  async function handle(
    raw: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<RouterResponse> {
    const msg = parseRuntimeMessage(raw)
    if (!msg) return { ok: false, error: 'Invalid message' }
    const kind = classifySender(sender, deps.runtimeId, deps.extensionOrigin)
    if (kind === 'untrusted') return { ok: false, error: 'Untrusted sender' }

    switch (msg.type) {
      case 'handoff':
        return handleHandoff(msg, sender, kind)
      case 'handoff.claim': {
        if (kind !== 'extension-page') return { ok: false, error: 'Forbidden' }
        const entry = await deps.handoff.claim(msg.id)
        return entry
          ? { ok: true, data: { url: entry.url, text: entry.text } }
          : { ok: false, error: 'Expired' }
      }
      case 'render-active-tab': {
        if (kind !== 'extension-page') return { ok: false, error: 'Forbidden' }
        return renderTab(msg.tabId)
      }
      case 'open-viewer': {
        if (kind !== 'extension-page') return { ok: false, error: 'Forbidden' }
        const url = buildViewerUrl(
          deps.viewerBase,
          msg.src ? { src: normalizeDocumentUrl(msg.src) } : {},
        )
        await deps.tabs.create({ url })
        return { ok: true }
      }
    }
  }

  async function handleHandoff(
    msg: Extract<RuntimeMessage, { type: 'handoff' }>,
    sender: chrome.runtime.MessageSender,
    kind: ReturnType<typeof classifySender>,
  ): Promise<RouterResponse> {
    const tabId = sender.tab?.id
    if (kind !== 'content-script' || tabId === undefined)
      return { ok: false, error: 'Forbidden' }
    // A page can only hand off its own document, never an arbitrary URL.
    if (stripHash(sender.url ?? '') !== stripHash(msg.url))
      return { ok: false, error: 'URL mismatch' }
    if (sender.frameId !== undefined && sender.frameId !== 0)
      return { ok: false, error: 'Top frame only' }
    const id = await deps.handoff.put(msg.url, msg.text)
    const hash = safeHash(msg.url)
    await deps.tabs.update(tabId, {
      url: buildViewerUrl(
        deps.viewerBase,
        { src: stripHash(msg.url), handoff: id },
        hash,
      ),
    })
    return { ok: true }
  }

  async function renderTab(tabId: number): Promise<RouterResponse> {
    const doc = await deps.readTab(tabId)
    if (!doc)
      return { ok: false, error: 'This page is not a plain-text Markdown document.' }
    if (!sourceProtocol(doc.url) || !isMarkdownContentType(doc.contentType)) {
      return { ok: false, error: 'This page is not a plain-text Markdown document.' }
    }
    const id = await deps.handoff.put(doc.url, doc.text)
    await deps.tabs.update(tabId, {
      url: buildViewerUrl(deps.viewerBase, { src: stripHash(doc.url), handoff: id }),
    })
    return { ok: true }
  }

  return { handle }
}

function stripHash(url: string): string {
  const i = url.indexOf('#')
  return i === -1 ? url : url.slice(0, i)
}

function safeHash(url: string): string {
  try {
    const h = new URL(url).hash
    return h === '#markscope-raw' ? '' : h
  } catch {
    return ''
  }
}
