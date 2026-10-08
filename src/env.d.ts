declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-sub' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-sup' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-mark' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-ins' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-abbr' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-emoji' {
  import type { MarkdownIt } from 'markdown-it'
  export const full: (md: MarkdownIt) => void
  export const light: (md: MarkdownIt) => void
}
declare module 'markdown-it-container' {
  import type { MarkdownIt } from 'markdown-it'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin: (md: MarkdownIt, name: string, options?: any) => void
  export default plugin
}

/** Injected by the build script. */
declare const __MARKSCOPE_VERSION__: string
