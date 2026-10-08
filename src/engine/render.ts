import type { MarkdownIt } from 'markdown-it'
import { escapeHtml } from './escape'
import { extractFrontMatter } from './frontmatter'
import { DEFAULT_HIGHLIGHT_BUDGET } from './highlight'
import { createMarkdown } from './markdown'
import {
  createEnv,
  type FrontMatter,
  type RenderOptions,
  type RenderResult,
} from './types'

let cached: { key: string; md: MarkdownIt } | null = null

function getMarkdown(options: RenderOptions): MarkdownIt {
  const key = JSON.stringify([options.markdown, options.highlight])
  if (cached?.key !== key) cached = { key, md: createMarkdown(options) }
  return cached.md
}

export function renderFrontMatter(fm: FrontMatter): string {
  const body =
    fm.entries.length > 0
      ? `<table><tbody>${fm.entries
          .map(
            ([k, v]) =>
              `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : `<pre><code>${escapeHtml(fm.raw)}</code></pre>`
  return `<details class="ms-frontmatter" data-source-line="1"><summary>Front matter</summary>${body}</details>\n`
}

/**
 * Markdown → HTML string plus document metadata. The HTML is NOT safe to
 * insert until it has passed through `sanitize()`.
 */
export function renderDocument(source: string, options: RenderOptions): RenderResult {
  const started = performance.now()
  const normalized = source.replace(/\r\n?/g, '\n')
  const { body, frontMatter } = extractFrontMatter(normalized)
  const env = createEnv(
    frontMatter?.lines ?? 0,
    options.highlightBudget ?? DEFAULT_HIGHLIGHT_BUDGET,
  )
  const md = getMarkdown(options)
  let html = md.render(body, env)
  if (frontMatter && options.markdown.frontMatter === 'show') {
    html = renderFrontMatter(frontMatter) + html
  }
  return {
    html,
    headings: env.headings,
    links: env.links,
    images: env.images,
    codeBlocks: env.codeBlocks,
    frontMatter,
    features: env.features,
    highlightTruncated: env.highlightTruncated,
    durationMs: performance.now() - started,
  }
}
