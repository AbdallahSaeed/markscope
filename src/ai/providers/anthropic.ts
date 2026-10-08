import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest } from '../types'

/**
 * Anthropic provider using the official SDK. Runs only in the extension
 * service worker, never in a web page context; the key is read from
 * extension storage per request and never leaves this process except to
 * api.anthropic.com (or the configured base URL).
 */
export function createAnthropicProvider(opts: {
  apiKey: string
  baseUrl: string
  fetch?: typeof fetch
}): AIProvider {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl || undefined,
    // The "browser" here is our own extension service worker, not a website.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  })
  return {
    id: 'anthropic',
    async *stream(request: AIRequest, signal: AbortSignal) {
      const stream = client.messages.stream(
        {
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
        },
        { signal },
      )
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text
        }
      }
    },
  }
}
