import { expect, test, type Page } from '@playwright/test'
import { defaultSettings } from '../../../src/shared/settings'
import {
  openWebview,
  posted,
  send,
  sendDocument,
  sendInit,
  startFakeHost,
  type FakeHost,
  type Posted,
} from './fake-host'

let host: FakeHost
test.beforeAll(async () => {
  host = await startFakeHost()
})
test.afterAll(() => host.close())

/** Console errors that mention the CSP: the policy must never block our own code. */
function watchCsp(page: Page): string[] {
  const violations: string[] = []
  page.on('console', m => {
    if (/content security policy|refused to/i.test(m.text())) violations.push(m.text())
  })
  page.on('pageerror', e => violations.push(String(e)))
  return violations
}

async function start(
  page: Page,
  text: string,
  extra?: Parameters<typeof sendDocument>[2],
) {
  await sendInit(page, host)
  await sendDocument(page, text, extra)
  await expect(page.locator('.ms-doc h1')).toBeVisible()
}

const last = async (page: Page, type: string): Promise<Posted | undefined> =>
  (await posted(page)).filter(m => m.type === type).at(-1)

test('renders under the real CSP: markdown, math, Mermaid and Graphviz, with no violations', async ({
  page,
}) => {
  const violations = watchCsp(page)
  await openWebview(page, host)
  await start(
    page,
    [
      '# Title',
      '',
      'Inline $a^2+b^2=c^2$ math.',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```dot',
      'digraph { a -> b }',
      '```',
      '',
      '## Second',
    ].join('\n'),
  )
  await expect(page.locator('.katex')).toBeVisible()
  await expect(page.locator('.ms-diagram svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.ms-diagram svg')).toHaveCount(2, { timeout: 30_000 })
  await expect(page.locator('.ms-outline a')).toHaveCount(2)
  expect(violations).toEqual([])
})

test('large documents render in a blob worker allowed by the CSP', async ({ page }) => {
  const violations = watchCsp(page)
  await openWebview(page, host)
  const big = '# Big\n\n' + 'A paragraph of text.\n\n'.repeat(5000)
  await start(page, big)
  expect(
    await page.evaluate(() => (window as unknown as { __workers: number }).__workers),
  ).toBe(1)
  expect(await page.locator('.ms-doc p').count()).toBeGreaterThan(4000)
  expect(violations).toEqual([])
})

test('the doctor reports through the host, with the document uri and version', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n\n[gone](#nowhere)\n', { version: 7 })
  await expect.poll(async () => (await last(page, 'doctor'))?.version).toBe(7)
  const doctor = (await last(page, 'doctor'))!
  expect(doctor.uri).toBe('file:///w/docs/readme.md')
  expect(
    (doctor.issues as { rule: string; line: number }[]).some(i => i.line === 3),
  ).toBe(true)
})

test('links go to the host and the page never navigates', async ({ page }) => {
  await openWebview(page, host)
  await start(
    page,
    '# T\n\n[other](other.md#part) [up](../top.md) [web](https://example.com/a) [cmd](command:workbench.action.reloadWindow) [anchor](#t)\n',
  )
  const url = page.url()
  await page.getByRole('link', { name: 'other' }).click()
  await expect
    .poll(async () => (await last(page, 'openLink')) as Posted | undefined)
    .toMatchObject({ kind: 'document', target: 'docs/other.md', hash: '#part' })
  await page.getByRole('link', { name: 'up' }).click()
  await expect
    .poll(async () => (await last(page, 'openLink')) as Posted | undefined)
    .toMatchObject({ kind: 'document', target: 'top.md' })
  await page.getByRole('link', { name: 'web' }).click()
  await expect
    .poll(async () => (await last(page, 'openLink')) as Posted | undefined)
    .toMatchObject({ kind: 'external', target: 'https://example.com/a' })
  // command: / vscode: links are stripped by the sanitizer: inert anchors, clicks go nowhere.
  const unsafe = page.getByText('cmd', { exact: true })
  await expect(unsafe).not.toHaveAttribute('href', /.+/)
  const before = (await posted(page)).filter(m => m.type === 'openLink').length
  await unsafe.click()
  await page.getByRole('link', { name: 'anchor' }).click()
  expect((await posted(page)).filter(m => m.type === 'openLink').length).toBe(before)
  expect(page.url().split('#')[0]).toBe(url.split('#')[0])
})

