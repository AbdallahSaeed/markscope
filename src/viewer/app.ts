/**
 * Viewer orchestrator: owns the current document and wires the rendering
 * pipeline to the UI components. Components stay dumb; this file decides.
 */
import { diagnose } from '@/analysis/doctor'
import { RenderClient } from '@/engine/render-client'
import type { RenderResult } from '@/engine/types'
import { debounce } from '@/shared/dom'
import { errorMessage } from '@/shared/errors'
import { computeStats } from '@/shared/stats'
import { renderKey, type Settings } from '@/shared/settings'
import {
  describeSource,
  parseWorkspaceUrl,
  withRawMarker,
  type ViewerParams,
} from '@/shared/urls'
import type { DocumentRef, LibraryStore } from '@/storage/library-store'
import type { SettingsStore } from '@/storage/settings-store'
import { AIPanel } from './ai-panel'
import { DocumentView } from './document-view'
import type { CursorInfo } from './editor/adapter'
import { EditorController } from './editor/editor-controller'
import { exportDocument, printDocument } from './document-actions'
import { saveDocument, saveDocumentAs } from './save-actions'
import { hideBanner, showBanner, type Layout, type ViewMode } from './layout'
import { localDocs } from './local-docs'
import { CommandPalette, type PaletteItem } from './palette'
import { SearchBar } from './search-bar'
import { Sidebar } from './sidebar'
import { applyAppearance, onSystemThemeChange, resolvedTheme } from './theme'
import { toast } from './toast'
import { draftKey, DraftSaver, draftStore } from './drafts'
import { offerDraftRestore } from './draft-restore'
import { LiveReload } from './live-reload'
import { createSplitDivider, type SplitDivider } from './split-divider'
import { SplitView } from './split-view'
import { renderCursor, renderStatus } from './status-bar'
import { highlightSource } from './source-view'
import { idFromHash, scrollToId, scrollToLine, topVisibleLine } from './navigation'
import { FolderSession, readFileAsBlobUrl } from './folder-session'

export interface LoadedDoc {
  ref: DocumentRef | null
  title: string
  source: string
  sourceUrl: string | null
  localId: string | null
  handle?: FileSystemFileHandle
  lastModified?: number
  scratch: boolean
  /** Base for relative links when the document no longer has a sourceUrl. */
  baseUrl?: string | null
  /** Set when the document belongs to an opened folder. */
  folder?: { id: string; name: string; path: string }
}

export interface AppDeps {
  layout: Layout
  settingsStore: SettingsStore
  library: LibraryStore
  viewerBase: string
  workerUrl: string
}

export class ViewerApp {
  settings!: Settings
  doc: LoadedDoc | null = null
  result: RenderResult | null = null
  view: ViewMode = 'read'
  modified = false

  readonly layout: Layout
  readonly sidebar: Sidebar
  readonly docView: DocumentView
  readonly search: SearchBar
  readonly palette: CommandPalette
  readonly ai: AIPanel
  private renderer: RenderClient
  /** Live reload and disk-change conflicts. */
  readonly live: LiveReload
  /** Crash backup of unsaved edits. */
  private readonly drafts = new DraftSaver(draftStore, onceToast)
  /** Text as last loaded or saved: what Discard reverts to and edits are measured against. */
  savedSource = ''
  /** The Markdown editor (CodeMirror, loaded on first use). */
  readonly editor: EditorController
  private cursor: CursorInfo | null = null
  /** Edit view: scroll sync, jump to source, cursor highlight. */
  readonly split: SplitView
  private readonly divider: SplitDivider
  private renderSeq = 0
  private lastRenderKey = ''
  private sourceRendered = false
  paletteItems: () => Promise<PaletteItem[]> = async () => []
  /** Open folder (set by the bootstrap; needs a user gesture). */
  requestFolder: () => void = () => undefined
  /** In-place navigation inside the open folder; returns true if handled. */
  navigateFolder: (path: string, hash: string) => boolean = () => false
  /** Renders the Files panel for the open folder (set by the bootstrap). */
  folder: FolderSession | null = null

