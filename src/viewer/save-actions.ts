/**
 * Save / Save as for the current document. Writes go to a File System
 * Access handle; documents without one (web, file://, scratch) go through
 * "Save as", after which saves go to the chosen file.
 */
import { errorMessage } from '@/shared/errors'
import { buildViewerUrl, describeSource, isRemoteUrl } from '@/shared/urls'
import type { DocumentRef } from '@/storage/library-store'
import type { ViewerApp } from './app'
import { exportMarkdown } from './export'
import {
  canWrite,
  ensurePermission,
  pickSaveTarget,
  suggestedFileName,
  supportsSavePicker,
  writeText,
} from './file-access'
import { localDocs } from './local-docs'
import { toast } from './toast'

/**
 * Edits reach `doc.source` through a debounce; a save pressed right after
 * typing must include the latest keystrokes.
 */
function commitEditor(app: ViewerApp): void {
  if (!app.doc) return
  const text = app.layout.editor.value
  if (text === app.doc.source) return
  app.doc = { ...app.doc, source: text }
  if (!app.doc.scratch) app.modified = true
  void app.render({ preserveScroll: true })
}

export async function saveDocument(app: ViewerApp): Promise<void> {
  commitEditor(app)
  const doc = app.doc
  if (!doc) return
  try {
    if (doc.scratch && !doc.handle) {
      await app.flushScratch()
      toast(
        'Scratch documents save automatically in this browser. Use Save as… to create a file.',
      )
      return
    }
    if (!doc.handle || !canWrite(doc.handle)) return await saveDocumentAs(app)
    if (!(await ensurePermission(doc.handle, 'readwrite'))) {
      toast('Saving needs permission to edit the file.', 'error')
      return
    }
    await writeTo(app, doc.handle)
    toast(`Saved to ${doc.handle.name}`)
  } catch (error) {
    toast(`Could not save: ${errorMessage(error)}`, 'error')
  }
}

export async function saveDocumentAs(app: ViewerApp): Promise<void> {
  commitEditor(app)
  const doc = app.doc
  if (!doc) return
  try {
    if (!supportsSavePicker()) {
      exportMarkdown(doc.source, doc.title)
      toast('Downloaded a copy (this browser cannot save directly to files).')
      return
    }
    const original = doc.sourceUrl ? describeSource(doc.sourceUrl) : null
    const currentName =
      doc.ref?.kind === 'local'
        ? doc.ref.name
        : doc.folder
          ? doc.folder.path.split('/').pop()
          : original?.name
    const handle = await pickSaveTarget(suggestedFileName(currentName ?? doc.title))
    if (!handle) return
    const baseUrl = doc.sourceUrl ?? doc.baseUrl ?? null
    const stored = await localDocs.create({
      name: handle.name,
      text: doc.source,
      handle,
      ...(baseUrl && !baseUrl.startsWith('workspace:') ? { baseUrl } : {}),
    })
    const ref: DocumentRef = { kind: 'local', id: stored.id, name: handle.name }
    const { folder: _leftFolder, ...rest } = doc
    app.doc = {
      ...rest,
      ref,
      sourceUrl: null,
      baseUrl,
      localId: stored.id,
      handle,
      scratch: false,
    }
    await writeTo(app, handle)
    history.replaceState(
      null,
      '',
      buildViewerUrl(app.deps.viewerBase, { doc: stored.id }, location.hash),
    )
    void app.deps.library.visit(ref, app.doc.title)
    toast(
      original && isRemoteUrl(doc.sourceUrl ?? '')
        ? `Saved to ${handle.name}. The original on ${original.host} is unchanged.`
        : `Saved to ${handle.name}`,
    )
  } catch (error) {
    toast(`Could not save: ${errorMessage(error)}`, 'error')
  }
}

async function writeTo(app: ViewerApp, handle: FileSystemFileHandle): Promise<void> {
  const text = app.doc?.source ?? ''
  await writeText(handle, text)
  // Record our own write so live reload doesn't treat it as a change.
  const lastModified =
    (await handle.getFile().catch(() => null))?.lastModified ?? Date.now()
  if (app.doc) app.doc = { ...app.doc, lastModified }
  if (app.doc?.localId) {
    const stored = await localDocs.get(app.doc.localId)
    if (stored)
      await localDocs.put({ ...stored, text, lastModified, updatedAt: Date.now() })
  }
  app.markSaved()
}
