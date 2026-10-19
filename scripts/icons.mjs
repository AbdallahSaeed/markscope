/**
 * Rasterizes src/icons/logo.svg to the PNG sizes the manifest needs.
 * Uses Playwright's Chromium when available; on macOS you can alternatively run:
 *   qlmanage -t -s 512 -o /tmp src/icons/logo.svg && for s in 16 32 48 128; do
 *     sips -z $s $s /tmp/logo.svg.png --out src/icons/icon-$s.png; done
 */
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const svg = await readFile(path.join(root, 'src/icons/logo.svg'), 'utf8')
const sizes = process.argv.slice(2).map(Number).filter(Boolean)
const browser = await chromium.launch({ channel: 'chromium' })
for (const size of sizes.length ? sizes : [16, 32, 48, 128, 256]) {
  // A fresh page per size, with the SVG as a block: inline layout leaves a line-height gap that clips the image.
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block" width="${size}" height="${size}" `)}</body></html>`,
  )
  await page.screenshot({
    path: path.join(root, `src/icons/icon-${size}.png`),
    omitBackground: true,
  })
  await page.close()
}
await browser.close()
console.log('icons written')
