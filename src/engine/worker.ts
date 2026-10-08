/// <reference lib="webworker" />
import { renderDocument } from './render'
import type { RenderOptions } from './types'

interface RenderRequest {
  id: number
  source: string
  options: RenderOptions
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, source, options } = event.data
  try {
    self.postMessage({ id, ok: true, result: renderDocument(source, options) })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
