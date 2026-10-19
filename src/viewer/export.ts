/**
 * Export the current document as standalone HTML or Markdown, or print it
 * (the browser's print dialog provides "Save as PDF").
 *
 * The HTML export is fully self-contained: no scripts, no external requests
 * (math renders as native MathML instead of loading KaTeX from a CDN), and
 * links to other Markdown documents point at the original files rather than
 * at the extension's viewer.
 */
import { downloadBlob } from '@/shared/dom'
import { renderExportHtml, safeFileName } from './export-html'

export * from './export-html'

async function documentCss(): Promise<string> {
  const res = await fetch(chrome.runtime.getURL('css/document.css'))
  return res.ok ? res.text() : ''
}

export async function exportHtml(
  article: HTMLElement,
  title: string,
  theme: 'light' | 'dark',
): Promise<void> {
  const html = renderExportHtml(article, title, theme, await documentCss())
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
