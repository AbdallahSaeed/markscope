/**
 * The draggable divider between the editor and the preview. Pointer drag,
 * arrow keys (2% steps) and double-click (reset) change the ratio; the
 * ratio is applied as `--ms-split` on the panes and saved by the caller.
 */
import { h } from '@/shared/dom'
import { clamp, LIMITS } from '@/shared/settings'

const KEY_STEP = 0.02
const DEFAULT_RATIO = 0.5

export interface SplitDivider {
  el: HTMLElement
  /** Applies a ratio (editor width / panes width) without saving it. */
  set(ratio: number): void
}

export function createSplitDivider(
  panes: HTMLElement,
  onCommit: (ratio: number) => void,
): SplitDivider {
  const { min, max } = LIMITS.splitRatio
  let ratio = DEFAULT_RATIO
  const el = h('div', {
    class: 'ms-split-divider ms-ui',
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize editor and preview',
    'aria-valuemin': String(min * 100),
    'aria-valuemax': String(max * 100),
    title: 'Drag to resize · double-click to reset',
  })

  const set = (next: number) => {
    ratio = clamp(next, min, max)
    panes.style.setProperty('--ms-split', `${(ratio * 100).toFixed(2)}%`)
    el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
  }
  const commit = (next: number) => {
    set(next)
    onCommit(ratio)
  }
  const fromPointer = (e: PointerEvent) => {
    const rect = panes.getBoundingClientRect()
    return rect.width > 0 ? (e.clientX - rect.left) / rect.width : ratio
  }

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    document.body.classList.add('ms-resizing')
  })
  el.addEventListener('pointermove', e => {
    if (el.hasPointerCapture(e.pointerId)) set(fromPointer(e))
  })
  const end = (e: PointerEvent) => {
    if (!el.hasPointerCapture(e.pointerId)) return
    el.releasePointerCapture(e.pointerId)
    document.body.classList.remove('ms-resizing')
    commit(fromPointer(e))
  }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  el.addEventListener('dblclick', () => commit(DEFAULT_RATIO))
  el.addEventListener('keydown', e => {
    const delta =
      e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0
    if (e.key === 'Home') commit(min)
    else if (e.key === 'End') commit(max)
    else if (delta) commit(ratio + delta)
    else return
    e.preventDefault()
    e.stopPropagation()
  })

  set(ratio)
  return { el, set }
}
