/**
 * Save / Save as / Reconnect with a mocked File System Access API
 * (native pickers and permission prompts cannot be driven headlessly).
 */
import type { Page } from '@playwright/test'
import { expect, openMarkdown, test } from './fixtures'

async function installFakeFileSystem(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const fake = {
      kind: 'file',
      name: 'guide-copy.md',
      perm: 'granted' as 'granted' | 'prompt',
      content: '',
      mtime: 1,
      writes: [] as string[],
      queryPermission: async () => fake.perm,
      requestPermission: async () => {
        fake.perm = 'granted'
        return fake.perm
      },
      createWritable: async () => ({
        write: async (t: string) => {
          fake.content = t
        },
        close: async () => {
          fake.mtime += 1
          fake.writes.push(fake.content)
        },
      }),
      getFile: async () =>
        new File([fake.content], fake.name, { lastModified: fake.mtime }),
    }
    w.__fakeFile = fake
    w.showSaveFilePicker = async () => fake
  })
}

const writes = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __fakeFile: { writes: string[] } }).__fakeFile.writes,
  )

test('save: edits to a web document are saved via "Save as", then saved in place', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await installFakeFileSystem(page)
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  await editor.fill('# Edited guide\n\nFirst edit.')

  // Unsaved state is visible: status hint, Save button, title marker.
  await expect(page.locator('.ms-status__modified')).toContainText('S to save')
  await expect(page.locator('.ms-save-btn')).toBeVisible()
  await expect(page).toHaveTitle(/•/)

  // Save immediately (inside the editor's debounce window).
  await editor.press('Control+s')
  await expect.poll(() => writes(page)).toEqual(['# Edited guide\n\nFirst edit.'])
  await expect(page.locator('.ms-save-btn')).toBeHidden()
  await expect(page.locator('.ms-status__modified')).toBeHidden()
  await expect(page.locator('.ms-toast').last()).toContainText('original on')
  // The viewer now points at the saved local copy.
  await expect(page).toHaveURL(/viewer\.html\?doc=/)
  await expect(page.locator('.ms-subtitle')).toContainText('guide-copy.md')

  // Second edit + Save writes to the same file without a picker.
  await editor.fill('# Edited guide\n\nSecond edit.')
  await page.locator('.ms-save-btn').click()
  await expect
    .poll(() => writes(page))
    .toEqual(['# Edited guide\n\nFirst edit.', '# Edited guide\n\nSecond edit.'])
  // Relative links still resolve against the original URL.
  await editor.fill('[other](./other.md)')
  await expect(page.locator('.ms-doc a', { hasText: 'other' })).toHaveAttribute(
    'href',
    /src=.*other\.md/,
  )
})

test('save: lost file permission pauses live reload and Reconnect restores it', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await installFakeFileSystem(page)
  await page.locator('[data-mode="split"]').click()
  await page.locator('.ms-editor .cm-content').fill('# Saved once')
  await page.keyboard.press('Control+s')
  await expect.poll(() => writes(page)).toHaveLength(1)

  // Simulate a page reload: Chrome drops the handle's permission.
  await page.evaluate(() => {
    ;(window as unknown as { __fakeFile: { perm: string } }).__fakeFile.perm = 'prompt'
    return chrome.storage.sync.set({
      settings: { liveReload: { enabled: true, intervalMs: 500 } },
    })
  })
  const banner = page.locator('.ms-banner')
  await expect(banner).toContainText('needs your permission to read guide-copy.md', {
    timeout: 10_000,
  })

  // The file changes on disk; Reconnect (a click) re-grants access and syncs.
  await page.evaluate(() => {
    const f = (window as unknown as { __fakeFile: { content: string; mtime: number } })
      .__fakeFile
    f.content = '# Changed on disk'
    f.mtime += 5
  })
  await banner.getByRole('button', { name: 'Reconnect' }).click()
  await expect(banner).toBeHidden()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Changed on disk/)
})

test('save: scratch documents autosave and offer "Save as" for a real file', async ({
  viewer,
}) => {
  const page = await viewer()
  await page.getByRole('button', { name: /Scratch document/ }).click()
  await expect(page.locator('.ms-editor .cm-content')).toBeVisible()
  await installFakeFileSystem(page)
  await page.locator('.ms-editor .cm-content').fill('# Scratch')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.ms-toast').last()).toContainText('save automatically')
  await page.keyboard.press('Control+Shift+s')
  await expect.poll(() => writes(page)).toEqual(['# Scratch'])
})

test('discard: reverts unsaved edits, offers Undo, and respects the last save', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  await installFakeFileSystem(page)
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  const discard = page.getByRole('button', { name: 'Discard', exact: true })
  await expect(discard).toBeHidden()

  // Edit, then discard → back to the original document.
  await editor.fill('# Scribbles')
  await expect(page.locator('.ms-doc h1')).toHaveText(/Scribbles/)
  await expect(discard).toBeVisible()
  await discard.click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(editor).toHaveText(/^# Guide/)
  await expect(discard).toBeHidden()
  await expect(page.locator('.ms-save-btn')).toBeHidden()
  await expect(page.locator('.ms-status__modified')).toBeHidden()
  await expect(page).not.toHaveTitle(/•/)

  // Undo brings the edits back (still unsaved).
  await page.locator('.ms-banner').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Scribbles/)
  await expect(editor).toHaveText('# Scribbles')
  await expect(discard).toBeVisible()

  // Save, edit again, discard → reverts to the SAVED text, not the original.
  await page.keyboard.press('Control+s')
  await expect.poll(() => writes(page)).toEqual(['# Scribbles'])
  await editor.fill('# Second draft')
  await discard.click()
  await expect(editor).toHaveText('# Scribbles')
  await expect(page.locator('.ms-doc h1')).toHaveText(/Scribbles/)

  // Typing then discarding immediately (inside the editor's debounce) sticks.
  await editor.pressSequentially('!!', { delay: 0 })
  await discard.click()
  await page.waitForTimeout(400)
  await expect(editor).toHaveText('# Scribbles')
  await expect(discard).toBeHidden()
})

