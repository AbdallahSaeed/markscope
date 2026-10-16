/**
 * On open: if a crash backup of unsaved edits exists for this document,
 * offer to restore it. When the document changed since the edits were
 * made, offer a compare first so neither version is lost.
 */
import { errorMessage } from '@/shared/errors'
import type { ViewerApp } from './app'
import { draftKey, draftStore, formatAgo, hashText, type DraftStore } from './drafts'
import { hideBanner, showBanner } from './layout'
import { compareVersions } from './merge-dialog'
import { toast } from './toast'

export async function offerDraftRestore(
  app: ViewerApp,
  store: Pick<DraftStore, 'get' | 'delete'> = draftStore,
): Promise<void> {
  const doc = app.doc
  const key = doc ? draftKey(doc) : null
  if (!doc || !key) return
  const draft = await store.get(key).catch(() => undefined)
  // Another document opened meanwhile, or the user already started editing.
  const current = app.doc ? draftKey(app.doc) : null
  if (!draft || current !== key || app.modified) return
  if (draft.text === doc.source) {
    await store.delete(key).catch(() => undefined)
    return
  }
  const changed = draft.baseHash !== hashText(doc.source)
  const when = formatAgo(draft.updatedAt)
  const restore = async (text: string) => {
    hideBanner(app.layout)
    await app.applyText(text)
  }
  const compare = async () => {
    try {
      const merged = await compareVersions({
        title: 'Restore unsaved edits',
        disk: doc.source,
        mine: draft.text,
        confirm: 'Restore this version',
      })
      if (merged !== null) await restore(merged)
    } catch (error) {
      toast(`Could not compare: ${errorMessage(error)}`, 'error')
    }
  }
  const discard = () => {
    hideBanner(app.layout)
    void store.delete(key).catch(() => undefined)
  }
  showBanner(
    app.layout,
    changed
      ? `Unsaved edits from ${when} were found, but the document has changed since then.`
      : `Unsaved edits from ${when} were found for this document.`,
    [
      changed
        ? { label: 'Compare…', run: () => void compare() }
        : { label: 'Restore', run: () => void restore(draft.text) },
      ...(changed
        ? [{ label: 'Restore anyway', run: () => void restore(draft.text) }]
        : []),
      { label: 'Discard them', run: discard },
    ],
    changed ? 'warn' : 'info',
  )
}
