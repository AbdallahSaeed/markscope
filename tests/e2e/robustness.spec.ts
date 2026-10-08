import { expect, openMarkdown, test } from './fixtures'

// Trace snapshots serialize the whole DOM on every step; with a 48k-line
// document that dominates the run, so large-document tests skip tracing.
const large = test.extend({})
large.use({ trace: 'off', screenshot: 'off' })

large(
  'very large documents render off the main thread and stay interactive',
  async ({ context, server }) => {
    const started = Date.now()
    const page = await openMarkdown(context, `${server.url}/large.md`)
    await expect(page.locator('.ms-doc h2')).toHaveCount(6000, { timeout: 30_000 })
    const elapsed = Date.now() - started
    expect(elapsed).toBeLessThan(20_000)
    await expect(page.locator('.ms-doc')).toHaveClass(/is-large/)
    // UI remains responsive: the palette opens promptly.
    await page.keyboard.press('Control+k')
    await expect(page.locator('dialog.ms-palette')).toBeVisible()
    await page.keyboard.type('Section 5999')
    await page.keyboard.press('Enter')
    await expect(page.locator('#section-5999')).toBeInViewport()
  },
)

test('doctor reports broken anchors and missing images', async ({ context, server }) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.locator('#ms-tab-doctor').click()
  const panel = page.locator('#ms-panel-doctor')
  await expect(panel).toContainText('Anchor #does-not-exist does not match')
  await page.locator('#usage').scrollIntoViewIfNeeded()
  await expect(panel).toContainText('Image failed to load')
  await expect(page.locator('.ms-broken-image')).toContainText('Broken image')
})

test('relative markdown links open inside the viewer at the right anchor', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.getByRole('link', { name: 'the other doc' }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Other document/)
  await expect(page).toHaveURL(/viewer\.html\?src=.*other\.md#details$/)
  await expect(page.locator('#details')).toBeInViewport()
})

test('back button does not trap the user in a redirect loop', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.goBack()
  await expect(page).toHaveURL(`${server.url}/guide.md`)
  await expect(page.locator('#markscope-offer')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(`${server.url}/guide.md`)
})

test('missing documents and servers without CORS show actionable errors', async ({
  viewer,
  server,
}) => {
  const missing = await viewer(`${server.url}/nope.md`)
  await expect(missing.locator('.ms-banner')).toContainText('404')
  // Chrome grants host access per origin from the content-script match
  // patterns, so servers without CORS still load (the "Grant access" banner
  // appears only when the user restricts site access; covered by unit tests).
  const md = await viewer(`${server.url}/nocors/guide.md`)
  await expect(md.locator('.ms-doc h1')).toHaveText(/Guide/)
  const extensionless = await viewer(`${server.url}/nocors/guide`)
  await expect(extensionless.locator('.ms-doc h1')).toHaveText(/Guide/)
})

test('live reload picks up changes and keeps the reading position', async ({
  context,
  server,
  extensionId,
}) => {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.getByLabel('Live reload', { exact: true }).check()
  await options.close()
  server.setOverride('live.md', '# Live\n\nversion one\n')
  const page = await openMarkdown(context, `${server.url}/live.md`)
  await expect(page.locator('.ms-status__live')).toBeVisible()
  server.setOverride('live.md', '# Live\n\nversion two\n')
  await expect(page.locator('.ms-doc')).toContainText('version two', { timeout: 10_000 })
})

for (const width of [320, 768, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ context, server }) => {
    const page = await openMarkdown(context, `${server.url}/guide.md`)
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
}

large(
  'read mode: scrolling is never pulled back and the sidebar stays pinned',
  async ({ context, server }) => {
    const page = await openMarkdown(context, `${server.url}/large.md`)
    await expect(page.locator('.ms-outline__link')).toHaveCount(6001)
    for (const y of [1500, 6000, 20000, 60000]) {
      await page.mouse.move(700, 400)
      await page.mouse.wheel(0, y - (await page.evaluate(() => window.scrollY)))
      await expect
        .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
        .toBeGreaterThan(y - 200)
      await page.waitForTimeout(400) // give scrollspy time to react
      const after = await page.evaluate(() => window.scrollY)
      expect(after).toBeGreaterThan(y - 200)
      // Sidebar is sticky under the toolbar, and the active entry is visible in it.
      expect(
        await page
          .locator('.ms-sidebar')
          .evaluate(el => Math.round(el.getBoundingClientRect().top)),
      ).toBe(52)
      await expect(page.locator('.ms-outline__link[aria-current]')).toBeInViewport()
    }
  },
)
