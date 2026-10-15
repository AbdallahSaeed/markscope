/**
 * The editor surface the viewer talks to. The CodeMirror implementation is
 * lazy-loaded, so nothing outside `codemirror.ts` imports CodeMirror.
 */

export interface EditorCallbacks {
  /** The user changed the text (not called for `setValue`). */
  onChange: () => void
  /** The editor scrolled. */
  onScroll: () => void
}

export interface EditorAdapter {
  getValue(): string
  /**
   * Replaces the text. Undo history is kept (so ⌘Z can reverse a discard)
   * unless `resetHistory` is set, e.g. when a different document opens.
   */
  setValue(text: string, opts?: { resetHistory?: boolean }): void
  focus(): void
  /** 1-based number of the first line visible at the top of the editor. */
  topVisibleLine(): number
  destroy(): void
}

export type CreateEditor = (
  parent: HTMLElement,
  text: string,
  callbacks: EditorCallbacks,
) => EditorAdapter
