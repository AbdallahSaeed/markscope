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
  const editor = page.locator('.ms-editor .cm-content')
  await expect(editor).toBeVisible()
  await editor.fill('# Edited live\n\nNew content')
  await expect(page.locator('.ms-doc h1')).toHaveText(/Edited live/)
  await expect(page.locator('.ms-status__modified')).toBeVisible()
  await page.locator('[data-mode="read"]').click()
  await expect(page.locator('.ms-pane--editor')).toBeHidden()
})

test('single-key shortcuts work in the very next event after a palette command', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('source view')
  // Chrome only moves focus off the closed dialog's input at its next rendering step. A key
  // that arrives before that (a slow or loaded machine) still targets the input and used to
  // be dropped. Reproduce it exactly: Enter, then the next key, in the same task.
  const target = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.ms-palette__input')
    if (!input) return 'no palette input'
    const key = (key: string, to: EventTarget) =>
      to.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    key('Enter', input) // runs "Source view" and closes the palette
    const next = document.activeElement ?? document.body
    key('2', next) // the next key press: the "Edit" view
    return `${next.tagName}.${next.className}`
  })
  expect(target).not.toContain('ms-palette__input')
  await expect(page.locator('[data-mode="split"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('editor: CodeMirror lists, Tab indent, and ⌘Z undoes a Discard', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  await expect(editor).toBeFocused()
  await expect(page.locator('.ms-editor .cm-lineNumbers')).toContainText('1')

  // The editor fits its pane (scrolling inside it), and scrolling syncs the preview.
  const editorBox = await page.locator('.ms-editor .cm-editor').boundingBox()
  const statusBox = await page.locator('.ms-status').boundingBox()
  expect((editorBox?.y ?? 0) + (editorBox?.height ?? 0)).toBeLessThanOrEqual(
    (statusBox?.y ?? 0) + 1,
  )
  await page
    .locator('.ms-editor .cm-scroller')
    .evaluate(e => e.scrollTo(0, e.scrollHeight))
  await expect
    .poll(() => page.locator('.ms-pane--preview').evaluate(e => e.scrollTop))
    .toBeGreaterThan(0)

  // Enter continues a list; Tab nests the item, Shift+Tab brings it back.
  await editor.fill('# Notes\n\n- first')
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await expect(page.locator('.ms-doc ul > li')).toHaveText(['first', 'second'])
  await page.keyboard.press('Tab')
  await expect(page.locator('.ms-doc li li')).toHaveText('second')
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.ms-doc ul > li')).toHaveText(['first', 'second'])

  // Discard is an editor transaction, so ⌘Z in the editor restores the edits.
  const discard = page.getByRole('button', { name: 'Discard', exact: true })
  await discard.click()
  await expect(page.locator('.ms-doc h1').first()).toHaveText(/Guide/)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.ms-doc h1').first()).toHaveText(/Notes/)
  await expect(discard).toBeVisible()
})

