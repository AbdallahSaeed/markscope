import { describe, expect, test } from 'vitest'
import { AI_PRESETS, defaultSettings } from '@/shared/settings'
import {
  PREVIEW_DEFAULTS,
  SETTING_ENTRIES,
  configurationProperties,
  previewOptionsFromConfig,
  settingsFromConfig,
} from '@/vscode/config-schema'
import {
  createVscodeManifest,
  markdownFileGlob,
} from '../../../scripts/vscode-manifest.mjs'

const none = () => undefined

describe('settingsFromConfig', () => {
  test('no configuration gives the defaults, with the VS Code theme for "system"', () => {
    expect(settingsFromConfig(none)).toEqual(defaultSettings())
  })

  test('maps values and the "vscode" theme to "system"', () => {
    const values: Record<string, unknown> = {
      theme: 'dark',
      'typography.fontSize': 20,
      'markdown.mermaid': false,
      'images.remote': 'block',
    }
    const s = settingsFromConfig(k => values[k])
    expect(s.theme).toBe('dark')
    expect(s.typography.fontSize).toBe(20)
    expect(s.markdown.mermaid).toBe(false)
    expect(s.privacy.remoteImages).toBe('block')
    expect(settingsFromConfig(k => (k === 'theme' ? 'vscode' : undefined)).theme).toBe(
      'system',
    )
  })

  test('invalid values fall back to defaults instead of leaking through', () => {
    const values: Record<string, unknown> = {
      theme: 'neon',
      'typography.fontSize': 9999,
      'typography.fontFamily': {},
      'markdown.math': 'yes',
      'images.remote': 'sometimes',
    }
    const s = settingsFromConfig(k => values[k])
    const d = defaultSettings()
    expect(s.theme).toBe(d.theme)
    expect(s.typography.fontSize).toBeLessThanOrEqual(24)
    expect(s.typography.fontFamily).toBe(d.typography.fontFamily)
    expect(s.markdown.math).toBe(d.markdown.math)
    expect(s.privacy.remoteImages).toBe(d.privacy.remoteImages)
  })

  test('AI is off by default and an empty URL or model means the provider default', () => {
    const d = defaultSettings()
    expect(d.ai.enabled).toBe(false)
    const s = settingsFromConfig(
      k => ({ 'ai.provider': 'openai', 'ai.baseUrl': '', 'ai.model': '' })[k as never],
    )
    expect(s.ai.provider).toBe('openai')
    expect(s.ai.baseUrl).toBe(AI_PRESETS.openai.baseUrl)
    expect(s.ai.model).toBe(AI_PRESETS.openai.model)
  })

  test('an unsafe AI endpoint falls back to the provider default instead of being used', () => {
    const s = settingsFromConfig(
      k =>
        ({
          'ai.enabled': true,
          'ai.provider': 'anthropic',
          'ai.baseUrl': 'http://evil.example/v1',
        })[k as never],
    )
    expect(s.ai.baseUrl).toBe(AI_PRESETS.anthropic.baseUrl)
  })

  test('AI settings are application-scoped, so a workspace cannot set them; the key is not a setting', () => {
    const props = configurationProperties()
    const aiKeys = Object.keys(props).filter(k => k.startsWith('markscope.ai.'))
    expect(aiKeys.sort()).toEqual([
      'markscope.ai.baseUrl',
      'markscope.ai.confirmBeforeSend',
      'markscope.ai.enabled',
      'markscope.ai.model',
      'markscope.ai.provider',
    ])
    for (const k of aiKeys) expect(props[k]!.scope, k).toBe('application')
    expect(aiKeys.some(k => /key|token|secret/i.test(k.replace('baseUrl', '')))).toBe(
      false,
    )
    for (const [k, p] of Object.entries(props))
      if (!k.startsWith('markscope.ai.') && !k.startsWith('markscope.preview.'))
        expect(p.scope, k).toBe('resource')
  })
})

describe('previewOptionsFromConfig', () => {
  test('defaults and validation', () => {
    expect(previewOptionsFromConfig(none)).toEqual(PREVIEW_DEFAULTS)
    const o = previewOptionsFromConfig(
      k =>
        ({
          'preview.updateOn': 'save',
          'preview.openMarkdownLinks': 'bogus',
          'doctor.enabled': 1,
        })[k as never],
    )
    expect(o.updateOn).toBe('save')
    expect(o.openMarkdownLinks).toBe(PREVIEW_DEFAULTS.openMarkdownLinks)
    expect(o.doctor).toBe(PREVIEW_DEFAULTS.doctor)
  })
})

describe('generated manifest', () => {
  const manifest = createVscodeManifest({ version: '1.2.3', publisher: 'pub' })
  const props = manifest.contributes.configuration.properties as Record<
    string,
    Record<string, unknown>
  >

  test('every setting entry has a property whose default matches defaultSettings()', () => {
    for (const e of SETTING_ENTRIES) {
      const p = props[`markscope.${e.key}`]
      expect(p, e.key).toBeDefined()
      const resolved = settingsFromConfig(k => (k === e.key ? p!.default : undefined))
      expect(resolved, e.key).toEqual(defaultSettings())
    }
  })

  test('enums and ranges come from the shared constants', () => {
    expect(props['markscope.typography.contentWidth']!.enum).toEqual([
      'narrow',
      'normal',
      'wide',
      'full',
    ])
    expect(props['markscope.typography.fontSize']).toMatchObject({
      minimum: 12,
      maximum: 24,
    })
  })

  test('commands, menus and keybindings refer to declared commands only', () => {
    const ids = new Set(
      manifest.contributes.commands.map((c: { command: string }) => c.command),
    )
    const used = [
      ...manifest.contributes.menus['editor/title'],
      ...manifest.contributes.menus.commandPalette,
      ...manifest.contributes.keybindings,
    ].map((m: { command: string }) => m.command)
    for (const id of used) expect(ids.has(id), id).toBe(true)
  })

  test('the reader is an opt-in custom editor for every Markdown extension', () => {
    const reader = manifest.contributes.customEditors[0]!
    expect(reader).toMatchObject({ viewType: 'markscope.reader', priority: 'option' })
    expect(
      reader.selector.map((s: { filenamePattern: string }) => s.filenamePattern),
    ).toEqual(['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx'].map(e => `*.${e}`))
    expect(manifest.activationEvents).toContain('onCustomEditor:markscope.reader')
  })

  test('identity, engine and untrusted-workspace support', () => {
    expect(manifest).toMatchObject({
      name: 'markscope-reader',
      version: '1.2.3',
      publisher: 'pub',
      engines: { vscode: '^1.90.0' },
      main: './extension.js',
      capabilities: {
        untrustedWorkspaces: { supported: 'limited' },
        virtualWorkspaces: true,
      },
    })
    expect(markdownFileGlob()).toBe('*.{md,markdown,mdown,mkd,mkdn,mdx}')
  })
})