test('relative images are resolved through the host and then load', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# T\n\n![pic](img/pixel.png)\n')
  await expect
    .poll(async () => (await last(page, 'resolveMedia'))?.path)
    .toBe('docs/img/pixel.png')
  const request = (await last(page, 'resolveMedia'))!
  await send(page, {
    type: 'media',
    requestId: request.requestId,
    url: `${host.origin}/media/pixel.png`,
  })
  await expect
    .poll(() =>
      page.locator('.ms-doc img').evaluate(i => (i as HTMLImageElement).naturalWidth),
    )
    .toBe(1)
})

test('a refused image (host says null) becomes a broken-image placeholder, not a request', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n\n![pic](img/secret.png)\n')
  await expect
    .poll(async () => (await last(page, 'resolveMedia'))?.requestId)
    .toBeDefined()
  await send(page, {
    type: 'media',
    requestId: (await last(page, 'resolveMedia'))!.requestId,
    url: null,
  })
  await expect(page.locator('.ms-doc img[src]')).toHaveCount(0)
})

test('an unsaved file (no base) explains why relative images are missing', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n\n![pic](img/pixel.png)\n', { baseUri: null })
  await expect(page.locator('.ms-banner')).toContainText('Save this file')
  expect((await posted(page)).some(m => m.type === 'resolveMedia')).toBe(false)
})

test('host scrolls move the preview without echoing; user scrolls are reported once', async ({
  page,
}) => {
  await openWebview(page, host)
  const body = Array.from(
    { length: 80 },
    (_, i) => `## Section ${i}\n\nText ${i}.\n`,
  ).join('\n')
  await start(page, `# T\n\n${body}`)
  await send(page, { type: 'scrollToLine', line: 200 })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
  await page.waitForTimeout(300)
  expect((await posted(page)).filter(m => m.type === 'scrolled')).toHaveLength(0)

  await page.mouse.wheel(0, 1500)
  await expect
    .poll(async () => (await posted(page)).filter(m => m.type === 'scrolled').length)
    .toBe(1)
  const line = (await last(page, 'scrolled'))!.line as number
  expect(line).toBeGreaterThan(200)
})

test('double-click reveals the block’s source line; the cursor line is highlighted', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n\nfirst\n\nsecond\n')
  await send(page, { type: 'cursorLine', line: 5 })
  await expect(page.locator('.ms-doc .ms-cursor-block')).toHaveText('second')
  await page.locator('.ms-doc p', { hasText: 'first' }).dblclick()
  await expect.poll(async () => (await last(page, 'revealLine'))?.line).toBe(3)
})

test('follows the VS Code theme, including high contrast', async ({ page }) => {
  await openWebview(page, host, { theme: 'vscode-dark' })
  await start(page, '# T\n')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => {
    document.body.className = 'vscode-high-contrast-light'
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high')
  await page.evaluate(() => {
    document.body.className = 'vscode-light'
  })
  await expect(page.locator('html')).toHaveAttribute('data-contrast', '')
})

test('saves what to restore: file and lock state', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  await send(page, { type: 'lock', locked: true })
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __state: unknown }).__state))
    .toMatchObject({ uri: 'file:///w/docs/readme.md', locked: true })
})

test('hash links from the host land on the heading; commands drive the UI', async ({
  page,
}) => {
  await openWebview(page, host)
  const body = Array.from({ length: 60 }, (_, i) => `## Part ${i}\n\nText.\n`).join('\n')
  await sendInit(page, host)
  await sendDocument(page, `# T\n\n${body}`, { hash: '#part-40' })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)

  await send(page, { type: 'command', name: 'find' })
  await expect(page.locator('.ms-search input')).toBeFocused()
  await page.keyboard.press('Escape')
  await send(page, { type: 'command', name: 'toggleSidebar' })
  await expect(page.locator('body')).toHaveClass(/sidebar-hidden/)
  await send(page, { type: 'command', name: 'focusMode' })
  await expect(page.locator('body')).toHaveClass(/zen/)
})

test('the toolbar shows only what applies in VS Code', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  for (const sel of ['.ms-home-btn', '.ms-star', '.ms-save-btn', '.ms-seg'])
    await expect(page.locator(sel)).toBeHidden()
  await expect(page.getByRole('button', { name: /Find in document/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Toggle sidebar/ })).toBeVisible()
  // The browser viewer's theme button, Commands button and ⋯ menu are here too.
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible()
})

