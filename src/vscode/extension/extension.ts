import * as vscode from 'vscode'
import { PreviewManager } from './preview-manager'

export function activate(context: vscode.ExtensionContext): void {
  const manager = new PreviewManager(context.extensionUri)
  context.subscriptions.push(...manager.register())
}

export function deactivate(): void {
  // Panels and diagnostics are disposed through context.subscriptions.
}
