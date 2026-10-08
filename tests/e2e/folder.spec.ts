/**
 * "Open folder" with real FileSystemDirectoryHandles from the origin-private
 * file system (only the native picker dialog is replaced).
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** Creates project/{README.md, docs/guide.md, assets/logo.png, node_modules/x.md} in OPFS. */
async function createProject(page: Page): Promise<void> {
  await page.evaluate(async png => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('project', { recursive: true }).catch(() => undefined)
    const project = await root.getDirectoryHandle('project', { create: true })
    const write = async (
      dir: FileSystemDirectoryHandle,
      name: string,
      data: string | Uint8Array,
    ) => {
      const file = await dir.getFileHandle(name, { create: true })
      const w = await (
        file as unknown as {
          createWritable(): Promise<
            WritableStreamDefaultWriter & {
              write(d: unknown): Promise<void>
              close(): Promise<void>
            }
          >
        }
      ).createWritable()
      await w.write(data)
      await w.close()
    }
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0))
    const assets = await project.getDirectoryHandle('assets', { create: true })
    const docs = await project.getDirectoryHandle('docs', { create: true })
    const deps = await project.getDirectoryHandle('node_modules', { create: true })
    await write(assets, 'logo.png', bytes)
    await write(
      project,
      'README.md',
      '# Project readme\n\n![Logo](assets/logo.png)\n\nSee the [guide](docs/guide.md#setup).\n',
    )
    await write(
      docs,
      'guide.md',
      '# Guide\n\n![Up](../assets/logo.png)\n\n![Escape](../../../../etc/secret.png)\n\n## Setup\n\nBack to [readme](../README.md).\n',
    )
    await write(deps, 'ignored.md', '# should not be listed')
  }, PNG_1PX)
  await installPickers(page)
}

/** Replaces the native pickers (they can't be driven headlessly); re-run after navigation. */
async function installPickers(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const project = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('project')
    const w = window as unknown as Record<string, unknown>
    w.showDirectoryPicker = async () => project
    w.showOpenFilePicker = async () => [await project.getFileHandle('README.md')]
  })
}

const imageLoaded = (page: Page, alt: string) =>
  page
    .locator(`.ms-doc img[alt="${alt}"]`)
    .evaluate(
      img =>
        (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    )

test('open folder: tree, relative images, in-place links, back/forward, palette', async ({
  viewer,
}) => {
  const page = await viewer()
  await createProject(page)
  await page.evaluate(
    () => ((window as unknown as { __noReload: boolean }).__noReload = true),
  )
  await page.getByRole('button', { name: /Open folder/ }).click()

  // README is the default document; relative images load from the folder.
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)
  await expect(page).toHaveURL(/\?ws=[a-f0-9]+&path=README\.md/)
  await expect.poll(() => imageLoaded(page, 'Logo')).toBe(true)
  await expect(page.locator('.ms-subtitle')).toHaveText('project / README.md')

  // Files tab: Markdown only, dependency folders skipped, current file marked.
  const files = page.locator('#ms-panel-files')
  await expect(page.locator('#ms-tab-files')).toBeVisible()
  await expect(files.locator('.ms-files__file')).toHaveText(['guide.md', 'README.md'])
  await expect(files.locator('[aria-current="page"]')).toHaveText('README.md')

  // Links to other documents navigate in place (no reload) at the anchor.
  await page.locator('.ms-doc a', { hasText: 'guide' }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  await expect(page).toHaveURL(/path=docs%2Fguide\.md#setup$/)
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true)
  await expect.poll(() => imageLoaded(page, 'Up')).toBe(true)
  // `..` cannot climb above the folder root: the image just fails safely.
  await expect(page.locator('.ms-broken-image', { hasText: 'Escape' })).toBeVisible()
  await expect(files.locator('[aria-current="page"]')).toHaveText('guide.md')

  // Back / Forward stay in place too.
  await page.goBack()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)
  await page.goForward()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Guide/)
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true)

  // Command palette searches the folder's files.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('readme')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)

  // Reload keeps working (OPFS access is always granted) and the folder is listed on the start page.
  await page.reload()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)
  await page.goto(page.url().split('?')[0] ?? '')
  await expect(page.locator('.ms-folder-link', { hasText: 'project' })).toBeVisible()
})

