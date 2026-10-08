/**
 * AI requests run here, in the service worker: the API key is read from
 * extension storage per request and is never sent to any page. Viewers talk
 * to this service over a long-lived Port so responses can stream.
 */
import { buildPrompt } from '@/ai/prompts'
import { createProvider } from '@/ai/providers'
import type { AIProvider, ProviderConfig } from '@/ai/types'
import { errorMessage } from '@/shared/errors'
import {
  AI_PORT_NAME,
  parseAIRequest,
  type AIPortEvent,
  type AIRunMessage,
  type AITestMessage,
} from '@/shared/messages'
import { aiKeyOrigin, type Settings } from '@/shared/settings'

export interface AIServiceDeps {
  loadSettings: () => Promise<Settings>
  getApiKey: (origin: string) => Promise<string>
  extensionOrigin: string
  makeProvider?: (config: ProviderConfig) => AIProvider
}

export interface PortLike {
  name: string
  sender?: chrome.runtime.MessageSender
  postMessage(message: AIPortEvent): void
  onMessage: { addListener(cb: (msg: unknown) => void): void }
  onDisconnect: { addListener(cb: () => void): void }
  disconnect(): void
}

export function createAIService(deps: AIServiceDeps) {
  const makeProvider = deps.makeProvider ?? createProvider

  async function run(
    port: PortLike,
    msg: AIRunMessage | AITestMessage,
    controller: AbortController,
  ): Promise<void> {
    const id = msg.id
    const settings = await deps.loadSettings()
    if (!settings.ai.enabled) {
      return port.postMessage({
        type: 'error',
        id,
        message: 'AI features are turned off. Enable them in Settings → AI.',
      })
    }
    if (!settings.ai.model) {
      return port.postMessage({
        type: 'error',
        id,
        message: 'Choose a model in Settings → AI.',
      })
    }
    const provider = makeProvider({
      provider: settings.ai.provider,
      baseUrl: settings.ai.baseUrl,
      apiKey: await deps.getApiKey(
        aiKeyOrigin(settings.ai.provider, settings.ai.baseUrl),
      ),
    })

    const prepared =
      msg.type === 'ai.test'
        ? {
            request: {
              system: 'Reply with the single word: ready',
              messages: [{ role: 'user' as const, content: 'ping' }],
              maxTokens: 16,
            },
            truncated: false,
          }
        : buildPrompt(msg)

    for await (const text of provider.stream(
      { ...prepared.request, model: settings.ai.model },
      controller.signal,
    )) {
      if (controller.signal.aborted) return
      port.postMessage({ type: 'delta', id, text })
    }
    // An aborted stream may end "normally"; never report it as done.
    if (controller.signal.aborted) return
    port.postMessage({ type: 'done', id, truncated: prepared.truncated })
  }

  function onConnect(port: PortLike): void {
    if (port.name !== AI_PORT_NAME) return
    // Only extension pages (viewer/options) may use AI — never content scripts.
    const url = port.sender?.url ?? ''
    if (!url.startsWith(deps.extensionOrigin)) {
      port.disconnect()
      return
    }
    let controller = new AbortController()
    port.onDisconnect.addListener(() => controller.abort())
    port.onMessage.addListener(raw => {
      const msg = parseAIRequest(raw)
      // Any new message supersedes the request in flight.
      controller.abort()
      if (!msg)
        return port.postMessage({ type: 'error', id: -1, message: 'Invalid AI request' })
      if (msg.type === 'ai.abort') return
      controller = new AbortController()
      const current = controller
      run(port, msg, current).catch(error => {
        if (current.signal.aborted) return
        port.postMessage({ type: 'error', id: msg.id, message: errorMessage(error) })
      })
    })
  }

  return { onConnect }
}
