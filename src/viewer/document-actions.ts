/** Export and print actions for the current document. */
import type { ViewerApp } from './app'
import { exportHtml, exportMarkdown } from './export'
import { resolvedTheme } from './theme'

export async function exportDocument(app: ViewerApp, kind: 'html' | 'md'): Promise<void> {
  const doc = app.doc
  if (!doc) return
  if (kind === 'md') return exportMarkdown(doc.source, doc.title)
  await app.docView.diagrams.renderAll(app.layout.article)
  await exportHtml(app.layout.article, doc.title, resolvedTheme(app.settings))
}

export async function printDocument(app: ViewerApp): Promise<void> {
  const article = app.layout.article
  const dark = resolvedTheme(app.settings) === 'dark'
  // Paper is light: print diagrams in the light theme, then restore.
  await app.docView.diagrams.renderAll(article, false)
  app.prepareForPrint()
  window.print()
  if (dark) await app.docView.diagrams.restoreTheme(article)
}
