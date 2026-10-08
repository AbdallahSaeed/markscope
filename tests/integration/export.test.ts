import {
  buildExportDocument,
  cleanForExport,
  safeFileName,
  serializeForExport,
} from '@/viewer/export'

function article(html: string): HTMLElement {
  const el = document.createElement('article')
  el.innerHTML = html
  return el
}

describe('HTML export', () => {
  test('strips viewer chrome and source-line markers', () => {
    const clone = cleanForExport(
      article(
        '<div class="ms-code" data-source-line="3"><div class="ms-code__bar ms-ui">TS · Copy</div><pre><span class="ms-gutter">1</span><code>x</code></pre></div><h2 id="a"><a class="ms-anchor" href="#a">§</a>A</h2>',
      ),
    )
    expect(
      clone.querySelector('.ms-ui, .ms-gutter, .ms-anchor, [data-source-line]'),
    ).toBeNull()
    expect(clone.textContent).toBe('xA')
  })

  test('document links point at the original file, keeping the anchor', () => {
    const clone = cleanForExport(
      article(
        '<a href="chrome-extension://id/viewer.html?src=https%3A%2F%2Fx.com%2Fb.md#usage" data-ms-doc="https://x.com/b.md" title="Open b.md in Markscope">b</a>',
      ),
    )
    const a = clone.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://x.com/b.md#usage')
    expect(a?.hasAttribute('data-ms-doc')).toBe(false)
    expect(a?.hasAttribute('title')).toBe(false)
  })

  test('rendered diagrams keep their scoped stylesheet; content <style> is still removed', () => {
    const html = serializeForExport(
      article(
        '<style>body{display:none}</style><div class="ms-diagram"><div class="ms-diagram__figure"><svg id="m1"><style>#m1 .node rect{fill:#eee}</style><g class="node"><rect></rect></g></svg></div></div><p>MSFIG00000000_0</p>',
      ),
    )
    expect(html).toContain('#m1 .node rect{fill:#eee}')
    expect(html).not.toContain('display:none')
    // A forged placeholder in the document text is not substituted.
    expect(html).toContain('MSFIG00000000_0')
  })

  test('still sanitizes everything outside diagrams', () => {
    const html = serializeForExport(
      article('<p>ok</p><img src="x" onerror="alert(1)"><script>alert(1)</script>'),
    )
    expect(html).not.toMatch(/onerror|<script/i)
  })

  test('the standalone document is offline-only and theme-aware', () => {
    const doc = buildExportDocument({
      title: 'A <b> title',
      theme: 'dark',
      css: '.ms-doc{}',
      body: '<p>hi</p>',
    })
    expect(doc).toContain('<html lang="en" data-theme="dark">')
    expect(doc).toContain('<title>A &lt;b&gt; title</title>')
    expect(doc).toContain("default-src 'none'")
    expect(doc).not.toMatch(/https?:\/\/(?!x\.invalid)/) // no external resources at all
    expect(doc).toContain('.katex-html { display: none; }') // MathML instead of CDN CSS
  })

  test('file names are filesystem-safe', () => {
    expect(safeFileName('a/b: c?', 'html')).toBe('a b c.html')
    expect(safeFileName('   ', 'md')).toBe('document.md')
  })
})
