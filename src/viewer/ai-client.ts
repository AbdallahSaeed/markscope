/** Viewer-side client for the service worker AI port. */
import type { AIPortEvent, AIRunMessage } from '@/shared/messages'

export interface AIStreamHandlers {
  onDelta: (text: string) => void
  onDone: (truncated: boolean) => void
  onError: (message: string) => void
}

type RunInput = Omit<AIRunMessage, 'type' | 'id'> | { type: 'ai.test' }

/** How requests reach the AI service and how its events come back. */
export interface AITransport {
  send(message: unknown): void
  /** Called for every event; the transport reports a lost connection through `onClose`. */
  connect(onEvent: (event: AIPortEvent) => void, onClose: () => void): void
  dispose(): void
}

export class AIClient {
  private connected = false
  private handlers: AIStreamHandlers | null = null
  /** Events carry the request id, so late events from aborted runs are ignored. */
  private currentId = 0

  constructor(private readonly transport: AITransport) {}

  run(message: RunInput, handlers: AIStreamHandlers): void {
    this.handlers = handlers
    const id = ++this.currentId
    this.connect()
    this.transport.send(
      'type' in message ? { type: 'ai.test', id } : { type: 'ai.run', id, ...message },
    )
  }

  abort(): void {
    if (this.handlers) this.transport.send({ type: 'ai.abort' })
    this.handlers = null
    this.currentId += 1
  }

  dispose(): void {
    this.abort()
    this.transport.dispose()
    this.connected = false
  }

  private connect(): void {
    if (this.connected) return
    this.transport.connect(
      (event: AIPortEvent) => {
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
      },
      () => {
        this.connected = false
        const h = this.handlers
        this.handlers = null
        h?.onError('Connection to the AI service was lost. Try again.')
      },
    )
    this.connected = true
  }
}
