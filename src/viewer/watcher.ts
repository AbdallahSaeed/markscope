/**
 * Live reload loop. Pauses while the tab is hidden, backs off on errors and
 * never overlaps requests.
 */
export interface WatcherOptions {
  intervalMs: number
  check: () => Promise<void>
  onError: (error: unknown) => void
}

export class Watcher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private failures = 0
  private inFlight = false
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && this.running) this.schedule(0)
  }

  constructor(private options: WatcherOptions) {}

  start(): void {
    if (this.running) return
    this.running = true
    document.addEventListener('visibilitychange', this.onVisibility)
    this.schedule(this.options.intervalMs)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  get active(): boolean {
    return this.running
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.tick(), delay)
  }

  private async tick(): Promise<void> {
    if (!this.running || this.inFlight) return
    if (document.visibilityState !== 'visible') return // resumed by visibilitychange
    this.inFlight = true
    try {
      await this.options.check()
      this.failures = 0
    } catch (error) {
      this.failures += 1
      this.options.onError(error)
    } finally {
      this.inFlight = false
    }
    if (this.running) {
      const backoff = Math.min(8, 2 ** Math.max(0, this.failures - 1))
      this.schedule(this.options.intervalMs * (this.failures ? backoff : 1))
    }
  }
}
