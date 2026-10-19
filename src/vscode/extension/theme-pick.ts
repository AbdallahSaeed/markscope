/** The "Markscope: Color Theme…" QuickPick: 35 named themes, grouped by scheme. */
import * as vscode from 'vscode'
import { themeChoiceUpdates, themePickGroups } from '../theme-choice'
import { readConfiguredSettings } from './config'

type ThemeItem = vscode.QuickPickItem & { themeId?: string }

export async function pickColorTheme(resource?: vscode.Uri): Promise<void> {
  const current = readConfiguredSettings(resource)
  const items: ThemeItem[] = []
  for (const group of themePickGroups()) {
    items.push({ label: group.label, kind: vscode.QuickPickItemKind.Separator })
    for (const t of group.themes) {
      const active =
        t.id === (t.scheme === 'light' ? current.themeLight : current.themeDark)
      items.push({
        label: t.name,
        description: active ? 'current' : undefined,
        detail: t.description,
        themeId: t.id,
      })
    }
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Markscope: Color Theme',
    placeHolder: 'Pick a theme for the preview',
    matchOnDetail: true,
  })
  const updates = picked?.themeId ? themeChoiceUpdates(picked.themeId) : null
  if (!updates) return
  const cfg = vscode.workspace.getConfiguration('markscope', resource)
  for (const [key, value] of updates)
    await cfg.update(key, value, vscode.ConfigurationTarget.Global)
}
