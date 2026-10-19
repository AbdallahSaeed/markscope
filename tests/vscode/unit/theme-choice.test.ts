import { describe, expect, test } from 'vitest'
import { DARK_THEME_IDS, LIGHT_THEME_IDS } from '@/shared/themes'
import { configurationProperties, settingsFromConfig } from '@/vscode/config-schema'
import { themeChoiceUpdates, themePickGroups } from '@/vscode/theme-choice'
import { createVscodeManifest } from '../../../scripts/vscode-manifest.mjs'

describe('themeChoiceUpdates', () => {
  test('a light theme sets the mode to light and themeLight', () => {
    expect(themeChoiceUpdates('solarized-light')).toEqual([
      ['theme', 'light'],
      ['themeLight', 'solarized-light'],
    ])
  })

  test('a dark theme sets the mode to dark and themeDark', () => {
    expect(themeChoiceUpdates('nord')).toEqual([
      ['theme', 'dark'],
      ['themeDark', 'nord'],
    ])
  })

  test('an unknown id changes nothing', () => {
    expect(themeChoiceUpdates('nope')).toBeNull()
    expect(themeChoiceUpdates('')).toBeNull()
  })

  test('the pick list has every theme, grouped by scheme', () => {
    const [light, dark] = themePickGroups()
    expect(light?.themes.map(t => t.id)).toEqual(LIGHT_THEME_IDS)
    expect(dark?.themes.map(t => t.id)).toEqual(DARK_THEME_IDS)
  })
})

describe('named themes in the VS Code configuration', () => {
  const props = configurationProperties()

  test('the settings offer exactly the registry ids, with the Cadmium defaults', () => {
    expect(props['markscope.themeLight']).toMatchObject({
      default: 'cadmium-light',
      enum: LIGHT_THEME_IDS,
    })
    expect(props['markscope.themeDark']).toMatchObject({
      default: 'cadmium-dark',
      enum: DARK_THEME_IDS,
    })
    expect(props['markscope.themeDark']?.enumDescriptions).toHaveLength(
      DARK_THEME_IDS.length,
    )
  })

  test('configured ids reach the settings, bad or wrong-scheme ones are ignored', () => {
    const values: Record<string, unknown> = {
      themeLight: 'ayu-light',
      themeDark: 'dracula',
    }
    expect(settingsFromConfig(k => values[k])).toMatchObject({
      themeLight: 'ayu-light',
      themeDark: 'dracula',
    })
    const bad: Record<string, unknown> = { themeLight: 'dracula', themeDark: 'ayu-light' }
    expect(settingsFromConfig(k => bad[k])).toMatchObject({
      themeLight: 'cadmium-light',
      themeDark: 'cadmium-dark',
    })
  })

  test('the manifest contributes the command and does not restrict the settings', () => {
    const manifest = createVscodeManifest({ version: '1.0.0', publisher: 'p' })
    expect(
      manifest.contributes.commands.map((c: { command: string }) => c.command),
    ).toContain('markscope.selectTheme')
  })
})
