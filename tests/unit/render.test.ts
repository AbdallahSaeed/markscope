import { extractFrontMatter } from '@/engine/frontmatter'
import { diagramKind } from '@/engine/plugins/fence'
import { renderTocHtml } from '@/engine/plugins/structure'
import { normalizeLang, languageLabel, highlightCode } from '@/engine/highlight'
import { createEnv } from '@/engine/types'
import { render, renderSafe } from '../helpers/render'

describe('front matter', () => {
  test('YAML key/values with quotes and nested lines', () => {
    const { body, frontMatter } = extractFrontMatter(
      '---\ntitle: "Hello"\ntags:\n  - a\n  - b\n# comment\n---\n# Body',
    )
    expect(body).toBe('# Body')
    expect(frontMatter?.entries).toEqual([
      ['title', 'Hello'],
      ['tags', '- a\n- b'],
    ])
    expect(frontMatter?.lines).toBe(7)
  })
  test('TOML front matter', () => {
    expect(extractFrontMatter("+++\ntitle = 'T'\n+++\nx").frontMatter?.entries).toEqual([
      ['title', 'T'],
    ])
  })
  test('no front matter / unterminated', () => {
    expect(extractFrontMatter('# Hi').frontMatter).toBeNull()
    expect(extractFrontMatter('---\ntitle: x\n# never closed').frontMatter).toBeNull()
  })
  test('rendered as a collapsible table, or hidden', () => {
    const shown = render('---\ntitle: Doc\n---\n# H')
    expect(shown.html).toContain('ms-frontmatter')
    expect(
      render('---\ntitle: Doc\n---\n# H', { frontMatter: 'hide' }).html,
    ).not.toContain('ms-frontmatter')
    expect(shown.headings[0]?.line).toBe(4)
  })
  test('front matter values are escaped', () => {
    expect(render('---\nx: <img src=x onerror=alert(1)>\n---\n').html).toContain(
      '&lt;img',
    )
  })
})

describe('GitHub-flavored Markdown', () => {
  test('tables, strikethrough, autolinks', () => {
    const el = renderSafe(
      '| a | b |\n|---|:-:|\n| 1 | 2 |\n\n~~gone~~ https://example.com',
    )
    expect(el.querySelector('table th')?.textContent).toBe('a')
    expect(el.querySelector('s')?.textContent).toBe('gone')
    expect(el.querySelector('a[href="https://example.com"]')).not.toBeNull()
  })
  test('task lists are disabled checkboxes', () => {
    const el = renderSafe('- [x] done\n- [ ] todo')
    const boxes = el.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0] as HTMLInputElement).checked).toBe(true)
    boxes.forEach(b => expect(b.hasAttribute('disabled')).toBe(true))
  })
  test('footnotes', () => {
    const el = renderSafe('Text[^n]\n\n[^n]: Note')
    expect(el.querySelector('.footnotes li')?.textContent).toContain('Note')
  })
  test('GitHub alerts with title-cased labels', () => {
    const el = renderSafe('> [!WARNING]\n> Careful')
    expect(
      el.querySelector('.markdown-alert-warning .markdown-alert-title')?.textContent,
    ).toBe('Warning')
  })
  test('container callouts with custom titles and details', () => {
    const el = renderSafe('::: tip Pro tip\nBody\n:::\n\n::: details More\nHidden\n:::')
    expect(
      el.querySelector('.markdown-alert-tip .markdown-alert-title')?.textContent,
    ).toBe('Pro tip')
    expect(el.querySelector('details summary')?.textContent).toBe('More')
  })
  test('callout titles are escaped', () => {
    expect(render('::: tip <b>x</b>\nBody\n:::').html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
  test('extended syntax toggles', () => {
    expect(render('==mark== H~2~O x^2^').html).toMatch(
      /<mark>mark<\/mark>.*<sub>2<\/sub>.*<sup>2<\/sup>/,
    )
    expect(render('==mark==', { extended: false }).html).not.toContain('<mark>')
  })
  test('emoji shortcodes', () => {
    expect(render(':rocket:').html).toContain('🚀')
    expect(render(':rocket:', { emoji: false }).html).toContain(':rocket:')
  })
  test('raw HTML can be disabled', () => {
    expect(render('<b>x</b>', { html: false }).html).toContain('&lt;b&gt;')
  })
})

describe('headings and structure', () => {
  test('GitHub-style ids, dedupe, inline code text', () => {
    const r = render('# Hello World\n## Hello World\n### Using `npm`')
    expect(r.headings.map(h => h.id)).toEqual([
      'hello-world',
      'hello-world-1',
      'using-npm',
    ])
    expect(r.headings.map(h => h.level)).toEqual([1, 2, 3])
    expect(r.headings[2]?.text).toBe('Using npm')
  })
  test('source lines on top-level blocks', () => {
    const el = renderSafe('# A\n\npara\n\n- item')
    expect(
      Array.from(el.querySelectorAll('[data-source-line]'), e =>
        e.getAttribute('data-source-line'),
      ),
    ).toEqual(['1', '3', '5'])
  })
  test('[[toc]] marker renders an inline table of contents', () => {
    const el = renderSafe('[[toc]]\n\n# One\n## Two')
    const links = Array.from(el.querySelectorAll('.ms-toc-inline a'), a =>
      a.getAttribute('href'),
    )
    expect(links).toEqual(['#one', '#two'])
  })
  test('toc helper escapes and handles empty input', () => {
    expect(renderTocHtml([])).toBe('')
    expect(renderTocHtml([{ level: 2, text: '<x>', id: 'x"y', line: 1 }])).toContain(
      '&lt;x&gt;',
    )
  })
  test('collects links and images with lines', () => {
    const r = render('See [docs](./a.md) and [](#empty)\n\n![logo](l.png)')
    expect(r.links).toEqual([
      { href: './a.md', text: 'docs', line: 1 },
      { href: '#empty', text: '', line: 1 },
    ])
    expect(r.images).toEqual([{ src: 'l.png', alt: 'logo', line: 3 }])
  })
})

describe('code', () => {
  test('known languages are highlighted and recorded', () => {
    const r = render('```ts\nconst a = 1\n```')
    expect(r.html).toContain('hljs-keyword')
    expect(r.html).toContain('data-lang="ts"')
    expect(r.codeBlocks).toEqual([{ lang: 'ts', content: 'const a = 1\n', line: 1 }])
  })
  test('unknown languages are escaped plain text', () => {
    const r = render('```nosuchlang\n<script>alert(1)</script>\n```')
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).not.toContain('hljs-')
  })
  test('highlighting can be disabled', () => {
    expect(render('```ts\nconst a = 1\n```', {}, false).html).not.toContain(
      'hljs-keyword',
    )
  })
  test('language names are normalised and attribute-safe', () => {
    expect(normalizeLang('TypeScript {1,3}')).toBe('typescript')
    expect(normalizeLang('"><img src=x>')).toBe('img')
    expect(languageLabel('ts')).toBe('TypeScript')
    expect(languageLabel('zzz')).toBe('zzz')
  })
  test('highlight budget falls back to plain text', () => {
    const env = createEnv(0, 5)
    expect(highlightCode('const a = 1', 'ts', env, true)).not.toContain('hljs')
    expect(env.highlightTruncated).toBe(true)
  })
})

