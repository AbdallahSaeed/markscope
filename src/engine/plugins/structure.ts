/**
 * Core rules that annotate the token stream:
 *  - GitHub-compatible heading ids + heading outline
 *  - data-source-line on top-level blocks (split-view scroll sync, doctor jumps)
 *  - link/image inventory (document doctor, export)
 *  - [[toc]] / [toc] inline table of contents
 */
import type { MarkdownIt, StateCore, Token } from 'markdown-it'
import { createSlugger } from '@/shared/slug'
import { escapeHtml } from '../escape'
import { asRenderEnv, type Heading, type RenderEnv } from '../types'

const TOC_RE = /^\s*\[\[?toc\]\]?\s*$/i

function inlineText(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? ''
  return token.children
    .filter(c => c.type === 'text' || c.type === 'code_inline' || c.type === 'emoji')
    .map(c => c.content)
    .join('')
}

function lineOf(token: Token | undefined, env: RenderEnv): number {
  return token?.map ? token.map[0] + env.lineOffset + 1 : 0
}

function headingIds(state: StateCore): void {
  const env = asRenderEnv(state.env)
  const slug = createSlugger()
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t?.type !== 'heading_open') continue
    const text = inlineText(tokens[i + 1]).trim()
    const id = slug(text)
    t.attrSet('id', id)
    env.headings.push({ level: Number(t.tag.slice(1)), text, id, line: lineOf(t, env) })
  }
}

function sourceLines(state: StateCore): void {
  const env = asRenderEnv(state.env)
  for (const t of state.tokens) {
    if (t.level === 0 && t.map && t.nesting !== -1 && t.type !== 'inline') {
      t.attrSet('data-source-line', String(t.map[0] + env.lineOffset + 1))
    }
  }
}

function inventory(state: StateCore): void {
  const env = asRenderEnv(state.env)
  let blockLine = 0
  for (const t of state.tokens) {
    if (t.map) blockLine = t.map[0] + env.lineOffset + 1
    if (t.type !== 'inline' || !t.children) continue
    const children = t.children
    for (let i = 0; i < children.length; i++) {
      const c = children[i]
      if (!c) continue
      if (c.type === 'image') {
        env.images.push({
          src: String(c.attrGet('src') ?? ''),
          alt: inlineText(c),
          line: blockLine,
        })
      } else if (c.type === 'link_open') {
        let text = ''
        for (
          let j = i + 1;
          j < children.length && children[j]?.type !== 'link_close';
          j++
        ) {
          const n = children[j]
          if (n?.type === 'text' || n?.type === 'code_inline') text += n.content
          if (n?.type === 'image') text += inlineText(n) || '[image]'
        }
        env.links.push({
          href: String(c.attrGet('href') ?? ''),
          text: text.trim(),
          line: blockLine,
        })
      }
    }
  }
}

function tocMarkers(state: StateCore): void {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length - 2; i++) {
    const open = tokens[i]
    const inline = tokens[i + 1]
    const close = tokens[i + 2]
    if (
      open?.type === 'paragraph_open' &&
      inline?.type === 'inline' &&
      close?.type === 'paragraph_close' &&
      TOC_RE.test(inline.content)
    ) {
      const toc = new state.Token('ms_toc', 'nav', 0)
      toc.block = true
      toc.map = open.map
      tokens.splice(i, 3, toc)
    }
  }
}

export function renderTocHtml(headings: Heading[]): string {
  const items = headings.filter(h => h.level <= 4)
  if (items.length === 0) return ''
  const min = Math.min(...items.map(h => h.level))
  const lis = items
    .map(
      h =>
        `<li class="ms-toc-l${h.level - min + 1}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`,
    )
    .join('')
  return `<nav class="ms-toc-inline" aria-label="Table of contents"><p class="ms-toc-inline__title">Contents</p><ul>${lis}</ul></nav>\n`
}

export function structurePlugin(md: MarkdownIt): void {
  md.core.ruler.push('ms_heading_ids', headingIds)
  md.core.ruler.push('ms_inventory', inventory)
  md.core.ruler.push('ms_toc_markers', tocMarkers)
  md.core.ruler.push('ms_source_lines', sourceLines)
  md.renderer.rules.ms_toc = (_tokens, _idx, _opts, env) =>
    renderTocHtml(asRenderEnv(env).headings)
}
