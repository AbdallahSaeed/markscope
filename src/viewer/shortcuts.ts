/**
 * Single-key shortcuts (GitHub/Gmail style) that never fire while typing,
 * plus modifier shortcuts. The same table drives the help dialog.
 */
import { h, isEditableTarget } from '@/shared/dom'

export interface Shortcut {
  keys: string
  description: string
  match: (e: KeyboardEvent) => boolean
  run: () => void
  /** Allowed even when focus is in a text field. */
  global?: boolean
}

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey
export const key = (k: string) => (e: KeyboardEvent) =>
  !isMod(e) && !e.altKey && e.key === k
export const modKey = (k: string) => (e: KeyboardEvent) =>
  isMod(e) && !e.altKey && e.key.toLowerCase() === k

export function installShortcuts(
  shortcuts: () => Shortcut[],
  blocked: () => boolean,
): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return
    const editing = isEditableTarget(e.target)
    for (const s of shortcuts()) {
      if (!s.match(e)) continue
      if (editing && !s.global) continue
      if (blocked() && !s.global) continue
      // Single-key shortcuts must not fire behind dialogs or open menus.
      if (!s.global && document.querySelector('dialog[open], .ms-menu:not([hidden])'))
        continue
      e.preventDefault()
      s.run()
      return
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}

export const MOD_LABEL = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

export function showShortcutHelp(shortcuts: Shortcut[]): void {
  const dialog = h(
    'dialog',
    { class: 'ms-help ms-ui', 'aria-labelledby': 'ms-help-title' },
    h(
      'header',
      {},
      h('h2', { id: 'ms-help-title', text: 'Keyboard shortcuts' }),
      h('button', {
        type: 'button',
        class: 'ms-icon-btn',
        'aria-label': 'Close',
        text: '×',
        on: { click: () => dialog.close() },
      }),
    ),
    h(
      'dl',
      {},
      ...shortcuts.flatMap(s => [
        h('dt', {}, ...s.keys.split(' ').map(k => h('kbd', { text: k }))),
        h('dd', { text: s.description }),
      ]),
    ),
  )
  dialog.addEventListener('close', () => dialog.remove())
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close()
  })
  document.body.append(dialog)
  dialog.showModal()
}
