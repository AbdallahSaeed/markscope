/**
 * Critical user journey:
 * open → detect → render → search → TOC → copy code → theme → settings →
 * reload → persistence → extension restart.
 */
import { expect, launch, openMarkdown, test } from './fixtures'

test('open, detect, render, search, navigate, copy, theme, settings, reload, restart', async ({
  context,
  extensionId,
  server,
  userDataDir,
}) => {
  // Open Markdown → detected by the content script → rendered in the viewer.
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  expect(page.url()).toContain(`chrome-extension://${extensionId}/viewer.html`)
  expect(new URL(page.url()).searchParams.get('src')).toBe(`${server.url}/guide.md`)
  expect(new URL(page.url()).searchParams.get('h')).toBeNull() // one-time token removed
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(page).toHaveTitle('Guide · Markscope')
  await expect(page.locator('.ms-status')).toContainText('words')

  // Search.
  await page.keyboard.press('/')
  await page.locator('.ms-search__input').fill('needle')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ms-search__count')).toHaveText('1/2')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ms-search__count')).toHaveText('2/2')
  await page.keyboard.press('Escape')
  await expect(page.locator('.ms-search')).toBeHidden()

  // Navigate via the outline (TOC).
  await page.locator('.ms-outline__link', { hasText: 'Reference' }).click()
  await expect(page.locator('#reference')).toBeInViewport()
  await expect(page).toHaveURL(/#reference$/)
  await expect(page.locator('.ms-outline__link[aria-current]')).toHaveText('Reference')

  // Copy a code block. Chromium cannot grant clipboard permissions to
  // extension origins in automation, so observe what the page writes.
  await page.evaluate(() => {
    const w = window as unknown as { __copied?: string }
    navigator.clipboard.writeText = async (text: string) => {
      w.__copied = text
    }
  })
  const block = page.locator('.ms-code', { hasText: 'copy me' })
  await block.hover()
  await block.locator('[data-action="copy"]').click()
  await expect(block.locator('[data-action="copy"]')).toContainText('Copied')
  expect(
    await page.evaluate(() => (window as unknown as { __copied?: string }).__copied),
  ).toBe("// copy test\nconsole.log('copy me')")

  // Theme: system → light → dark via the T shortcut.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('t')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('t')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // Change settings on the options page; the open viewer updates live.
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.getByLabel('Content width').selectOption('wide')
  await options.getByLabel('Line numbers in code blocks').check()
  await expect(options.locator('.ms-saved')).toHaveText('Saved')
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--doc-width').trim(),
      ),
    )
    .toBe('96ch')
  await expect(page.locator('.ms-code .ms-gutter').first()).toBeVisible()

  // Reload: the viewer re-fetches the source and settings persist.
  await page.reload()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.ms-code .ms-gutter').first()).toBeVisible()

  // Restart the browser/extension with the same profile.
  await context.close()
  const restarted = await launch(userDataDir)
  try {
    const home = await restarted.context.newPage()
    await home.goto(`chrome-extension://${restarted.extensionId}/viewer.html`)
    await expect(home.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(home.locator('.ms-doc-list__title', { hasText: 'Guide' })).toBeVisible()
    const again = await openMarkdown(restarted.context, `${server.url}/guide.md`)
    await expect(again.locator('.ms-code .ms-gutter').first()).toBeVisible()
  } finally {
    await restarted.context.close()
  }
})
