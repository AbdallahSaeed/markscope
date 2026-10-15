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
  /** Fractional 1-based line at the top of the viewport (12.5 = halfway through line 12). */
  topLine(): number
  /** Scrolls so a fractional line is at the top of the viewport. */
  scrollToLine(line: number): void
  /** Puts the cursor at the start of a line, centers it and focuses the editor. */
  revealLine(line: number): void
  lineCount(): number
  /** Length of the text in UTF-16 code units (cheap; no string copy). */
  length(): number
  /** The element that scrolls (for scroll events and bottom detection). */
  scrollElement(): HTMLElement
  /** Applies a Markdown command to the main selection; false if it didn't apply. */
  run(command: MarkdownCommand): boolean
  destroy(): void
}

export type CreateEditor = (
  parent: HTMLElement,
  text: string,
  callbacks: EditorCallbacks,
) => EditorAdapter
