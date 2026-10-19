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
import { DocumentView } from '@/viewer/document-view'
import { hideBanner, showBanner, type Layout } from '@/viewer/layout'
import { idFromHash, scrollToId, scrollToLine, topVisibleLine } from '@/viewer/navigation'
import { SearchBar } from '@/viewer/search-bar'
import { Sidebar } from '@/viewer/sidebar'
import { renderStatus } from '@/viewer/status-bar'
import { applyAppearance, resolvedTheme } from '@/viewer/theme'
import { toast } from '@/viewer/toast'
import type { WebviewCommand } from '../protocol'
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
}

export class PreviewApp {
  settings: Settings
  private doc: PreviewDoc | null = null
  private result: RenderResult | null = null
  private locked = false
  private renderSeq = 0
  private lastRenderKey = ''
  private lastSentLine = 0
  private highlighted: Element | null = null
  private sidebarHidden: boolean
  private readonly layout: Layout
  private readonly bridge: Bridge
  private readonly renderer: RenderClient
  private readonly sidebar: Sidebar
  private readonly docView: DocumentView
  private readonly search: SearchBar
  private readonly echo = new ScrollEcho()
  private readonly pendingMedia = new Map<number, (url: string | null) => void>()
  private mediaSeq = 0
  private readonly narrow = window.matchMedia('(max-width: 900px)')

  constructor(deps: PreviewDeps) {
    this.layout = deps.layout
    this.bridge = deps.bridge
    this.renderer = deps.renderer
    this.settings = deps.settings
    this.sidebarHidden = !deps.settings.layout.sidebar

    this.sidebar = new Sidebar({
      onHeading: id => scrollToId(this.layout.article, id),
      onLine: line => this.bridge.post({ type: 'revealLine', line }),
      onTab: () => undefined,
    })
    this.layout.sidebarSlot.append(this.sidebar.el)

    this.docView = new DocumentView(this.layout.article, 'workspace://vscodedoc/', {
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

    this.layout.sidebarBtn.addEventListener('click', () => this.toggleSidebar())
    this.layout.searchBtn.addEventListener('click', () => this.search.open())
    this.layout.zenExit.addEventListener('click', () => this.toggleFocus(false))
    this.installScrollReporting()
    this.applySettings(deps.settings)
  }

  // ---------------------------------------------------------------- settings

  applySettings(next: Settings): void {
    const prev = this.settings
    this.settings = next
    this.refreshTheme(prev)
    document.body.classList.toggle('sidebar-hidden', this.sidebarHidden)
    this.layout.sidebarBtn.setAttribute('aria-expanded', String(this.sidebarOpen()))
    if (
      this.doc &&
      (renderKey(next) !== this.lastRenderKey ||
        prev.code.lineNumbers !== next.code.lineNumbers ||
        prev.code.wrap !== next.code.wrap ||
        prev.privacy.remoteImages !== next.privacy.remoteImages)
    )
      void this.render({ preserveScroll: true })
  }

  /** Re-applies appearance (also when VS Code's own theme changed). */
  refreshTheme(prev: Settings = this.settings): void {
    applyAppearance(this.settings)
    const theme = resolvedTheme(this.settings)
    if (resolvedTheme(prev) !== theme || prev !== this.settings)
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
    else if (!sameFile) window.scrollTo(0, 0)
    this.persistState()
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.persistState()
  }

  private persistState(): void {
    this.bridge.setState({ uri: this.doc?.uri ?? null, locked: this.locked })
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
      aiEnabled: false,
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
    this.echo.expect(topVisibleLine(this.layout.article))
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
    else this.runDoctor()
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
