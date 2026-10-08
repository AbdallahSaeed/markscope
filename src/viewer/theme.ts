import type { Settings } from '@/shared/settings'

const media = window.matchMedia('(prefers-color-scheme: dark)')

export function resolvedTheme(settings: Settings): 'light' | 'dark' {
  return settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
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
  media.addEventListener('change', cb)
  return () => media.removeEventListener('change', cb)
}
