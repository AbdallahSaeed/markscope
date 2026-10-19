/**
 * Runs inside a real VS Code (see .vscode-test.mjs). The webview can't be
 * inspected from here, so these tests observe it through effects the host
 * sees: the doctor's diagnostics only appear after the webview booted under
 * the real CSP, rendered the document and posted the result back.
 */
import * as assert from 'node:assert'
import * as vscode from 'vscode'

const folder = () => vscode.workspace.workspaceFolders![0]!.uri
const fixture = (name: string) => vscode.Uri.joinPath(folder(), name)

async function waitFor<T>(
  what: string,
  probe: () => T | undefined | false,
  ms = 45_000,
): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise(r => setTimeout(r, 100))
  }
}

const previewTabs = () =>
  vscode.window.tabGroups.all
    .flatMap(g => [...g.tabs])
    .filter(
      t =>
        t.input instanceof vscode.TabInputWebview &&
        t.input.viewType.includes('markscope.preview'),
    )

const problems = (uri: vscode.Uri) =>
  vscode.languages.getDiagnostics(uri).filter(d => d.source === 'Markscope')

async function openEditor(name: string): Promise<vscode.TextEditor> {
  return vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(fixture(name)),
    {
      preview: false,
    },
  )
}

async function replaceText(
  editor: vscode.TextEditor,
  from: string,
  to: string,
): Promise<void> {
  const text = editor.document.getText()
  const start = editor.document.positionAt(text.indexOf(from))
  const end = editor.document.positionAt(text.indexOf(from) + from.length)
  await editor.edit(b => b.replace(new vscode.Range(start, end), to))
}

describe('Markscope preview', () => {
  afterEach(async () => {
    await vscode.workspace
      .getConfiguration('markscope')
      .update('doctor.enabled', undefined, true)
    await vscode.commands
      .executeCommand('workbench.action.revertAndCloseActiveEditor')
      .then(
        () => undefined,
        () => undefined,
      )
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await waitFor('previews to close', () => previewTabs().length === 0)
  })

  it('contributes and registers every command', async () => {
    const pkg = vscode.extensions.all.find(e => e.id.endsWith('.markscope'))
    assert.ok(pkg, 'extension is installed')
    // Commands exist only once the extension has activated (VS Code does that on first use).
    await pkg.activate()
    const declared = (pkg.packageJSON.contributes.commands as { command: string }[]).map(
      c => c.command,
    )
    const registered = await vscode.commands.getCommands(true)
    for (const id of declared) assert.ok(registered.includes(id), `${id} is registered`)
  })

  it('opens beside the editor and reports doctor problems on the right line', async () => {
    const editor = await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    const tab = await waitFor('the preview tab', () => previewTabs()[0])
    assert.strictEqual(tab.label, 'Preview broken.md')

    const issue = await waitFor('the broken-anchor problem', () =>
      problems(editor.document.uri).find(d => d.code === 'broken-anchor'),
    )
    assert.strictEqual(issue.range.start.line, 2, 'issue is on line 3 (0-based 2)')
    assert.strictEqual(issue.source, 'Markscope')
  })

  it('updates as the document changes', async () => {
    const editor = await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    await waitFor('the problem', () => problems(editor.document.uri).length > 0)
    await replaceText(editor, '#missing', '#title')
    await waitFor(
      'the problem to clear',
      () => problems(editor.document.uri).length === 0,
    )
    await replaceText(editor, '#title', '#gone')
    await waitFor('the problem to return', () => problems(editor.document.uri).length > 0)
  })

  it('follows the active Markdown editor unless locked, and ignores other files', async () => {
    await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    await waitFor('the preview', () => previewTabs()[0])

    await openEditor('other.md')
    await waitFor(
      'the preview to follow',
      () => previewTabs()[0]?.label === 'Preview other.md',
    )

    await openEditor('notes.txt')
    await new Promise(r => setTimeout(r, 500))
    assert.strictEqual(
      previewTabs()[0]?.label,
      'Preview other.md',
      'plain text is not previewed',
    )

    await vscode.commands.executeCommand('markscope.toggleLock')
    await waitFor('the lock', () => previewTabs()[0]?.label === '🔒 Preview other.md')
    await openEditor('broken.md')
    await new Promise(r => setTimeout(r, 500))
    assert.strictEqual(
      previewTabs()[0]?.label,
      '🔒 Preview other.md',
      'a locked preview stays put',
    )
  })

  it('keeps following the file after its editor was closed and reopened', async () => {
    const editor = await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    await waitFor('the problem', () => problems(editor.document.uri).length > 0)
    // Closing the editor disposes the TextDocument; reopening makes a new object.
    const textTab = vscode.window.tabGroups.all
      .flatMap(g => [...g.tabs])
      .find(
        t =>
          t.input instanceof vscode.TabInputText &&
          t.input.uri.toString() === editor.document.uri.toString(),
      )
    assert.ok(textTab, 'the text editor tab exists')
    await vscode.window.tabGroups.close(textTab)
    // VS Code may dispose the document now or much later; either way the preview must keep following the file.
    // Beside the preview: in the preview's own group the tab would hide it, and a hidden webview is not running.
    const again = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(fixture('broken.md')),
      { preview: false, viewColumn: vscode.ViewColumn.Beside },
    )
    assert.strictEqual(previewTabs().length, 1, 'no duplicate preview')
    await replaceText(again, '#missing', '#title')
    await waitFor('the problem to clear', () => problems(again.document.uri).length === 0)
  })

  it('clears its problems when the preview closes', async () => {
    const editor = await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    await waitFor('the problem', () => problems(editor.document.uri).length > 0)
    const tab = previewTabs()[0]!
    await vscode.window.tabGroups.close(tab)
    await waitFor('problems to clear', () => problems(editor.document.uri).length === 0)
  })

  it('can turn the doctor off', async () => {
    const editor = await openEditor('broken.md')
    await vscode.commands.executeCommand('markscope.openPreviewToSide')
    await waitFor('the problem', () => problems(editor.document.uri).length > 0)
    await vscode.workspace
      .getConfiguration('markscope')
      .update('doctor.enabled', false, true)
    await waitFor('problems to clear', () => problems(editor.document.uri).length === 0)
    await vscode.workspace
      .getConfiguration('markscope')
      .update('doctor.enabled', true, true)
    await waitFor('problems to return', () => problems(editor.document.uri).length > 0)
  })

  it('refuses to preview a non-Markdown file', async () => {
    await openEditor('notes.txt')
    await vscode.commands.executeCommand('markscope.openPreview')
    await new Promise(r => setTimeout(r, 500))
    assert.strictEqual(previewTabs().length, 0)
  })
})
