/**
 * A stand-in for the VS Code extension host: serves dist/vscode/webview and
 * the webview HTML (built by the real buildWebviewHtml, so the real CSP applies),
 * and drives the page through window messages like VS Code does.
 */
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { defaultSettings, type Settings } from '../../../src/shared/settings'
import { buildWebviewHtml } from '../../../src/vscode/extension/html'

const root = path.resolve(process.cwd(), 'dist/vscode/webview')
const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}
// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export interface FakeHost {
  origin: string
  close(): Promise<void>
}

export async function startFakeHost(): Promise<FakeHost> {
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/index.html') {
      const origin = `http://${req.headers.host}`
      const html = buildWebviewHtml({
        cspSource: origin,
        nonce: 'testnonce123',
        scriptUri: `${origin}/webview/js/preview.js`,
        styleUris: ['document', 'viewer', 'vscode'].map(
          n => `${origin}/webview/css/${n}.css`,
        ),
        remoteImages: url.searchParams.get('remote') === 'block' ? 'block' : 'allow',
      })
      res.writeHead(200, { 'content-type': 'text/html' }).end(html)
      return
    }
    if (url.pathname === '/media/pixel.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
      return
    }
    if (url.pathname.startsWith('/webview/')) {
      const file = path.join(root, url.pathname.slice('/webview/'.length))
      if (!file.startsWith(root)) return void res.writeHead(403).end()
      try {
        res
          .writeHead(200, {
            'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
          })
          .end(await readFile(file))
      } catch {
        res.writeHead(404).end()
      }
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

type Theme =
  'vscode-dark' | 'vscode-light' | 'vscode-high-contrast' | 'vscode-high-contrast-light'

export interface Posted {
  v: number
  type: string
  [key: string]: unknown
}

/** Opens the webview with a fake `acquireVsCodeApi` that records what it posts. */
export async function openWebview(
  page: Page,
  host: FakeHost,
  opts: { theme?: Theme; remote?: 'allow' | 'block' } = {},
): Promise<void> {
  const theme = opts.theme ?? 'vscode-light'
  await page.addInitScript(theme => {
    const w = window as unknown as Record<string, unknown>
    w.__posted = []
    w.__state = null
    w.__workers = 0
    w.acquireVsCodeApi = () => ({
      postMessage: (m: unknown) => (w.__posted as unknown[]).push(m),
      getState: () => w.__state,
      setState: (s: unknown) => (w.__state = s),
    })
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        w.__workers = (w.__workers as number) + 1
      }
    }
    document.addEventListener('DOMContentLoaded', () =>
      document.body.classList.add(theme),
    )
  }, theme)
  await page.goto(`${host.origin}/index.html?remote=${opts.remote ?? 'allow'}`)
  await page.waitForFunction(() =>
    ((window as unknown as { __posted: Posted[] }).__posted ?? []).some(
      m => m.type === 'ready',
    ),
  )
}

export const posted = (page: Page): Promise<Posted[]> =>
  page.evaluate(() => (window as unknown as { __posted: Posted[] }).__posted)

export const send = (page: Page, message: Record<string, unknown>) =>
  page.evaluate(m => window.postMessage({ v: 1, ...m }, '*'), message)

export function sendInit(
  page: Page,
  host: FakeHost,
  settings: Settings = defaultSettings(),
) {
  return send(page, {
    type: 'init',
    settings,
    aiAvailable: false,
    assets: {
      worker: `${host.origin}/webview/js/render-worker.js`,
      documentCss: `${host.origin}/webview/css/document.css`,
      katexCss: `${host.origin}/webview/vendor/katex/katex.min.css`,
    },
  })
}

export function sendDocument(
  page: Page,
  text: string,
  extra: { baseUri?: string | null; hash?: string; version?: number; uri?: string } = {},
) {
  return send(page, {
    type: 'document',
    uri: extra.uri ?? 'file:///w/docs/readme.md',
    version: extra.version ?? 1,
    text,
    fileName: 'readme.md',
    baseUri:
      extra.baseUri === undefined
        ? 'workspace://vscodedoc/docs/readme.md'
        : extra.baseUri,
    hash: extra.hash ?? '',
  })
}
