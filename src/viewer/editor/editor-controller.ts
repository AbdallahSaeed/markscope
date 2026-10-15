/**
 * Owns the Markdown editor: loads CodeMirror on first use, keeps the text
 * while it isn't loaded, and debounces edits before the app re-renders.
 */
import { debounce } from '@/shared/dom'
import type { CreateEditor, CursorInfo, EditorAdapter } from './adapter'
import type { MarkdownCommand } from './markdown-commands'

/** Typing pause before edits reach the document and the preview re-renders. */
export const EDIT_DEBOUNCE_MS = 160

export interface EditorControllerOptions {
  /** Debounced: the user's edits are ready to apply. */
  onChange: () => void
  onScroll: () => void
  /** The cursor or selection moved. */
  onCursor?: (info: CursorInfo) => void
  /** Injected for tests; defaults to lazy-loading CodeMirror. */
  load?: () => Promise<CreateEditor>
}

const loadCodeMirror = (): Promise<CreateEditor> =>
  import('./codemirror').then(m => m.createCodeMirror)

export class EditorController {
  private adapter: EditorAdapter | null = null
  private mounting: Promise<void> | null = null
  /** The text while the editor isn't mounted yet. */
  private buffer = ''
  private readonly pending: ReturnType<typeof debounce<[]>>

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: EditorControllerOptions,
  ) {
    this.pending = debounce(() => this.opts.onChange(), EDIT_DEBOUNCE_MS)
  }

  get mounted(): boolean {
    return this.adapter !== null
  }

  /** The editor's current text, including edits still inside the debounce. */
  get value(): string {
    return this.adapter?.getValue() ?? this.buffer
  }

  /** Replace the text; `resetHistory` when a different document opens. */
  setValue(text: string, opts?: { resetHistory?: boolean }): void {
    this.buffer = text
    this.adapter?.setValue(text, opts)
  }

  /** Mounts the editor if needed, then focuses it. */
  async show(): Promise<void> {
    await this.mount()
    this.adapter?.focus()
  }

  focus(): void {
    this.adapter?.focus()
  }

  /** Drop edits waiting in the debounce (Discard). */
  cancelPending(): void {
    this.pending.cancel()
  }

  topVisibleLine(): number {
    return this.adapter?.topVisibleLine() ?? 1
  }

  /** Runs a formatting command in the editor; false when it isn't mounted or didn't apply. */
  run(command: MarkdownCommand): boolean {
    if (!this.adapter) return false
    const applied = this.adapter.run(command)
    this.adapter.focus()
    return applied
  }

  private mount(): Promise<void> {
    this.mounting ??= (this.opts.load ?? loadCodeMirror)()
      .then(create => {
        this.adapter = create(this.host, this.buffer, {
          onChange: () => this.pending(),
          onScroll: () => this.opts.onScroll(),
          onCursor: info => this.opts.onCursor?.(info),
        })
      })
      .catch(error => {
        this.mounting = null // allow a retry
        throw error
      })
    return this.mounting
  }
}
