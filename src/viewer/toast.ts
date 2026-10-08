import { h } from '@/shared/dom'

let region: HTMLElement | null = null

/** Polite live-region toast for non-blocking feedback. */
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  if (!region) {
    region = h('div', { class: 'ms-toasts ms-ui', role: 'status', 'aria-live': 'polite' })
    document.body.append(region)
  }
  const item = h('div', { class: `ms-toast ms-toast--${kind}`, text: message })
  region.append(item)
  setTimeout(() => item.classList.add('is-leaving'), 2600)
  setTimeout(() => item.remove(), 3000)
}
