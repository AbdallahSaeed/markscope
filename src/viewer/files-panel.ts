/**
 * "Files" sidebar panel for an opened folder: a filterable tree with the
 * current document highlighted. By default it lists Markdown files only;
 * "Show all files" lists everything, with files Markscope can't open shown
 * dimmed and inert. Folders without Markdown start in "all files" mode.
 */
import { h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { ancestorsOf, markdownOnly, type TreeNode, type WorkspaceTree } from './workspace'

export interface FilesPanelOptions {
  folderName: string
  tree: WorkspaceTree
  currentPath: string | null
  hrefFor: (path: string) => string
  /** In-place navigation; return true when handled. */
  onOpen: (path: string) => boolean
  onClose: () => void
}

const SHOW_ALL_KEY = 'markscope.files.showAll'

function readShowAll(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_KEY) === '1'
  } catch {
    return false
  }
}

function writeShowAll(on: boolean): void {
  try {
    localStorage.setItem(SHOW_ALL_KEY, on ? '1' : '0')
  } catch {
    // per-viewer convenience only
  }
}

const extensionOf = (name: string) =>
  (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] ?? '').toLowerCase()

export function renderFilesPanel(opts: FilesPanelOptions): HTMLElement {
  const hasMarkdown = opts.tree.files.length > 0
  // A folder with no Markdown is only useful in "all files" mode.
  let showAll = hasMarkdown ? readShowAll() : true
  const open = new Set(opts.currentPath ? ancestorsOf(opts.currentPath) : [])

  const fileItem = (path: string, label: string, markdown: boolean): HTMLElement =>
    h(
      'li',
      { dataset: { path } },
      markdown
        ? h(
            'a',
            {
              class: 'ms-files__file',
              href: opts.hrefFor(path),
              title: path,
              ...(path === opts.currentPath ? { 'aria-current': 'page' } : {}),
            },
            icon(ICONS.file),
            h('span', { text: label }),
          )
        : h(
            'span',
            {
              class: 'ms-files__file is-other',
              'aria-disabled': 'true',
              title: `${path} — not a Markdown file, so Markscope can't open it`,
            },
            icon(ICONS.file),
            h('span', { text: label }),
            extensionOf(label)
              ? h('small', { class: 'ms-files__ext', text: extensionOf(label) })
              : null,
          ),
    )

  const renderNodes = (nodes: TreeNode[], depth = 0): HTMLElement =>
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
                { open: open.has(node.path) || (depth === 0 && nodes.length === 1) },
                h(
                  'summary',
                  { class: 'ms-files__dir', title: node.path },
                  icon(ICONS.folder),
                  h('span', { text: node.name }),
                ),
                renderNodes(node.children ?? [], depth + 1),
              ),
            )
          : fileItem(node.path, node.name, node.markdown !== false),
      ),
    )

  const filter = h('input', {
    type: 'search',
    class: 'ms-outline-filter',
    'aria-label': 'Filter files',
  })
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'ms-chip ms-chip--quiet ms-files__toggle',
      'aria-pressed': String(showAll),
      title: hasMarkdown
        ? 'Also list files Markscope cannot open'
        : 'This folder has no Markdown files',
      disabled: !hasMarkdown,
    },
    icon(ICONS.eye),
    h('span', { text: 'Show all files' }),
  )
  const tree = h('nav', {
    class: 'ms-files',
    'aria-label': `Files in ${opts.folderName}`,
  })
  const flat = h('ul', { class: 'ms-files__list ms-files__flat', hidden: true })
  const note = h('p', { class: 'ms-panel__summary' })

  const markdownSet = new Set(opts.tree.files)
  function paint(): void {
    const nodes = showAll ? opts.tree.nodes : markdownOnly(opts.tree.nodes)
    const count = showAll ? opts.tree.allFiles.length : opts.tree.files.length
    filter.placeholder = `Filter ${count} ${showAll ? 'files' : 'Markdown files'}`
    toggle.setAttribute('aria-pressed', String(showAll))
    tree.replaceChildren(
      nodes.length
        ? renderNodes(nodes)
        : h('p', {
            class: 'ms-empty',
            text: showAll ? 'This folder is empty.' : 'No Markdown files in this folder.',
          }),
    )
    note.textContent = [
      !hasMarkdown
        ? 'No Markdown files here — other files are listed but can’t be opened.'
        : '',
      opts.tree.truncated ? 'Large folder: some files were skipped.' : '',
    ]
      .filter(Boolean)
      .join(' ')
    note.hidden = note.textContent === ''
    applyFilter()
  }

  // Filtering shows a flat list of matching paths (easier to scan than a tree).
  function applyFilter(): void {
    const q = filter.value.trim().toLowerCase()
    tree.hidden = q !== ''
    flat.hidden = q === ''
    if (!q) return
    const pool = showAll ? opts.tree.allFiles : opts.tree.files
    const matches = pool.filter(f => f.toLowerCase().includes(q)).slice(0, 200)
    flat.replaceChildren(
      ...(matches.length
        ? matches.map(path => fileItem(path, path, markdownSet.has(path)))
        : [h('li', { class: 'ms-empty', text: 'No matching files' })]),
    )
  }

  filter.addEventListener('input', applyFilter)
  toggle.addEventListener('click', () => {
    showAll = !showAll
    writeShowAll(showAll)
    paint()
  })
  for (const list of [tree, flat]) {
    list.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest('a')
      const path = a?.closest('li')?.dataset.path
      if (!a || !path || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      if (opts.onOpen(path)) e.preventDefault()
    })
  }

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

  paint()
  return h(
    'div',
    { class: 'ms-files-panel' },
    header,
    h('div', { class: 'ms-files__tools' }, filter, toggle),
    note,
    tree,
    flat,
  )
}
