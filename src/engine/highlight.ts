import hljs from 'highlight.js/lib/common'
import { escapeHtml } from './escape'
import type { RenderEnv } from './types'

export const DEFAULT_HIGHLIGHT_BUDGET = 1_500_000

export function normalizeLang(info: string): string {
  const lang = info.trim().split(/\s+/)[0] ?? ''
  return lang
    .replace(/[^\w+#.-]/g, '')
    .slice(0, 40)
    .toLowerCase()
}

export function languageLabel(lang: string): string {
  const def = lang ? hljs.getLanguage(lang) : undefined
  return def?.name ?? lang
}

/**
 * Highlights code when the language is known and the per-render budget
 * allows; otherwise returns escaped plain text. Never auto-detects (slow and
 * often wrong on short snippets).
 */
export function highlightCode(
  code: string,
  lang: string,
  env: RenderEnv,
  enabled: boolean,
): string {
  if (!enabled || !lang || !hljs.getLanguage(lang)) return escapeHtml(code)
  if (code.length > env.highlightBudget) {
    env.highlightTruncated = true
    return escapeHtml(code)
  }
  env.highlightBudget -= code.length
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}
