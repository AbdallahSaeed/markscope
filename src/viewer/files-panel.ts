/**
 * "Files" sidebar panel for an opened folder: a filterable tree of the
 * folder's Markdown files with the current document highlighted.
 */
import { h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { ancestorsOf, type TreeNode, type WorkspaceTree } from './workspace'

export interface FilesPanelOptions {
  folderName: string
  tree: WorkspaceTree
  currentPath: string | null
  hrefFor: (path: string) => string
  /** In-place navigation; return true when handled. */
  onOpen: (path: string) => boolean
  onClose: () => void
}

export function renderFilesPanel(opts: FilesPanelOptions): HTMLElement {
  const open = new Set(opts.currentPath ? ancestorsOf(opts.currentPath) : [])
  const filter = h('input', {
    type: 'search',
    class: 'ms-outline-filter',
    placeholder: `Filter ${opts.tree.files.length} files`,
    'aria-label': 'Filter files',
  })

  const renderNodes = (nodes: TreeNode[]): HTMLElement =>
    h(
      'ul',
      { class: 'ms-files__list', role: 'group' },
      ...nodes.map(node =>
        node.kind === 'dir'
          ? h(
              'li',
              { dataset: { path: node.path } },
              h(
                'details',
                { open: open.has(node.path) || nodes.length === 1 },
                h(
                  'summary',
                  { class: 'ms-files__dir', title: node.path },
                  icon(ICONS.folder),
                  h('span', { text: node.name }),
                ),
                renderNodes(node.children ?? []),
              ),
            )
          : h(
              'li',
              { dataset: { path: node.path } },
              h(
                'a',
                {
                  class: 'ms-files__file',
                  href: opts.hrefFor(node.path),
                  title: node.path,
                  ...(node.path === opts.currentPath ? { 'aria-current': 'page' } : {}),
                },
                icon(ICONS.file),
                h('span', { text: node.name }),
              ),
            ),
      ),
    )

  const tree = h(
    'nav',
    { class: 'ms-files', 'aria-label': `Files in ${opts.folderName}` },
    renderNodes(opts.tree.nodes),
  )
  const flat = h('ul', { class: 'ms-files__list ms-files__flat', hidden: true })

  tree.addEventListener('click', e => onLinkClick(e))
  flat.addEventListener('click', e => onLinkClick(e))
  function onLinkClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a')
    const path = a?.closest('li')?.dataset.path
    if (!a || !path || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (opts.onOpen(path)) e.preventDefault()
  }

  // Filtering shows a flat list of matching paths (easier to scan than a tree).
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase()
    tree.hidden = q !== ''
    flat.hidden = q === ''
    if (!q) return
    const matches = opts.tree.files.filter(f => f.toLowerCase().includes(q)).slice(0, 200)
    flat.replaceChildren(
      ...(matches.length
        ? matches.map(path =>
            h(
              'li',
              { dataset: { path } },
              h(
                'a',
                {
                  class: 'ms-files__file',
                  href: opts.hrefFor(path),
                  title: path,
                  ...(path === opts.currentPath ? { 'aria-current': 'page' } : {}),
                },
                icon(ICONS.file),
                h('span', { text: path }),
              ),
            ),
          )
        : [h('li', { class: 'ms-empty', text: 'No matching files' })]),
    )
  })

  const header = h(
    'div',
    { class: 'ms-files__head' },
    icon(ICONS.folder),
    h('strong', { text: opts.folderName, title: opts.folderName }),
    h(
      'button',
      {
        type: 'button',
        class: 'ms-icon-btn',
        'aria-label': 'Close folder',
        title: 'Close folder',
        on: { click: () => opts.onClose() },
      },
      icon(ICONS.x),
    ),
  )

  const body =
    opts.tree.files.length === 0
      ? h('p', { class: 'ms-empty', text: 'No Markdown files in this folder.' })
      : h('div', {}, tree, flat)

  return h(
    'div',
    { class: 'ms-files-panel' },
    header,
    opts.tree.files.length ? filter : null,
    body,
    opts.tree.truncated
      ? h('p', {
          class: 'ms-panel__summary',
          text: 'Large folder: some files were skipped.',
        })
      : null,
  )
}
