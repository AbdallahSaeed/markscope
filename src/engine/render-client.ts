/**
 * Renders off the main thread via a module Worker so very large documents
 * never freeze the UI. Falls back to in-thread rendering if the worker
 * cannot start (e.g. restrictive environments, tests).
 */
import { renderDocument } from './render'
import type { RenderOptions, RenderResult } from './types'

/** Below this size the worker round-trip costs more than it saves. */
export const WORKER_THRESHOLD = 64 * 1024

type Pending = {
  source: string
  options: RenderOptions
  resolve: (r: RenderResult) => void
  reject: (e: unknown) => void
}

export class RenderClient {
  private worker: Worker | null = null
  private failed = false
  private seq = 0
  private pending = new Map<number, Pending>()

  constructor(private readonly workerUrl: string | null) {}

  render(source: string, options: RenderOptions): Promise<RenderResult> {
    if (source.length < WORKER_THRESHOLD || !this.ensureWorker()) {
      return Promise.resolve(renderDocument(source, options))
    }
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { source, options, resolve, reject })
      this.worker?.postMessage({ id, source, options })
    })
  }

  private ensureWorker(): boolean {
    if (this.worker) return true
    if (this.failed || !this.workerUrl || typeof Worker === 'undefined') return false
    try {
      const worker = new Worker(this.workerUrl, { type: 'module' })
      worker.onmessage = (
        e: MessageEvent<{
          id: number
          ok: boolean
          result?: RenderResult
          error?: string
        }>,
      ) => {
        const p = this.pending.get(e.data.id)
        if (!p) return
        this.pending.delete(e.data.id)
        if (e.data.ok && e.data.result) p.resolve(e.data.result)
        else p.reject(new Error(e.data.error ?? 'Render failed'))
      }
      worker.onerror = () => {
        // Stop using the worker and finish in-flight requests on this thread.
        this.failed = true
        this.worker?.terminate()
        this.worker = null
        for (const p of this.pending.values()) {
          try {
            p.resolve(renderDocument(p.source, p.options))
          } catch (error) {
            p.reject(error)
          }
        }
        this.pending.clear()
      }
      this.worker = worker
      return true
    } catch {
      this.failed = true
      return false
    }
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
