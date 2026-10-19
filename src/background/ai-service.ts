/**
 * AI requests run here, in the service worker: the API key is read from
 * extension storage per request and is never sent to any page. Viewers talk
 * to this service over a long-lived Port so responses can stream. The request
 * handling itself lives in `@/ai/service`; this adds the browser-specific
 * "only extension pages may connect" check.
 */
import {
  createAIService as createCoreService,
  type AIPort,
  type AIServiceDeps as CoreDeps,
} from '@/ai/service'
import { AI_PORT_NAME } from '@/shared/messages'

export interface AIServiceDeps extends CoreDeps {
  extensionOrigin: string
}

export interface PortLike extends AIPort {
  name: string
  sender?: chrome.runtime.MessageSender
  disconnect(): void
}

export function createAIService(deps: AIServiceDeps) {
  const core = createCoreService(deps)

  function onConnect(port: PortLike): void {
    if (port.name !== AI_PORT_NAME) return
    // Only extension pages (viewer/options) may use AI — never content scripts.
    const url = port.sender?.url ?? ''
    if (!url.startsWith(deps.extensionOrigin)) {
      port.disconnect()
      return
    }
    core.attach(port)
  }

  return { onConnect }
}
