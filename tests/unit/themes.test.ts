import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { defaultSettings, mergeSettings, parseSettings } from '@/shared/settings'
import { contrast, ensureContrast, fromOklch, mix, toOklch } from '@/shared/theme-color'
import { PALETTES } from '@/shared/theme-palettes'
import {
  allPalettesCss,
  CONTRAST_RULES,
  deriveTokens,
  exportPaletteCss,
  PALETTE_IDS,
} from '@/shared/theme-tokens'
import {
  DARK_THEME_IDS,
  LIGHT_THEME_IDS,
  THEME_REGISTRY,
  themeById,
} from '@/shared/themes'
import { applyAppearance, resolvedPalette, setHostTheme } from '@/viewer/theme'

const themesCssPath = resolve(process.cwd(), 'src/styles/themes.css')

describe('registry', () => {
  test('has 10 light and 25 dark themes with unique ids', () => {
    expect(LIGHT_THEME_IDS).toHaveLength(10)
    expect(DARK_THEME_IDS).toHaveLength(25)
    const ids = THEME_REGISTRY.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every theme has palette data except the Cadmium base, and vice versa', () => {
    const missing = THEME_REGISTRY.filter(
      t => !t.id.startsWith('cadmium-') && !(t.id in PALETTES),
    ).map(t => t.id)
    expect(missing).toEqual([])
    expect(Object.keys(PALETTES).filter(id => !themeById(id))).toEqual([])
    expect(PALETTE_IDS).toHaveLength(33)
  })
})

describe('settings', () => {
  test('default to the Cadmium palettes', () => {
    const s = defaultSettings()
    expect(s.themeLight).toBe('cadmium-light')
    expect(s.themeDark).toBe('cadmium-dark')
  })

  test('accept a valid id and fall back on unknown or wrong-scheme ids', () => {
    expect(parseSettings({ themeLight: 'nord', themeDark: 'nord' })).toMatchObject({
      themeLight: 'cadmium-light', // a dark id is not a light theme
      themeDark: 'nord',
    })
    expect(parseSettings({ themeLight: 'solarized-light' }).themeLight).toBe(
      'solarized-light',
    )
    expect(parseSettings({ themeLight: 'nope', themeDark: 5 })).toMatchObject({
      themeLight: 'cadmium-light',
      themeDark: 'cadmium-dark',
    })
  })

  test('merging a patch keeps the other palette', () => {
    const base = parseSettings({ themeDark: 'dracula' })
    expect(mergeSettings(base, { themeLight: 'ayu-light' })).toMatchObject({
      themeLight: 'ayu-light',
      themeDark: 'dracula',
    })
  })
})

describe('color math', () => {
  test('WCAG contrast of black on white is 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  test('OKLCH round trip and mixing are stable', () => {
    for (const hex of ['#1e66f5', '#bd93f9', '#fdf6e3', '#002b36']) {
      expect(fromOklch(toOklch(hex))).toBe(hex)
    }
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  test('ensureContrast keeps the hue, only moves lightness, and leaves good colors alone', () => {
    expect(ensureContrast('#0b3d91', '#eff1f5', 4.5)).toEqual({
      color: '#0b3d91',
      changed: false,
    })
    const light = ensureContrast('#93a1a1', '#fdf6e3', 4.5)
    expect(light.changed).toBe(true)
    expect(contrast(light.color, '#fdf6e3')).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(toOklch(light.color).h - toOklch('#93a1a1').h)).toBeLessThan(6)

    const dark = ensureContrast('#545454', '#212121', 3)
    expect(dark.changed).toBe(true)
    expect(contrast(dark.color, '#212121')).toBeGreaterThanOrEqual(3)
    expect(toOklch(dark.color).l).toBeGreaterThan(toOklch('#545454').l)
  })
})

