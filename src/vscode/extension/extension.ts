import * as vscode from 'vscode'
import { PreviewManager } from './preview-manager'
import { createVscodeSecrets } from './secret-area'
import { pickColorTheme } from './theme-pick'

export function activate(context: vscode.ExtensionContext): void {
  const manager = new PreviewManager(
    context.extensionUri,
    createVscodeSecrets(context.secrets),
    context.extension.id,
  )
  context.subscriptions.push(
    ...manager.register(),
    vscode.commands.registerCommand('markscope.selectTheme', () => pickColorTheme()),
  )
}

export function deactivate(): void {
  // Panels and diagnostics are disposed through context.subscriptions.
}
