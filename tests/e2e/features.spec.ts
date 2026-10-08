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
