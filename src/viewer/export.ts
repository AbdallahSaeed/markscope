/**
 * Export the current document as standalone HTML or Markdown, or print it
 * (the browser's print dialog provides "Save as PDF").
 */
import { downloadBlob } from '@/shared/dom'
import { escapeHtml } from '@/engine/escape'
import { sanitizeToString } from '@/engine/sanitize'

export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'document'
  return `${base}.${ext}`
}

async function documentCss(): Promise<string> {
  const res = await fetch(chrome.runtime.getURL('css/document.css'))
  return res.ok ? res.text() : ''
}

/** Removes viewer-only chrome from a cloned article. */
export function cleanForExport(article: HTMLElement): HTMLElement {
  const clone = article.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('.ms-ui, .ms-anchor, .ms-diagram__source, .ms-gutter')
    .forEach(n => n.remove())
  clone
    .querySelectorAll('[data-source-line]')
    .forEach(n => n.removeAttribute('data-source-line'))
  return clone
}

export async function exportHtml(
  article: HTMLElement,
  title: string,
  theme: 'light' | 'dark',
): Promise<void> {
  const clone = cleanForExport(article)
  const hasMath = clone.querySelector('.katex') !== null
  const css = await documentCss()
  // Re-sanitize: the exported file will be opened outside our CSP.
  const body = sanitizeToString(clone.innerHTML)
  const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net">
<title>${escapeHtml(title)}</title>
${hasMath ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.min.css">' : ''}
<style>${css}</style>
</head>
<body class="ms-export">
<article class="ms-doc">
${body}
</article>
<footer class="ms-export__footer">Exported with Markscope</footer>
</body>
</html>`
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    safeFileName(title, 'html'),
  )
}

export function exportMarkdown(source: string, title: string): void {
  downloadBlob(
    new Blob([source], { type: 'text/markdown;charset=utf-8' }),
    safeFileName(title, 'md'),
  )
}
