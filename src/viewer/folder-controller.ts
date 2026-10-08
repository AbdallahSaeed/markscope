/**
 * Folder (workspace) flow: open a folder, show its documents, navigate
 * between them in place (a page reload would drop Chrome's folder
 * permission), handle Back/Forward, and reconnect after a reload.
 */
import { h, icon } from '@/shared/dom'
import { errorMessage } from '@/shared/errors'
import { ICONS } from '@/shared/icons'
import { buildViewerUrl, parseViewerUrl, type ViewerParams } from '@/shared/urls'
import type { ViewerApp } from './app'
import { ensurePermission } from './file-access'
import { renderFilesPanel } from './files-panel'
import { FolderAccessNeededError, FolderSession } from './folder-session'
import { showBanner } from './layout'
import { toast } from './toast'
import {
  defaultDocument,
  pickFolder,
  supportsFolders,
  workspaces,
  type Workspace,
} from './workspace'

export interface FolderController {
  /** Handles `?ws=` URLs; returns false when the URL is not a folder URL. */
  start(params: ViewerParams): Promise<boolean>
  /** "Open folder…" (needs a user gesture for the picker). */
  openFolder(): Promise<void>
  /** Reopen a recent folder (needs a user gesture for the permission prompt). */
  openStored(ws: Workspace): Promise<void>
  /** A dropped directory handle. */
  openHandle(handle: FileSystemDirectoryHandle): Promise<void>
  /** In-place navigation to a document of the open folder. */
  navigate(path: string, hash?: string): boolean
}

