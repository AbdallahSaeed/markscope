/**
 * Live reload and conflict handling for the open document.
 *
 * The source (a file handle or a URL) is polled while live reload is on,
 * also while there are unsaved edits. A change on disk is applied directly
 * when there are no edits; otherwise the user chooses: keep their edits,
 * load the disk version (with Undo), or compare and merge.
 */
import { errorMessage, PermissionNeededError } from '@/shared/errors'
import { describeSource, isRemoteUrl } from '@/shared/urls'
import type { LoadedDoc, ViewerApp } from './app'
import { ensurePermission, FileAccessNeededError, readIfPermitted } from './file-access'
import { hideBanner, showBanner } from './layout'
import { localDocs } from './local-docs'
import { compareVersions } from './merge-dialog'
import { defaultLoaderDeps, loadSource, type Validators } from './source-loader'
import { toast } from './toast'
import { Watcher } from './watcher'

/** A version of the document read from its source. */
export interface DiskVersion {
  text: string
  /** Set for files (File System Access); absent for URLs. */
  lastModified?: number
}

/** Same version of the source: by modification time for files, by text for URLs. */
export function sameVersion(a: DiskVersion, b: DiskVersion): boolean {
  return a.lastModified !== undefined || b.lastModified !== undefined
    ? a.lastModified === b.lastModified
    : a.text === b.text
}

/** Remote URLs are polled at most this often, whatever the setting. */
const REMOTE_MIN_INTERVAL_MS = 2000

export function documentName(doc: LoadedDoc): string {
  if (doc.handle) return doc.handle.name
  if (doc.folder) return doc.folder.path.split('/').pop() ?? doc.folder.path
  if (doc.sourceUrl) return describeSource(doc.sourceUrl).name
  return doc.title
}

export class LiveReload {
  private watcher: Watcher | null = null
  private interval = 0
  private validators: Validators | null = null
  /** An error banner from polling is showing; a successful poll clears it. */
  private errorShown = false
  /**
   * The disk version the conflict banner is asking about. Later polls see the
   * same version and must not rebuild the banner (focus, clicks, screen readers).
   */
  private conflict: DiskVersion | null = null

  constructor(private readonly app: ViewerApp) {}

  get active(): boolean {
    return !!this.watcher?.active
  }

  /** A different document was opened. */
  reset(): void {
    this.validators = null
    this.errorShown = false
    this.conflict = null
  }

  /** Starts, retunes or stops polling for the current document and settings. */
  configure(): void {
    const { doc, settings } = this.app
    const want = !!doc && settings.liveReload.enabled && !!(doc.sourceUrl || doc.handle)
    if (!want) {
      this.stop()
      this.app.updateStatus()
      return
    }
    const intervalMs =
      doc.sourceUrl && isRemoteUrl(doc.sourceUrl)
        ? Math.max(settings.liveReload.intervalMs, REMOTE_MIN_INTERVAL_MS)
        : settings.liveReload.intervalMs
    if (this.watcher?.active && this.interval === intervalMs) return
    this.watcher?.stop()
    this.interval = intervalMs
    this.watcher = new Watcher({
      intervalMs,
      check: () => this.check(),
      onError: error => this.onLoadError(error),
    })
    this.watcher.start()
    this.app.updateStatus()
  }

  private stop(): void {
    this.watcher?.stop()
    this.watcher = null
  }

  private async check(): Promise<void> {
    const doc = this.app.doc
    if (!doc) return
    // A document switch during the awaits below wins over the poll.
    const stillCurrent = () =>
      this.app.doc?.localId === doc.localId && this.app.doc?.sourceUrl === doc.sourceUrl
    const disk = await this.readChanged(doc)
    if (this.errorShown) {
      this.errorShown = false
      hideBanner(this.app.layout)
    }
    if (disk && stillCurrent()) await this.receive(disk)
  }

  /** The source's current version, or null when it hasn't changed since we last looked. */
  private async readChanged(doc: LoadedDoc): Promise<DiskVersion | null> {
    if (doc.handle) {
      const file = await readIfPermitted(doc.handle)
      if (file.lastModified === doc.lastModified) return null
      return { text: await file.text(), lastModified: file.lastModified }
    }
    if (!doc.sourceUrl) return null
    const res = await loadSource(doc.sourceUrl, this.validators, defaultLoaderDeps())
    this.validators = res.validators
    return res.changed ? { text: res.text } : null
  }

  /**
   * A new version arrived from the source: apply it, or ask when it would
   * replace unsaved edits (including text still inside the typing debounce).
   */
  async receive(disk: DiskVersion): Promise<void> {
    const { app } = this
    if (!app.doc) return
    const current = app.editor.value
    // Decide before adoptBaseline moves savedSource.
    const edited = app.hasUnsavedEdits()
    if (disk.text === current) {
      // Same text (a touch, or someone saved what we have): just catch up.
      this.adoptBaseline(disk)
      if (edited) {
        app.editor.cancelPending()
        app.doc = { ...app.doc, source: current }
        app.markSaved()
      }
      return
    }
    if (disk.text === app.savedSource) {
      this.adoptBaseline(disk)
      return
    }
    if (!edited) await this.applyExternalChange(disk)
    else if (!this.conflict || !sameVersion(this.conflict, disk)) this.showConflict(disk)
  }

  /** The disk version becomes the base the edits are compared and saved against. */
  private adoptBaseline(disk: DiskVersion): void {
    const { app } = this
    if (!app.doc) return
    this.conflict = null
    app.savedSource = disk.text
    if (disk.lastModified !== undefined)
      app.doc = { ...app.doc, lastModified: disk.lastModified }
  }

