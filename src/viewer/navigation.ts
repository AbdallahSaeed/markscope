/** Scrolling helpers for the rendered document (anchors and source lines). */

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function scrollToId(article: HTMLElement, id: string): boolean {
  const el = id ? article.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) : null
  if (!el) return false
  el.closest('details')?.setAttribute('open', '')
  el.scrollIntoView({
    block: 'start',
    behavior: prefersReducedMotion() ? 'instant' : 'smooth',
  })
  history.replaceState(history.state, '', `#${encodeURIComponent(id)}`)
  return true
}

export function idFromHash(hash: string): string {
  const raw = hash.replace(/^#/, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Scrolls to the block that contains a source line (nearest preceding block). */
export function scrollToLine(
  article: HTMLElement,
  line: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  const blocks = article.querySelectorAll<HTMLElement>('[data-source-line]')
  let target: HTMLElement | null = null
  for (const el of blocks) {
    if (Number(el.dataset.sourceLine) <= line) target = el
    else break
  }
  target ??= blocks[0] ?? null
  target?.scrollIntoView({ block: 'start', behavior })
  if (behavior !== 'instant' && target) {
    target.classList.add('ms-flash')
    setTimeout(() => target?.classList.remove('ms-flash'), 1200)
  }
}

/** Source line of the first block visible under the toolbar. */
export function topVisibleLine(article: HTMLElement): number {
  for (const el of article.querySelectorAll<HTMLElement>('[data-source-line]')) {
    if (el.getBoundingClientRect().bottom > 64) return Number(el.dataset.sourceLine)
  }
  return 0
}
