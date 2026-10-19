/**
 * Visual review of the named themes: renders one reference document (headings, callouts, code,
 * table, math, a diagram, a highlight) in every theme and writes a contact sheet.
 *
 *   npm run build && node scripts/theme-shots.mjs [outDir]
 *
 * Loads dist/chrome in Playwright's Chromium and switches `data-theme` / `data-palette` on the
 * viewer, so it shows exactly what the shipped CSS does. Review by eye.
 */
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { THEME_REGISTRY } from '../src/shared/themes.ts'

const root = path.resolve(import.meta.dirname, '..')
const out = path.resolve(process.argv[2] ?? path.join(tmpdir(), 'markscope-theme-shots'))
await mkdir(out, { recursive: true })

const DOC = `# Reference document

A paragraph with **bold**, *italic*, \`inline code\`, a [link](https://example.com) and ==a highlight==.

> [!NOTE]
> Notes use the note color.

> [!TIP]
> Tips use the tip color.

> [!WARNING]
> Warnings use the warning color.

> [!CAUTION]
> Cautions use the caution color.

## Code

\`\`\`ts
// comment
export function greet(name: string): string {
  const n = 42
  return \`Hello, \${name} \${n}\`
}
\`\`\`

| Theme | Scheme |
| ----- | ------ |
| Nord  | dark   |

Inline math $a^2 + b^2 = c^2$.

\`\`\`mermaid
flowchart LR
  A[Write] --> B[Read] --> C[Ship]
\`\`\`
`

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/markdown; charset=utf-8')
  res.end(DOC)
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const url = `http://127.0.0.1:${server.address().port}/reference.md`

const ext = path.join(root, 'dist/chrome')
const ctx = await chromium.launchPersistentContext(
  await mkdtemp(path.join(tmpdir(), 'ms-')),
  {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1000, height: 1250 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  },
)
let [worker] = ctx.serviceWorkers()
worker ??= await ctx.waitForEvent('serviceworker')
const page = await ctx.newPage()
await page.goto(url)
await page.waitForURL(/viewer\.html/)
await page.locator('.ms-doc h1').first().waitFor()
const diagram = page.locator('.ms-diagram[data-diagram="mermaid"]')
await diagram.scrollIntoViewIfNeeded()
await page.locator('.ms-diagram svg').first().waitFor({ timeout: 30_000 })

const shots = []
for (const t of THEME_REGISTRY) {
  await page.evaluate(
    ([scheme, id]) => {
      document.documentElement.dataset.theme = scheme
      document.documentElement.dataset.palette = id
    },
    [t.scheme, t.id],
  )
  await page.waitForTimeout(120)
  const file = path.join(out, `${t.id}.png`)
  await page.screenshot({ path: file })
  shots.push({ ...t, file })
}
await ctx.close()
server.close()

// Contact sheet: a real file next to the shots (images are not loadable from about:blank).
const cells = shots
  .map(
    s =>
      `<figure><img src="${path.basename(s.file)}"><figcaption>${s.name} <small>${s.scheme}</small></figcaption></figure>`,
  )
  .join('')
const sheetHtml = path.join(out, 'contact-sheet.html')
await writeFile(
  sheetHtml,
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:3px 2px;color:#fff}</style>`,
)
const browser = await chromium.launch({ channel: 'chromium' })
const sheetPage = await browser.newPage({ viewport: { width: 2000, height: 900 } })
await sheetPage.goto(`file://${sheetHtml}`)
await sheetPage.waitForLoadState('load')
const sheet = path.join(out, 'contact-sheet.png')
await sheetPage.screenshot({ path: sheet, fullPage: true })
await browser.close()
console.log(`${shots.length} themes → ${out}\ncontact sheet: ${sheet}`)
