import type { AIProviderId } from '@/shared/settings'
import type { ChatTurn } from '@/shared/messages'

export interface AIRequest {
  model: string
  system: string
  messages: ChatTurn[]
  maxTokens: number
}

/** Every provider streams plain text deltas; transport details stay inside. */
export interface AIProvider {
  readonly id: AIProviderId
  stream(request: AIRequest, signal: AbortSignal): AsyncIterable<string>
}

export interface ProviderConfig {
  provider: AIProviderId
  baseUrl: string
  apiKey: string
  fetch?: typeof fetch
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConfigError'
  }
}
