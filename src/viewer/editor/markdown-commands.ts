/**
 * Markdown editing commands as pure functions of (text, selection), so they
 * are unit-testable without CodeMirror. Change positions refer to the
 * original text; the returned selection refers to the text after the edit.
 */
import type { TextChange } from './diff'

export interface Selection {
  from: number
  to: number
}

export interface Edit {
  changes: TextChange[]
  selection: Selection
}

export type MarkdownCommand = (text: string, sel: Selection) => Edit | null

/** Markers `wrapSelection` applies when the matching key is typed over a selection. */
export const WRAP_ON_TYPE = new Set(['*', '_', '~', '`'])

/**
 * Toggles an inline marker (`**`, `_`, `` ` ``, `~~`) around the selection.
 * Unwraps when the markers are inside or just outside the selection; with
 * no selection, inserts a pair and puts the cursor between them.
 */
export function toggleInline(marker: string): MarkdownCommand {
  const m = marker.length
  return (text, { from, to }) => {
    const before = text.slice(Math.max(0, from - m), from)
    const after = text.slice(to, to + m)
    const inner = text.slice(from, to)
    if (before === marker && after === marker) {
      // Markers just outside the selection (or an empty pair around the cursor).
      return {
        changes: [
          { from: from - m, to: from, insert: '' },
          { from: to, to: to + m, insert: '' },
        ],
        selection: { from: from - m, to: to - m },
      }
    }
    if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
      return {
        changes: [{ from, to, insert: inner.slice(m, inner.length - m) }],
        selection: { from, to: to - 2 * m },
      }
    }
    return {
      changes: [{ from, to, insert: `${marker}${inner}${marker}` }],
      selection: { from: from + m, to: to + m },
    }
  }
}

export const toggleBold = toggleInline('**')
export const toggleItalic = toggleInline('_')
export const toggleCode = toggleInline('`')
export const toggleStrike = toggleInline('~~')

const URL_RE = /^(https?:\/\/|mailto:)\S+$/i

/**
 * Wraps the selection in a link. A selected URL becomes the target (cursor
 * in the empty text); otherwise the text is kept and the `url` placeholder
 * is selected so it can be typed over.
 */
export const insertLink: MarkdownCommand = (text, { from, to }) => {
  const selected = text.slice(from, to)
  if (URL_RE.test(selected)) {
    return {
      changes: [{ from, to, insert: `[](${selected})` }],
      selection: { from: from + 1, to: from + 1 },
    }
  }
  const label = selected || 'text'
  const insert = `[${label}](url)`
  const urlStart = from + label.length + 3
  return {
    changes: [{ from, to, insert }],
    selection: selected
      ? { from: urlStart, to: urlStart + 3 }
      : { from: from + 1, to: from + 1 + label.length },
  }
}

/** Typing `*`, `_`, `~` or `` ` `` over a selection wraps it instead of replacing it. */
export function wrapSelection(text: string, sel: Selection, char: string): Edit | null {
  if (sel.from === sel.to || !WRAP_ON_TYPE.has(char)) return null
  return {
    changes: [
      { from: sel.from, to: sel.from, insert: char },
      { from: sel.to, to: sel.to, insert: char },
    ],
    selection: { from: sel.from + 1, to: sel.to + 1 },
  }
}

// ------------------------------------------------------------------ tables

type Align = 'left' | 'center' | 'right' | null

const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const DELIMITER_CELL = /^\s*:?-+:?\s*$/

/** Splits a table row on unescaped pipes, ignoring the outer ones. */
export function splitRow(line: string): string[] {
  const body = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
  return body.split(/(?<!\\)\|/).map(c => c.trim())
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

function delimiter(align: Align, width: number): string {
  const w = Math.max(width, 3)
  if (align === 'center') return `:${'-'.repeat(w - 2)}:`
  if (align === 'right') return `${'-'.repeat(w - 1)}:`
  if (align === 'left') return `:${'-'.repeat(w - 1)}`
  return '-'.repeat(w)
}

function pad(cell: string, width: number, align: Align): string {
  const gap = width - [...cell].length
  if (align === 'right') return ' '.repeat(gap) + cell
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + cell + ' '.repeat(gap - left)
  }
  return cell + ' '.repeat(gap)
}

/** Re-aligns a GFM table given as lines; returns null if it isn't one. */
export function formatTableLines(lines: string[]): string[] | null {
  const rows = lines.map(splitRow)
  const delim = rows[1]
  if (rows.length < 2 || !delim?.every(c => DELIMITER_CELL.test(c))) return null
  const cols = Math.max(...rows.map(r => r.length))
  const aligns = Array.from({ length: cols }, (_, i) => alignOf(delim[i] ?? ''))
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(3, ...rows.map((r, j) => (j === 1 ? 0 : [...(r[i] ?? '')].length))),
  )
  return rows.map((r, j) => {
    const cells = Array.from({ length: cols }, (_, i) =>
      j === 1
        ? delimiter(aligns[i] ?? null, widths[i] ?? 3)
        : pad(r[i] ?? '', widths[i] ?? 3, aligns[i] ?? null),
    )
    return `| ${cells.join(' | ')} |`
  })
}

/** Formats the GFM table around the cursor; null when the cursor isn't in one. */
export const formatTable: MarkdownCommand = (text, sel) => {
  const lines = text.split('\n')
  let offset = 0
  let cursorLine = 0
  for (let i = 0; i < lines.length; i++) {
    const end = offset + (lines[i]?.length ?? 0)
    if (sel.from <= end) {
      cursorLine = i
      break
    }
    offset = end + 1
  }
  if (!isTableLine(lines[cursorLine] ?? '')) return null
  let first = cursorLine
  while (first > 0 && isTableLine(lines[first - 1] ?? '')) first--
  let last = cursorLine
  while (last < lines.length - 1 && isTableLine(lines[last + 1] ?? '')) last++
  const block = lines.slice(first, last + 1)
  const formatted = formatTableLines(block)
  if (!formatted) return null
  const from = lines.slice(0, first).reduce((n, l) => n + l.length + 1, 0)
  const to = from + block.join('\n').length
  const insert = formatted.join('\n')
  // Keep the cursor on the same row, at the start of that row.
  const rowStart =
    from + formatted.slice(0, cursorLine - first).reduce((n, l) => n + l.length + 1, 0)
  return insert === block.join('\n')
    ? { changes: [], selection: sel }
    : { changes: [{ from, to, insert }], selection: { from: rowStart, to: rowStart } }
}
