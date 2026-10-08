import { renderDocument } from '@/engine/render'
import { sanitizeToString } from '@/engine/sanitize'
import { defaultSettings, type MarkdownSettings } from '@/shared/settings'

export function render(
  source: string,
  markdown: Partial<MarkdownSettings> = {},
  highlight = true,
) {
  return renderDocument(source, {
    markdown: { ...defaultSettings().markdown, ...markdown },
    highlight,
  })
}

/** Render + sanitize, returning a detached container for DOM assertions. */
export function renderSafe(
  source: string,
  markdown: Partial<MarkdownSettings> = {},
): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = sanitizeToString(render(source, markdown).html)
  return div
}
