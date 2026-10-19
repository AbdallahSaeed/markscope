import { describe, expect, test, vi } from 'vitest'
import { defaultSettings } from '@/shared/settings'
import type { MenuItem } from '@/viewer/menu'
import { previewMenuItems, type MenuHost } from '@/vscode/webview/menu'

function host(over: Partial<MenuHost> = {}): MenuHost {
  return {
    settings: () => defaultSettings(),
    kind: () => 'preview',
    locked: () => false,
    focusModeOn: () => false,
    act: vi.fn(),
    toggleFocus: vi.fn(),
    toggleAI: vi.fn(),
    showShortcuts: vi.fn(),
    ...over,
  }
}

const visible = (h: MenuHost) =>
  previewMenuItems(h).filter((i): i is MenuItem => i !== 'separator' && !i.hidden?.())

describe('previewMenuItems', () => {
  test('the AI item needs the assistant on; the lock item is not offered in the Reader', () => {
    const labels = (h: MenuHost) => visible(h).map(i => i.label)
    expect(labels(host())).not.toContain('AI assistant')
    expect(labels(host())).toContain('Lock preview to this file')
    const on = defaultSettings()
    expect(
      labels(host({ settings: () => ({ ...on, ai: { ...on.ai, enabled: true } }) })),
    ).toContain('AI assistant')
    expect(labels(host({ kind: () => 'reader' }))).not.toContain(
      'Lock preview to this file',
    )
  })

  test('checkable items reflect the current state', () => {
    const s = defaultSettings()
    const items = visible(
      host({
        locked: () => true,
        focusModeOn: () => true,
        settings: () => ({ ...s, code: { ...s.code, lineNumbers: true } }),
      }),
    )
    const checked = (label: string) => items.find(i => i.label === label)?.checked?.()
    expect(checked('Lock preview to this file')).toBe(true)
    expect(checked('Focus mode')).toBe(true)
    expect(checked('Line numbers in code')).toBe(true)
  })

  test('items run the host action they are named for', () => {
    const h = host()
    for (const [label, name] of [
      ['Refresh', 'refresh'],
      ['Settings', 'openSettings'],
      ['Command palette', 'openCommands'],
      ['Export as HTML', 'exportHtml'],
    ] as const) {
      visible(h)
        .find(i => i.label === label)!
        .run()
      expect(h.act).toHaveBeenLastCalledWith(name)
    }
    visible(h)
      .find(i => i.label === 'Focus mode')!
      .run()
    expect(h.toggleFocus).toHaveBeenCalled()
  })
})
