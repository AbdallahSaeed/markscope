/** Webview entry: waits for the host's `init`, then renders whatever it sends. */
import { RenderClient } from '@/engine/render-client'
import { errorMessage } from '@/shared/errors'
import { configureKatexCss } from '@/viewer/document-view'
import { buildLayout } from '@/viewer/layout'
import { setHostTheme, themeFromVsCodeClasses } from '@/viewer/theme'
import type { HostMessage } from '../protocol'
import { createBridge } from './host-bridge'
import { installPreviewKeys } from './keys'
import { PreviewApp } from './preview-app'

/** The worker bundle is one self-contained file; run it from a blob (the CSP allows only `blob:` workers). */
async function workerBlobUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    return URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }))
  } catch {
    return null // RenderClient then renders on the main thread
  }
}

/** VS Code marks the body with vscode-light / vscode-dark / vscode-high-contrast[-light]. */
function readHostTheme(): void {
  const { theme, highContrast } = themeFromVsCodeClasses(document.body.classList)
  setHostTheme(theme)
  document.documentElement.dataset.contrast = highContrast ? 'high' : ''
}

async function main(): Promise<void> {
  const bridge = createBridge()
  const mount = document.getElementById('ms-root') ?? document.body
  const layout = buildLayout(mount, {
    hide: ['home', 'favorite', 'save', 'modes', 'palette', 'theme', 'more'],
  })
  readHostTheme()

  let app: PreviewApp | null = null
  // Messages are handled one at a time: `init` is async and `document` follows it.
  let queue: Promise<void> = Promise.resolve()

  const handle = async (message: HostMessage): Promise<void> => {
    if (message.type === 'init') {
      if (app) return app.applySettings(message.settings)
      configureKatexCss(message.assets.katexCss)
      const url = await workerBlobUrl(message.assets.worker)
      app = new PreviewApp({
        layout,
        bridge,
        renderer: new RenderClient(url),
        settings: message.settings,
        documentCssUrl: message.assets.documentCss,
      })
      installPreviewKeys({
        find: () => app?.run('find'),
        toggleSidebar: () => app?.toggleSidebar(),
        focusMode: () => app?.toggleFocus(),
        exitFocus: () => app?.toggleFocus(false),
        jumpHeading: delta => app?.jumpHeading(delta),
        isBlocked: () => app?.searchOpen ?? false,
      })
      new MutationObserver(() => {
        readHostTheme()
        app?.refreshTheme()
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] })
      return
    }
    if (!app) return
    switch (message.type) {
      case 'document':
        return app.setDocument(
          {
            uri: message.uri,
            version: message.version,
            text: message.text,
            fileName: message.fileName,
            baseUri: message.baseUri,
          },
          message.hash,
        )
      case 'settings':
        return app.applySettings(message.settings)
      case 'lock':
        return app.setLocked(message.locked)
      case 'scrollToLine':
        return app.scrollToLine(message.line)
      case 'cursorLine':
        return app.cursorLine(message.line)
      case 'media':
        return app.settleMedia(message.requestId, message.url)
      case 'command':
        return app.run(message.name)
      case 'banner':
        return app.banner(message.message)
      case 'ai.event':
        return // AI arrives in a later release
    }
  }

  // Typing floods `document` messages; only the newest one is worth rendering.
  let pendingDocument: HostMessage | null = null
  bridge.onMessage(message => {
    if (message.type === 'document') {
      const queued = pendingDocument !== null
      pendingDocument = message
      if (queued) return
      queue = queue
        .then(() => {
          const latest = pendingDocument
          pendingDocument = null
          return latest ? handle(latest) : undefined
        })
        .catch(error => app?.banner(errorMessage(error)))
      return
    }
    queue = queue
      .then(() => handle(message))
      .catch(error => app?.banner(errorMessage(error)))
  })
  bridge.post({ type: 'ready' })
}

main().catch(error => {
  document.body.textContent = `Markscope failed to start: ${errorMessage(error)}`
})
