import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { startServer, type FixtureServer } from './server'

export const EXTENSION_PATH = path.resolve(process.cwd(), 'dist/chrome')

export async function launch(
  userDataDir: string,
): Promise<{ context: BrowserContext; extensionId: string }> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 860 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
  // The welcome tab opened on install is not part of the tests. It can open
  // after launch (it raced CI tests by taking the foreground mid-test), so
  // close it whenever it appears, not only if it is already there.
  const isWelcome = (p: Page) => p.url().includes('welcome=1')
  context.on('page', p => {
    p.once('domcontentloaded', () => {
      if (isWelcome(p)) void p.close().catch(() => undefined)
    })
  })
  let [worker] = context.serviceWorkers()
  worker ??= await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  for (const p of context.pages()) if (isWelcome(p)) await p.close()
  return { context, extensionId }
}

type Fixtures = {
  userDataDir: string
  context: BrowserContext
  extensionId: string
  server: FixtureServer
  viewer: (src?: string) => Promise<Page>
  /** Automatic: on failure, reports browser errors and visible toasts/banners. */
  diagnostics: void
}

/**
 * Records every toast, banner and view switch for the page's whole life:
 * toasts vanish after a few seconds, long before a timed-out assertion.
 */
function recordUi(): void {
  const log: string[] = []
  ;(window as unknown as { __msUiLog: string[] }).__msUiLog = log
  const t0 = performance.now()
  const push = (s: string) => log.push(`+${Math.round(performance.now() - t0)}ms ${s}`)
  new MutationObserver(mutations => {
    for (const m of mutations) {
      const el = m.target instanceof Element ? m.target : null
      if (m.type === 'attributes' && el?.classList.contains('ms-panes'))
        push(`view=${el.getAttribute('data-view')}`)
      for (const n of m.addedNodes)
        if (n instanceof HTMLElement && n.matches('.ms-toast'))
          push(`toast: ${n.textContent?.trim()}`)
      const banner = el?.closest('.ms-banner')
      if (m.type === 'childList' && banner) push(`banner: ${banner.textContent?.trim()}`)
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-view'],
  })
}

/** What the browser showed, so CI logs explain failures even without artifacts. */
async function collectUi(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const log = (window as unknown as { __msUiLog?: string[] }).__msUiLog ?? []
      const focus = document.activeElement
      return [
        ...log,
        `now: view=${document.querySelector('.ms-panes')?.getAttribute('data-view')} focus=${focus?.tagName}.${focus?.className} openDialogs=${document.querySelectorAll('dialog[open]').length}`,
      ]
    })
    .catch(() => [])
}

export const test = base.extend<Fixtures>({
  userDataDir: async ({}, use) => {
    await use(mkdtempSync(path.join(tmpdir(), 'markscope-e2e-')))
  },
  context: async ({ userDataDir }, use) => {
    const { context } = await launch(userDataDir)
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    await use(new URL(worker.url()).host)
  },
  server: async ({}, use) => {
    const server = await startServer()
    await use(server)
    await server.close()
  },
  diagnostics: [
    async ({ context }, use, testInfo) => {
      const lines: string[] = []
      const watch = (page: Page) => {
        page.on('console', m => {
          if (m.type() === 'error')
            lines.push(`[console.error] ${page.url()}: ${m.text()}`)
        })
        page.on('pageerror', e => lines.push(`[pageerror] ${page.url()}: ${e.message}`))
      }
      context.pages().forEach(watch)
      context.on('page', watch)
      await context.addInitScript(recordUi)
      await use()
      if (testInfo.status === testInfo.expectedStatus) return
      for (const page of context.pages())
        for (const ui of await collectUi(page)) lines.push(`[ui] ${page.url()}: ${ui}`)
      if (lines.length === 0) return
      const body = lines.join('\n')
      await testInfo.attach('browser-diagnostics', { body, contentType: 'text/plain' })
      process.stdout.write(`\n--- browser diagnostics: ${testInfo.title} ---\n${body}\n`)
    },
    { auto: true },
  ],
  viewer: async ({ context, extensionId }, use) => {
    await use(async (src?: string) => {
      const page = await context.newPage()
      const q = src ? `?src=${encodeURIComponent(src)}` : ''
      await page.goto(`chrome-extension://${extensionId}/viewer.html${q}`)
      return page
    })
  },
})

export const expect = test.expect

/** Opens a Markdown URL like a user would and waits for the viewer redirect. */
export async function openMarkdown(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForURL(/viewer\.html/, { timeout: 15_000 })
  await page.locator('.ms-doc h1').first().waitFor()
  return page
}
