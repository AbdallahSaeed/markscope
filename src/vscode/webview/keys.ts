/** In-webview shortcuts that don't fight VS Code: single keys, never while typing. */
import { installShortcuts, key, type Shortcut } from '@/viewer/shortcuts'

export interface PreviewKeyActions {
  find: () => void
  toggleSidebar: () => void
  focusMode: () => void
  toggleAI: () => void
  exitFocus: () => void
  jumpHeading: (delta: 1 | -1) => void
  isBlocked: () => boolean
}

export function installPreviewKeys(a: PreviewKeyActions): () => void {
  const table: Shortcut[] = [
    { keys: '/', description: 'Find', match: key('/'), run: a.find },
    { keys: 'B', description: 'Toggle outline', match: key('b'), run: a.toggleSidebar },
    { keys: 'Z', description: 'Focus mode', match: key('z'), run: a.focusMode },
    { keys: 'A', description: 'AI assistant', match: key('a'), run: a.toggleAI },
    {
      keys: 'Esc',
      description: 'Exit focus mode',
      match: key('Escape'),
      run: a.exitFocus,
    },
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
  ]
  return installShortcuts(() => table, a.isBlocked)
}
