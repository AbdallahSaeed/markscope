/**
 * The preview inside a VS Code webview. It composes the same components as
 * the browser viewer (renderer, DocumentView, sidebar, search, doctor) but has
 * no editing, saving or file lifecycle: the native editor and the host own
 * those. Everything that touches the outside world goes through the Bridge.
 */
import { diagnose } from '@/analysis/doctor'
import { RenderClient } from '@/engine/render-client'
import type { RenderResult } from '@/engine/types'
import { debounce } from '@/shared/dom'
import { errorMessage } from '@/shared/errors'
import { renderKey, type Settings } from '@/shared/settings'
import { computeStats } from '@/shared/stats'
import { parseWorkspaceUrl } from '@/shared/urls'
import { AIPanel } from '@/viewer/ai-panel'
import { Menu } from '@/viewer/menu'
import { showShortcutHelp } from '@/viewer/shortcuts'
import type { AITransport } from '@/viewer/ai-client'
import { DocumentView } from '@/viewer/document-view'
import {
  cleanForExport,
  renderExportHtml,
  safeFileName,
  serializeForExport,
} from '@/viewer/export-html'
import { hideBanner, showBanner, type Layout } from '@/viewer/layout'
import { idFromHash, scrollToId, scrollToLine, topVisibleLine } from '@/viewer/navigation'
import { SearchBar } from '@/viewer/search-bar'
import { Sidebar } from '@/viewer/sidebar'
import { renderStatus } from '@/viewer/status-bar'
import { applyAppearance, resolvedTheme } from '@/viewer/theme'
import { toast } from '@/viewer/toast'
import type { PreviewAction, ThemeChoice, WebviewCommand } from '../protocol'
import { previewShortcuts, type PreviewKeyActions } from './keys'
import { previewMenuItems } from './menu'
import type { Bridge } from './host-bridge'
import { ScrollEcho } from './scroll-echo'

export interface PreviewDoc {
  uri: string
  version: number
  text: string
  fileName: string
  baseUri: string | null
}

const CURSOR_CLASS = 'ms-cursor-block'
const MEDIA_TIMEOUT_MS = 10_000

export interface PreviewDeps {
  layout: Layout
  bridge: Bridge
  renderer: RenderClient
  settings: Settings
  /** Webview URI of document.css, inlined into exported files. */
  documentCssUrl: string
  /** Where AI requests go (the extension host). */
  aiTransport: AITransport
}

/** The line the reader was at, from the state a previous page of this panel saved. */
function savedPosition(state: unknown): { uri: string; line: number } | null {
  if (typeof state !== 'object' || state === null) return null
  const { uri, line } = state as Record<string, unknown>
  return typeof uri === 'string' && Number.isInteger(line) && (line as number) >= 1
    ? { uri, line: line as number }
    : null
}

export class PreviewApp {
  settings: Settings
  private doc: PreviewDoc | null = null
  private result: RenderResult | null = null
  private locked = false
  private kind: 'preview' | 'reader' = 'preview'
  private renderSeq = 0
  private lastRenderKey = ''
  private lastSentLine = 0
  private lastTheme: 'light' | 'dark'
  private restoreLine: { uri: string; line: number } | null
  private highlighted: Element | null = null
  private sidebarHidden: boolean
  private readonly layout: Layout
  private readonly documentCssUrl: string
  private readonly bridge: Bridge
  private readonly renderer: RenderClient
  private readonly sidebar: Sidebar
  private readonly docView: DocumentView
  private readonly search: SearchBar
  private readonly ai: AIPanel
  private readonly echo = new ScrollEcho()
  private readonly pendingMedia = new Map<number, (url: string | null) => void>()
  private mediaSeq = 0
  private readonly narrow = window.matchMedia('(max-width: 900px)')

