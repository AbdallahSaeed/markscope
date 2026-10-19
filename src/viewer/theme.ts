import type { Settings } from '@/shared/settings'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** A host (VS Code) can say which theme "system" means; null → the OS preference. */
let hostTheme: 'light' | 'dark' | null = null

export function setHostTheme(theme: 'light' | 'dark' | null): void {
  hostTheme = theme
}

export function resolvedTheme(settings: Settings): 'light' | 'dark' {
  if (settings.theme !== 'system') return settings.theme
  return hostTheme ?? (darkQuery().matches ? 'dark' : 'light')
}

/** VS Code marks the webview body with vscode-light / vscode-dark / vscode-high-contrast[-light]. */
export function themeFromVsCodeClasses(classes: Iterable<string>): {
  theme: 'light' | 'dark'
  highContrast: boolean
} {
  const set = new Set(classes)
  const highContrast =
    set.has('vscode-high-contrast') || set.has('vscode-high-contrast-light')
  const light = set.has('vscode-light') || set.has('vscode-high-contrast-light')
  return { theme: light ? 'light' : 'dark', highContrast }
}

const WIDTHS = { narrow: '62ch', normal: '76ch', wide: '96ch', full: '100%' } as const

/** Applies theme + typography as attributes/CSS variables (no re-render). */
export function applyAppearance(
  settings: Settings,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = resolvedTheme(settings)
  root.dataset.font = settings.typography.fontFamily
  root.style.setProperty('--doc-font-size', `${settings.typography.fontSize}px`)
  root.style.setProperty('--doc-line-height', String(settings.typography.lineHeight))
  root.style.setProperty('--doc-width', WIDTHS[settings.typography.contentWidth])
}

export function onSystemThemeChange(cb: () => void): () => void {
  const media = darkQuery()
  media.addEventListener('change', cb)
  return () => media.removeEventListener('change', cb)
}
