/**
 * Generates store screenshots (1280×800) and the 440×280 promo tile from the
 * built extension using Playwright's Chromium.
 *   npm run build && node scripts/screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const ext = path.join(root, 'dist/chrome')
const out = path.join(root, 'docs/store/screenshots')
await mkdir(out, { recursive: true })

const context = await chromium.launchPersistentContext(
  await mkdtemp(path.join(tmpdir(), 'ms-shots-')),
  {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  },
)
let [worker] = context.serviceWorkers()
worker ??= await context.waitForEvent('serviceworker')
const id = new URL(worker.url()).host
const base = `chrome-extension://${id}`

async function tour(theme) {
  const page = await context.newPage()
  await page.goto(`${base}/viewer.html`)
  await page.evaluate(t => chrome.storage.sync.set({ settings: { theme: t } }), theme)
  await page.goto(`${base}/viewer.html?tour=1`)
  await page.locator('.ms-doc h1').waitFor()
  await page.waitForTimeout(600)
  return page
}

const light = await tour('light')
await light.screenshot({ path: path.join(out, '1-reader-light.png') })
await light.locator('#diagrams').scrollIntoViewIfNeeded()
await light.evaluate(() => window.scrollBy(0, -60))
await light.waitForTimeout(2500)
await light.screenshot({ path: path.join(out, '2-diagrams.png') })
await light.keyboard.press('Control+k')
await light.keyboard.type('export')
await light.waitForTimeout(300)
await light.screenshot({ path: path.join(out, '3-command-palette.png') })
await light.keyboard.press('Escape')
await light.locator('#ms-tab-doctor').click()
await light.locator('[data-mode="split"]').click()
await light.waitForTimeout(400)
await light.screenshot({ path: path.join(out, '4-edit-and-doctor.png') })

const dark = await tour('dark')
await dark.locator('#code').scrollIntoViewIfNeeded()
await dark.waitForTimeout(400)
await dark.screenshot({ path: path.join(out, '5-code-dark.png') })

const home = await context.newPage()
await home.goto(`${base}/viewer.html`)
await home.evaluate(() => chrome.storage.sync.set({ settings: { theme: 'light' } }))
await home.reload()
await home.waitForTimeout(500)
await home.screenshot({ path: path.join(out, '6-start-page.png') })

const tile = await context.newPage()
await tile.setViewportSize({ width: 440, height: 280 })
// Blank page + inline icon: no extension scripts run on the tile.
const iconData = (await readFile(path.join(root, 'src/icons/icon-128.png'))).toString(
  'base64',
)
await tile.setContent(`<body style="margin:0;display:grid;place-items:center;height:280px;background:linear-gradient(135deg,#f6f3ec,#e8ebfb);font-family:'Iowan Old Style',Georgia,serif">
  <div style="display:flex;align-items:center;gap:18px"><img src="data:image/png;base64,${iconData}" width="96" height="96">
  <div><div style="font-size:40px;font-weight:600;color:#1c2333;letter-spacing:-.02em">Markscope</div>
  <div style="font:15px system-ui;color:#4a5165;margin-top:4px">Markdown, read like code deserves.</div></div></div></body>`)
await tile.waitForTimeout(300)
await tile.screenshot({ path: path.join(root, 'docs/store/promo-440x280.png') })

await context.close()
console.log(`screenshots written to ${path.relative(root, out)}`)