  constructor(deps: PreviewDeps) {
    this.layout = deps.layout
    this.documentCssUrl = deps.documentCssUrl
    this.bridge = deps.bridge
    this.renderer = deps.renderer
    this.settings = deps.settings
    this.sidebarHidden = !deps.settings.layout.sidebar
    this.lastTheme = resolvedTheme(deps.settings)
    this.restoreLine = savedPosition(deps.bridge.getState())

    this.sidebar = new Sidebar({
      onHeading: id => scrollToId(this.layout.article, id),
      onLine: line => this.bridge.post({ type: 'revealLine', line }),
      onTab: () => undefined,
    })
    this.layout.sidebarSlot.append(this.sidebar.el)

    this.docView = new DocumentView(this.layout.article, 'workspace://vscodedoc/', {
      onExplainCode: (code, lang) => {
        if (this.openAI()) this.ai.explainCode(code, lang)
      },
      onImageError: debounce(() => this.runDoctor(), 300),
      onNavigateAnchor: id => scrollToId(this.layout.article, id),
      loadLocalMedia: url => this.requestMedia(url),
      onUnresolvedLocalMedia: () =>
        showBanner(
          this.layout,
          'Save this file to show images by relative path.',
          undefined,
          'warn',
        ),
      onOpenFile: (target, hash) => {
        const parsed = parseWorkspaceUrl(target)
        if (!parsed) return false
        this.bridge.post({ type: 'openLink', kind: 'file', target: parsed.path, hash })
        return true
      },
      onNavigateWorkspace: (target, hash) => {
        const parsed = parseWorkspaceUrl(target)
        if (!parsed) return false
        this.bridge.post({
          type: 'openLink',
          kind: 'document',
          target: parsed.path,
          hash,
        })
        return true
      },
      onOpenExternal: href => {
        this.bridge.post({ type: 'openLink', kind: 'external', target: href, hash: '' })
        return true
      },
    })
    this.search = new SearchBar(() => this.layout.article)
    this.layout.main.prepend(this.search.el)
    this.ai = new AIPanel(
      {
        document: () => this.doc?.text ?? '',
        title: () => this.doc?.fileName ?? 'Untitled',
        selection: () => window.getSelection()?.toString() ?? '',
        dark: () => document.documentElement.dataset.theme === 'dark',
      },
      () => this.closeAI(),
      deps.aiTransport,
    )
    this.layout.aiSlot.append(this.ai.el)
    this.layout.aiBtn.addEventListener('click', () => this.toggleAI())

    this.layout.sidebarBtn.addEventListener('click', () => this.toggleSidebar())
    this.layout.themeBtn.addEventListener('click', () => this.cycleTheme())
    this.layout.paletteBtn.addEventListener('click', () => this.act('openCommands'))
    // ⌘K is a VS Code chord prefix: the button opens VS Code's palette, filtered to Markscope.
    this.layout.paletteBtn.querySelector('kbd')?.remove()
    new Menu(this.layout.moreBtn, () =>
      previewMenuItems({
        settings: () => this.settings,
        kind: () => this.kind,
        locked: () => this.locked,
        focusModeOn: () => document.body.classList.contains('zen'),
        act: (name, value) => this.act(name, value),
        toggleFocus: () => this.toggleFocus(),
        toggleAI: () => this.toggleAI(),
        showShortcuts: () => this.showShortcuts(),
      }),
    )
    this.layout.searchBtn.addEventListener('click', () => this.search.open())
    this.layout.zenExit.addEventListener('click', () => this.toggleFocus(false))
    this.installScrollReporting()
    this.applySettings(deps.settings)
  }

  // ---------------------------------------------------------------- settings

  applySettings(next: Settings): void {
    const prev = this.settings
    this.settings = next
    this.refreshTheme()
    document.body.classList.toggle('sidebar-hidden', this.sidebarHidden)
    this.layout.sidebarBtn.setAttribute('aria-expanded', String(this.sidebarOpen()))
    this.layout.aiBtn.hidden = !next.ai.enabled
    this.updateThemeButton()
    if (!next.ai.enabled) this.closeAI()
    this.ai.configure(next)
    if (
      this.doc &&
      (renderKey(next) !== this.lastRenderKey ||
        prev.code.lineNumbers !== next.code.lineNumbers ||
        prev.code.wrap !== next.code.wrap ||
        prev.privacy.remoteImages !== next.privacy.remoteImages ||
        prev.ai.enabled !== next.ai.enabled)
    )
      void this.render({ preserveScroll: true })
  }

