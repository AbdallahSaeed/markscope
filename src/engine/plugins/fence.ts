/**
 * Fenced code rendering. Emits plain, attribute-light markup; interactive
 * chrome (copy, language badge, line numbers, explain) is added by the
 * viewer so the sanitized HTML stays free of controls.
 */
import type { MarkdownIt, Token } from 'markdown-it'
import { escapeHtml } from '../escape'
import { highlightCode, normalizeLang } from '../highlight'
import { asRenderEnv } from '../types'

const GRAPHVIZ_LANGS = new Set(['dot', 'graphviz', 'digraph', 'gv'])
const GRAPHVIZ_SOURCE_RE = /^(?:strict\s+)?(?:di)?graph\b[^{]*\{/i

export function diagramKind(
  lang: string,
  code: string,
  opts: { mermaid: boolean; graphviz: boolean },
): 'mermaid' | 'graphviz' | null {
  if (opts.graphviz && GRAPHVIZ_LANGS.has(lang)) return 'graphviz'
  if (lang === 'mermaid') {
    // DOT pasted into a mermaid fence is a common mistake; route it correctly.
    if (opts.graphviz && GRAPHVIZ_SOURCE_RE.test(code.trimStart())) return 'graphviz'
    return opts.mermaid ? 'mermaid' : null
  }
  return null
}

export interface FenceOptions {
  mermaid: boolean
  graphviz: boolean
  highlight: boolean
}

export function fencePlugin(md: MarkdownIt, opts: FenceOptions): void {
  md.renderer.rules.fence = (tokens: Token[], idx: number, _o, rawEnv) => {
    const env = asRenderEnv(rawEnv)
    const token = tokens[idx]
    if (!token) return ''
    const lang = normalizeLang(token.info)
    const code = token.content
    const line = token.map ? token.map[0] + env.lineOffset + 1 : 0
    const lineAttr = token.level === 0 && line ? ` data-source-line="${line}"` : ''

    const kind = diagramKind(lang, code, opts)
    if (kind) {
      env.features[kind] = true
      return `<div class="ms-diagram" data-diagram="${kind}"${lineAttr}><pre class="ms-diagram__source"><code>${escapeHtml(code)}</code></pre></div>\n`
    }

    env.codeBlocks.push({ lang, content: code, line })
    // A fence's trailing newline would render as an empty last line.
    const body = highlightCode(code.replace(/\n$/, ''), lang, env, opts.highlight)
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
    const cls = lang ? `hljs language-${escapeHtml(lang)}` : 'hljs'
    return `<div class="ms-code"${langAttr}${lineAttr}><pre><code class="${cls}">${body}</code></pre></div>\n`
  }
}
