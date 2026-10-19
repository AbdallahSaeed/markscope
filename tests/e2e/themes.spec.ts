/** The 35 named themes: gallery, command palette, persistence, print and export. */
import { readFile } from 'node:fs/promises'
import { expect, openMarkdown, test } from './fixtures'

const paper = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
  )

test('pick a theme in settings: the open viewer, a reload, print and export all follow', async ({
  context,
  extensionId,
  server,
}) => {
  const viewer = await openMarkdown(context, `${server.url}/guide.md`)
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)

  // The gallery has every theme: 10 light + 25 dark.
  await expect(options.locator('.ms-theme-card')).toHaveCount(35)
  await expect(options.locator('.ms-theme-card[data-theme="light"]')).toHaveCount(10)

  // Choosing Dracula saves it, switches the mode to dark and re-themes the viewer live.
  await options.locator('.ms-theme-card', { hasText: 'Dracula' }).click()
  await expect(options.locator('.ms-saved')).toHaveText('Saved')
  await expect(viewer.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(viewer.locator('html')).toHaveAttribute('data-palette', 'dracula')
  expect(await paper(viewer)).toBe('#282a36')
  await expect(options.getByLabel('Mode', { exact: true })).toHaveValue('dark')
  await expect(options.locator('.ms-theme-card:has(:checked)')).toHaveCount(2) // one per scheme

  // The light theme is independent: it is used when the mode is light.
  await options.locator('.ms-theme-card', { hasText: 'Solarized Light' }).click()
  await expect(viewer.locator('html')).toHaveAttribute('data-palette', 'solarized-light')
  expect(await paper(viewer)).toBe('#fdf6e3')
  await options.getByLabel('Mode', { exact: true }).selectOption('dark')
  await expect(viewer.locator('html')).toHaveAttribute('data-palette', 'dracula')

  // Survives a reload.
  await viewer.reload()
  await expect(viewer.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(viewer.locator('html')).toHaveAttribute('data-palette', 'dracula')
  expect(await paper(viewer)).toBe('#282a36')

  // Print is always the light Cadmium base, whatever is on screen.
  await viewer.emulateMedia({ media: 'print' })
  expect(await paper(viewer)).toMatch(/^oklch\(98\.6% 0?\.006 85\)$/) // minified: no leading zero
  await viewer.emulateMedia({ media: 'screen' })

  // HTML export carries the active palette only.
  await viewer.getByRole('button', { name: 'More actions' }).click()
  const download = viewer.waitForEvent('download')
  await viewer.getByRole('menuitem', { name: 'Export as HTML' }).click()
  const html = await readFile((await (await download).path())!, 'utf8')
  expect(html).toContain('data-palette="dracula"')
  expect(html).toContain("[data-palette='dracula']")
  expect(html).not.toContain("[data-palette='nord']")
})

test('the command palette switches themes, and T shows the palette name', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.keyboard.press('Control+k')
  await page.locator('.ms-palette__input').fill('theme nord')
  await expect(page.locator('.ms-palette__item').first()).toContainText('Theme: Nord')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'nord')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await paper(page)).toBe('#2e3440')

  // An empty palette query stays free of the 35 theme rows.
  await page.keyboard.press('Control+k')
  await expect(page.locator('.ms-palette__item', { hasText: 'Theme: ' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // T cycles the mode and the toast names the palette that applies.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('t') // dark → system
  await page.keyboard.press('t') // system → light
  await expect(page.locator('.ms-toast').last()).toContainText(
    'Theme: light (Cadmium Light)',
  )
})

test('the popup links to the theme gallery', async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole('button', { name: 'More themes…' })).toBeVisible()
})