test('editor: formatting keys, auto-pairs, paste-as-link, table format, cursor status', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  const preview = page.locator('.ms-doc')
  const cursor = page.locator('.ms-status__cursor')
  await expect(cursor).toHaveText('Ln 1, Col 1')

  // ⌘B then ⌘I on the selection: bold and italic, and the selection is kept.
  await editor.fill('world')
  await page.keyboard.press('ControlOrMeta+a')
  await expect(cursor).toHaveText('Ln 1, Col 6 (5 selected)')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.press('ControlOrMeta+i')
  await expect(editor).toHaveText('**_world_**')
  await expect(preview.locator('strong em')).toHaveText('world')

  // Typing ~ twice over a selection wraps it (strikethrough).
  await editor.fill('gone')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('~~')
  await expect(editor).toHaveText('~~gone~~')
  await expect(preview.locator('del, s')).toHaveText('gone')

  // Brackets pair; typing the closer steps over it.
  await editor.fill('')
  await page.keyboard.type('(x')
  await expect(editor).toHaveText('(x)')
  await page.keyboard.type(')')
  await expect(editor).toHaveText('(x)')

  // Pasting a URL over selected text makes a link (clipboard can't be granted
  // to extension pages in automation, so dispatch the paste event).
  await editor.fill('the docs')
  await page.keyboard.press('ControlOrMeta+a')
  await editor.evaluate(el => {
    const data = new DataTransfer()
    data.setData('text/plain', 'https://example.com/docs')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(editor).toHaveText('[the docs](https://example.com/docs)')

  // ⌘⌥T aligns the table under the cursor.
  await editor.fill('|a|bb|\n|-|-|\n|ccc|d|')
  await page.keyboard.press('ControlOrMeta+Alt+t')
  await expect(page.locator('.ms-editor .cm-line').first()).toHaveText('| a   | bb  |')

  // Editor commands are listed in the shortcut help; the cursor hides in Read view.
  await page.locator('[data-mode="read"]').click()
  await expect(cursor).toBeHidden()
  await page.keyboard.press('Shift+?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText(
    'Bold (editor)',
  )
})

test('editor: two-way scroll sync, double-click to jump, cursor highlight, divider', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  // 80 sections of 4 lines each: "## Section i" is on line 4i - 3.
  const doc = Array.from(
    { length: 80 },
    (_, i) =>
      `## Section ${i + 1}\n\nParagraph ${i + 1} with enough words to wrap a little.\n`,
  ).join('\n')
  await editor.fill(doc)
  await expect(page.locator('.ms-doc h2').last()).toHaveText(/Section 80$/)

  /** First section heading visible at the top of each pane. */
  const tops = () =>
    page.evaluate(() => {
      const first = (sel: string, box: Element, re: RegExp) => {
        const top = box.getBoundingClientRect().top
        for (const el of document.querySelectorAll(sel)) {
          const m = re.exec(el.textContent ?? '')
          if (m && el.getBoundingClientRect().bottom > top) return Number(m[1])
        }
        return -1
      }
      return {
        editor: first(
          '.cm-line',
          document.querySelector('.cm-scroller')!,
          /^## Section (\d+)$/,
        ),
        preview: first(
          '.ms-doc h2',
          document.querySelector('.ms-pane--preview')!,
          /Section (\d+)$/,
        ),
      }
    })
  const inSync = async () => {
    const t = await tops()
    return Math.abs(t.editor - t.preview) <= 1 && t.editor > 1
  }
  const scroller = page.locator('.ms-editor .cm-scroller')
  const preview = page.locator('.ms-pane--preview')

  // Editor → preview.
  await scroller.evaluate(e => e.scrollTo(0, e.scrollHeight * 0.5))
  await expect.poll(inSync).toBe(true)
  // Preview → editor.
  await preview.evaluate(e => e.scrollTo(0, e.scrollHeight * 0.25))
  await expect.poll(inSync).toBe(true)
  // Bottom follows bottom.
  await scroller.evaluate(e => e.scrollTo(0, e.scrollHeight))
  await expect
    .poll(() => preview.evaluate(e => e.scrollTop + e.clientHeight >= e.scrollHeight - 2))
    .toBe(true)

  // Double-click a preview block → the editor cursor moves to its source line,
  // and the block is highlighted as the cursor's block.
  const target = page.locator('.ms-doc h2', { hasText: /Section 60$/ })
  await target.scrollIntoViewIfNeeded()
  await target.dblclick()
  await expect(page.locator('.ms-status__cursor')).toHaveText(/^Ln 237, Col 1/)
  await expect(target).toHaveClass(/ms-cursor-block/)
  await expect(editor).toBeFocused()

  // Divider: drag to ~30%, keyboard nudges by 2%, and the ratio is saved.
  const panes = (await page.locator('.ms-panes').boundingBox())!
  const divider = page.locator('.ms-split-divider')
  const box = (await divider.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(panes.x + panes.width * 0.3, box.y + 200, { steps: 5 })
  await page.mouse.up()
  const editorWidth = async () =>
    ((await page.locator('.ms-pane--editor').boundingBox())?.width ?? 0) / panes.width
  await expect.poll(editorWidth).toBeCloseTo(0.3, 1)
  await divider.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(editorWidth).toBeCloseTo(0.32, 1)
  await expect(divider).toHaveAttribute('aria-valuenow', '32')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { settings } = await chrome.storage.sync.get('settings')
        return (settings as { layout?: { splitRatio?: number } })?.layout?.splitRatio
      }),
    )
    .toBeCloseTo(0.32, 2)
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
  const editor = page.locator('.ms-editor .cm-content')
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
