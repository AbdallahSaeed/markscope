/** The ⋯ menu of the VS Code preview: the browser viewer's menu, with what makes sense here. */
import type { Settings } from '@/shared/settings'
import type { MenuItem } from '@/viewer/menu'
import type { PreviewAction, ThemeChoice } from '../protocol'

/** What the menu needs to know and do; `PreviewApp` provides it. */
export interface MenuHost {
  settings(): Settings
  kind(): 'preview' | 'reader'
  locked(): boolean
  focusModeOn(): boolean
  act(name: PreviewAction, value?: ThemeChoice): void
  toggleFocus(): void
  toggleAI(): void
  showShortcuts(): void
}

export function previewMenuItems(host: MenuHost): (MenuItem | 'separator')[] {
  const act = (name: PreviewAction) => () => host.act(name)
  return [
    { label: 'Refresh', hint: 'R', run: act('refresh') },
    { label: 'Show source in the editor', run: act('showSource') },
    {
      label: 'Lock preview to this file',
      run: act('toggleLock'),
      checked: () => host.locked(),
      hidden: () => host.kind() === 'reader',
    },
    { label: 'Copy Markdown', run: act('copyMarkdown') },
    { label: 'Copy rendered HTML', run: act('copyHtml') },
    'separator',
    { label: 'Export as HTML', run: act('exportHtml') },
    'separator',
    {
      label: 'Focus mode',
      hint: 'Z',
      run: () => host.toggleFocus(),
      checked: () => host.focusModeOn(),
    },
    {
      label: 'Line numbers in code',
      run: act('toggleLineNumbers'),
      checked: () => host.settings().code.lineNumbers,
    },
    {
      label: 'AI assistant',
      hint: 'A',
      run: () => host.toggleAI(),
      hidden: () => !host.settings().ai.enabled,
    },
    'separator',
    { label: 'Keyboard shortcuts', hint: '?', run: () => host.showShortcuts() },
    { label: 'Command palette', run: act('openCommands') },
    { label: 'Settings', run: act('openSettings') },
  ]
}
