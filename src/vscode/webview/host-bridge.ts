/** The webview's side of the host protocol: validated in, enveloped out. */
import {
  envelope,
  parseHostMessage,
  type HostMessage,
  type WebviewMessage,
} from '../protocol'

export interface VsCodeApi {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

export interface Bridge {
  post(message: WebviewMessage): void
  onMessage(handler: (message: HostMessage) => void): void
  getState(): unknown
  setState(state: unknown): void
}

export function createBridge(
  api: VsCodeApi = acquireVsCodeApi(),
  target: Pick<Window, 'addEventListener'> = window,
): Bridge {
  return {
    post: message => api.postMessage(envelope(message)),
    onMessage(handler) {
      target.addEventListener('message', event => {
        const message = parseHostMessage((event as MessageEvent).data)
        if (message) handler(message)
      })
    },
    getState: () => api.getState(),
    setState: state => api.setState(state),
  }
}
