/**
 * Viewer entry point. Decides what to show from the URL:
 *   ?src=URL[&h=handoff]  remote or file:// document
 *   ?doc=ID               local document (IndexedDB)
 *   ?scratch=1            new scratch document
 *   (none)                start page
 */
import { errorMessage, PermissionNeededError } from '@/shared/errors'
import {
  buildViewerUrl,
  describeSource,
  parseViewerUrl,
  type ViewerParams,
} from '@/shared/urls'
import { libraryStore, settingsStore } from '@/storage'
import type { LibraryEntry } from '@/storage/library-store'
import { ViewerApp, type LoadedDoc } from './app'
import { menuItems, paletteItems, shortcutTable, type CommandContext } from './commands'
import { renderHome } from './home'
import { buildLayout, showBanner } from './layout'
import { isAcceptedFileName, localDocs, pickLocalFile } from './local-docs'
import { Menu } from './menu'
import { installShortcuts } from './shortcuts'
import { defaultLoaderDeps, loadSource } from './source-loader'
import { toast } from './toast'

const viewerBase = chrome.runtime.getURL('viewer.html')
const settings = settingsStore()
const library = libraryStore()

/** Returns null (→ fetch the URL instead) if the handoff is missing or the worker is unavailable. */
async function claimHandoff(id: string): Promise<{ url: string; text: string } | null> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'handoff.claim', id })) as
      { ok: boolean; data?: { url: string; text: string } } | undefined
    return res?.ok && res.data ? res.data : null
  } catch {
    return null
  }
}

async function resolveDocument(params: ViewerParams): Promise<LoadedDoc | null> {
  if (params.src) {
    const src = params.src
    let text: string | null = null
    if (params.handoff) text = (await claimHandoff(params.handoff))?.text ?? null
    if (text === null) {
      const res = await loadSource(src, null, defaultLoaderDeps())
      text = res.changed ? res.text : ''
    }
    // Drop the one-time token from the address bar so reload re-fetches.
    if (params.handoff)
      history.replaceState(null, '', buildViewerUrl(viewerBase, { src }, location.hash))
    return {
      ref: { kind: 'url', url: src },
      title: describeSource(src).name,
      source: text,
      sourceUrl: src,
      localId: null,
      scratch: false,
    }
  }
  if (params.doc) {
    const stored = await localDocs.get(params.doc)
    if (!stored)
      throw new Error('This local document is no longer available. Open the file again.')
    return {
      ref: stored.scratch ? null : { kind: 'local', id: stored.id, name: stored.name },
      title: stored.name,
      source: stored.text,
      sourceUrl: null,
      localId: stored.id,
      ...(stored.handle ? { handle: stored.handle } : {}),
      ...(stored.lastModified !== undefined ? { lastModified: stored.lastModified } : {}),
      scratch: !!stored.scratch,
      ...(stored.baseUrl ? { baseUrl: stored.baseUrl } : {}),
    }
  }
  return null
}

async function openLocalFile(file: File, handle?: FileSystemFileHandle): Promise<void> {
  if (!isAcceptedFileName(file.name)) {
    toast(`${file.name} is not a Markdown file`, 'error')
    return
  }
  const doc = await localDocs.create({
    name: file.name,
    text: await file.text(),
    lastModified: file.lastModified,
    ...(handle ? { handle } : {}),
  })
  location.assign(buildViewerUrl(viewerBase, { doc: doc.id }))
}

async function newScratch(): Promise<void> {
  const doc = await localDocs.create({
    name: 'Scratch.md',
    text: '# Untitled\n\nStart writing **Markdown** here. The preview updates as you type.\n',
    scratch: true,
  })
  location.assign(buildViewerUrl(viewerBase, { doc: doc.id }))
}

async function openTour(): Promise<void> {
  const res = await fetch(chrome.runtime.getURL('samples/tour.md'))
  // One fixed id: reopening the tour refreshes it instead of piling up copies.
  const doc = await localDocs.put({
    id: 'markscope-tour',
    name: 'Markscope tour.md',
    text: await res.text(),
    updatedAt: Date.now(),
  })
  location.assign(buildViewerUrl(viewerBase, { doc: doc.id }))
}

