import { AIConfigError, type AIProvider, type ProviderConfig } from '../types'
import { createAnthropicProvider } from './anthropic'
import { createOpenAICompatibleProvider } from './openai-compatible'

export function createProvider(config: ProviderConfig): AIProvider {
  const { provider, apiKey, baseUrl } = config
  if ((provider === 'anthropic' || provider === 'openai') && !apiKey) {
    throw new AIConfigError('Add an API key in Settings → AI to use this provider.')
  }
  switch (provider) {
    case 'anthropic':
      return createAnthropicProvider({
        apiKey,
        baseUrl,
        ...(config.fetch ? { fetch: config.fetch } : {}),
      })
    case 'openai':
    case 'local':
    case 'custom':
      return createOpenAICompatibleProvider({
        id: provider,
        apiKey,
        baseUrl,
        ...(config.fetch ? { fetch: config.fetch } : {}),
      })
  }
}