test('diagrams are re-themed when VS Code switches theme', async ({ page }) => {
  await openWebview(page, host, { theme: 'vscode-dark' })
  await start(page, '# T\n\n```mermaid\ngraph TD; A-->B;\n```\n')
  const svg = page.locator('.ms-diagram svg').first()
  await expect(svg).toBeVisible({ timeout: 30_000 })
  await svg.evaluate(el => el.setAttribute('data-probe', '1'))
  await page.evaluate(() => {
    document.body.className = 'vscode-light'
  })
  // The old SVG (marked above) is replaced by one rendered with the light palette.
  await expect(page.locator('.ms-diagram svg[data-probe]')).toHaveCount(0, {
    timeout: 30_000,
  })
  await expect(page.locator('.ms-diagram svg')).toHaveCount(1)
})

test('a reloaded page (hidden tab shown again) returns to where the reader was', async ({
  page,
}) => {
  const body = Array.from(
    { length: 80 },
    (_, i) => `## Section ${i}\n\nText ${i}.\n`,
  ).join('\n')
  await openWebview(page, host, {
    state: { uri: 'file:///w/docs/readme.md', locked: false, line: 200 },
  })
  await start(page, `# T\n\n${body}`)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
  // Restoring is not a user scroll: nothing is reported back to the editor.
  await page.waitForTimeout(300)
  expect((await posted(page)).filter(m => m.type === 'scrolled')).toHaveLength(0)
})

test('only the newest of a burst of document messages is rendered', async ({ page }) => {
  await openWebview(page, host)
  await sendInit(page, host)
  // Large enough to render in the worker (async), so a burst really backs up.
  const filler = 'A paragraph of text.\n\n'.repeat(4000)
  await page.evaluate(filler => {
    for (let v = 1; v <= 20; v++)
      window.postMessage(
        {
          v: 1,
          type: 'document',
          uri: 'file:///w/docs/readme.md',
          version: v,
          text: `# Version ${v}\n\n${filler}`,
          fileName: 'readme.md',
          baseUri: null,
          hash: '',
        },
        '*',
      )
  }, filler)
  await expect(page.locator('.ms-doc h1')).toContainText('Version 20', {
    timeout: 30_000,
  })
  await expect.poll(async () => (await last(page, 'doctor'))?.version).toBe(20)
  const versions = (await posted(page))
    .filter(m => m.type === 'doctor')
    .map(m => m.version)
  expect(versions.length).toBeLessThan(10)
})

test('the export command produces a self-contained HTML file for the host to save', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(
    page,
    '# Exported title\n\nText with a [link](other.md) and $x^2$.\n\n```mermaid\ngraph TD; A-->B;\n```\n',
  )
  await send(page, { type: 'command', name: 'exportHtml' })
  await expect
    .poll(async () => (await last(page, 'exportHtml')) !== undefined, { timeout: 30_000 })
    .toBe(true)
  const out = (await last(page, 'exportHtml'))!
  const html = out.html as string
  expect(out.fileName).toBe('Exported title.html')
  expect(html).toContain('<!doctype html>')
  expect(html).toContain('<title>Exported title</title>')
  expect(html).toContain("default-src 'none'")
  expect(html).toContain('<svg') // the diagram was rendered before exporting
  expect(html).not.toContain('<script')
  expect(html).not.toContain('ms-ui')
  expect(html).not.toContain('data-source-line')
  expect(html.length).toBeGreaterThan(10_000) // document.css is inlined
})

test('the copy command posts the rendered article as a fragment', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# Copy me\n\nSome *text* and [a link](https://example.com/).\n')
  await send(page, { type: 'command', name: 'copyHtml' })
  await expect.poll(async () => (await last(page, 'copy')) !== undefined).toBe(true)
  const text = (await last(page, 'copy'))!.text as string
  expect(text).toContain('<h1')
  expect(text).toContain('Copy me')
  expect(text).toContain('<em>text</em>')
  expect(text).not.toContain('<html')
  expect(text).not.toContain('ms-ui')
  expect(text).not.toContain('data-source-line')
})

test('nothing is exported unless the host asks', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  await page.waitForTimeout(300)
  expect((await posted(page)).some(m => m.type === 'exportHtml')).toBe(false)
})

