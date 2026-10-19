/**
 * Symlink-safe confinement for `file:` documents: a path that looks inside
 * the folder root but resolves (through a symlink) outside it is refused.
 */
import { realpath } from 'node:fs/promises'
import path from 'node:path'

const caseInsensitive = process.platform === 'win32'
const fold = (p: string) => (caseInsensitive ? p.toLowerCase() : p)

/** True when `target` exists and its real path is `root` or below it. */
export async function isRealPathInside(root: string, target: string): Promise<boolean> {
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
    const rel = path.relative(fold(realRoot), fold(realTarget))
    return (
      rel !== '' &&
      rel !== '..' &&
      !rel.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(rel)
    )
  } catch {
    return false
  }
}
