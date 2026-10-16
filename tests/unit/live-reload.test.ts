import type { LoadedDoc, ViewerApp } from '@/viewer/app'
import type { Layout } from '@/viewer/layout'
import { documentName, LiveReload, sameVersion } from '@/viewer/live-reload'

describe('live reload helpers', () => {
  test('sameVersion compares files by modification time and URLs by text', () => {
    expect(
      sameVersion({ text: 'a', lastModified: 5 }, { text: 'b', lastModified: 5 }),
    ).toBe(true)
    expect(
      sameVersion({ text: 'a', lastModified: 5 }, { text: 'a', lastModified: 6 }),
    ).toBe(false)
    expect(sameVersion({ text: 'same' }, { text: 'same' })).toBe(true)
    expect(sameVersion({ text: 'one' }, { text: 'two' })).toBe(false)
    expect(sameVersion({ text: 'a', lastModified: 1 }, { text: 'a' })).toBe(false)
  })

  test('documentName prefers the file, then the folder path, then the URL', () => {
    const base: LoadedDoc = {
      ref: null,
      title: 'Title',
      source: '',
      sourceUrl: null,
      localId: null,
      scratch: false,
    }
    expect(
      documentName({ ...base, handle: { name: 'notes.md' } as FileSystemFileHandle }),
    ).toBe('notes.md')
    expect(
      documentName({ ...base, folder: { id: 'f', name: 'repo', path: 'docs/a.md' } }),
    ).toBe('a.md')
    expect(documentName({ ...base, sourceUrl: 'https://example.com/x/readme.md' })).toBe(
      'readme.md',
    )
    expect(documentName(base)).toBe('Title')
  })
})

describe('LiveReload.receive', () => {
  /** A minimal stand-in for ViewerApp with the state receive() reads. */
  function setup({ typed = 'saved', modified = false } = {}) {
    const banner = document.createElement('div')
    banner.hidden = true
    const state = { editorText: typed }
    const app = {
      doc: {
        ref: null,
        title: 'Doc',
        source: 'saved',
        sourceUrl: null,
        localId: null,
        scratch: false,
        handle: { name: 'notes.md' },
        lastModified: 1,
      } as unknown as LoadedDoc,
      modified,
      savedSource: 'saved',
      layout: { banner } as unknown as Layout,
      editor: {
        get value() {
          return state.editorText
        },
        setValue: vi.fn((t: string) => {
          state.editorText = t
        }),
        cancelPending: vi.fn(),
      },
      render: vi.fn(async () => undefined),
      markSaved: vi.fn(),
      hasUnsavedEdits() {
        return this.modified || state.editorText !== this.savedSource
      },
    }
    const live = new LiveReload(app as unknown as ViewerApp)
    const buttons = () => [...banner.querySelectorAll('button')]
    return { app, live, banner, buttons }
  }

  test('keystrokes still inside the typing debounce are protected, not overwritten', async () => {
    // `modified` is still false: the debounce hasn't fired yet.
    const { app, live, banner, buttons } = setup({ typed: 'just typed' })
    await live.receive({ text: 'from disk', lastModified: 2 })
    expect(app.editor.setValue).not.toHaveBeenCalled()
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toMatch(/notes\.md changed on disk while you were editing/)
    expect(buttons().map(b => b.textContent)).toEqual([
      'Keep mine',
      'Load theirs',
      'Compare…',
      '',
    ])
  })

  test('the same disk version does not rebuild the banner; a newer one does', async () => {
    const { live, buttons } = setup({ typed: 'edits', modified: true })
    await live.receive({ text: 'disk v2', lastModified: 2 })
    const first = buttons()[0]
    await live.receive({ text: 'disk v2', lastModified: 2 })
    expect(buttons()[0]).toBe(first)
    await live.receive({ text: 'disk v3', lastModified: 3 })
    expect(buttons()[0]).not.toBe(first)
  })

  test('without edits the disk version is applied', async () => {
    const { app, live, banner } = setup()
    await live.receive({ text: 'from disk', lastModified: 2 })
    expect(app.editor.setValue).toHaveBeenCalledWith('from disk')
    expect(app.savedSource).toBe('from disk')
    expect(app.doc).toMatchObject({ source: 'from disk', lastModified: 2 })
    expect(app.render).toHaveBeenCalled()
    expect(banner.hidden).toBe(true)
  })

  test('a disk version equal to the typed text just marks it saved', async () => {
    const { app, live, banner } = setup({ typed: 'same text' })
    await live.receive({ text: 'same text', lastModified: 5 })
    expect(app.editor.cancelPending).toHaveBeenCalled()
    expect(app.doc).toMatchObject({ source: 'same text', lastModified: 5 })
    expect(app.markSaved).toHaveBeenCalled()
    expect(banner.hidden).toBe(true)
  })

  test('Keep mine makes the disk version the baseline and closes the banner', async () => {
    const { app, live, banner, buttons } = setup({ typed: 'edits', modified: true })
    await live.receive({ text: 'disk v2', lastModified: 2 })
    buttons()[0]?.click()
    expect(app.savedSource).toBe('disk v2')
    expect(app.doc).toMatchObject({ lastModified: 2 })
    expect(banner.hidden).toBe(true)
  })
})