  /**
   * Asks how to resolve a disk change that conflicts with unsaved edits.
   * `saving`: raised by Save, so "keep mine" means "overwrite now".
   */
  showConflict(disk: DiskVersion, opts: { saving?: boolean } = {}): void {
    const { app } = this
    if (!app.doc) return
    this.conflict = disk
    const name = documentName(app.doc)
    showBanner(
      app.layout,
      opts.saving
        ? `${name} changed on disk since you opened it. Saving now would overwrite that change.`
        : `${name} changed on disk while you were editing.`,
      [
        {
          label: opts.saving ? 'Overwrite' : 'Keep mine',
          run: () => {
            this.adoptBaseline(disk)
            hideBanner(app.layout)
            if (opts.saving) void app.save()
          },
        },
        { label: 'Load theirs', run: () => void this.loadTheirs(disk) },
        { label: 'Compare…', run: () => void this.compare(disk) },
      ],
      'warn',
    )
  }

  private async loadTheirs(disk: DiskVersion): Promise<void> {
    const { app } = this
    app.editor.cancelPending()
    const edits = app.editor.value
    app.modified = false
    await this.applyExternalChange(disk)
    app.updateHeader()
    app.syncDraft()
    this.configure()
    showBanner(app.layout, 'Loaded the version from disk. Your edits were replaced.', {
      label: 'Undo',
      run: () => void app.applyText(edits),
    })
  }

  private async compare(disk: DiskVersion): Promise<void> {
    const { app } = this
    if (!app.doc) return
    app.editor.cancelPending()
    try {
      const merged = await compareVersions({
        title: `Compare ${documentName(app.doc)} with the version on disk`,
        disk: disk.text,
        mine: app.editor.value,
      })
      if (merged === null) return
      this.adoptBaseline(disk)
      hideBanner(app.layout)
      await app.applyText(merged)
    } catch (error) {
      toast(`Could not compare: ${errorMessage(error)}`, 'error')
    }
  }

  /** Replaces the document with the source's version (no unsaved edits). */
  async applyExternalChange(disk: DiskVersion): Promise<void> {
    const { app } = this
    if (!app.doc) return
    this.conflict = null
    const { text, lastModified } = disk
    app.savedSource = text
    app.doc = {
      ...app.doc,
      source: text,
      ...(lastModified !== undefined ? { lastModified } : {}),
    }
    app.editor.setValue(text)
    if (app.doc.localId && !app.doc.scratch) {
      const stored = await localDocs.get(app.doc.localId)
      if (stored)
        await localDocs.put({
          ...stored,
          text,
          updatedAt: Date.now(),
          ...(lastModified !== undefined ? { lastModified } : {}),
        })
    }
    await app.render({ preserveScroll: true })
  }

  async reload(): Promise<void> {
    const { app } = this
    const doc = app.doc
    if (!doc) return
    if (
      app.hasUnsavedEdits() &&
      !confirm('Discard your edits and reload the original document?')
    )
      return
    try {
      if (doc.handle) {
        if (!(await ensurePermission(doc.handle, 'read')))
          throw new FileAccessNeededError(doc.handle.name)
        const file = await doc.handle.getFile()
        app.modified = false
        await this.applyExternalChange({
          text: await file.text(),
          lastModified: file.lastModified,
        })
      } else if (doc.sourceUrl) {
        const res = await loadSource(doc.sourceUrl, null, defaultLoaderDeps())
        this.validators = res.validators
        app.modified = false
        if (res.changed) await this.applyExternalChange({ text: res.text })
      } else {
        toast('This document has no source to reload from.')
        return
      }
      hideBanner(app.layout)
      app.updateHeader()
      app.syncDraft()
      this.configure()
      toast('Reloaded')
    } catch (error) {
      this.onLoadError(error)
    }
  }

  onLoadError(error: unknown): void {
    const { layout } = this.app
    if (error instanceof FileAccessNeededError) {
      // Permission can only be re-granted from a click, so ask once and pause.
      this.stop()
      showBanner(
        layout,
        `Live reload paused: Chrome needs your permission to read ${error.fileName} again.`,
        { label: 'Reconnect', run: () => void this.reconnectFile() },
        'warn',
      )
      return
    }
    if (error instanceof PermissionNeededError) {
      showBanner(
        layout,
        `Reloading needs access to ${error.origin.replace('/*', '')}.`,
        {
          label: 'Grant access',
          run: () =>
            void chrome.permissions.request({ origins: [error.origin] }).then(ok => {
              if (ok) void this.reload()
            }),
        },
        'warn',
      )
      this.stop()
      return
    }
    this.errorShown = true
    showBanner(
      layout,
      errorMessage(error),
      { label: 'Retry', run: () => void this.reload() },
      'error',
    )
  }

  /** Click handler for the Reconnect banner (a user gesture). */
  private async reconnectFile(): Promise<void> {
    const { app } = this
    const doc = app.doc
    if (!doc?.handle) return
    if (!(await ensurePermission(doc.handle, 'read'))) {
      toast('Permission was not granted. Use Reload (R) to try again.', 'error')
      return
    }
    hideBanner(app.layout)
    try {
      const file = await doc.handle.getFile()
      if (file.lastModified !== doc.lastModified)
        await this.receive({
          text: await file.text(),
          lastModified: file.lastModified,
        })
      this.configure()
      toast(`Reconnected to ${doc.handle.name}`)
    } catch (error) {
      this.onLoadError(error)
    }
  }
}
