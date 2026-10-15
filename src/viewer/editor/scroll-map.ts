/**
 * Maps between source lines and pixel offsets in the preview, so the editor
 * and the preview can follow each other. Pure (unit-testable): callers
 * measure the anchors, this only interpolates between them.
 */

/** A rendered block: its first source line and its top offset in the scroll content. */
export interface Anchor {
  line: number
  top: number
}

/**
 * Keeps anchors whose line and top both increase. Hidden or collapsed
 * blocks (top 0, or out of order) would otherwise make the mapping jump.
 */
export function monotonic(anchors: readonly Anchor[]): Anchor[] {
  const out: Anchor[] = []
  for (const a of anchors) {
    const prev = out[out.length - 1]
    if (!Number.isFinite(a.line) || !Number.isFinite(a.top)) continue
    if (!prev || (a.line > prev.line && a.top >= prev.top)) out.push(a)
  }
  return out
}

/** Index of the last anchor whose `key` is <= value (0 if none). */
function floorIndex(
  anchors: readonly Anchor[],
  value: number,
  key: keyof Anchor,
): number {
  let lo = 0
  let hi = anchors.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((anchors[mid]?.[key] ?? Infinity) <= value) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Offset of a (fractional) source line, interpolated between anchors. */
export function lineToOffset(anchors: readonly Anchor[], line: number): number {
  const first = anchors[0]
  if (!first) return 0
  if (line <= first.line) return first.top
  const i = floorIndex(anchors, line, 'line')
  const a = anchors[i] ?? first
  const b = anchors[i + 1]
  if (!b) return a.top
  return a.top + ((line - a.line) / (b.line - a.line)) * (b.top - a.top)
}

/** Fractional source line at an offset, interpolated between anchors. */
export function offsetToLine(anchors: readonly Anchor[], offset: number): number {
  const first = anchors[0]
  if (!first) return 1
  if (offset <= first.top) return first.line
  const i = floorIndex(anchors, offset, 'top')
  const a = anchors[i] ?? first
  const b = anchors[i + 1]
  if (!b || b.top === a.top) return a.line
  return a.line + ((offset - a.top) / (b.top - a.top)) * (b.line - a.line)
}
