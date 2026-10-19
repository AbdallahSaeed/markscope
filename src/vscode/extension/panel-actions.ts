/**
 * What the preview's toolbar and ⋯ menu do in VS Code. The webview names an
 * action from a fixed list (see `PREVIEW_ACTIONS`); everything it means is
 * decided here, so the webview can't name a command, a path or a setting.
 */
import * as vscode from 'vscode'
import type { PreviewAction, ThemeChoice } from '../protocol'
import { readConfiguredSettings } from './config'

export interface ActionTarget {
  readonly document: vscode.TextDocument | null
  readonly extensionId: string
  refresh(): void
  showSource(): Promise<void>
  requestCopy(): void
  requestExport(): void
  toggleLock(): void
}

/** User-level setting (not workspace): a preference of the person, not of the project. */
async function setUserSetting(
  key: string,
  value: unknown,
  resource?: vscode.Uri,
): Promise<void> {
  await vscode.workspace
    .getConfiguration('markscope', resource)
    .update(key, value, vscode.ConfigurationTarget.Global)
}

export async function runPreviewAction(
  target: ActionTarget,
  name: PreviewAction,
  value?: ThemeChoice,
): Promise<void> {
  const doc = target.document
  switch (name) {
    case 'refresh':
      return target.refresh()
    case 'showSource':
      return target.showSource()
    case 'copyMarkdown':
      if (!doc) return
      await vscode.env.clipboard.writeText(doc.getText())
      vscode.window.setStatusBarMessage('Markscope: copied the Markdown', 3000)
      return
    case 'copyHtml':
      return target.requestCopy()
    case 'exportHtml':
      return target.requestExport()
    case 'toggleLock':
      return target.toggleLock()
    case 'openSettings':
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${target.extensionId}`,
      )
      return
    case 'openCommands':
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>Markscope: ')
      return
    case 'toggleLineNumbers':
      await setUserSetting(
        'code.lineNumbers',
        !readConfiguredSettings(doc?.uri).code.lineNumbers,
        doc?.uri,
      )
      return
    case 'selectTheme':
      await vscode.commands.executeCommand('markscope.selectTheme')
      return
    case 'setTheme':
      if (value) await setUserSetting('theme', value, doc?.uri)
      return
  }
}
