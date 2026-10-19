/**
 * One Markscope preview: a webview showing a text document. It owns the
 * conversation with its webview. Everything the webview sends is validated by
 * `parseWebviewMessage` and then re-derived here: the webview never names a
 * file by URI, only a folder-relative path, which is confined to the
 * document's root before anything is opened or served.
 */
import * as os from 'node:os'
import * as vscode from 'vscode'
import { workspaceUrl } from '@/shared/urls'
import {
  envelope,
  parseWebviewMessage,
  type HostMessage,
  type WebviewMessage,
} from '../protocol'
import type { SecretsStore } from '@/storage/secrets-store'
import type { AIPortRequest } from '@/shared/messages'
import { createPanelAI, type PanelAI } from './ai-host'
import { runPreviewAction } from './panel-actions'
import { readPreviewOptions, readSettings } from './config'
import { isRealPathInside } from './confine'
import type { DiagnosticsSink } from './diagnostics'
import { buildWebviewHtml, makeNonce } from './html'
import {
  DOC_ROOT_ID,
  exportFileName,
  isBroadRoot,
  MAX_PREVIEW_CHARS,
  isMarkdownFileName,
  isMediaFileName,
  parseLineHash,
  parseExternalHref,
  relativeToRoot,
  safeRelativePath,
  updateDelayMs,
} from './link-policy'

export const PREVIEW_VIEW_TYPE = 'markscope.preview'

const MAX_MEDIA_IN_FLIGHT = 16
const EXTERNAL_OPEN_INTERVAL_MS = 1000

export interface PanelHost {
  readonly extensionUri: vscode.Uri
  readonly diagnostics: DiagnosticsSink
  /** API keys, bound to the endpoint origin they were saved for. */
  readonly secrets: SecretsStore
  /** `publisher.name`, for opening this extension's settings. */
  readonly extensionId: string
  /** Called once when the panel closes (the host stops tracking it). */
  panelClosed(panel: PreviewPanel): void
  /** Another panel shows this document? (decides when diagnostics are cleared). */
  isShownElsewhere(doc: vscode.TextDocument, except: PreviewPanel): boolean
  /** What a panel shows or how it looks changed: refresh the status bar. */
  stateChanged(): void
}

const webviewFile = (extensionUri: vscode.Uri, ...parts: string[]) =>
  vscode.Uri.joinPath(extensionUri, 'webview', ...parts)

/** The folder links and images are confined to: the workspace folder, else the document's own folder. */
export function rootFor(uri: vscode.Uri): vscode.Uri | undefined {
  if (uri.scheme === 'untitled') return undefined
  const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri
  if (folder) return folder
  const dir = vscode.Uri.joinPath(uri, '..')
  // A loose file in "/" or the home folder must not make everything below it servable.
  return uri.scheme === 'file' &&
    isBroadRoot(dir.path, vscode.Uri.file(os.homedir()).path)
    ? undefined
    : dir
}

/** Resources the webview may load: its own bundle and the displayed document's root, nothing else. */
export function panelOptions(
  extensionUri: vscode.Uri,
  doc?: vscode.TextDocument,
): vscode.WebviewOptions {
  const roots = [webviewFile(extensionUri)]
  const root = doc ? rootFor(doc.uri) : undefined
  if (root) roots.push(root)
  return {
    enableScripts: true,
    enableCommandUris: false,
    enableForms: false,
    localResourceRoots: roots,
  }
}

export class PreviewPanel {
  private doc: vscode.TextDocument | null = null
  private ready = false
  private pendingHash = ''
  private updateTimer: ReturnType<typeof setTimeout> | undefined
  private lastRevealedFromPreview = 0
  private remoteImages = readSettings().privacy.remoteImages as 'allow' | 'block'
  private readonly disposables: vscode.Disposable[] = []
  private disposed = false
  private mediaInFlight = 0
  /** Set when the host asked the webview for an export; the webview can't start one on its own. */
  private exportRequested = false
  private exportTarget: vscode.Uri | undefined
  private copyRequested = false
  private ai: PanelAI | undefined
  private lastExternalOpen = 0

  constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly host: PanelHost,
    private locked = false,
    readonly kind: 'preview' | 'reader' = 'preview',
  ) {
    panel.webview.options = panelOptions(host.extensionUri)
    this.disposables.push(
      panel.webview.onDidReceiveMessage(raw => void this.onMessage(raw)),
      panel.onDidDispose(() => this.dispose()),
    )
    this.loadHtml()
  }

  get document(): vscode.TextDocument | null {
    return this.doc
  }

  /** VS Code makes a new TextDocument when a closed file is reopened: follow the file, not the object. */
  rebind(doc: vscode.TextDocument): void {
    if (!this.doc || !sameUri(this.doc, doc) || this.doc === doc) return
    this.doc = doc
    this.refreshNow()
  }

  showsUri(uri: vscode.Uri): boolean {
    return this.doc?.uri.toString() === uri.toString()
  }

  get isReader(): boolean {
    return this.kind === 'reader'
  }

  /** Reader tabs are titled by VS Code (the file name); previews say what they are. */
  private updateTitle(): void {
    if (this.kind === 'reader' || !this.doc) return
    this.panel.title = previewTitle(this.doc, this.locked)
  }

  get isLocked(): boolean {
    return this.locked
  }

  // ----------------------------------------------------------------- content

  private loadHtml(): void {
    const web = this.panel.webview
    const uri = (...parts: string[]) =>
      web.asWebviewUri(webviewFile(this.host.extensionUri, ...parts)).toString()
    this.ready = false
    web.html = buildWebviewHtml({
      cspSource: web.cspSource,
      nonce: makeNonce(),
      scriptUri: uri('js', 'preview.js'),
      styleUris: [
        uri('css', 'document.css'),
        uri('css', 'viewer.css'),
        uri('css', 'vscode.css'),
      ],
      remoteImages: this.remoteImages,
    })
  }

  async show(doc: vscode.TextDocument, hash = ''): Promise<void> {
    const previous = this.doc
    this.doc = doc
    this.pendingHash = hash
    // Images mode lives in the CSP and is resource-scoped: follow the document's folder.
    const remote = readSettings(doc.uri).privacy.remoteImages
    if (remote !== this.remoteImages) {
      this.remoteImages = remote
      this.loadHtml() // `ready` comes again and the document is sent then
    }
    this.updateTitle()
    this.panel.webview.options = panelOptions(this.host.extensionUri, doc)
    this.host.stateChanged()
    if (
      previous &&
      !sameUri(previous, doc) &&
      !this.host.isShownElsewhere(previous, this)
    )
      this.host.diagnostics.clear(previous.uri)
    this.sendDocument()
  }

  private post(message: HostMessage): void {
    if (this.disposed) return
    void this.panel.webview.postMessage(envelope(message))
  }

  private sendDocument(): void {
    const doc = this.doc
    if (!doc || !this.ready) return
    if (doc.getText().length > MAX_PREVIEW_CHARS) {
      this.banner('This file is too large to preview. Use the editor.')
      return
    }
    const root = rootFor(doc.uri)
    const rel = root ? relativeToRoot(root.path, doc.uri.path) : null
    const hash = this.pendingHash
    this.pendingHash = ''
    this.post({
      type: 'document',
      uri: doc.uri.toString(),
      version: doc.version,
      text: doc.getText(),
      fileName: fileName(doc),
      baseUri: rel ? workspaceUrl(DOC_ROOT_ID, rel) : null,
      hash,
    })
    this.host.stateChanged()
  }

  /** The document changed: refresh after a pause that grows with its size. */
  scheduleUpdate(): void {
    if (!this.doc) return
    clearTimeout(this.updateTimer)
    this.updateTimer = setTimeout(
      () => this.sendDocument(),
      updateDelayMs(this.doc.getText().length),
    )
  }

  refreshNow(): void {
    clearTimeout(this.updateTimer)
    this.sendDocument()
  }

  setLocked(locked: boolean): void {
    if (this.kind === 'reader') return // the reader is always tied to its file
    this.locked = locked
    this.updateTitle()
    this.post({ type: 'lock', locked })
  }

  /** Re-reads the configuration; images mode lives in the CSP, so it reloads the page. */
  refreshConfig(): void {
    const settings = readSettings(this.doc?.uri)
    if (settings.privacy.remoteImages !== this.remoteImages) {
      this.remoteImages = settings.privacy.remoteImages
      this.loadHtml() // the webview announces `ready` again and gets everything resent
      return
    }
    this.post({ type: 'settings', settings })
    const doc = this.doc
    if (!doc) return
    if (readPreviewOptions(doc.uri).doctor) this.sendCommand('runDoctor')
    else this.host.diagnostics.clear(doc.uri)
  }

  /** Asks the webview for a self-contained HTML export; the answer opens a save dialog. */
  requestExport(target?: vscode.Uri): void {
    this.exportRequested = true
    this.exportTarget = target
    this.sendCommand('exportHtml')
  }

  private actionTarget() {
    const panel = this
    return {
      get document() {
        return panel.doc
      },
      extensionId: this.host.extensionId,
      refresh: () => this.refreshNow(),
      showSource: async () => {
        if (!this.doc) return
        await vscode.window.showTextDocument(this.doc, {
          viewColumn: this.editorColumn(),
        })
      },
      requestCopy: () => this.requestCopy(),
      requestExport: () => this.requestExport(),
      toggleLock: () => this.setLocked(!this.locked),
    }
  }

  /**
   * AI requests are served here, never in the webview: the key stays in the host and the
   * webview only sees streamed text. An untrusted workspace gets no AI at all.
   */
  private handleAI(request: AIPortRequest): void {
    if (request.type === 'ai.abort') return void this.ai?.handle(request)
    if (!vscode.workspace.isTrusted) {
      return this.post({
        type: 'ai.event',
        event: {
          type: 'error',
          id: request.id,
          message:
            'AI is turned off in untrusted workspaces. Trust this folder to use it.',
        },
      })
    }
    this.ai ??= createPanelAI({
      loadSettings: async () => readSettings(this.doc?.uri),
      secrets: this.host.secrets,
      post: event => this.post({ type: 'ai.event', event }),
    })
    this.ai.handle(request)
  }

  /** Asks the webview for the rendered HTML of the article; the answer goes to the clipboard. */
  requestCopy(): void {
    this.copyRequested = true
    this.sendCommand('copyHtml')
  }

  private async saveCopy(text: string): Promise<void> {
    if (!this.copyRequested) return // only a copy the host asked for
    this.copyRequested = false
    await vscode.env.clipboard.writeText(text)
    vscode.window.setStatusBarMessage('Markscope: copied the rendered HTML', 3000)
  }

  private async saveExport(html: string, name: string): Promise<void> {
    if (!this.exportRequested) return // only an export the host asked for
    this.exportRequested = false
    const doc = this.doc
    const folder =
      doc && doc.uri.scheme !== 'untitled'
        ? vscode.Uri.joinPath(doc.uri, '..')
        : undefined
    const fileName = exportFileName(name)
    const chosen = this.exportTarget
    this.exportTarget = undefined
    const target =
      chosen ??
      (await vscode.window.showSaveDialog({
        defaultUri: folder ? vscode.Uri.joinPath(folder, fileName) : undefined,
        filters: { HTML: ['html'] },
        saveLabel: 'Export',
      }))
    if (!target) return
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(html))
    const open = await vscode.window.showInformationMessage(
      `Exported ${target.path.split('/').pop()}`,
      'Open in Browser',
    )
    if (open) await vscode.env.openExternal(target)
  }

  sendCommand(name: Extract<HostMessage, { type: 'command' }>['name']): void {
    this.post({ type: 'command', name })
  }

  banner(message: string): void {
    this.post({ type: 'banner', message })
  }

  // ------------------------------------------------------------ editor sync

  /** The editor scrolled to `line` (1-based). */
  syncScroll(line: number): void {
    if (line === this.lastRevealedFromPreview) {
      this.lastRevealedFromPreview = 0 // our own echo, compared by value; consumed once
      return
    }
    this.post({ type: 'scrollToLine', line })
  }

  syncCursor(line: number): void {
    this.post({ type: 'cursorLine', line })
  }

  // --------------------------------------------------------------- messages

  private async onMessage(raw: unknown): Promise<void> {
    const message = parseWebviewMessage(raw)
    if (!message) return
    try {
      await this.handle(message)
    } catch (error) {
      this.banner(error instanceof Error ? error.message : String(error))
    }
  }

  private async handle(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true
        this.post({
          type: 'init',
          settings: readSettings(this.doc?.uri),
          assets: this.assets(),
          aiAvailable: readSettings(this.doc?.uri).ai.enabled,
          kind: this.kind,
        })
        this.post({ type: 'lock', locked: this.locked })
        this.sendDocument()
        return
      case 'openLink':
        if (message.kind === 'external') return this.openExternal(message.target)
        return message.kind === 'file'
          ? this.openFileLink(message.target, message.hash)
          : this.openDocumentLink(message.target, message.hash)
      case 'resolveMedia':
        return this.resolveMedia(message.requestId, message.path)
      case 'scrolled':
        return this.revealInEditor(message.line)
      case 'revealLine':
        return this.focusEditorAt(message.line)
      case 'doctor':
        return this.acceptDoctor(message)
      case 'exportHtml':
        return this.saveExport(message.html, message.fileName)
      case 'copy':
        return this.saveCopy(message.text)
      case 'ai':
        return this.handleAI(message.request)
      case 'action':
        return runPreviewAction(this.actionTarget(), message.name, message.value)
    }
  }

  private assets() {
    const web = this.panel.webview
    const uri = (...parts: string[]) =>
      web.asWebviewUri(webviewFile(this.host.extensionUri, ...parts)).toString()
    return {
      worker: uri('js', 'render-worker.js'),
      documentCss: uri('css', 'document.css'),
      katexCss: uri('vendor', 'katex', 'katex.min.css'),
    }
  }

  private async openExternal(href: string): Promise<void> {
    const url = parseExternalHref(href)
    if (!url) return this.banner('That link type is not supported.')
    const now = Date.now()
    if (now - this.lastExternalOpen < EXTERNAL_OPEN_INTERVAL_MS) return // no prompt spam
    this.lastExternalOpen = now
    // VS Code shows its own trusted-domains prompt for web links.
    await vscode.env.openExternal(vscode.Uri.parse(url.toString(), true))
  }

  /** `target` is a folder-relative path; the root is ours, so `..` can never leave it. */
  private async confinedTarget(path: string): Promise<vscode.Uri | undefined> {
    const doc = this.doc
    const rel = safeRelativePath(path)
    const root = doc ? rootFor(doc.uri) : undefined
    if (!rel || !root) return undefined
    const target = vscode.Uri.joinPath(root, ...rel.split('/'))
    if (target.scheme === 'file') {
      return (await isRealPathInside(root.fsPath, target.fsPath)) ? target : undefined
    }
    try {
      await vscode.workspace.fs.stat(target)
      return target
    } catch {
      return undefined
    }
  }

  private async openDocumentLink(path: string, hash: string): Promise<void> {
    const rel = safeRelativePath(path)
    if (!rel || !isMarkdownFileName(rel)) return
    const target = await this.confinedTarget(rel)
    if (!target)
      return this.banner(`Could not open ${rel}: not found inside this folder.`)
    const next = await vscode.workspace.openTextDocument(target)
    if (readPreviewOptions(this.doc?.uri).openMarkdownLinks === 'inEditor') {
      await vscode.window.showTextDocument(next, { viewColumn: this.editorColumn() })
      return
    }
    await this.show(next, hash)
  }

  /** A link to a project file (or folder): confined like everything else, then opened by VS Code. */
  private async openFileLink(path: string, hash: string): Promise<void> {
    const rel = safeRelativePath(path)
    if (!rel) return
    const target = await this.confinedTarget(rel)
    if (!target)
      return this.banner(`Could not open ${rel}: not found inside this folder.`)
    const stat = await vscode.workspace.fs.stat(target)
    if (stat.type & vscode.FileType.Directory) {
      await vscode.commands.executeCommand('revealInExplorer', target)
      return
    }
    const lines = parseLineHash(hash)
    if (!lines) {
      await vscode.commands.executeCommand('vscode.open', target, {
        viewColumn: this.editorColumn(),
      })
      return
    }
    const doc = await vscode.workspace.openTextDocument(target)
    const last = Math.max(0, Math.min(lines.end, doc.lineCount) - 1)
    const first = Math.min(Math.max(0, lines.start - 1), last)
    await vscode.window.showTextDocument(doc, {
      viewColumn: this.editorColumn(),
      selection: new vscode.Range(first, 0, last, doc.lineAt(last).text.length),
    })
  }

  private async resolveMedia(requestId: number, path: string): Promise<void> {
    const rel = safeRelativePath(path)
    const target =
      rel && isMediaFileName(rel) ? await this.confinedTarget(rel) : undefined
    this.post({
      type: 'media',
      requestId,
      url: target ? this.panel.webview.asWebviewUri(target).toString() : null,
    })
  }

  private acceptDoctor(message: Extract<WebviewMessage, { type: 'doctor' }>): void {
    const doc = this.doc
    if (!doc || message.uri !== doc.uri.toString()) return
    if (!readPreviewOptions(doc.uri).doctor) return this.host.diagnostics.clear(doc.uri)
    this.host.diagnostics.set(doc, message.version, message.issues)
  }

  private editorFor(doc: vscode.TextDocument): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(e => sameUri(e.document, doc))
  }

  private editorColumn(): vscode.ViewColumn | undefined {
    return this.doc ? this.editorFor(this.doc)?.viewColumn : undefined
  }

  /** The preview scrolled to `line` (1-based): move the editor, if the user wants that. */
  private revealInEditor(line: number): void {
    const doc = this.doc
    const editor = doc ? this.editorFor(doc) : undefined
    if (!doc || !editor || !readPreviewOptions(doc.uri).scrollEditorWithPreview) return
    const zero = Math.min(line, doc.lineCount) - 1
    this.lastRevealedFromPreview = zero + 1
    editor.revealRange(
      new vscode.Range(zero, 0, zero, 0),
      vscode.TextEditorRevealType.AtTop,
    )
  }

  /** Double-click in the preview: put the cursor on that source line. */
  private async focusEditorAt(line: number): Promise<void> {
    const doc = this.doc
    if (!doc) return
    const zero = Math.min(line, doc.lineCount) - 1
    const position = new vscode.Position(zero, 0)
    await vscode.window.showTextDocument(doc, {
      viewColumn: this.editorColumn(),
      selection: new vscode.Range(position, position),
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.updateTimer)
    const doc = this.doc
    if (doc && !this.host.isShownElsewhere(doc, this))
      this.host.diagnostics.clear(doc.uri)
    this.ai?.dispose()
    for (const d of this.disposables) d.dispose()
    this.panel.dispose()
    this.host.panelClosed(this)
  }
}

function sameUri(a: vscode.TextDocument, b: vscode.TextDocument): boolean {
  return a.uri.toString() === b.uri.toString()
}

/** The tab title of a preview, so a panel can be created with its final name (no placeholder flash). */
export function previewTitle(doc: vscode.TextDocument, locked = false): string {
  return `${locked ? '🔒 ' : ''}Preview ${fileName(doc)}`
}

function fileName(doc: vscode.TextDocument): string {
  return doc.uri.path.split('/').pop() || 'Untitled'
}
