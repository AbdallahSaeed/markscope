/**
 * What choosing a named theme means for the VS Code settings (no `vscode` import, so it is
 * unit-tested). Picking a theme also switches `markscope.theme` to that theme's scheme so
 * the result is visible at once, like the browser extension's gallery.
 */
import { themeById, themesOf, type Scheme, type ThemeInfo } from '../shared/themes'

export type SettingUpdate = readonly [key: string, value: string]

export function themeChoiceUpdates(id: string): SettingUpdate[] | null {
  const info = themeById(id)
  if (!info) return null
  return [
    ['theme', info.scheme],
    [info.scheme === 'light' ? 'themeLight' : 'themeDark', info.id],
  ]
}

export interface ThemePickGroup {
  scheme: Scheme
  label: string
  themes: readonly ThemeInfo[]
}

export function themePickGroups(): ThemePickGroup[] {
  return [
    { scheme: 'light', label: 'Light themes', themes: themesOf('light') },
    { scheme: 'dark', label: 'Dark themes', themes: themesOf('dark') },
  ]
}