  constructor(readonly deps: AppDeps) {
    this.layout = deps.layout
    this.renderer = new RenderClient(deps.workerUrl)
    this.sidebar = new Sidebar({
      onHeading: id => this.scrollToId(id),
      onLine: line => this.scrollToLine(line),
      onTab: () => undefined,
    })
    this.layout.sidebarSlot.append(this.sidebar.el)
    this.docView = new DocumentView(this.layout.article, deps.viewerBase, {
      onExplainCode: (code, lang) => {
        if (this.openAI()) this.ai.explainCode(code, lang)
      },
      onImageError: debounce(() => this.runDoctor(), 300),
      onNavigateAnchor: id => this.scrollToId(id),
      loadLocalMedia: url =>
        url.startsWith('file:')
          ? readFileAsBlobUrl(url)
          : (this.folder?.loadMedia(url) ?? Promise.resolve(null)),
      onUnresolvedLocalMedia: () =>
        showBanner(
          this.layout,
          'This document shows images by relative path. Open the folder that contains it to display them.',
          { label: 'Open folder…', run: () => this.requestFolder() },
        ),
      onRequestFolder: () => this.requestFolder(),
      onNavigateWorkspace: (target, hash) => {
        const t = parseWorkspaceUrl(target)
        return (
          !!t &&
          !!this.folder &&
          t.id === this.folder.id &&
          this.navigateFolder(t.path, hash)
        )
      },
    })
    this.search = new SearchBar(() => this.layout.article)
    this.layout.main.prepend(this.search.el)
    this.palette = new CommandPalette(() => this.paletteItems())
    this.ai = new AIPanel(
      {
        document: () => this.currentSource(),
        title: () => this.doc?.title ?? 'Untitled',
        selection: () => window.getSelection()?.toString() ?? '',
        dark: () => document.documentElement.dataset.theme === 'dark',
      },
      () => this.closeAI(),
    )
    this.layout.aiSlot.append(this.ai.el)
    this.live = new LiveReload(this)
    void draftStore.prune().catch(() => undefined) // stale backups; harmless if it fails
    this.editor = new EditorController(this.layout.editor, {
      onChange: () => void this.onEdit().catch(e => toast(errorMessage(e), 'error')),
      onScroll: () => this.split.onEditorScroll(),
      onCursor: info => {
        this.cursor = info
        this.split.onCursor(info.line)
        if (this.view === 'split') renderCursor(this.layout.status, info)
      },
    })
    this.split = new SplitView({
      preview: this.layout.previewPane,
      article: this.layout.article,
      editor: this.editor,
      active: () => this.view === 'split',
    })
    this.divider = createSplitDivider(this.layout.panes, splitRatio =>
      this.updateSettings({ layout: { splitRatio } }),
    )
    this.layout.panes.append(this.divider.el)
    window.addEventListener('beforeunload', e => {
      if (this.modified && !this.doc?.scratch) e.preventDefault()
    })
    window.addEventListener('pagehide', () => {
      void this.flushScratch()
      void this.drafts.flush()
    })
    window.addEventListener('beforeprint', () => this.prepareForPrint())
    onSystemThemeChange(() => {
      if (this.settings) this.applySettings(this.settings)
    })
    window.addEventListener('hashchange', () => this.scrollToHash())
    this.narrow.addEventListener('change', () => this.updateSidebarButton())
  }

  // ---------------------------------------------------------------- settings

