import hljs from 'highlight.js/lib/common'
import { h } from '@/shared/dom'

/** Above this size the source view skips highlighting to stay responsive. */
export const SOURCE_HIGHLIGHT_LIMIT = 300_000

/** Read-only source view with a line-number gutter. */
export function highlightSource(target: HTMLElement, source: string): void {
  const lines = source.split('\n').length
  const gutter = h('span', { class: 'ms-gutter', 'aria-hidden': 'true' })
  gutter.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join('\n')
  const code = h('code', { class: 'hljs language-markdown' })
  if (source.length <= SOURCE_HIGHLIGHT_LIMIT) {
    // hljs output is escaped token markup generated from text, not user HTML.
    code.innerHTML = hljs.highlight(source, {
      language: 'markdown',
      ignoreIllegals: true,
    }).value
  } else {
    code.textContent = source
  }
  target.classList.add('has-gutter')
  target.replaceChildren(gutter, code)
}