function installDragAndDrop(): void {
  document.addEventListener('dragover', e => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      document.body.classList.add('is-dragging')
    }
  })
  document.addEventListener('dragleave', e => {
    if (e.relatedTarget === null) document.body.classList.remove('is-dragging')
  })
  document.addEventListener('drop', async e => {
    document.body.classList.remove('is-dragging')
    const item = Array.from(e.dataTransfer?.items ?? []).find(i => i.kind === 'file')
    if (!item) return
    e.preventDefault()
    // Keep a handle (Chromium) so the dropped file can live-reload.
    const getHandle = (
      item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
      }
    ).getAsFileSystemHandle
    const handlePromise = getHandle ? getHandle.call(item) : Promise.resolve(null)
    const file = item.getAsFile()
    if (!file) return
    try {
      const handle = await handlePromise.catch(() => null)
      await openLocalFile(
        file,
        handle?.kind === 'file' ? (handle as FileSystemFileHandle) : undefined,
      )
    } catch (error) {
      toast(`Could not open ${file.name}: ${errorMessage(error)}`, 'error')
    }
  })
}

async function main(): Promise<void> {
  const layout = buildLayout(document.getElementById('ms-root') ?? document.body)
  const app = new ViewerApp({
    layout,
    settingsStore: settings,
    library,
    viewerBase,
    workerUrl: chrome.runtime.getURL('js/render-worker.js'),
  })
  app.applySettings(await settings.load())
  settings.subscribe(next => app.applySettings(next))

  const openFile = () =>
    void pickLocalFile()
      .then(r => (r ? openLocalFile(r.file, r.handle) : undefined))
      .catch(e => toast(errorMessage(e), 'error'))
  const ctx: CommandContext = {
    app,
    library,
    viewerBase,
    openFile,
    newScratch: () => void newScratch(),
    goHome: () => location.assign(viewerBase),
  }
  app.paletteItems = () => paletteItems(ctx)
  new Menu(layout.moreBtn, () => menuItems(ctx))
  installShortcuts(
    () => shortcutTable(ctx),
    () => app.palette.isOpen,
  )
  installDragAndDrop()

  layout.sidebarBtn.addEventListener('click', () => app.toggleSidebar())
  layout.searchBtn.addEventListener('click', () => app.search.open())
  layout.aiBtn.addEventListener('click', () => app.toggleAI())
  layout.themeBtn.addEventListener('click', () => app.cycleTheme())
  layout.paletteBtn.addEventListener('click', () => void app.palette.open())
  layout.favoriteBtn.addEventListener('click', () => void app.toggleFavorite())
  layout.saveBtn.addEventListener('click', () => void app.save())
  layout.zenExit.addEventListener('click', () => app.toggleZen(false))
  for (const [mode, btn] of Object.entries(layout.modeButtons)) {
    btn.addEventListener('click', () => app.setView(mode as 'read' | 'split' | 'source'))
  }
  app.setView('read')

  const params = parseViewerUrl(location.href)
  const query = new URLSearchParams(location.search)
  if (query.get('tour') === '1') return openTour()

  try {
    const doc = await resolveDocument(params)
    if (doc) {
      await app.openDocument(doc)
      return
    }
    if (params.scratch) return newScratch()
  } catch (error) {
    document.body.dataset.mode = 'document'
    if (error instanceof PermissionNeededError) app.onLoadError(error)
    else
      showBanner(
        layout,
        errorMessage(error),
        { label: 'Start page', run: ctx.goHome },
        'error',
      )
    return
  }

  let homeSeq = 0
  const showHome = async () => {
    const seq = ++homeSeq
    document.body.dataset.mode = 'home'
    layout.home.hidden = false
    document.title = 'Markscope'
    const [fileAccess, lib] = await Promise.all([
      chrome.extension.isAllowedFileSchemeAccess().catch(() => true),
      library.load(),
    ])
    if (seq !== homeSeq) return // a newer library update is rendering
    renderHome(layout.home, {
      library: lib,
      viewerBase,
      fileAccess,
      welcome: query.get('welcome') === '1',
      hooks: {
        openFile,
        openUrl: url => location.assign(buildViewerUrl(viewerBase, { src: url })),
        newScratch: () => void newScratch(),
        openTour: () => void openTour(),
        toggleFavorite: (e: LibraryEntry) =>
          void library.favorite(e.ref, !e.favorite, e.title),
        removeEntry: (e: LibraryEntry) => void library.remove(e.ref),
      },
    })
  }
  await showHome()
  library.subscribe(() => void showHome().catch(e => toast(errorMessage(e), 'error')))
}

main().catch(error => {
  document.body.textContent = `Markscope failed to start: ${errorMessage(error)}`
})