  applySettings(next: Settings): void {
    const prev = this.settings as Settings | undefined
    this.settings = next
    applyAppearance(next)
    document.body.classList.toggle('sidebar-hidden', !next.layout.sidebar)
    this.updateSidebarButton()
    this.divider.set(next.layout.splitRatio)
    this.layout.aiBtn.hidden = !next.ai.enabled
    if (!next.ai.enabled) this.closeAI()
    this.ai.configure(next)
    this.updateThemeButton()

    const theme = resolvedTheme(next)
    if (prev && resolvedTheme(prev) !== theme)
      this.docView.diagrams.retheme(this.layout.article, theme === 'dark')
    if (
      this.doc &&
      (renderKey(next) !== this.lastRenderKey ||
        prev?.code.lineNumbers !== next.code.lineNumbers ||
        prev?.code.wrap !== next.code.wrap ||
        prev?.privacy.remoteImages !== next.privacy.remoteImages ||
        prev?.ai.enabled !== next.ai.enabled)
    ) {
      void this.render({ preserveScroll: true })
    }
    if (this.doc) this.configureWatcher()
  }

  updateSettings(patch: Parameters<SettingsStore['update']>[0]): void {
    void this.deps.settingsStore.update(patch).catch(e => toast(errorMessage(e), 'error'))
  }

