/** In-webview shortcuts that don't fight VS Code: single keys, never while typing. */
import { installShortcuts, key, type Shortcut } from '@/viewer/shortcuts'

export interface PreviewKeyActions {
  find: () => void
  toggleSidebar: () => void
  focusMode: () => void
  toggleAI: () => void
  exitFocus: () => void
  jumpHeading: (delta: 1 | -1) => void
  refresh: () => void
  cycleTheme: () => void
  showHelp: () => void
  isBlocked: () => boolean
}

/** The one table: it drives the key handler and the "Keyboard shortcuts" dialog. */
export function previewShortcuts(a: PreviewKeyActions): Shortcut[] {
  return [
    { keys: '/', description: 'Find in document', match: key('/'), run: a.find },
    { keys: 'B', description: 'Toggle outline', match: key('b'), run: a.toggleSidebar },
    {
      keys: 'J',
      description: 'Next heading',
      match: key('j'),
      run: () => a.jumpHeading(1),
    },
    {
      keys: 'K',
      description: 'Previous heading',
      match: key('k'),
      run: () => a.jumpHeading(-1),
    },
    { keys: 'R', description: 'Refresh the preview', match: key('r'), run: a.refresh },
    { keys: 'T', description: 'Switch theme', match: key('t'), run: a.cycleTheme },
    { keys: 'A', description: 'AI assistant', match: key('a'), run: a.toggleAI },
    { keys: 'Z', description: 'Focus mode', match: key('z'), run: a.focusMode },
    {
      keys: 'Esc',
      description: 'Exit focus mode',
      match: key('Escape'),
      run: a.exitFocus,
    },
    { keys: '?', description: 'Keyboard shortcuts', match: key('?'), run: a.showHelp },
  ]
}

export function installPreviewKeys(a: PreviewKeyActions): () => void {
  return installShortcuts(() => previewShortcuts(a), a.isBlocked)
}
