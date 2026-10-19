/**
 * The webview's HTML shell and its Content-Security-Policy. Pure, so the
 * policy can be unit-tested for both image modes.
 */
import { randomBytes } from 'node:crypto'

export type RemoteImages = 'allow' | 'block'

export interface HtmlOptions {
  cspSource: string
  nonce: string
  scriptUri: string
  styleUris: readonly string[]
  remoteImages: RemoteImages
}

export const makeNonce = (): string => randomBytes(16).toString('base64url')

export function buildCsp(
  opts: Pick<HtmlOptions, 'cspSource' | 'nonce' | 'remoteImages'>,
) {
  const web = opts.remoteImages === 'allow' ? ' https:' : ''
  return [
    "default-src 'none'",
    // Mermaid/Graphviz chunks load from the extension; Graphviz needs WASM compilation.
    `script-src 'nonce-${opts.nonce}' ${opts.cspSource} 'wasm-unsafe-eval'`,
    // Sanitized inline `style` attributes and Mermaid's scoped <style> need this.
    `style-src ${opts.cspSource} 'unsafe-inline'`,
    `img-src ${opts.cspSource} data: blob:${web}`,
    `media-src ${opts.cspSource} blob:${web}`,
    `font-src ${opts.cspSource}`,
    // The render worker is started from a blob of the bundled worker script.
    'worker-src blob:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    // Only to read our own bundled files (worker source, document CSS).
    `connect-src ${opts.cspSource}`,
  ].join('; ')
}

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

export function buildWebviewHtml(opts: HtmlOptions): string {
  const links = opts.styleUris
    .map(href => `<link rel="stylesheet" href="${attr(href)}">`)
    .join('\n    ')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${attr(buildCsp(opts))}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Markscope Preview</title>
    ${links}
  </head>
  <body data-mode="loading" data-host="vscode">
    <div id="ms-root"></div>
    <script type="module" nonce="${opts.nonce}" src="${attr(opts.scriptUri)}"></script>
  </body>
</html>`
}
