import * as vscode from 'vscode'
import { computeStats } from '@/shared/stats'
import { MAX_STATS_CHARS, statusText } from './status-text'

/** Words, reading time and doctor problems for the document in view; click opens Problems. */
export class PreviewStatus implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'markscope.status',
    vscode.StatusBarAlignment.Right,
    100,
  )

  constructor() {
    this.item.name = 'Markscope'
    this.item.command = 'workbench.actions.view.problems'
  }

  show(doc: vscode.TextDocument | undefined): void {
    if (!doc) return this.item.hide()
    const text = doc.getText()
    const stats = text.length <= MAX_STATS_CHARS ? computeStats(text) : null
    const issues = vscode.languages
      .getDiagnostics(doc.uri)
      .filter(d => d.source === 'Markscope').length
    const { text: label, tooltip } = statusText(stats, issues)
    this.item.text = label
    this.item.tooltip = tooltip
    this.item.show()
  }

  dispose(): void {
    this.item.dispose()
  }
}
