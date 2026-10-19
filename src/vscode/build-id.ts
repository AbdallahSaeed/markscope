/**
 * Identifies one build of the extension. The host and the webview are compiled
 * together, so they carry the same id. If VS Code keeps running an older host
 * after the extension was replaced on disk (the webview always loads fresh
 * files), the ids differ and the preview says so instead of silently ignoring
 * what the new toolbar asks for.
 */
export const BUILD_ID: string =
  typeof __MARKSCOPE_BUILD__ === 'string' ? __MARKSCOPE_BUILD__ : 'dev'

/** An empty or different id means the other side is from another build. */
export const sameBuild = (other: string | undefined): boolean => other === BUILD_ID
