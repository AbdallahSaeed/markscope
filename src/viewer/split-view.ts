/**
 * Edit view behaviour between the editor and the preview: two-way scroll
 * sync, double-click a preview block to jump to its source, and a
 * highlight on the preview block under the editor cursor.
 */
import type { EditorController } from './editor/editor-controller'
import { lineToOffset, monotonic, offsetToLine, type Anchor } from './editor/scroll-map'

export interface SplitViewDeps {
  /** The preview pane (the element that scrolls). */
  preview: HTMLElement
  article: HTMLElement
  editor: EditorController
  /** True while the Edit view is showing. */
  active: () => boolean
}

type Side = 'editor' | 'preview'

/** After a jump from the preview, keep the preview still while the editor centers. */
const JUMP_HOLD_MS = 400
/** A scroll event within this many px of a position we set ourselves is an echo. */
const ECHO_PX = 2
const CURSOR_CLASS = 'ms-cursor-block'

const atBottom = (el: HTMLElement) =>
  el.scrollTop + el.clientHeight >= el.scrollHeight - 2

export class SplitView {
  private anchors: Anchor[] | null = null
  /**
   * The scrollTop we last set on each pane. Its scroll event is an echo, not
   * user input. Compared by value, not time, so a real scroll right after a
   * sync is never dropped.
   */
  private readonly echo: Record<Side, number | null> = { editor: null, preview: null }
  private holdEditorUntil = 0
  private frame: Record<Side, number> = { editor: 0, preview: 0 }
  private cursorLine = 0
  private highlighted: HTMLElement | null = null

  constructor(private readonly deps: SplitViewDeps) {
    deps.preview.addEventListener('scroll', () => this.schedule('preview'), {
      passive: true,
    })
    deps.article.addEventListener('dblclick', e => this.onDoubleClick(e))
    // Images, diagrams and fonts change block positions after a render.
    new ResizeObserver(() => this.invalidate()).observe(deps.article)
  }

  /** The preview changed (render, resize): re-measure before the next sync. */
  invalidate(): void {
    this.anchors = null
  }

  /** The editor scrolled. */
  onEditorScroll(): void {
    this.schedule('editor')
  }

  /** Aligns the preview with the editor (entering the view, after a render). */
  syncPreview(): void {
    if (!this.deps.active()) return
    this.invalidate()
    this.follow('editor')
    this.highlight(this.cursorLine)
  }

  /** The editor cursor moved to a 1-based line. */
  onCursor(line: number): void {
    this.cursorLine = line
    this.highlight(line)
  }

  /** Leaving the Edit view. */
  deactivate(): void {
    this.highlighted?.classList.remove(CURSOR_CLASS)
    this.highlighted = null
  }

  private schedule(from: Side): void {
    if (!this.deps.active()) return
    const el = from === 'preview' ? this.deps.preview : this.deps.editor.scrollElement()
    const expected = this.echo[from]
    this.echo[from] = null
    if (el && expected !== null && Math.abs(el.scrollTop - expected) < ECHO_PX) return
    if (from === 'editor' && performance.now() < this.holdEditorUntil) return
    if (this.frame[from]) return
    this.frame[from] = requestAnimationFrame(() => {
      this.frame[from] = 0
      this.follow(from)
    })
  }

  /** Makes the other pane follow `from`. */
  private follow(from: Side): void {
    const { preview, editor } = this.deps
    const scroller = editor.scrollElement()
    if (!scroller) return
    const anchors = this.measure()
    if (from === 'editor') {
      const top = atBottom(scroller)
        ? preview.scrollHeight
        : lineToOffset(anchors, editor.topLine())
      preview.scrollTop = top
      this.echo.preview = preview.scrollTop
    } else {
      if (atBottom(preview)) scroller.scrollTop = scroller.scrollHeight
      else editor.scrollToLine(offsetToLine(anchors, preview.scrollTop))
      this.echo.editor = scroller.scrollTop
    }
  }

  /** Anchors for the preview's top-level blocks, measured once per layout. */
  private measure(): Anchor[] {
    if (this.anchors) return this.anchors
    const { preview, article, editor } = this.deps
    const base = preview.getBoundingClientRect().top - preview.scrollTop
    const blocks = [...article.querySelectorAll<HTMLElement>('[data-source-line]')].map(
      el => ({
        line: Number(el.dataset.sourceLine),
        top: el.getBoundingClientRect().top - base,
      }),
    )
    this.anchors = monotonic([
      { line: 1, top: 0 },
      ...blocks,
      { line: editor.lineCount() + 1, top: preview.scrollHeight },
    ])
    return this.anchors
  }

  private onDoubleClick(e: MouseEvent): void {
    if (!this.deps.active() || !this.deps.editor.scrollElement()) return
    const target = e.target instanceof Element ? e.target : null
    if (!target?.closest('[data-source-line]')) return
    const { preview } = this.deps
    const offset = e.clientY - preview.getBoundingClientRect().top + preview.scrollTop
    this.holdEditorUntil = performance.now() + JUMP_HOLD_MS
    this.deps.editor.revealLine(Math.floor(offsetToLine(this.measure(), offset)))
  }

  /** Marks the top-level preview block that contains a source line. */
  private highlight(line: number): void {
    if (!this.deps.active() || line < 1) return
    let block: HTMLElement | null = null
    for (const el of this.deps.article.querySelectorAll<HTMLElement>(
      '[data-source-line]',
    )) {
      if (Number(el.dataset.sourceLine) <= line) block = el
      else break
    }
    if (block === this.highlighted) return
    this.highlighted?.classList.remove(CURSOR_CLASS)
    block?.classList.add(CURSOR_CLASS)
    this.highlighted = block
  }
}
