import { expect, openMarkdown, test } from './fixtures'

test('diagrams and math render (Mermaid, Graphviz WASM, KaTeX)', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  const mermaid = page.locator('.ms-diagram[data-diagram="mermaid"]')
  const dot = page.locator('.ms-diagram[data-diagram="graphviz"]')
  await mermaid.scrollIntoViewIfNeeded()
  await expect(mermaid).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
  await expect(mermaid.locator('svg')).toBeVisible()
  // Mermaid's scoped stylesheet must survive sanitizing, otherwise nodes
  // render as solid black shapes with unreadable labels.
  await expect(mermaid.locator('svg style')).toHaveCount(1)
  const fill = await mermaid
    .locator('svg .node rect, svg .node polygon')
    .first()
    .evaluate(el => getComputedStyle(el).fill)
  expect(fill).not.toBe('rgb(0, 0, 0)')
  // Node labels are real SVG text (not stripped HTML in foreignObject).
  await expect(mermaid.locator('svg text', { hasText: 'Start' })).toBeVisible()
  await dot.scrollIntoViewIfNeeded()
  await expect(dot).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
  await expect(dot.locator('svg')).toBeVisible()
  await expect(page.locator('.katex-display')).toBeVisible()
  await expect(page.locator('.markdown-alert-tip .markdown-alert-title')).toHaveText(
    'Tip',
  )
})

test('command palette, view modes and live-preview editing', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('source view')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ms-pane--source')).toBeVisible()
  await expect(page.locator('.ms-source .ms-gutter')).toContainText('1')

  await page.locator('body').press('2')
  const editor = page.locator('.ms-editor')
  await expect(editor).toBeVisible()
  await editor.fill('# Edited live\n\nNew content')
  await expect(page.locator('.ms-doc h1')).toHaveText(/Edited live/)
  await expect(page.locator('.ms-status__modified')).toBeVisible()
  await page.locator('[data-mode="read"]').click()
  await expect(page.locator('.ms-pane--editor')).toBeHidden()
})

test('start page: open URL, recents, favorites, feature tour', async ({
  context,
  server,
  viewer,
}) => {
  const first = await openMarkdown(context, `${server.url}/other.md`)
  await first.locator('.ms-star').click()
  await expect(first.locator('.ms-star')).toHaveAttribute('aria-pressed', 'true')

  const home = await viewer()
  await expect(home.locator('#ms-home-title')).toBeVisible()
  await expect(
    home.locator('.ms-doc-list__title', { hasText: 'Other document' }),
  ).toBeVisible()
  await home.getByLabel('Markdown URL').fill(`${server.url}/guide.md`)
  await home.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(home.locator('.ms-doc h1')).toHaveText(/Guide/)

  const tour = await viewer()
  await tour.getByRole('button', { name: /Feature tour/ }).click()
  await expect(tour.locator('.ms-doc h1')).toHaveText(/Markscope feature tour/)
  await expect(tour.locator('.ms-toc-inline')).toBeVisible()
})

test('scratch document persists edits', async ({ viewer }) => {
  const page = await viewer()
  await page.getByRole('button', { name: /Scratch document/ }).click()
  const editor = page.locator('.ms-editor')
  await expect(editor).toBeVisible()
  await editor.fill('# My notes\n\nRemember this.')
  await expect(page.locator('.ms-doc h1')).toHaveText(/My notes/)
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.ms-doc h1')).toHaveText(/My notes/)
})

test('keyboard help, export and accessibility landmarks', async ({ context, server }) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Export as HTML' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Guide.html')
  const downloadPath = await file.path()
  const exported = await import('node:fs').then(fs =>
    fs.readFileSync(downloadPath, 'utf8'),
  )
  expect(exported).not.toContain('cdn.jsdelivr') // self-contained
  expect(exported).not.toContain('chrome-extension://') // links work outside Markscope
  expect(exported.match(/<style/g)?.length ?? 0).toBeGreaterThanOrEqual(2) // Mermaid styles kept

  // Printing from the dark theme uses the light palette (paper is white).
  await page.keyboard.press('t')
  await page.keyboard.press('t')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ media: 'print' })
  const ink = await page
    .locator('.ms-doc p')
    .first()
    .evaluate(el => getComputedStyle(el).color)
  expect(ink).not.toMatch(/oklch\(0\.9|rgb\(2[0-9]{2}/) // not light-on-white
  await expect(page.locator('.ms-frontmatter, .ms-toolbar')).toHaveCount(1) // toolbar exists…
  await expect(page.locator('.ms-toolbar')).toBeHidden() // …but is not printed
  await page.emulateMedia({ media: 'screen' })

  await expect(page.getByRole('main')).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Document sidebar' }),
  ).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Sidebar' })).toBeVisible()
  // Every icon-only button has an accessible name.
  const unnamed = await page
    .locator('button')
    .evaluateAll(
      btns =>
        btns.filter(
          b =>
            (b as HTMLElement).offsetParent !== null &&
            !(b.getAttribute('aria-label') || b.textContent?.trim()),
        ).length,
    )
  expect(unnamed).toBe(0)
})

test('popup and settings pages render', async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator('.ms-wordmark')).toHaveText('Markscope')
  await expect(
    popup.getByRole('switch', { name: /Open Markdown automatically/ }),
  ).toBeChecked()

  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(options.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(options.getByLabel('Enable AI features')).not.toBeChecked()
})

test('focus mode keeps the document at reading width and is easy to exit', async ({
  viewer,
}) => {
  const page = await viewer()
  await page.getByRole('button', { name: /Feature tour/ }).click()
  await page.locator('.ms-doc h1').waitFor()
  const normalWidth = await page
    .locator('.ms-doc')
    .evaluate(el => el.getBoundingClientRect().width)

  // Enter from the menu (mouse users) — chrome hides, the document must not collapse.
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Focus mode/ }).click()
  await expect(page.locator('.ms-toolbar')).toBeHidden()
  // Wait for the column transition to settle, then check width + centering.
  await expect
    .poll(async () => {
      const box = await page.locator('.ms-doc').boundingBox()
      return Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 640)
    })
    .toBeLessThan(12)
  const zenBox = await page.locator('.ms-doc').boundingBox()
  expect(zenBox?.width).toBeGreaterThanOrEqual(normalWidth - 1)
  expect(Math.abs((zenBox?.x ?? 0) + (zenBox?.width ?? 0) / 2 - 640)).toBeLessThan(12)
  // Reading progress bar is active (0% wide at the top, so check display).
  await expect(page.locator('.ms-progress')).toHaveCSS('display', 'block')

  // Split view in focus mode fills the viewport, even after scrolling.
  await page.mouse.wheel(0, 900)
  await page.keyboard.press('2')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  const editorBox = await page.locator('.ms-editor').boundingBox()
  expect(editorBox?.width).toBeGreaterThan(400)
  expect(editorBox?.y).toBe(0)
  expect(editorBox?.height).toBeGreaterThan(780)
  await page.locator('.ms-doc').click()
  await page.keyboard.press('1')

  // Mouse exit.
  await page.getByRole('button', { name: /Exit focus/ }).click()
  await expect(page.locator('.ms-toolbar')).toBeVisible()
  await expect(page.locator('.ms-zen-exit')).toBeHidden()

  // Keyboard: Z enters, Esc exits.
  await page.keyboard.press('z')
  await expect(page.locator('.ms-toolbar')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ms-toolbar')).toBeVisible()
})
