import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  openWebview,
  sendDocument,
  sendInit,
  startFakeHost,
  type FakeHost,
} from './fake-host'

let host: FakeHost
test.beforeAll(async () => {
  host = await startFakeHost()
})
test.afterAll(() => host.close())

const DOC = [
  '# Accessible document',
  '',
  'A paragraph with a [link](https://example.com/) and `inline code`.',
  '',
  '> [!NOTE]',
  '> A note.',
  '',
  '> [!TIP]',
  '> A tip.',
  '',
  '> [!IMPORTANT]',
  '> Important.',
  '',
  '> [!WARNING]',
  '> A warning.',
  '',
  '> [!CAUTION]',
  '> Careful.',
  '',
  '## Table and code',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const x: number = 1',
  '```',
  '',
  '- [ ] a task',
  '- [x] done',
  '',
  '![A described image](img/pixel.png)',
].join('\n')

for (const theme of [
  'vscode-light',
  'vscode-dark',
  'vscode-high-contrast',
  'vscode-high-contrast-light',
] as const) {
  test(`no serious accessibility violations (${theme})`, async ({ page }) => {
    await openWebview(page, host, { theme })
    await sendInit(page, host)
    await sendDocument(page, DOC)
    await expect(page.locator('.ms-doc h1')).toBeVisible()
    await expect(page.locator('.ms-doc pre')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter(
      v => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map(
        v =>
          `${v.id}: ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0]?.target.join(' ')}`,
      ),
    ).toEqual([])
  })
}

test('the toolbar and sidebar can be used with the keyboard alone', async ({ page }) => {
  await openWebview(page, host)
  await sendInit(page, host)
  await sendDocument(page, DOC)
  await expect(page.locator('.ms-doc h1')).toBeVisible()
  // Every control that is visible has an accessible name and can take focus.
  const unnamed = await page.$$eval('button:not([hidden]):not([data-host-hidden])', els =>
    els
      .filter(e => (e as HTMLElement).offsetParent !== null)
      .filter(
        e =>
          !(
            e.getAttribute('aria-label') ||
            e.getAttribute('title') ||
            e.textContent?.trim()
          ),
      )
      .map(e => e.outerHTML.slice(0, 80)),
  )
  expect(unnamed).toEqual([])
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  expect(focused).not.toBe('BODY')
})
