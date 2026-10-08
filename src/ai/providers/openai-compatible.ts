import type { AIProviderId } from '@/shared/settings'
import { readSSE } from '../sse'
import { AIConfigError, type AIProvider, type AIRequest } from '../types'

/**
 * Any OpenAI Chat Completions–compatible endpoint: OpenAI itself, local
 * runtimes (Ollama, LM Studio, llama.cpp server) and custom gateways.
 */
export function createOpenAICompatibleProvider(opts: {
  id: AIProviderId
  apiKey: string
  baseUrl: string
  fetch?: typeof fetch
}): AIProvider {
  if (!opts.baseUrl)
    throw new AIConfigError('Set a base URL for this provider in Settings → AI.')
  const doFetch = opts.fetch ?? fetch.bind(globalThis)
  const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`

  return {
    id: opts.id,
    async *stream(request: AIRequest, signal: AbortSignal) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers,
        signal,
        credentials: 'omit',
        body: JSON.stringify({
          model: request.model,
          stream: true,
          max_tokens: request.maxTokens,
          messages: [{ role: 'system', content: request.system }, ...request.messages],
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(await describeHttpError(res))
      }
      for await (const data of readSSE(res.body, signal)) {
        if (data === '[DONE]') return
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const delta = extractDelta(parsed)
        if (delta) yield delta
      }
    },
  }
}

export function extractDelta(chunk: unknown): string {
  if (typeof chunk !== 'object' || chunk === null) return ''
  const choices = (chunk as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''
  const first = choices[0] as { delta?: { content?: unknown } } | undefined
  const content = first?.delta?.content
  return typeof content === 'string' ? content : ''
}

async function describeHttpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } | string }
    detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? '')
  } catch {
    // body was not JSON
  }
  const hint =
    res.status === 401 || res.status === 403
      ? 'Check the API key in Settings → AI.'
      : res.status === 404
        ? 'Check the base URL and model name.'
        : res.status === 429
          ? 'Rate limited by the provider; try again shortly.'
          : ''
  return [`Provider returned HTTP ${res.status}.`, detail.slice(0, 300), hint]
    .filter(Boolean)
    .join(' ')
}