/** Simulates another program writing the file. */
const changeOnDisk = (page: Page, text: string) =>
  page.evaluate(t => {
    const f = (window as unknown as { __fakeFile: { content: string; mtime: number } })
      .__fakeFile
    f.content = t
    f.mtime += 5
  }, text)

/** Number of unsaved-edit backups in the viewer's IndexedDB. */
const draftCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('markscope')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('drafts')) return resolve(0)
          const count = db.transaction('drafts').objectStore('drafts').count()
          count.onsuccess = () => {
            resolve(count.result)
            db.close()
          }
        }
      }),
  )

/** Opens guide.md and saves it once to the fake file, so it has a handle. */
async function openSavedCopy(page: Page) {
  await installFakeFileSystem(page)
  await page.locator('[data-mode="split"]').click()
  const editor = page.locator('.ms-editor .cm-content')
  await editor.fill('# Mine\n\nShared line.')
  await page.keyboard.press('Control+s')
  await expect.poll(() => writes(page)).toHaveLength(1)
  return editor
}

test('conflict: saving over a file that changed on disk asks first', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  const editor = await openSavedCopy(page)
  await editor.fill('# Mine v2')
  await changeOnDisk(page, '# Theirs')

  await page.keyboard.press('Control+s')
  const banner = page.locator('.ms-banner')
  await expect(banner).toContainText('Saving now would overwrite that change')
  expect(await writes(page)).toHaveLength(1) // nothing written yet

  await banner.getByRole('button', { name: 'Overwrite' }).click()
  await expect.poll(() => writes(page)).toEqual(['# Mine\n\nShared line.', '# Mine v2'])
  await expect(page.locator('.ms-save-btn')).toBeHidden()
})

test('conflict: a change on disk while editing can be compared, merged or loaded', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  const editor = await openSavedCopy(page)
  await page.evaluate(() =>
    chrome.storage.sync.set({
      settings: { liveReload: { enabled: true, intervalMs: 500 } },
    }),
  )
  const banner = page.locator('.ms-banner')

  // Compare: take the disk change with the merge arrow, then use the result.
  await editor.fill('# Mine v2\n\nShared line.')
  await changeOnDisk(page, '# Theirs\n\nShared line.')
  // Wait for the visible button: a hidden earlier banner can still hold this text.
  await expect(banner.getByRole('button', { name: 'Keep mine' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(banner).toContainText('changed on disk while you were editing')
  await banner.getByRole('button', { name: 'Compare…' }).click()
  const dialog = page.locator('dialog.ms-merge')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.ms-merge__status')).toHaveText('1 difference')
  await dialog.locator('.cm-merge-revert button').first().click()
  await expect(dialog.locator('.ms-merge__status')).toHaveText('No differences')
  await dialog.getByRole('button', { name: 'Use my version' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Theirs/)
  await expect(page.locator('.ms-save-btn')).toBeHidden() // matches disk now

  // Load theirs replaces the edits, and Undo brings them back.
  await editor.fill('# Mine v3')
  await changeOnDisk(page, '# Theirs 2')
  // Wait for the visible button: a hidden earlier banner can still hold this text.
  await expect(banner.getByRole('button', { name: 'Keep mine' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(banner).toContainText('changed on disk while you were editing')
  // Later polls see the same disk version and must not rebuild the banner
  // (that would steal keyboard focus and make the buttons unclickable).
  const loadTheirs = banner.getByRole('button', { name: 'Load theirs' })
  const button = await loadTheirs.elementHandle()
  await page.waitForTimeout(1200) // more than two 500 ms polls
  expect(await button?.evaluate(el => el.isConnected)).toBe(true)
  await loadTheirs.click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Theirs 2/)
  await expect(page.locator('.ms-save-btn')).toBeHidden()
  await banner.getByRole('button', { name: 'Undo' }).click()
  await expect(editor).toHaveText('# Mine v3')
  await expect(page.locator('.ms-save-btn')).toBeVisible()
})

test('drafts: unsaved edits survive a reload and can be restored', async ({
  context,
  server,
}) => {
  const page = await openMarkdown(context, `${server.url}/guide.md`)
  page.on('dialog', d => void d.accept()) // the "leave site?" prompt
  await page.locator('[data-mode="split"]').click()
  await page.locator('.ms-editor .cm-content').fill('# Draft text')
  await expect.poll(() => draftCount(page)).toBe(1)

  await page.reload()
  const banner = page.locator('.ms-banner')
  await expect(banner).toContainText('Unsaved edits from')
  await banner.getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Draft text/)
  await expect(page.locator('.ms-save-btn')).toBeVisible()

  // Discarding the edits removes the backup, so nothing is offered next time.
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect.poll(() => draftCount(page)).toBe(0)
  await page.reload()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(banner).toBeHidden()
})
