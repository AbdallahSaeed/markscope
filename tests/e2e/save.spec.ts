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
  const editor = page.locator('.ms-editor')
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
  await page.locator('.ms-editor').fill('# Saved once')
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
  await expect(page.locator('.ms-editor')).toBeVisible()
  await installFakeFileSystem(page)
  await page.locator('.ms-editor').fill('# Scratch')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.ms-toast').last()).toContainText('save automatically')
  await page.keyboard.press('Control+Shift+s')
  await expect.poll(() => writes(page)).toEqual(['# Scratch'])
})