describe('diagrams and math', () => {
  test('mermaid and graphviz fences become placeholders', () => {
    const r = render(
      '```mermaid\ngraph TD; A-->B\n```\n\n```dot\ndigraph { a -> b }\n```',
    )
    expect(r.features).toMatchObject({ mermaid: true, graphviz: true })
    expect(r.html).toContain('data-diagram="mermaid"')
    expect(r.html).toContain('data-diagram="graphviz"')
    expect(r.html).toContain('A--&gt;B')
  })
  test('diagramKind routing', () => {
    const on = { mermaid: true, graphviz: true }
    expect(diagramKind('mermaid', 'digraph G { a -> b }', on)).toBe('graphviz')
    expect(diagramKind('mermaid', 'strict graph { a -- b }', on)).toBe('graphviz')
    expect(diagramKind('mermaid', 'graph TD\nA-->B', on)).toBe('mermaid')
    expect(diagramKind('graphviz', 'x', on)).toBe('graphviz')
    expect(diagramKind('dot', 'x', { mermaid: true, graphviz: false })).toBeNull()
    expect(
      diagramKind('mermaid', 'graph TD', { mermaid: false, graphviz: true }),
    ).toBeNull()
    expect(diagramKind('js', 'x', on)).toBeNull()
  })
  test('disabled diagrams render as code', () => {
    expect(render('```mermaid\ngraph TD\n```', { mermaid: false }).html).toContain(
      'ms-code',
    )
  })
  test('KaTeX inline and block, flagged for lazy CSS', () => {
    const r = render('Inline $a^2$ and\n\n$$\n\\sum_i x_i\n$$')
    expect(r.features.math).toBe(true)
    expect(r.html).toContain('katex')
    expect(r.html).toContain('katex-display')
  })
  test('KaTeX blocks dangerous commands (trust: false)', () => {
    const el = renderSafe('$\\href{javascript:alert(1)}{click}$')
    expect(el.innerHTML).not.toMatch(/href="javascript/i)
  })
  test('math can be disabled', () => {
    expect(render('$a^2$', { math: false }).features.math).toBe(false)
  })
})

describe('robustness', () => {
  test('invalid / pathological markdown does not throw', () => {
    const nasty = [
      '[',
      '](',
      '```',
      '> > > > >',
      '*'.repeat(5000),
      '[x]('.repeat(2000),
      '<div>'.repeat(500),
      '\u0000￿',
    ]
    for (const src of nasty) expect(() => render(src)).not.toThrow()
  })
  test('CRLF input renders identically to LF', () => {
    expect(render('# A\r\n\r\ntext\r\n').html).toBe(render('# A\n\ntext\n').html)
  })
  test('large documents render in reasonable time', () => {
    const section =
      '## Section\n\nSome **bold** text with `code` and a [link](#x).\n\n```js\nconst x = 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n'
    const big = section.repeat(4000) // ≈ 400 KB
    const t = performance.now()
    const r = render(big)
    expect(r.headings).toHaveLength(4000)
    expect(performance.now() - t).toBeLessThan(8000)
  })
})