  /** Re-applies appearance (also when VS Code's own theme changed). */
  refreshTheme(): void {
    applyAppearance(this.settings)
    const theme = resolvedTheme(this.settings)
    if (theme === this.lastTheme) return
    this.lastTheme = theme
    this.docView.diagrams.retheme(this.layout.article, theme === 'dark')
  }

  // --------------------------------------------------------------- documents

  async setDocument(doc: PreviewDoc, hash: string): Promise<void> {
    const sameFile = this.doc?.uri === doc.uri
    this.doc = doc
    document.body.dataset.mode = 'document'
    hideBanner(this.layout)
    this.layout.title.textContent = doc.fileName
    this.layout.subtitle.textContent = ''
    await this.render({ preserveScroll: sameFile })
    if (hash)
      requestAnimationFrame(() => scrollToId(this.layout.article, idFromHash(hash)))
    else if (!sameFile) {
      // A hidden tab reloads this page: come back to where the reader was.
      const restore = this.restoreLine?.uri === doc.uri ? this.restoreLine.line : 0
      this.restoreLine = null
      if (restore) this.applyScroll(restore)
      else window.scrollTo(0, 0)
    }
    this.persistState()
  }

  setKind(kind: 'preview' | 'reader'): void {
    this.kind = kind
  }

  /** Asks the host to do one of the fixed toolbar/menu actions. */
  act(name: PreviewAction, value?: ThemeChoice): void {
    this.bridge.post(
      value === undefined ? { type: 'action', name } : { type: 'action', name, value },
    )
  }

  private updateThemeButton(): void {
    const labels = { system: 'VS Code theme', light: 'Light theme', dark: 'Dark theme' }
    this.layout.themeBtn.title = `${labels[this.settings.theme]} — switch (T)`
    this.layout.themeBtn.setAttribute('aria-label', this.layout.themeBtn.title)
    this.layout.themeBtn.dataset.theme = this.settings.theme
  }

  /** VS Code theme → light → dark → …; the choice is saved as the `markscope.theme` setting. */
  cycleTheme(): void {
    const order: ThemeChoice[] = ['vscode', 'light', 'dark']
    const current: ThemeChoice =
      this.settings.theme === 'system' ? 'vscode' : this.settings.theme
    this.act('setTheme', order[(order.indexOf(current) + 1) % order.length])
  }

  showShortcuts(): void {
    showShortcutHelp(previewShortcuts(this.keyActions()))
  }

  /** The keyboard actions, shared by the key handler and the shortcut help. */
  keyActions(): PreviewKeyActions {
    return {
      find: () => this.run('find'),
      toggleSidebar: () => this.toggleSidebar(),
      focusMode: () => this.toggleFocus(),
      toggleAI: () => this.toggleAI(),
      exitFocus: () => this.toggleFocus(false),
      jumpHeading: delta => this.jumpHeading(delta),
      refresh: () => this.act('refresh'),
      cycleTheme: () => this.cycleTheme(),
      showHelp: () => this.showShortcuts(),
      isBlocked: () => this.searchOpen,
    }
  }

  get isLocked(): boolean {
    return this.locked
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.persistState()
  }

  private persistState(): void {
    this.bridge.setState({
      uri: this.doc?.uri ?? null,
      locked: this.locked,
      line: topVisibleLine(this.layout.article),
    })
  }

