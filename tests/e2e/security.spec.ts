import { expect, openMarkdown, test } from './fixtures'

test('malicious Markdown cannot run script, phish or overlay the UI', async ({
  context,
  server,
}) => {
  const dialogs: string[] = []
  const errors: string[] = []
  context.on('page', p =>
    p.on('dialog', d => void d.dismiss().then(() => dialogs.push(d.message()))),
  )
  const page = await openMarkdown(context, `${server.url}/malicious.md`)
  page.on('pageerror', e => errors.push(e.message))

  // Let lazy diagrams render.
  await page.locator('.ms-diagram').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await page
    .locator('.ms-doc')
    .evaluate(el => el.querySelectorAll('a').forEach(a => a.click()))

  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned),
  ).toBeUndefined()
  expect(dialogs).toEqual([])
  const doc = page.locator('.ms-doc')
  for (const sel of [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    // Mermaid's own id-scoped stylesheet is allowed; content styles are not.
    'style:not(.ms-diagram__figure style)',
    'base',
    'meta',
    'input[type="password"]',
  ]) {
    await expect(doc.locator(sel)).toHaveCount(0)
  }
  // The fixed-position overlay is contained inside the article and never
  // covers viewer chrome.
  const covering = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, 20)
    return el?.closest('.ms-toolbar') !== null
  })
  expect(covering).toBe(true)
  // Still on the viewer: no meta refresh / base hijack.
  expect(page.url()).toContain('viewer.html')
})