describe('every palette is readable', () => {
  for (const id of PALETTE_IDS) {
    test(id, () => {
      const info = themeById(id)!
      const { tokens } = deriveTokens(PALETTES[id]!, info.scheme)
      const failures = CONTRAST_RULES.filter(
        ([fg, bg, min]) => contrast(tokens[fg]!, tokens[bg]!) < min,
      ).map(([fg, bg, min]) => `${fg} on ${bg} < ${min}`)
      expect(failures).toEqual([])
    })
  }

  test('a light theme has a light page and a dark theme a dark one', () => {
    for (const id of PALETTE_IDS) {
      const info = themeById(id)!
      const { tokens } = deriveTokens(PALETTES[id]!, info.scheme)
      const paperToInk = contrast(tokens['--paper']!, tokens['--ink']!)
      expect(paperToInk).toBeGreaterThan(4.5)
      const pageIsLight =
        contrast(tokens['--paper']!, '#ffffff') < contrast(tokens['--paper']!, '#000000')
      expect(pageIsLight, id).toBe(info.scheme === 'light')
    }
  })

  test('faithful colors are kept: body text and accents move little and never change hue', () => {
    for (const id of PALETTE_IDS) {
      const p = PALETTES[id]!
      const { tokens } = deriveTokens(p, themeById(id)!.scheme)
      // Solarized's own body text is below AA; that is the biggest nudge we accept.
      expect(Math.abs(toOklch(tokens['--ink']!).l - toOklch(p.fg).l), id).toBeLessThan(
        0.1,
      )
      // The accent keeps its hue even if it was nudged for links.
      const dh = Math.abs(toOklch(tokens['--accent']!).h - toOklch(p.accent).h)
      expect(Math.min(dh, 360 - dh), id).toBeLessThan(8)
    }
  })
})

describe('generated CSS', () => {
  const css = allPalettesCss()

  test('has one rule per palette and only declares custom properties and color-scheme', () => {
    for (const id of PALETTE_IDS) expect(css).toContain(`[data-palette='${id}']`)
    const declarations = [...css.matchAll(/^\s{4}([\w-]+):/gm)].map(m => m[1])
    const foreign = declarations.filter(d => d !== 'color-scheme' && !d!.startsWith('--'))
    expect(foreign).toEqual([])
    expect(css).not.toMatch(/url\(|position|z-index|@import|expression/i)
  })

  test('is screen-only so print stays on the light base', () => {
    expect(css.startsWith('@media screen {')).toBe(true)
    expect(css.match(/@media/g)).toHaveLength(1)
  })

  test('the committed themes.css is up to date (run `npm run themes`)', () => {
    expect(readFileSync(themesCssPath, 'utf8')).toContain(css)
  })

  test('export carries only the active palette, and nothing for the Cadmium base', () => {
    const one = exportPaletteCss('nord')
    expect(one).toContain("[data-palette='nord']")
    expect(one).not.toContain("[data-palette='dracula']")
    expect(one.startsWith('@media screen')).toBe(true)
    expect(exportPaletteCss('cadmium-dark')).toBe('')
    expect(exportPaletteCss('nope')).toBe('')
  })
})

describe('resolvedPalette', () => {
  const settings = parseSettings({
    theme: 'system',
    themeLight: 'ayu-light',
    themeDark: 'dracula',
  })

  test('an explicit scheme picks its palette', () => {
    expect(resolvedPalette({ ...settings, theme: 'light' })).toBe('ayu-light')
    expect(resolvedPalette({ ...settings, theme: 'dark' })).toBe('dracula')
  })

  test('system follows the host (VS Code) scheme', () => {
    setHostTheme('dark')
    expect(resolvedPalette(settings)).toBe('dracula')
    setHostTheme('light')
    expect(resolvedPalette(settings)).toBe('ayu-light')
    setHostTheme(null)
  })

  test('applyAppearance writes data-theme and data-palette together', () => {
    const root = document.createElement('div')
    applyAppearance({ ...settings, theme: 'dark' }, root)
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.palette).toBe('dracula')
  })
})