  async render(opts: { preserveScroll: boolean }): Promise<void> {
    const doc = this.doc
    if (!doc) return
    const seq = ++this.renderSeq
    const anchorLine = opts.preserveScroll ? topVisibleLine(this.layout.article) : 0
    let result: RenderResult
    try {
      result = await this.renderer.render(doc.text, {
        markdown: this.settings.markdown,
        highlight: this.settings.code.highlight,
      })
    } catch (error) {
      showBanner(
        this.layout,
        `Could not render: ${errorMessage(error)}`,
        undefined,
        'error',
      )
      return
    }
    if (seq !== this.renderSeq) return // a newer render superseded this one
    this.result = result
    this.lastRenderKey = renderKey(this.settings)
    this.highlighted = null
    this.docView.render(result, {
      settings: this.settings,
      baseUrl: doc.baseUri,
      sourceLength: doc.text.length,
      dark: resolvedTheme(this.settings) === 'dark',
      aiEnabled: this.settings.ai.enabled,
    })
    this.sidebar.setHeadings(result.headings, this.layout.article)
    this.runDoctor()
    this.updateStatus()
    this.search.refresh()
    if (anchorLine) this.applyScroll(anchorLine)
  }

  private updateStatus(): void {
    const doc = this.doc
    const result = this.result
    if (!doc || !result) return
    const stats = computeStats(doc.text)
    renderStatus(this.layout.status, {
      stats,
      renderMs: result.durationMs,
      live: false,
      modified: false,
    })
    this.sidebar.setInfo(stats, {
      source: doc.fileName,
      renderMs: result.durationMs,
      size: new Blob([doc.text]).size,
    })
  }

  runDoctor(): void {
    const doc = this.doc
    const result = this.result
    if (!doc || !result) return
    const issues = diagnose({
      source: doc.text,
      headings: result.headings,
      links: result.links,
      images: result.images,
      knownIds: this.docView.knownIds(),
      brokenImages: this.docView.failedImages,
    })
    this.sidebar.setDoctor(issues)
    this.bridge.post({ type: 'doctor', uri: doc.uri, version: doc.version, issues })
  }

  // ---------------------------------------------------------- editor ⇄ preview

  /** The editor scrolled: follow it, without echoing the move back. */
  scrollToLine(line: number): void {
    this.applyScroll(line)
  }

  private applyScroll(line: number): void {
    scrollToLine(this.layout.article, line, 'instant')
    // Layout is synchronous: this reads the position we just set.
    const top = topVisibleLine(this.layout.article)
    this.echo.expect(top)
    this.lastSentLine = top // a later real scroll back to the old line must be reported
  }

  /** The editor cursor moved: mark the block it is in. */
  cursorLine(line: number): void {
    const blocks = this.layout.article.querySelectorAll<HTMLElement>('[data-source-line]')
    let target: HTMLElement | null = null
    for (const el of blocks) {
      if (Number(el.dataset.sourceLine) <= line) target = el
      else break
    }
    this.highlighted?.classList.remove(CURSOR_CLASS)
    target?.classList.add(CURSOR_CLASS)
    this.highlighted = target
  }

