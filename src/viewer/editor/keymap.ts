/**
 * Formatting commands and their keys: one table drives the CodeMirror
 * keymap, the shortcut help dialog and the command palette.
 */
import {
  formatTable,
  insertLink,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleStrike,
  type MarkdownCommand,
} from './markdown-commands'

export interface EditorCommandSpec {
  id: string
  label: string
  /** CodeMirror key name, e.g. `Shift-Mod-x` (Mod = ⌘ on macOS, Ctrl elsewhere). */
  key: string
  command: MarkdownCommand
}

export const EDITOR_COMMANDS: readonly EditorCommandSpec[] = [
  { id: 'bold', label: 'Bold', key: 'Mod-b', command: toggleBold },
  { id: 'italic', label: 'Italic', key: 'Mod-i', command: toggleItalic },
  { id: 'code', label: 'Inline code', key: 'Mod-e', command: toggleCode },
  { id: 'strike', label: 'Strikethrough', key: 'Shift-Mod-x', command: toggleStrike },
  // ⌘K stays the command palette, so links take Shift.
  { id: 'link', label: 'Insert link', key: 'Shift-Mod-k', command: insertLink },
  // Needs Mod: on macOS CodeMirror matches ⌥-only combos by the typed character (⌥⇧F → Ï).
  { id: 'table', label: 'Format table', key: 'Mod-Alt-t', command: formatTable },
]

/** `Shift-Mod-x` → `Shift ⌘ X` (the shortcut-help format). */
export function displayKey(key: string, modLabel: string): string {
  return key
    .split('-')
    .map(part =>
      part === 'Mod' ? modLabel : part.length === 1 ? part.toUpperCase() : part,
    )
    .join(' ')
}
