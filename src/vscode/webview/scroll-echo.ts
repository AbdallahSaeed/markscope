/**
 * Tells a scroll we caused ourselves apart from one the user made, by value:
 * the line we scrolled to is remembered, and a reading equal to it is an echo.
 * (A time window would drop real scrolls that land right after a sync — the
 * bug split-view.ts documents.)
 */
export class ScrollEcho {
  private expected: number | null = null

  /** Call right after scrolling the preview to `line` on the host's behalf. */
  expect(line: number): void {
    this.expected = line
  }

  /** True while the reading is still the position we set; any other reading ends the echo. */
  isEcho(current: number): boolean {
    if (this.expected === null) return false
    if (current === this.expected) return true
    this.expected = null
    return false
  }
}
