/** Tracks every preview panel: commands, follow/lock, editor events and restore after reload. */
import * as vscode from 'vscode'
import { MARKDOWN_EXTENSIONS } from '@/shared/urls'
import { readPreviewOptions } from './config'
import { DiagnosticsSink } from './diagnostics'
import { isMarkdownFileName } from './link-policy'
import {
  panelOptions,
  PREVIEW_VIEW_TYPE,
  PreviewPanel,
  type PanelHost,
} from './preview-panel'

const isMarkdownDocument = (doc: vscode.TextDocument): boolean =>
  doc.languageId === 'markdown' ||
  (MARKDOWN_EXTENSIONS as readonly string[]).some(ext =>
    doc.uri.path.toLowerCase().endsWith(`.${ext}`),
  )

interface SavedState {
  uri: string | null
  locked: boolean
}

function parseState(state: unknown): SavedState | null {
  if (typeof state !== 'object' || state === null) return null
  const { uri, locked } = state as Record<string, unknown>
  if (uri !== null && typeof uri !== 'string') return null
  return { uri, locked: locked === true }
}

export class PreviewManager implements PanelHost, vscode.WebviewPanelSerializer {
  readonly diagnostics = new DiagnosticsSink()
  private readonly panels = new Set<PreviewPanel>()
  private lastActive: PreviewPanel | undefined

  constructor(readonly extensionUri: vscode.Uri) {}

  // --------------------------------------------------------------- PanelHost

  panelClosed(panel: PreviewPanel): void {
    this.panels.delete(panel)
    if (this.lastActive === panel) this.lastActive = undefined
  }

  isShownElsewhere(doc: vscode.TextDocument, except: PreviewPanel): boolean {
    return [...this.panels].some(p => p !== except && p.document === doc)
  }

  // ------------------------------------------------------------------ panels

  private track(panel: PreviewPanel): PreviewPanel {
    this.panels.add(panel)
    this.lastActive = panel
    panel.panel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) this.lastActive = panel
    })
    return panel
  }

  private activePanel(): PreviewPanel | undefined {
    return [...this.panels].find(p => p.panel.active) ?? this.lastActive
  }

  async open(
    doc: vscode.TextDocument,
    column: vscode.ViewColumn,
    hash = '',
  ): Promise<void> {
    const beside = column === vscode.ViewColumn.Beside
    const existing = [...this.panels].find(p => p.document === doc)
    if (existing) {
      existing.panel.reveal(beside ? column : undefined, beside)
      return
    }
    const reusable = beside ? undefined : this.activePanel()
    if (reusable && !reusable.isLocked) {
      reusable.panel.reveal(undefined, false)
      await reusable.show(doc, hash)
      return
    }
    const panel = vscode.window.createWebviewPanel(
      PREVIEW_VIEW_TYPE,
      'Preview',
      { viewColumn: column, preserveFocus: beside },
      { ...panelOptions(this.extensionUri, doc), retainContextWhenHidden: false },
    )
    await this.track(new PreviewPanel(panel, this)).show(doc, hash)
  }

  /** VS Code restores panels after a reload, with the state the webview saved. */
  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: unknown,
  ): Promise<void> {
    const preview = this.track(new PreviewPanel(panel, this, parseState(state)?.locked))
    const saved = parseState(state)
    if (!saved?.uri) return
    try {
      const uri = vscode.Uri.parse(saved.uri, true)
      if (!isMarkdownFileName(uri.path)) return // persisted state is not trusted blindly
      await preview.show(await vscode.workspace.openTextDocument(uri))
    } catch {
      preview.banner('The previewed file could not be reopened.')
    }
  }

  // ------------------------------------------------------------------ events

  register(): vscode.Disposable[] {
    const w = vscode.workspace
    const win = vscode.window
    const showing = (doc: vscode.TextDocument) =>
      [...this.panels].filter(p => p.document === doc)
    return [
      this.diagnostics,
      win.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, this),
      w.onDidChangeTextDocument(e => {
        if (e.contentChanges.length === 0) return
        for (const p of showing(e.document))
          if (readPreviewOptions(e.document.uri).updateOn === 'change') p.scheduleUpdate()
      }),
      w.onDidSaveTextDocument(doc => {
        for (const p of showing(doc)) p.refreshNow()
      }),
      win.onDidChangeActiveTextEditor(editor => {
        const doc = editor?.document
        if (!doc || !isMarkdownDocument(doc)) return
        for (const p of this.panels)
          if (
            !p.isLocked &&
            p.document !== doc &&
            readPreviewOptions(doc.uri).followActiveEditor
          )
            void p.show(doc)
      }),
      win.onDidChangeTextEditorVisibleRanges(e => {
        const first = e.visibleRanges[0]
        if (!first) return
        for (const p of showing(e.textEditor.document))
          if (readPreviewOptions(e.textEditor.document.uri).scrollPreviewWithEditor)
            p.syncScroll(first.start.line + 1)
      }),
      win.onDidChangeTextEditorSelection(e => {
        for (const p of showing(e.textEditor.document))
          p.syncCursor((e.selections[0]?.active.line ?? 0) + 1)
      }),
      w.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration('markscope')) return
        for (const p of this.panels) p.refreshConfig()
      }),
      w.onDidDeleteFiles(e => {
        for (const p of this.panels)
          if (
            p.document &&
            e.files.some(f => f.toString() === p.document?.uri.toString())
          )
            p.banner('This file was deleted.')
      }),
      ...this.registerCommands(),
    ]
  }

  private registerCommands(): vscode.Disposable[] {
    const cmd = vscode.commands.registerCommand
    const targetDocument = async (uri?: vscode.Uri) =>
      uri
        ? vscode.workspace.openTextDocument(uri)
        : vscode.window.activeTextEditor?.document
    const openFor = (column: vscode.ViewColumn) => async (uri?: vscode.Uri) => {
      const doc = await targetDocument(uri)
      if (!doc || !isMarkdownDocument(doc)) {
        void vscode.window.showInformationMessage('Open a Markdown file to preview it.')
        return
      }
      await this.open(doc, column)
    }
    const forActive = (fn: (p: PreviewPanel) => void) => () => {
      const panel = this.activePanel()
      if (panel) fn(panel)
    }
    return [
      cmd('markscope.openPreview', openFor(vscode.ViewColumn.Active)),
      cmd('markscope.openPreviewToSide', openFor(vscode.ViewColumn.Beside)),
      cmd(
        'markscope.toggleLock',
        forActive(p => p.setLocked(!p.isLocked)),
      ),
      cmd(
        'markscope.find',
        forActive(p => p.sendCommand('find')),
      ),
      cmd(
        'markscope.toggleSidebar',
        forActive(p => p.sendCommand('toggleSidebar')),
      ),
      cmd(
        'markscope.focusMode',
        forActive(p => p.sendCommand('focusMode')),
      ),
      cmd(
        'markscope.runDoctor',
        forActive(p => p.sendCommand('runDoctor')),
      ),
    ]
  }
}