  private installScrollReporting(): void {
    let frame = 0
    window.addEventListener(
      'scroll',
      () => {
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          const line = topVisibleLine(this.layout.article)
          if (line < 1 || this.echo.isEcho(line) || line === this.lastSentLine) return
          this.lastSentLine = line
          this.bridge.post({ type: 'scrolled', line })
          this.persistState()
        })
      },
      { passive: true },
    )
    this.layout.article.addEventListener('dblclick', e => {
      const block = (e.target as HTMLElement).closest<HTMLElement>('[data-source-line]')
      const line = Number(block?.dataset.sourceLine)
      if (Number.isInteger(line) && line >= 1)
        this.bridge.post({ type: 'revealLine', line })
    })
  }

  // ------------------------------------------------------------------- media

  /** Asks the host for a webview URI of a folder-relative image; null if refused. */
  private requestMedia(url: string): Promise<string | null> {
    const parsed = parseWorkspaceUrl(url)
    if (!parsed) return Promise.resolve(null)
    const requestId = ++this.mediaSeq
    return new Promise(resolve => {
      const timer = setTimeout(() => this.settleMedia(requestId, null), MEDIA_TIMEOUT_MS)
      this.pendingMedia.set(requestId, value => {
        clearTimeout(timer)
        resolve(value)
      })
      this.bridge.post({ type: 'resolveMedia', requestId, path: parsed.path })
    })
  }

  settleMedia(requestId: number, url: string | null): void {
    const resolve = this.pendingMedia.get(requestId)
    this.pendingMedia.delete(requestId)
    resolve?.(url)
  }

  // ---------------------------------------------------------------- commands

  run(name: WebviewCommand): void {
    if (name === 'find') this.search.open()
    else if (name === 'toggleSidebar') this.toggleSidebar()
    else if (name === 'focusMode') this.toggleFocus()
    else if (name === 'exportHtml') void this.exportHtml()
    else if (name === 'copyHtml') void this.copyHtml()
    else if (name === 'toggleAI') this.toggleAI()
    else this.runDoctor()
  }

  /** The rendered article as an HTML fragment (diagrams included), for pasting elsewhere. */
  async copyHtml(): Promise<void> {
    if (!this.doc || !this.result) return
    try {
      await this.docView.diagrams.renderAll(this.layout.article)
      const text = serializeForExport(cleanForExport(this.layout.article))
      this.bridge.post({ type: 'copy', text })
    } catch (error) {
      this.banner(`Could not copy: ${errorMessage(error)}`)
    }
  }

  /** Builds the self-contained HTML (diagrams fully rendered) and hands it to the host to save. */
  async exportHtml(): Promise<void> {
    const doc = this.doc
    const result = this.result
    if (!doc || !result) return
    try {
      await this.docView.diagrams.renderAll(this.layout.article)
      const res = await fetch(this.documentCssUrl)
      const title =
        result.headings.find(h => h.level === 1)?.text ||
        doc.fileName.replace(/\.[^.]+$/, '')
      const html = renderExportHtml(
        this.layout.article,
        title,
        resolvedTheme(this.settings),
        res.ok ? await res.text() : '',
      )
      this.bridge.post({
        type: 'exportHtml',
        html,
        fileName: safeFileName(title, 'html'),
      })
    } catch (error) {
      this.banner(`Could not export: ${errorMessage(error)}`)
    }
  }

  banner(message: string): void {
    showBanner(this.layout, message, undefined, 'warn')
  }

  private sidebarOpen(): boolean {
    return this.narrow.matches
      ? document.body.classList.contains('sidebar-open')
      : !this.sidebarHidden
  }

  toggleSidebar(): void {
    if (this.narrow.matches) document.body.classList.toggle('sidebar-open')
    else {
      this.sidebarHidden = !this.sidebarHidden
      document.body.classList.toggle('sidebar-hidden', this.sidebarHidden)
    }
    this.layout.sidebarBtn.setAttribute('aria-expanded', String(this.sidebarOpen()))
  }

  /** Returns false (and says why) when the assistant is switched off. */
  openAI(): boolean {
    if (!this.settings.ai.enabled) {
      toast('Turn on markscope.ai.enabled in Settings to use the assistant.')
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

  toggleFocus(force?: boolean): void {
    const on = document.body.classList.toggle('zen', force)
    this.layout.zenExit.hidden = !on
    if (on) toast('Focus mode — press Z or Esc to exit')
  }

  jumpHeading(delta: 1 | -1): void {
    const headings = this.sidebar.allHeadings
    if (headings.length === 0) return
    const next =
      headings[
        Math.min(
          headings.length - 1,
          Math.max(0, this.sidebar.currentHeadingIndex + delta),
        )
      ]
    if (next) scrollToId(this.layout.article, next.id)
  }

  get searchOpen(): boolean {
    return !this.search.el.hidden
  }

  dispose(): void {
    this.docView.dispose()
    this.renderer.dispose()
  }
}
