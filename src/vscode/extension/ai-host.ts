/**
 * One preview's AI session in the extension host. The webview only ever posts
 * requests; the provider call, the settings gate and the API key (read from
 * the secret store, by endpoint origin) all stay here, and the key is never
 * sent to the webview. Free of the `vscode` module so it can be unit-tested.
 */
import { createAIService } from '@/ai/service'
import type { AIProvider, ProviderConfig } from '@/ai/types'
import type { AIPortEvent, AIPortRequest } from '@/shared/messages'
import type { Settings } from '@/shared/settings'
import type { SecretsStore } from '@/storage/secrets-store'

export interface PanelAIDeps {
  /** Effective settings (AI already forced off in untrusted workspaces). */
  loadSettings: () => Promise<Settings>
  secrets: Pick<SecretsStore, 'getApiKey'>
  post: (event: AIPortEvent) => void
  makeProvider?: (config: ProviderConfig) => AIProvider
}

export interface PanelAI {
  handle(request: AIPortRequest): void
  /** Aborts anything in flight (the preview closed). */
  dispose(): void
}

export function createPanelAI(deps: PanelAIDeps): PanelAI {
  let onMessage: ((message: unknown) => void) | undefined
  let onDisconnect: (() => void) | undefined
  createAIService({
    loadSettings: deps.loadSettings,
    getApiKey: origin => deps.secrets.getApiKey(origin),
    ...(deps.makeProvider ? { makeProvider: deps.makeProvider } : {}),
  }).attach({
    postMessage: deps.post,
    onMessage: { addListener: cb => void (onMessage = cb) },
    onDisconnect: { addListener: cb => void (onDisconnect = cb) },
  })
  return {
    handle: request => onMessage?.(request),
    dispose: () => onDisconnect?.(),
  }
}