export function createFolderController(
  app: ViewerApp,
  viewerBase: string,
): FolderController {
  let session: FolderSession | null = null
  let loading = 0

  const urlFor = (path: string, hash = '') =>
    buildViewerUrl(viewerBase, session ? { ws: session.id, path } : {}, hash)

  function renderFiles(currentPath: string | null, select = false): void {
    if (!session) {
      app.sidebar.setFiles(null)
      return
    }
    app.sidebar.setFiles(
      renderFilesPanel({
        folderName: session.workspace.name,
        tree: session.tree,
        currentPath,
        hrefFor: path => urlFor(path),
        onOpen: path => controller.navigate(path),
        onClose: () => location.assign(viewerBase),
      }),
      select,
    )
  }

  async function show(
    path: string | null,
    hash: string,
    history_: 'push' | 'replace' | 'none',
  ): Promise<void> {
    if (!session) return
    const seq = ++loading
    if (!path) {
      showFolderOverview(session)
      return
    }
    try {
      const doc = await session.loadDocument(path)
      if (seq !== loading) return
      const url = urlFor(path, hash)
      if (history_ === 'push') history.pushState({ ws: session.id, path }, '', url)
      else if (history_ === 'replace')
        history.replaceState({ ws: session.id, path }, '', url)
      app.folder = session
      await app.openDocument(doc)
      renderFiles(path)
      void workspaces.touch(session.workspace)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        toast(`“${path}” was not found in ${session.workspace.name}.`, 'error')
        await session.refresh().catch(() => undefined)
        renderFiles(app.doc?.folder?.path ?? null, true)
        return
      }
      showBanner(app.layout, errorMessage(error), undefined, 'error')
    }
  }

  /**
   * A folder with no Markdown files: list everything in the Files tab (files
   * shown but not openable) and explain what Markscope can open.
   */
  function showFolderOverview(current: FolderSession): void {
    const { workspace, tree } = current
    app.folder = current
    // No document is open: actions like Save must not target the previous one.
    app.doc = null
    app.result = null
    document.body.dataset.mode = 'document'
    app.layout.home.hidden = true
    app.layout.title.textContent = workspace.name
    app.layout.subtitle.textContent = 'Folder · no Markdown files'
    document.title = `${workspace.name} · Markscope`
    app.layout.status.replaceChildren()
    app.layout.favoriteBtn.hidden = true
    app.layout.saveBtn.hidden = true
    renderFiles(null, true)

    const folders = new Set(
      tree.allFiles.map(f => f.split('/').slice(0, -1).join('/')).filter(Boolean),
    )
    const byType = new Map<string, number>()
    for (const file of tree.allFiles) {
      const ext = /\.([A-Za-z0-9]{1,8})$/.exec(file)?.[1]?.toLowerCase() ?? 'other'
      byType.set(ext, (byType.get(ext) ?? 0) + 1)
    }
    const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const another = h(
      'button',
      { type: 'button', class: 'ms-btn' },
      icon(ICONS.folder),
      h('span', { text: 'Open another folder…' }),
    )
    another.addEventListener('click', () => void controller.openFolder())

    app.layout.article.replaceChildren(
      h(
        'div',
        { class: 'ms-reconnect ms-folder-overview' },
        icon(ICONS.folder),
        h('h2', { text: `No Markdown files in “${workspace.name}”` }),
        h('p', {
          text:
            tree.allFiles.length === 0
              ? 'This folder is empty.'
              : `It contains ${tree.allFiles.length} file${tree.allFiles.length === 1 ? '' : 's'}${folders.size ? ` in ${folders.size + 1} folders` : ''}. They are listed in the Files panel, but only Markdown files (.md, .markdown, .mdx) open in Markscope.`,
        }),
        topTypes.length
          ? h(
              'ul',
              { class: 'ms-type-chips', 'aria-label': 'File types in this folder' },
              ...topTypes.map(([ext, n]) =>
                h('li', { class: 'ms-chip ms-chip--quiet', text: `${ext} · ${n}` }),
              ),
            )
          : null,
        tree.truncated
          ? h('p', {
              class: 'ms-muted',
              text: 'Large folder: only the first files were scanned.',
            })
          : null,
        another,
      ),
    )
  }

  function showReconnect(ws: Workspace, params: ViewerParams): void {
    document.body.dataset.mode = 'document'
    app.layout.home.hidden = true
    app.layout.title.textContent = ws.name
    app.layout.subtitle.textContent = 'Folder · access needed'
    const button = h(
      'button',
      { type: 'button', class: 'ms-btn ms-btn--primary' },
      icon(ICONS.folder),
      h('span', { text: `Reconnect “${ws.name}”` }),
    )
    button.addEventListener('click', async () => {
      // Chrome only re-grants folder access from a user gesture.
      if (!(await ensurePermission(ws.handle, 'read'))) {
        toast('Access was not granted.', 'error')
        return
      }
      await controller.start(params)
    })
    app.layout.article.replaceChildren(
      h(
        'div',
        { class: 'ms-reconnect' },
        icon(ICONS.folder),
        h('h2', { text: 'Reconnect to this folder' }),
        h('p', {
          text: `For your privacy, Chrome asks again for access to “${ws.name}” after the page reloads.`,
        }),
        button,
      ),
    )
    button.focus()
  }

  /** For a document opened without a location: find it inside a picked folder. */
  async function locateInFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const doc = app.doc
    const name = doc?.ref?.kind === 'local' ? doc.ref.name : null
    if (!doc || !name) return false
    const ws = await workspaces.add(handle)
    session = await FolderSession.open(ws)
    const candidates = session.tree.files.filter(
      f => (f.split('/').pop() ?? '').toLowerCase() === name.toLowerCase(),
    )
    let match = candidates.length === 1 ? candidates[0] : undefined
    for (const candidate of candidates.length > 1 ? candidates : []) {
      const loaded = await session.loadDocument(candidate)
      if (loaded.source === doc.source) {
        match = candidate
        break
      }
    }
    if (!match) {
      toast(`Couldn't find ${name} in “${ws.name}”. Showing the folder instead.`)
      await show(defaultDocument(session.tree.files), '', 'push')
      return true
    }
    await show(match, location.hash, 'push')
    toast(`Opened ${name} from “${ws.name}” — local images now load.`)
    return true
  }

  window.addEventListener('popstate', () => {
    const params = parseViewerUrl(location.href)
    if (session && params.ws === session.id)
      void show(params.path ?? null, location.hash, 'none')
    else location.reload()
  })

  const controller: FolderController = {
    async start(params) {
      if (!params.ws) return false
      const ws = await workspaces.get(params.ws)
      if (!ws)
        throw new Error(
          'This folder is no longer available. Open it again from the start page.',
        )
      try {
        session = await FolderSession.open(ws)
      } catch (error) {
        if (error instanceof FolderAccessNeededError) {
          showReconnect(ws, params)
          return true
        }
        throw error
      }
      const path = params.path ?? defaultDocument(session.tree.files)
      await show(path, location.hash, params.path ? 'none' : 'replace')
      if (!params.path) renderFiles(path, true)
      return true
    },

    async openFolder() {
      if (!supportsFolders()) {
        toast('This browser cannot open folders. Use Open file instead.', 'error')
        return
      }
      try {
        const handle = await pickFolder()
        if (!handle) return
        // A loose document asked for its folder: open it in place.
        if (app.doc?.ref?.kind === 'local' && !session && (await locateInFolder(handle)))
          return
        await controller.openHandle(handle)
      } catch (error) {
        toast(`Could not open the folder: ${errorMessage(error)}`, 'error')
      }
    },

    async openStored(ws) {
      if (!(await ensurePermission(ws.handle, 'read'))) {
        toast(`Access to “${ws.name}” was not granted.`, 'error')
        return
      }
      session = await FolderSession.open(ws)
      await show(defaultDocument(session.tree.files), '', 'push')
      renderFiles(app.doc?.folder?.path ?? null, true)
    },

    async openHandle(handle) {
      const ws = await workspaces.add(handle)
      session = await FolderSession.open(ws)
      await show(defaultDocument(session.tree.files), '', 'push')
      renderFiles(app.doc?.folder?.path ?? null, true)
    },

    navigate(path, hash = '') {
      if (!session) return false
      if (
        app.modified &&
        !confirm('Discard your unsaved edits and open another document?')
      )
        return true
      void show(path, hash, 'push')
      return true
    },
  }

  app.requestFolder = () => void controller.openFolder()
  app.navigateFolder = (path, hash) => controller.navigate(path, hash)
  return controller
}
