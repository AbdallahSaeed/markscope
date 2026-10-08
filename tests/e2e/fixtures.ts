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
  let [worker] = context.serviceWorkers()
  worker ??= await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  // The welcome tab opened on install is not part of the tests.
  for (const p of context.pages()) if (p.url().includes('welcome=1')) await p.close()
  return { context, extensionId }
}

type Fixtures = {
  userDataDir: string
  context: BrowserContext
  extensionId: string
  server: FixtureServer
  viewer: (src?: string) => Promise<Page>
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
