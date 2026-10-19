/** The browser extension's AI channel: a long-lived Port to the service worker. */
import { AI_PORT_NAME } from '@/shared/messages'
import type { AITransport } from './ai-client'

export function chromePortTransport(): AITransport {
  let port: chrome.runtime.Port | null = null
  return {
    connect(onEvent, onClose) {
      if (port) return
      const p = chrome.runtime.connect({ name: AI_PORT_NAME })
      p.onMessage.addListener(onEvent)
      p.onDisconnect.addListener(() => {
        port = null
        onClose()
      })
      port = p
    },
    send(message) {
      port?.postMessage(message)
    },
    dispose() {
      port?.disconnect()
      port = null
    },
  }
}
