/**
 * The editor surface the viewer talks to. The CodeMirror implementation is
 * lazy-loaded, so nothing outside `codemirror.ts` imports CodeMirror.
 */

import type { MarkdownCommand } from './markdown-commands'

/** Where the cursor is: 1-based line and column, and the selection length. */
export interface CursorInfo {
  line: number
  col: number
  selected: number
}

export interface EditorCallbacks {
  /** The user changed the text (not called for `setValue`). */
  onChange: () => void
  /** The editor scrolled. */
  onScroll: () => void
  /** The cursor or selection moved (also called once on mount). */
  onCursor: (info: CursorInfo) => void
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
  /** Applies a Markdown command to the main selection; false if it didn't apply. */
  run(command: MarkdownCommand): boolean
  destroy(): void
}

export type CreateEditor = (
  parent: HTMLElement,
  text: string,
  callbacks: EditorCallbacks,
) => EditorAdapter
