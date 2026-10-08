/**
 * Tiny hyperscript helper for building trusted UI. Never pass untrusted HTML:
 * strings become text nodes, so content is always escaped.
 */
type Child = Node | string | number | null | undefined | false
type Props = {
  class?: string
  text?: string
  dataset?: Record<string, string>
  style?: Partial<Record<string, string>>
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>
  [attr: string]: unknown
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') el.className = String(value)
    else if (key === 'text') el.textContent = String(value)
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key === 'style') Object.assign(el.style, value)
    else if (key === 'on') {
      for (const [type, handler] of Object.entries(
        value as Record<string, EventListener>,
      )) {
        el.addEventListener(type, handler)
      }
    } else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : String(child))
  }
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Builds an inline SVG icon from trusted path data (24×24 viewBox, stroked). */
export function icon(paths: readonly string[], label?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', 'ms-icon')
  if (label) {
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', label)
  } else svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    svg.append(p)
  }
  return svg
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const debounced = (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

/** Triggers a client-side download without the `downloads` permission. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const s = Math.round((now - timestamp) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const hours = Math.round(m / 60)
  if (hours < 24) return `${hours} h ago`
  const d = Math.round(hours / 24)
  if (d < 30) return `${d} d ago`
  return new Date(timestamp).toLocaleDateString()
}
