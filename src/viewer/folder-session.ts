/**
 * The folder (workspace) currently open in the viewer: loads its documents
 * and the local images they reference.
 */
import { parseWorkspaceUrl, workspaceUrl } from '@/shared/urls'
import type { LoadedDoc } from './app'
import { hasPermission } from './file-access'
import { resolveFile, scanTree, type Workspace, type WorkspaceTree } from './workspace'

/** Thrown when Chrome needs the user to re-grant access to an opened folder. */
export class FolderAccessNeededError extends Error {
  constructor(readonly workspace: Workspace) {
    super(`Markscope needs your permission to read the folder “${workspace.name}” again.`)
    this.name = 'FolderAccessNeededError'
  }
}

export class FolderSession {
  private constructor(
    readonly workspace: Workspace,
    public tree: WorkspaceTree,
  ) {}

  /** Opens a stored workspace; requires permission to already be granted. */
  static async open(workspace: Workspace): Promise<FolderSession> {
    if (!(await hasPermission(workspace.handle, 'read')))
      throw new FolderAccessNeededError(workspace)
    return new FolderSession(workspace, await scanTree(workspace.handle))
  }

  get id(): string {
    return this.workspace.id
  }

  async refresh(): Promise<void> {
    this.tree = await scanTree(this.workspace.handle)
  }

  async loadDocument(path: string): Promise<LoadedDoc> {
    const handle = await resolveFile(this.workspace.handle, path)
    const file = await handle.getFile()
    return {
      ref: { kind: 'workspace', id: this.workspace.id, path, name: this.workspace.name },
      title: file.name,
      source: await file.text(),
      sourceUrl: null,
      baseUrl: workspaceUrl(this.workspace.id, path),
      localId: null,
      handle,
      lastModified: file.lastModified,
      scratch: false,
      folder: { id: this.workspace.id, name: this.workspace.name, path },
    }
  }

  /** Loads an image inside this folder as a blob URL. */
  async loadMedia(url: string): Promise<string | null> {
    const target = parseWorkspaceUrl(url)
    if (!target || target.id !== this.workspace.id) return null
    const handle = await resolveFile(this.workspace.handle, target.path)
    return URL.createObjectURL(await handle.getFile())
  }
}

/** Reads a file:// resource through the extension's file access as a blob URL. */
export function readFileAsBlobUrl(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'blob'
    xhr.onload = () =>
      resolve(
        (xhr.status === 0 || xhr.status === 200) && xhr.response
          ? URL.createObjectURL(xhr.response as Blob)
          : null,
      )
    xhr.onerror = () => resolve(null)
    xhr.send()
  })
}
