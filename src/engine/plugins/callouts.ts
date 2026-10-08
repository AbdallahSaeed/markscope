/**
 * `::: tip Optional title` style containers (VuePress/Docusaurus dialect)
 * plus `::: details Summary`. GitHub `> [!NOTE]` alerts come from
 * @mdit/plugin-alert and share the same styling.
 */
import container from 'markdown-it-container'
import type { MarkdownIt, Token } from 'markdown-it'
import { escapeHtml } from '../escape'

export const CALLOUT_KINDS: Record<string, string> = {
  note: 'note',
  info: 'note',
  tip: 'tip',
  tips: 'tip',
  success: 'tip',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
  danger: 'caution',
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function calloutsPlugin(md: MarkdownIt): void {
  for (const [name, kind] of Object.entries(CALLOUT_KINDS)) {
    md.use(container, name, {
      render(tokens: Token[], idx: number) {
        const t = tokens[idx]
        if (!t || t.nesting !== 1) return '</div>\n'
        const custom = t.info.trim().slice(name.length).trim()
        const title = escapeHtml(custom || titleCase(name))
        return `<div class="markdown-alert markdown-alert-${kind}"><p class="markdown-alert-title">${title}</p>\n`
      },
    })
  }
  md.use(container, 'details', {
    render(tokens: Token[], idx: number) {
      const t = tokens[idx]
      if (!t || t.nesting !== 1) return '</details>\n'
      const summary = escapeHtml(
        t.info.trim().slice('details'.length).trim() || 'Details',
      )
      return `<details class="ms-details"><summary>${summary}</summary>\n`
    },
  })
}
