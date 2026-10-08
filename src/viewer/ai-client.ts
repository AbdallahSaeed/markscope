/** Viewer-side client for the service worker AI port. */
import { AI_PORT_NAME, type AIPortEvent, type AIRunMessage } from '@/shared/messages'

export interface AIStreamHandlers {
  onDelta: (text: string) => void
  onDone: (truncated: boolean) => void
  onError: (message: string) => void
}

type RunInput = Omit<AIRunMessage, 'type' | 'id'> | { type: 'ai.test' }

export class AIClient {
  private port: chrome.runtime.Port | null = null
  private handlers: AIStreamHandlers | null = null
  /** Events carry the request id, so late events from aborted runs are ignored. */
  private currentId = 0

  run(message: RunInput, handlers: AIStreamHandlers): void {
    this.handlers = handlers
    const id = ++this.currentId
    const port = this.connect()
    port.postMessage(
      'type' in message ? { type: 'ai.test', id } : { type: 'ai.run', id, ...message },
    )
  }

  abort(): void {
    if (this.handlers) this.port?.postMessage({ type: 'ai.abort' })
    this.handlers = null
    this.currentId += 1
  }

  dispose(): void {
    this.abort()
    this.port?.disconnect()
    this.port = null
  }

  private connect(): chrome.runtime.Port {
    if (this.port) return this.port
    const port = chrome.runtime.connect({ name: AI_PORT_NAME })
    port.onMessage.addListener((event: AIPortEvent) => {
      const h = this.handlers
      if (!h || (event.id !== this.currentId && event.id !== -1)) return
      if (event.type === 'delta') h.onDelta(event.text)
      else if (event.type === 'done') {
        this.handlers = null
        h.onDone(event.truncated)
      } else {
        this.handlers = null
        h.onError(event.message)
      }
    })
    port.onDisconnect.addListener(() => {
      this.port = null
      const h = this.handlers
      this.handlers = null
      h?.onError('Connection to the AI service was lost. Try again.')
    })
    this.port = port
    return port
  }
}