test('a file opened on its own explains missing images and finds itself in a picked folder', async ({
  viewer,
}) => {
  const page = await viewer()
  await createProject(page)
  await page.getByRole('button', { name: /Open file/ }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)
  await expect(page).toHaveURL(/\?doc=/)

  // No silent failure: the relative image explains itself.
  const placeholder = page.locator('.ms-needs-folder')
  await expect(placeholder).toContainText('open the folder')
  await expect(page.locator('.ms-banner')).toContainText(
    'Open the folder that contains it',
  )
  await installPickers(page) // "Open file" navigated to a new page

  // Clicking it opens the folder and locates this document inside it.
  await placeholder.click()
  await expect(page).toHaveURL(/\?ws=[a-f0-9]+&path=README\.md/)
  await expect.poll(() => imageLoaded(page, 'Logo')).toBe(true)
  await expect(page.locator('.ms-needs-folder')).toHaveCount(0)
})

test('folder without Markdown: overview, all files listed but not openable', async ({
  viewer,
}) => {
  const page = await viewer()
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('examples', { recursive: true }).catch(() => undefined)
    const dir = await root.getDirectoryHandle('examples', { create: true })
    const write = async (d: FileSystemDirectoryHandle, n: string, t: string) => {
      const f = await d.getFileHandle(n, { create: true })
      const w = await (
        f as unknown as {
          createWritable(): Promise<{
            write(t: string): Promise<void>
            close(): Promise<void>
          }>
        }
      ).createWritable()
      await w.write(t)
      await w.close()
    }
    const src = await dir.getDirectoryHandle('src', { create: true })
    await write(dir, 'example.py', 'print(1)')
    await write(dir, 'data.csv', 'a,b')
    await write(src, 'main.ts', 'export {}')
    ;(
      window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
      }
    ).showDirectoryPicker = async () => dir
  })
  await page.getByRole('button', { name: /Open folder/ }).click()

  const overview = page.locator('.ms-folder-overview')
  await expect(overview).toContainText('No Markdown files in “examples”')
  await expect(overview).toContainText('3 files')
  await expect(overview.locator('.ms-type-chips li')).toHaveCount(3)
  await expect(page.locator('.ms-banner')).toBeHidden()

  // Files tab lists everything; non-Markdown files are inert (not links).
  const files = page.locator('#ms-panel-files')
  await expect(files).toBeVisible()
  await expect(files.locator('.ms-files__toggle')).toHaveAttribute('aria-pressed', 'true')
  await files.locator('summary', { hasText: 'src' }).click()
  await expect(files.locator('.ms-files__file.is-other')).toHaveText([
    'main.tsts',
    'data.csvcsv',
    'example.pypy',
  ])
  await expect(files.locator('a.ms-files__file')).toHaveCount(0)
  await files.locator('.ms-files__file', { hasText: 'example.py' }).click()
  await expect(overview).toBeVisible() // clicking did not navigate

  // Filtering works across all files.
  await files.getByLabel('Filter files').fill('main')
  await expect(files.locator('.ms-files__flat .ms-files__file')).toHaveText([
    'src/main.tsts',
  ])
})

test('"Show all files" toggle and the toolbar home button', async ({ viewer }) => {
  const page = await viewer()
  await createProject(page)
  await page.getByRole('button', { name: /Open folder/ }).click()
  await expect(page.locator('.ms-doc h1')).toHaveText(/Project readme/)

  const files = page.locator('#ms-panel-files')
  const toggle = files.locator('.ms-files__toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(files.locator('.ms-files__file.is-other')).toHaveCount(0)
  await toggle.click()
  await files.locator('summary', { hasText: 'assets' }).click()
  await expect(
    files.locator('.ms-files__file.is-other', { hasText: 'logo.png' }),
  ).toBeVisible()
  await expect(files.locator('a.ms-files__file', { hasText: 'README.md' })).toBeVisible() // Markdown still opens

  // Home button returns to the start page, which lists the folder.
  await page.getByRole('button', { name: /Start page/ }).click()
  await expect(page.locator('#ms-home-title')).toBeVisible()
  await expect(page.locator('.ms-folder-link', { hasText: 'project' })).toBeVisible()
})
