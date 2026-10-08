/**
 * Builds a configured markdown-it instance. Pure: safe to run in a Worker
 * (no DOM access), which is how the viewer uses it for large documents.
 */
import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'
import footnote from 'markdown-it-footnote'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import mark from 'markdown-it-mark'
import ins from 'markdown-it-ins'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import { full as emoji } from 'markdown-it-emoji'
import { alert } from '@mdit/plugin-alert'
import { tasklist } from '@mdit/plugin-tasklist'
import { katex } from '@mdit/plugin-katex-slim'
import { asRenderEnv, type RenderOptions } from './types'
import { structurePlugin } from './plugins/structure'
import { fencePlugin } from './plugins/fence'
import { calloutsPlugin } from './plugins/callouts'

export function createMarkdown(options: RenderOptions): MarkdownItInstance {
  const m = options.markdown
  const md = MarkdownIt({
    html: m.html,
    breaks: m.breaks,
    linkify: m.linkify,
    typographer: m.typographer,
    xhtmlOut: false,
  })

  // GitHub-flavoured task lists; checkboxes are read-only.
  md.use(tasklist, { disabled: true, label: false })
  if (m.footnotes) md.use(footnote)
  if (m.emoji) md.use(emoji)
  if (m.extended) {
    md.use(sub).use(sup).use(mark).use(ins).use(abbr).use(deflist)
  }
  if (m.alerts) {
    md.use(alert, {
      deep: true,
      titleRenderer: (tokens, idx) => {
        const name = tokens[idx]?.markup ?? 'note'
        return `<p class="markdown-alert-title">${name.charAt(0).toUpperCase()}${name.slice(1)}</p>\n`
      },
    })
    calloutsPlugin(md)
  }
  if (m.math) {
    md.use(katex, {
      throwOnError: false,
      strict: 'ignore',
      // `trust: false` blocks \href{javascript:…}, \url, \htmlClass etc.
      trust: false,
      maxSize: 50,
      maxExpand: 1000,
      logger: () => 'ignore' as const,
    })
    // Flag math so the viewer only loads KaTeX CSS when needed.
    const original = md.renderer.rules.math_inline
    const originalBlock = md.renderer.rules.math_block
    if (original) {
      md.renderer.rules.math_inline = (t, i, o, env, self) => {
        asRenderEnv(env).features.math = true
        return original(t, i, o, env, self)
      }
    }
    if (originalBlock) {
      md.renderer.rules.math_block = (t, i, o, env, self) => {
        asRenderEnv(env).features.math = true
        return originalBlock(t, i, o, env, self)
      }
    }
  }

  fencePlugin(md, {
    mermaid: m.mermaid,
    graphviz: m.graphviz,
    highlight: options.highlight,
  })
  structurePlugin(md)
  return md
}
