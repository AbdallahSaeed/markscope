/**
 * "Compare with disk" dialog. Resolves with the user's merged text, or null
 * when cancelled. The merge view (and @codemirror/merge) loads on demand.
 */
import { h } from '@/shared/dom'

export interface CompareOptions {
  title: string
  disk: string
  mine: string
  /** Label for the confirm button. */
  confirm?: string
}

export async function compareVersions(opts: CompareOptions): Promise<string | null> {
  const { createMergeView } = await import('./editor/merge-view')
  const body = h('div', { class: 'ms-merge__body' })
  const status = h('span', { class: 'ms-merge__status', 'aria-live': 'polite' })
  const cancel = h('button', { type: 'button', class: 'ms-btn', text: 'Cancel' })
  const accept = h('button', {
    type: 'button',
    class: 'ms-btn ms-btn--primary',
    text: opts.confirm ?? 'Use my version',
  })
  const dialog = h(
    'dialog',
    { class: 'ms-merge ms-ui', 'aria-labelledby': 'ms-merge-title' },
    h(
      'header',
      { class: 'ms-merge__header' },
      h('h2', { id: 'ms-merge-title', text: opts.title }),
      h('p', {
        text: 'Left: the version on disk (read-only). Right: your version, which you can edit. Use the arrows to copy a change from the left into your version.',
      }),
    ),
    h(
      'div',
      { class: 'ms-merge__labels', 'aria-hidden': 'true' },
      h('span', { text: 'On disk' }),
      h('span', { text: 'Your version' }),
    ),
    body,
    h('footer', { class: 'ms-merge__footer' }, status, cancel, accept),
  )
  document.body.append(dialog)
  const describe = () => {
    const n = merge.changes()
    status.textContent =
      n === 0 ? 'No differences' : `${n} difference${n === 1 ? '' : 's'}`
  }
  // Not a click listener: the merge view re-renders its arrows on mousedown.
  const merge = createMergeView(body, opts.disk, opts.mine, () => describe())
  describe()

  return new Promise(resolve => {
    let result: string | null = null
    cancel.addEventListener('click', () => dialog.close())
    accept.addEventListener('click', () => {
      result = merge.result()
      dialog.close()
    })
    dialog.addEventListener('close', () => {
      merge.destroy()
      dialog.remove()
      resolve(result)
    })
    dialog.showModal()
  })
}
