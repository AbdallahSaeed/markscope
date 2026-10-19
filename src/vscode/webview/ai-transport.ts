/** Carries the AI panel's requests to the extension host and its streamed answers back. */
import type { AITransport } from '@/viewer/ai-client'
import type { AIPortEvent, AIPortRequest } from '@/shared/messages'
import type { Bridge } from './host-bridge'

export interface BridgeAITransport extends AITransport {
  /** An `ai.event` arrived from the host. */
  deliver(event: AIPortEvent): void
}

export function bridgeAITransport(bridge: Pick<Bridge, 'post'>): BridgeAITransport {
  let onEvent: ((event: AIPortEvent) => void) | null = null
  return {
    connect(handler) {
      onEvent = handler
    },
    // The host validates every request again (parseWebviewMessage), so the cast loses nothing.
    send: message => bridge.post({ type: 'ai', request: message as AIPortRequest }),
    deliver: event => onEvent?.(event),
    dispose() {
      onEvent = null
    },
  }
}
