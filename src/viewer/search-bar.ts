/**
 * Find-in-document bar. Paints matches with the CSS Custom Highlight API
 * (no DOM mutation); falls back to scrolling between matches without paint
 * in browsers that lack it.
 */
import { debounce, h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { findMatches } from './search'

type HighlightRegistry = {
  set(name: string, h: unknown): void
  delete(name: string): void
}
const highlights = (
  globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined
)?.highlights
const HighlightCtor = (
  globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }
).Highlight

export class SearchBar {
  readonly el: HTMLElement
  private input = h('input', {
    type: 'search',
    class: 'ms-search__input',
    placeholder: 'Find in document',
    'aria-label': 'Find in document',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  private count = h('span', { class: 'ms-search__count', 'aria-live': 'polite' })
  private ranges: Range[] = []
  private index = -1
  private lastQuery = ''

  constructor(private readonly root: () => HTMLElement) {
    const btn = (label: string, ico: readonly string[], fn: () => void) =>
      h(
        'button',
        {
          type: 'button',
          class: 'ms-icon-btn',
          'aria-label': label,
          title: label,
          on: { click: fn },
        },
        icon(ico),
      )
    this.el = h(
      'div',
      { class: 'ms-search ms-ui', role: 'search', hidden: true },
      icon(ICONS.search),
      this.input,
      this.count,
      btn('Previous match (Shift+Enter)', ['m18 15-6-6-6 6'], () => this.step(-1)),
      btn('Next match (Enter)', ['m6 9 6 6 6-6'], () => this.step(1)),
      btn('Close search (Esc)', ICONS.x, () => this.close()),
    )
    const run = debounce(() => this.search(), 120)
    this.input.addEventListener('input', run)
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        run.cancel()
        if (this.input.value !== this.lastQuery) this.search()
        else this.step(e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
  }

  open(initial?: string): void {
    this.el.hidden = false
    if (initial) this.input.value = initial
    this.input.focus()
    this.input.select()
    if (this.input.value) this.search()
  }

  close(): void {
    this.el.hidden = true
    this.clear()
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Re-run after the document re-renders (live reload, edits). */
  refresh(): void {
    if (this.isOpen && this.input.value) this.search(false)
  }

  private clear(): void {
    this.ranges = []
    this.index = -1
    highlights?.delete('ms-search')
    highlights?.delete('ms-search-current')
    this.count.textContent = ''
    this.lastQuery = ''
  }

  private search(scroll = true): void {
    const q = this.input.value
    const keepIndex = scroll ? -1 : this.index
    this.clear()
    this.lastQuery = q
    if (q.trim() === '') return
    this.ranges = findMatches(this.root(), q)
    if (highlights && HighlightCtor)
      highlights.set('ms-search', new HighlightCtor(...this.ranges))
    if (this.ranges.length === 0) {
      this.count.textContent = 'No matches'
      return
    }
    if (scroll) {
      this.index = -1
      this.step(1)
      return
    }
    // After a re-render keep the user's position without scrolling.
    this.index = Math.min(keepIndex, this.ranges.length - 1)
    const current = this.ranges[this.index]
    if (current && highlights && HighlightCtor)
      highlights.set('ms-search-current', new HighlightCtor(current))
    this.updateCount()
  }

  private step(delta: number): void {
    if (this.ranges.length === 0) return
    this.index = (this.index + delta + this.ranges.length) % this.ranges.length
    const range = this.ranges[this.index]
    if (!range) return
    if (highlights && HighlightCtor)
      highlights.set('ms-search-current', new HighlightCtor(range))
    const el = range.startContainer.parentElement
    el?.closest('details')?.setAttribute('open', '')
    el?.scrollIntoView({ block: 'center' })
    this.updateCount()
  }

  private updateCount(): void {
    const total = this.ranges.length
    this.count.textContent = `${Math.max(this.index + 1, 0)}/${total}${total >= 2000 ? '+' : ''}`
  }
}
