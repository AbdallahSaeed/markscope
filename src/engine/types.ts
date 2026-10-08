import type { MarkdownSettings } from '@/shared/settings'

export interface Heading {
  level: number
  text: string
  id: string
  line: number
}

export interface LinkRef {
  href: string
  text: string
  line: number
}

export interface ImageRef {
  src: string
  alt: string
  line: number
}

export interface CodeBlockRef {
  lang: string
  content: string
  line: number
}

export interface FrontMatter {
  raw: string
  entries: [string, string][]
  lines: number
}

export interface RenderOptions {
  markdown: MarkdownSettings
  highlight: boolean
  /** Max characters of code to syntax-highlight; the rest renders plain. */
  highlightBudget?: number
}

export interface RenderResult {
  html: string
  headings: Heading[]
  links: LinkRef[]
  images: ImageRef[]
  codeBlocks: CodeBlockRef[]
  frontMatter: FrontMatter | null
  features: { math: boolean; mermaid: boolean; graphviz: boolean }
  highlightTruncated: boolean
  durationMs: number
}

/** Mutable per-render state shared by the markdown-it plugins. */
export interface RenderEnv {
  [key: string | symbol]: unknown
  lineOffset: number
  headings: Heading[]
  links: LinkRef[]
  images: ImageRef[]
  codeBlocks: CodeBlockRef[]
  highlightBudget: number
  highlightTruncated: boolean
  features: { math: boolean; mermaid: boolean; graphviz: boolean }
}

export function createEnv(lineOffset: number, highlightBudget: number): RenderEnv {
  return {
    lineOffset,
    headings: [],
    links: [],
    images: [],
    codeBlocks: [],
    highlightBudget,
    highlightTruncated: false,
    features: { math: false, mermaid: false, graphviz: false },
  }
}

/** markdown-it types `env` loosely; every rule in Markscope receives a RenderEnv. */
export const asRenderEnv = (env: unknown): RenderEnv => env as RenderEnv
