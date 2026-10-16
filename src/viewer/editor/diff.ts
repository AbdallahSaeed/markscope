/** Text helpers for the editor that don't depend on CodeMirror (unit-testable). */

export interface TextChange {
  from: number
  to: number
  insert: string
}

/**
 * The smallest single replacement that turns `before` into `after`
 * (common prefix and suffix are kept), or null when they are equal.
 * Programmatic updates (reload, discard) then keep the cursor and scroll
 * position wherever the text didn't change.
 */
export function minimalChange(before: string, after: string): TextChange | null {
  if (before === after) return null
  const max = Math.min(before.length, after.length)
  let start = 0
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++
  let end = 0
  while (
    end < max - start &&
    before.charCodeAt(before.length - 1 - end) ===
      after.charCodeAt(after.length - 1 - end)
  )
    end++
  return {
    from: start,
    to: before.length - end,
    insert: after.slice(start, after.length - end),
  }
}