  private updateThemeButton(): void {
    const labels = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }
    this.layout.themeBtn.title = `${labels[this.settings.theme]} — switch (T)`
    this.layout.themeBtn.dataset.theme = this.settings.theme
  }

  cycleTheme(): void {
    const order = ['system', 'light', 'dark'] as const
    const next =
      order[(order.indexOf(this.settings.theme) + 1) % order.length] ?? 'system'
    this.updateSettings({ theme: next })
    toast(`Theme: ${next}`)
  }

  // --------------------------------------------------------------- documents

  async openDocument(doc: LoadedDoc): Promise<void> {
    this.doc = doc
    this.savedSource = doc.source
    this.live.reset()
    this.modified = false
    hideBanner(this.layout)
    this.sourceRendered = false
    document.body.dataset.mode = 'document'
    this.layout.home.hidden = true
    this.editor.setValue(doc.source, { resetHistory: true })
    this.updateHeader()
    await this.render({ preserveScroll: false })
    this.scrollToHash()
    // Record after rendering so recents show the real title, not the file name.
    if (doc.ref) void this.deps.library.visit(doc.ref, this.doc?.title ?? doc.title)
    this.configureWatcher()
    void offerDraftRestore(this)
    if (doc.scratch) this.setView('split')
  }

  currentSource(): string {
    return this.doc?.source ?? ''
  }

  updateHeader(): void {
    const doc = this.doc
    if (!doc) return
    const where = doc.sourceUrl ? describeSource(doc.sourceUrl) : null
    this.layout.title.textContent = doc.title
    this.layout.subtitle.textContent = doc.scratch
      ? 'Scratch document · saved in this browser'
      : doc.folder
        ? `${doc.folder.name} / ${doc.folder.path}`
        : where
          ? `${where.host} · ${where.path}`
          : `Local · ${doc.ref?.kind === 'local' ? doc.ref.name : ''}`
    this.layout.subtitle.title = doc.sourceUrl ?? ''
    document.title = `${doc.title}${this.modified ? ' •' : ''} · Markscope`
    this.layout.saveBtn.hidden = !this.modified
    this.layout.discardBtn.hidden = !this.modified
    void this.refreshFavorite()
  }

  async refreshFavorite(): Promise<void> {
    const ref = this.doc?.ref
    const btn = this.layout.favoriteBtn
    btn.hidden = !ref
    if (!ref) return
    const lib = await this.deps.library.load()
    const key = JSON.stringify(ref)
    const fav = lib.entries.some(e => JSON.stringify(e.ref) === key && e.favorite)
    btn.setAttribute('aria-pressed', String(fav))
    btn.classList.toggle('is-on', fav)
    btn.setAttribute('aria-label', fav ? 'Remove from favorites' : 'Add to favorites')
    btn.title = btn.getAttribute('aria-label') ?? ''
  }

  async toggleFavorite(): Promise<void> {
    const ref = this.doc?.ref
    if (!ref) return
    const on = this.layout.favoriteBtn.getAttribute('aria-pressed') !== 'true'
    await this.deps.library.favorite(ref, on, this.doc?.title)
    await this.refreshFavorite()
    toast(on ? 'Added to favorites' : 'Removed from favorites')
  }

  async render(opts: { preserveScroll: boolean }): Promise<void> {
    const doc = this.doc
    if (!doc) return
    const seq = ++this.renderSeq
    // The Edit view re-aligns the preview with the editor instead.
    const anchorLine =
      opts.preserveScroll && this.view !== 'split' ? this.topVisibleLine() : 0
    let result: RenderResult
    try {
      result = await this.renderer.render(doc.source, {
        markdown: this.settings.markdown,
        highlight: this.settings.code.highlight,
      })
    } catch (error) {
      showBanner(
        this.layout,
        `Could not render document: ${errorMessage(error)}`,
        undefined,
        'error',
      )
      return
    }
    if (seq !== this.renderSeq) return // a newer render superseded this one
    this.result = result
    this.lastRenderKey = renderKey(this.settings)
    this.docView.render(result, {
      settings: this.settings,
      baseUrl: doc.sourceUrl ?? doc.baseUrl ?? null,
      sourceLength: doc.source.length,
      dark: resolvedTheme(this.settings) === 'dark',
      aiEnabled: this.settings.ai.enabled,
    })
    const derived = deriveTitle(result, doc)
    if (this.doc && derived !== this.doc.title) {
      // Merge into the *current* doc: edits may have landed during the await.
      this.doc = { ...this.doc, title: derived }
      this.updateHeader()
    }
    this.sidebar.setHeadings(result.headings, this.layout.article)
    this.runDoctor()
    this.updateStatus()
    this.search.refresh()
    if (result.highlightTruncated)
      toast('Large document: syntax highlighting was limited to keep things fast.')
    if (this.view === 'source') this.renderSourceView()
    else this.sourceRendered = false
    if (this.view === 'split') this.split.syncPreview()
    else if (anchorLine) this.scrollToLine(anchorLine, 'instant')
  }

  runDoctor(): void {
    const result = this.result
    if (!result || !this.doc) return
    this.sidebar.setDoctor(
      diagnose({
        source: this.doc.source,
        headings: result.headings,
        links: result.links,
        images: result.images,
        knownIds: this.docView.knownIds(),
        brokenImages: this.docView.failedImages,
      }),
    )
  }

  updateStatus(): void {
    const doc = this.doc
    const result = this.result
    if (!doc || !result) return
    const stats = computeStats(doc.source)
    renderStatus(this.layout.status, {
      stats,
      renderMs: result.durationMs,
      live: this.live.active,
      modified: this.modified,
    })
    this.sidebar.setInfo(stats, {
      source: doc.sourceUrl ?? (doc.scratch ? 'Scratch document' : 'Local document'),
      renderMs: result.durationMs,
      size: new Blob([doc.source]).size,
    })
  }

  // ------------------------------------------------------------ live reload

  private configureWatcher(): void {
    this.live.configure()
  }

  reload(): Promise<void> {
    return this.live.reload()
  }

  onLoadError(error: unknown): void {
    this.live.onLoadError(error)
  }

  // --------------------------------------------------------------------- save

  /** Save (⌘/Ctrl S): write back to the file, or fall back to "Save as". */
  save(): Promise<void> {
    return saveDocument(this)
  }

  /** Save as… (⇧⌘/Ctrl⇧S): pick a file; later saves go to that file. */
  saveAs(): Promise<void> {
    return saveDocumentAs(this)
  }

  /** Called after a successful write: clears the dirty state everywhere. */
  markSaved(): void {
    this.savedSource = this.doc?.source ?? ''
    this.modified = false
    hideBanner(this.layout)
    this.updateHeader()
    this.updateStatus()
    this.configureWatcher()
    this.syncDraft()
  }

  /**
   * Discard (revert to the last saved version). Acts immediately but offers
   * Undo, so a misclick never loses work.
   */
  async discardChanges(): Promise<void> {
    const doc = this.doc
    if (!doc) return
    this.editor.cancelPending()
    const edited = this.editor.value
    if (!this.modified && edited === this.savedSource) return
    this.doc = { ...doc, source: this.savedSource }
    // A transaction, not a reset: ⌘Z in the editor also brings the edits back.
    this.editor.setValue(this.savedSource)
    this.modified = false
    this.updateHeader()
    this.configureWatcher()
    this.syncDraft()
    await this.render({ preserveScroll: true })
    showBanner(this.layout, 'Edits discarded — reverted to the last saved version.', {
      label: 'Undo',
      run: () => void this.applyText(edited),
    })
  }

  /** Replaces the text as an edit (undoable in the editor): Undo banners, merges, restores. */
  async applyText(text: string): Promise<void> {
    if (!this.doc) return
    this.doc = { ...this.doc, source: text }
    this.editor.setValue(text)
    this.modified = !this.doc.scratch && text !== this.savedSource
    hideBanner(this.layout)
    this.updateHeader()
    this.configureWatcher()
    this.syncDraft()
    await this.render({ preserveScroll: true })
  }

  /** Keeps the crash backup in step: written while there are unsaved edits, removed after. */
  syncDraft(): void {
    const doc = this.doc
    const key = doc ? draftKey(doc) : null
    if (!doc || !key) return
    if (this.modified) this.drafts.schedule(key, doc.source, this.savedSource)
    else void this.drafts.clear(key)
  }

  // ------------------------------------------------------------------ editing

  private async onEdit(): Promise<void> {
    if (!this.doc) return
    const text = this.editor.value
    if (text === this.doc.source) return
    this.doc = { ...this.doc, source: text }
    if (!this.doc.scratch && !this.modified) {
      this.modified = true
      this.configureWatcher()
      this.updateHeader()
    }
    this.syncDraft()
    if (this.doc.scratch && this.doc.localId) {
      const stored = await localDocs.get(this.doc.localId)
      if (stored) await localDocs.put({ ...stored, text, updatedAt: Date.now() })
    }
    await this.render({ preserveScroll: false })
  }

  setView(mode: ViewMode): void {
    this.view = mode
    this.layout.panes.dataset.view = mode
    for (const [id, btn] of Object.entries(this.layout.modeButtons))
      btn.setAttribute('aria-pressed', String(id === mode))
    if (mode === 'source') this.renderSourceView()
    renderCursor(this.layout.status, mode === 'split' ? this.cursor : null)
    if (mode === 'split') {
      // Panes scroll independently; a leftover page scroll would cut them off.
      window.scrollTo(0, 0)
      void this.editor
        .show()
        .then(() => this.split.syncPreview())
        .catch(e => toast(`Could not load the editor: ${errorMessage(e)}`, 'error'))
    } else this.split.deactivate()
  }

  private renderSourceView(): void {
    if (this.sourceRendered || !this.doc) return
    this.sourceRendered = true
    highlightSource(this.layout.sourceView, this.doc.source)
  }

  // --------------------------------------------------------------- navigation

  scrollToId(id: string): void {
    scrollToId(this.layout.article, id)
  }

  private scrollToHash(): void {
    if (!location.hash) return
    const id = idFromHash(location.hash)
    requestAnimationFrame(() => this.scrollToId(id))
  }

  scrollToLine(line: number, behavior: ScrollBehavior = 'smooth'): void {
    scrollToLine(this.layout.article, line, behavior)
  }

  private topVisibleLine(): number {
    return topVisibleLine(this.layout.article)
  }

  jumpHeading(delta: 1 | -1): void {
    const headings = this.sidebar.allHeadings
    if (headings.length === 0) return
    const idx = this.sidebar.currentHeadingIndex
    const next = headings[Math.min(headings.length - 1, Math.max(0, idx + delta))]
    if (next) this.scrollToId(next.id)
  }

  // --------------------------------------------------------------- panels etc

  private readonly narrow = window.matchMedia('(max-width: 900px)')

  /** On narrow screens the sidebar is a drawer, independent of the setting. */
  private updateSidebarButton(): void {
    const open = this.narrow.matches
      ? document.body.classList.contains('sidebar-open')
      : this.settings.layout.sidebar
    this.layout.sidebarBtn.setAttribute('aria-expanded', String(open))
  }

  toggleSidebar(): void {
    if (this.narrow.matches) {
      document.body.classList.toggle('sidebar-open')
      this.updateSidebarButton()
      return
    }
    this.updateSettings({ layout: { sidebar: !this.settings.layout.sidebar } })
  }

  /** Returns false (and explains why) when AI is disabled. */
  openAI(): boolean {
    if (!this.settings.ai.enabled) {
      toast('Enable AI in Settings → AI to use the assistant.')
      return false
    }
    this.ai.el.hidden = false
    document.body.classList.add('ai-open')
    this.ai.focus()
    return true
  }

  closeAI(): void {
    this.ai.el.hidden = true
    document.body.classList.remove('ai-open')
  }

  toggleAI(): void {
    if (this.ai.el.hidden) this.openAI()
    else this.closeAI()
  }

  toggleZen(force?: boolean): void {
    const on = document.body.classList.toggle('zen', force)
    this.layout.zenExit.hidden = !on
    if (on) {
      toast('Focus mode — press Z or Esc to exit')
      // Keep the reader where they were; the hidden toolbar no longer offsets it.
      if (this.view === 'split') this.editor.focus()
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  exportAs(kind: 'html' | 'md'): Promise<void> {
    return exportDocument(this, kind)
  }

  print(): Promise<void> {
    return printDocument(this)
  }

  /** Browser-initiated print (menu, Ctrl/⌘ P) can't await, so open what we can. */
  prepareForPrint(): void {
    this.layout.article
      .querySelectorAll('details')
      .forEach(d => d.setAttribute('open', ''))
  }

  async flushScratch(): Promise<void> {
    const doc = this.doc
    if (!doc?.scratch || !doc.localId) return
    const text = this.editor.value
    const stored = await localDocs.get(doc.localId)
    if (stored && stored.text !== text)
      await localDocs.put({ ...stored, text, updatedAt: Date.now() })
  }

  viewOriginal(): void {
    const url = this.doc?.sourceUrl
    if (url) window.open(withRawMarker(url), '_blank', 'noopener')
  }

  async copySource(): Promise<void> {
    await navigator.clipboard.writeText(this.currentSource())
    toast('Markdown copied')
  }
}

/** Backup failures are reported once per page, not on every keystroke. */
let backupWarned = false
function onceToast(error: unknown): void {
  if (backupWarned) return
  backupWarned = true
  toast(
    `Unsaved edits can't be backed up in this browser: ${errorMessage(error)}`,
    'error',
  )
}

export function deriveTitle(result: RenderResult, doc: LoadedDoc): string {
  const h1 = result.headings.find(h => h.level === 1)?.text
  const fmTitle = result.frontMatter?.entries.find(
    ([k]) => k.toLowerCase() === 'title',
  )?.[1]
  const fallback = doc.sourceUrl
    ? describeSource(doc.sourceUrl).name
    : doc.folder
      ? (doc.folder.path.split('/').pop() ?? doc.folder.path)
      : doc.ref?.kind === 'local'
        ? doc.ref.name
        : 'Untitled'
  return (fmTitle || h1 || fallback || 'Untitled').slice(0, 200)
}

export type { ViewerParams }
