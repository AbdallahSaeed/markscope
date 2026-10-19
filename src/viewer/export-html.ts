/**
 * The pure half of HTML export: turns a rendered article into one
 * self-contained HTML string. No browser-extension APIs, so hosts other than
 * the browser extension (the VS Code webview) can use it.
 */
import { escapeHtml } from '@/engine/escape'
import { sanitizeToString } from '@/engine/sanitize'
import { randomId } from '@/shared/ids'

export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'document'
  return `${base}.${ext}`
}

/**
 * Without KaTeX's stylesheet both of its renderings would show; keep the
 * MathML one, which every current browser renders natively.
 */
export const EXPORT_EXTRA_CSS = `
.ms-doc .katex-html { display: none; }
.ms-doc .katex-mathml { position: static; clip: auto; width: auto; height: auto; overflow: visible; }
.ms-doc .katex-display { display: block; text-align: center; margin: 1em 0; }
.ms-doc .katex-display math { display: block math; }
.ms-doc .ms-code[data-lang]::before { content: attr(data-lang); display: block; padding: 0.5em 1.1em 0; font: 600 0.7em var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
`

/** Removes viewer-only chrome and makes links work outside the extension. */
export function cleanForExport(article: HTMLElement): HTMLElement {
  const clone = article.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('.ms-ui, .ms-anchor, .ms-diagram__source, .ms-gutter')
    .forEach(n => n.remove())
  clone
    .querySelectorAll('[data-source-line]')
    .forEach(n => n.removeAttribute('data-source-line'))
  // Document links were rewritten to the viewer; point them back at the file.
  clone.querySelectorAll<HTMLAnchorElement>('a[data-ms-doc]').forEach(a => {
    const target = a.dataset.msDoc ?? ''
    let hash = ''
    try {
      hash = new URL(a.getAttribute('href') ?? '', 'https://x.invalid/').hash
    } catch {
      // no hash
    }
    a.setAttribute('href', target + hash)
    a.removeAttribute('data-ms-doc')
    a.removeAttribute('title')
  })
  return clone
}

/**
 * Re-sanitizes the export (it will be opened outside our CSP) while keeping
 * rendered diagrams intact. Diagram SVG was already sanitized when it was
 * rendered — including the check that its stylesheet is scoped and loads
 * nothing — but the general sanitizer forbids <style>, which would turn
 * Mermaid diagrams into black boxes. Figures are swapped for unguessable
 * placeholders, the rest is sanitized, then the figures are put back.
 */
export function serializeForExport(clone: HTMLElement): string {
  const token = `MSFIG${randomId(8)}`
  const figures: string[] = []
  clone.querySelectorAll('.ms-diagram__figure').forEach(figure => {
    figures.push(figure.innerHTML)
    figure.textContent = `${token}_${figures.length - 1}`
  })
  const safe = sanitizeToString(clone.innerHTML)
  return safe.replace(
    new RegExp(`${token}_(\\d+)`, 'g'),
    (_, i: string) => figures[Number(i)] ?? '',
  )
}

export function buildExportDocument(opts: {
  title: string
  theme: 'light' | 'dark'
  css: string
  body: string
}): string {
  return `<!doctype html>
<html lang="en" data-theme="${opts.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
<meta name="generator" content="Markscope">
<title>${escapeHtml(opts.title)}</title>
<style>${opts.css}${EXPORT_EXTRA_CSS}</style>
</head>
<body class="ms-export">
<article class="ms-doc">
${opts.body}
</article>
<footer class="ms-export__footer">Exported with Markscope</footer>
</body>
</html>`
}

/** The self-contained HTML for a rendered article; hosts decide where it goes. */
export function renderExportHtml(
  article: HTMLElement,
  title: string,
  theme: 'light' | 'dark',
  css: string,
): string {
  const body = serializeForExport(cleanForExport(article))
  return buildExportDocument({ title, theme, css, body })
}
