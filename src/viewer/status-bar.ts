/** The status bar: document statistics, live/modified state and the editor cursor. */
import { h } from '@/shared/dom'
import type { DocumentStats } from '@/shared/stats'
import type { CursorInfo } from './editor/adapter'
import { MOD_LABEL } from './shortcuts'

export interface StatusInfo {
  stats: DocumentStats
  renderMs: number
  live: boolean
  modified: boolean
}

export function renderStatus(el: HTMLElement, info: StatusInfo): void {
  const parts = [
    `${info.stats.words.toLocaleString()} words`,
    `${info.stats.readingMinutes || '<1'} min read`,
    `${info.stats.lines.toLocaleString()} lines`,
    `${Math.round(info.renderMs)} ms`,
  ]
  const cursor = el.querySelector<HTMLElement>('.ms-status__cursor')
  el.replaceChildren(
    ...parts.map(text => h('span', { text })),
    h('span', {
      class: 'ms-status__live',
      text: info.live ? '● Live' : '',
      hidden: !info.live,
    }),
    h('span', {
      class: 'ms-status__modified',
      text: info.modified ? `Edited · ${MOD_LABEL} S to save` : '',
      hidden: !info.modified,
    }),
    // Kept across re-renders; updated on its own by renderCursor.
    cursor ?? h('span', { class: 'ms-status__cursor', hidden: true }),
  )
}

export function formatCursor(info: CursorInfo): string {
  const pos = `Ln ${info.line}, Col ${info.col}`
  return info.selected ? `${pos} (${info.selected.toLocaleString()} selected)` : pos
}

/** Shows the editor cursor position, or hides it (null) outside the Edit view. */
export function renderCursor(el: HTMLElement, info: CursorInfo | null): void {
  let span = el.querySelector<HTMLElement>('.ms-status__cursor')
  if (!span) {
    span = h('span', { class: 'ms-status__cursor', hidden: true })
    el.append(span)
  }
  span.hidden = !info
  span.textContent = info ? formatCursor(info) : ''
}