/** Settings with the assistant switched on (what the host sends in a trusted workspace). */
const aiOn = (extra: Record<string, unknown> = {}) => {
  const s = defaultSettings()
  return { ...s, ai: { ...s.ai, enabled: true, confirmBeforeSend: false, ...extra } }
}

test('the AI button and panel exist only while the assistant is enabled', async ({
  page,
}) => {
  await openWebview(page, host)
  await sendInit(page, host)
  await sendDocument(page, '# T\n')
  await expect(page.locator('.ms-doc h1')).toBeVisible()
  await expect(page.getByRole('button', { name: /AI assistant/ })).toBeHidden()
  await send(page, { type: 'command', name: 'toggleAI' })
  await expect(page.locator('.ms-ai')).toBeHidden()

  await send(page, { type: 'settings', settings: aiOn() })
  await expect(page.getByRole('button', { name: /AI assistant/ })).toBeVisible()
  await page.getByRole('button', { name: /AI assistant/ }).click()
  await expect(page.locator('.ms-ai')).toBeVisible()
  await send(page, { type: 'settings', settings: defaultSettings() })
  await expect(page.locator('.ms-ai')).toBeHidden()
})

test('AI requests go to the host and its streamed answer appears; the document is not sent elsewhere', async ({
  page,
}) => {
  await openWebview(page, host)
  await sendInit(page, host, aiOn())
  await sendDocument(page, '# T\n\nSecret body text.\n')
  await expect(page.locator('.ms-doc h1')).toBeVisible()
  await page.getByRole('button', { name: /AI assistant/ }).click()
  await page.getByRole('button', { name: 'Summarize document' }).click()

  await expect.poll(async () => (await last(page, 'ai')) !== undefined).toBe(true)
  const sent = (await last(page, 'ai'))!.request as {
    type: string
    id: number
    task: string
    document: string
  }
  expect(sent).toMatchObject({ type: 'ai.run', task: 'summarize' })
  expect(sent.document).toContain('Secret body text.')

  await send(page, {
    type: 'ai.event',
    event: { type: 'delta', id: sent.id, text: 'A **short** ' },
  })
  await send(page, {
    type: 'ai.event',
    event: { type: 'delta', id: sent.id, text: 'summary.' },
  })
  await send(page, {
    type: 'ai.event',
    event: { type: 'done', id: sent.id, truncated: false },
  })
  await expect(page.locator('.ms-ai__log')).toContainText('short summary.')

  // A late event from an older request is ignored.
  await send(page, { type: 'ai.event', event: { type: 'delta', id: 999, text: 'STALE' } })
  await page.waitForTimeout(150)
  await expect(page.locator('.ms-ai__log')).not.toContainText('STALE')
})

test('a host error (for example an untrusted workspace) is shown, not swallowed', async ({
  page,
}) => {
  await openWebview(page, host)
  await sendInit(page, host, aiOn())
  await sendDocument(page, '# T\n\ntext\n')
  await expect(page.locator('.ms-doc h1')).toBeVisible()
  await page.getByRole('button', { name: /AI assistant/ }).click()
  await page.getByRole('button', { name: 'Summarize document' }).click()
  await expect.poll(async () => (await last(page, 'ai')) !== undefined).toBe(true)
  const id = ((await last(page, 'ai'))!.request as { id: number }).id
  await send(page, {
    type: 'ai.event',
    event: {
      type: 'error',
      id,
      message: 'AI is turned off in untrusted workspaces. Trust this folder to use it.',
    },
  })
  await expect(page.locator('.ms-ai__log')).toContainText('untrusted workspaces')
})

test('links to project files go to the host with their path and line anchor', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n\n[the app](../src/app.ts#L42) and [the folder](../src/)\n')
  await page.getByRole('link', { name: 'the app' }).click()
  await expect
    .poll(async () => (await last(page, 'openLink')) as Posted | undefined)
    .toMatchObject({ kind: 'file', target: 'src/app.ts', hash: '#L42' })
  await page.getByRole('link', { name: 'the folder' }).click()
  await expect
    .poll(async () => (await last(page, 'openLink')) as Posted | undefined)
    .toMatchObject({ kind: 'file', target: 'src', hash: '' })
  expect(page.url()).toContain('/index.html') // the page itself never navigated
})

const action = async (page: Page) => (await last(page, 'action')) as Posted | undefined

/** Menu entries: checkable ones have role menuitemcheckbox, so select by class and label. */
const menuItem = (page: Page, label: string | RegExp) =>
  page.locator('.ms-menu__item').filter({
    has: page.locator('span', {
      hasText: typeof label === 'string' ? new RegExp(`^${label}`) : label,
    }),
  })

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
}

test('the ⋯ menu has the browser viewer’s options that make sense in VS Code', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  await openMenu(page)
  const names = await page.locator('.ms-menu__item > span').allTextContents()
  for (const label of [
    'Refresh',
    'Show source in the editor',
    'Copy Markdown',
    'Copy rendered HTML',
    'Export as HTML',
    'Focus mode',
    'Keyboard shortcuts',
    'Command palette',
    'Settings',
  ])
    expect(names.join('|'), label).toContain(label)
  // Browser-only options are absent; the AI item needs the assistant switched on.
  for (const gone of [
    'Save',
    'Start page',
    'Print',
    'Live reload',
    'View original file',
    'AI assistant',
  ])
    expect(names.join('|'), gone).not.toContain(gone)
})

test('menu items ask the host for their fixed action', async ({ page }) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  const expected: [string, string][] = [
    ['Refresh', 'refresh'],
    ['Show source in the editor', 'showSource'],
    ['Copy Markdown', 'copyMarkdown'],
    ['Copy rendered HTML', 'copyHtml'],
    ['Export as HTML', 'exportHtml'],
    ['Command palette', 'openCommands'],
    ['Settings', 'openSettings'],
    ['Line numbers in code', 'toggleLineNumbers'],
    ['Lock preview to this file', 'toggleLock'],
  ]
  for (const [label, name] of expected) {
    await openMenu(page)
    await menuItem(page, label).click()
    await expect.poll(async () => (await action(page))?.name, label).toBe(name)
  }
})

test('the theme button cycles VS Code theme → light → dark and saves the choice via the host', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  const button = page.getByRole('button', { name: /theme/i })
  await button.click()
  await expect
    .poll(async () => await action(page))
    .toMatchObject({ name: 'setTheme', value: 'light' })
  await send(page, {
    type: 'settings',
    settings: { ...defaultSettings(), theme: 'light' },
  })
  await button.click()
  await expect
    .poll(async () => await action(page))
    .toMatchObject({ name: 'setTheme', value: 'dark' })
  await send(page, {
    type: 'settings',
    settings: { ...defaultSettings(), theme: 'dark' },
  })
  await expect(button).toHaveAttribute('data-theme', 'dark')
  await button.click()
  await expect
    .poll(async () => await action(page))
    .toMatchObject({ name: 'setTheme', value: 'vscode' })
})

test('the Commands button opens VS Code’s palette, filtered to Markscope', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  await page.getByRole('button', { name: 'Commands' }).click()
  await expect.poll(async () => (await action(page))?.name).toBe('openCommands')
})

test('Focus mode and Keyboard shortcuts work from the menu; the shortcut list matches the keys', async ({
  page,
}) => {
  await openWebview(page, host)
  await start(page, '# T\n')
  await openMenu(page)
  await menuItem(page, 'Focus mode').click()
  await expect(page.locator('body')).toHaveClass(/zen/)
  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/zen/)

  await openMenu(page)
  await menuItem(page, 'Keyboard shortcuts').click()
  // A closed dialog may linger in the DOM for a moment: look at the open one.
  const help = page.locator('dialog.ms-help[open]')
  await expect(help).toBeVisible()
  for (const text of [
    'Find in document',
    'Switch theme',
    'Refresh the preview',
    'AI assistant',
  ])
    await expect(help).toContainText(text)
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()
  // The same keys work: R refreshes, ? opens the help again.
  await page.keyboard.press('r')
  await expect.poll(async () => (await action(page))?.name).toBe('refresh')
  await page.keyboard.press('?')
  await expect(page.locator('dialog.ms-help[open]')).toBeVisible()
})

test('the AI item appears in the menu only when the assistant is on, and the Reader has no lock item', async ({
  page,
}) => {
  await openWebview(page, host)
  await sendInit(page, host, aiOn(), 'reader')
  await sendDocument(page, '# T\n')
  await expect(page.locator('.ms-doc h1')).toBeVisible()
  await openMenu(page)
  await expect(menuItem(page, 'AI assistant')).toBeVisible()
  await expect(menuItem(page, 'Lock preview')).toHaveCount(0)
})
