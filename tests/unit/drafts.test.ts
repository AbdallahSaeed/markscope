import type { ViewerApp } from '@/viewer/app'
import { offerDraftRestore } from '@/viewer/draft-restore'
import {
  DRAFT_DELAY_MS,
  DRAFT_MAX_AGE_MS,
  draftKey,
  DraftSaver,
  formatAgo,
  hashText,
  type Draft,
} from '@/viewer/drafts'
import { showBanner, type Layout } from '@/viewer/layout'

describe('draft helpers', () => {
  const base = { scratch: false, localId: null, sourceUrl: null }

  test('draftKey identifies documents; scratch and sourceless docs have none', () => {
    expect(draftKey({ ...base, sourceUrl: 'https://x.dev/a.md' })).toBe(
      'url:https://x.dev/a.md',
    )
    expect(draftKey({ ...base, localId: 'abc' })).toBe('local:abc')
    expect(
      draftKey({ ...base, localId: 'abc', folder: { id: 'f1', path: 'docs/a.md' } }),
    ).toBe('folder:f1:docs/a.md')
    expect(draftKey({ ...base, scratch: true, localId: 'abc' })).toBeNull()
    expect(draftKey(base)).toBeNull()
  })

  test('hashText is stable and sensitive to small changes', () => {
    expect(hashText('hello')).toBe(hashText('hello'))
    expect(hashText('hello')).not.toBe(hashText('hellp'))
    expect(hashText('')).toMatch(/^[0-9a-f]+:0$/)
  })

  test('formatAgo describes recent times', () => {
    const now = 1_000_000_000
    expect(formatAgo(now - 5_000, now)).toMatch(/minute|now/)
    expect(formatAgo(now - 3 * 60_000, now)).toMatch(/3 minutes ago/)
    expect(formatAgo(now - 2 * 3_600_000, now)).toMatch(/2 hours ago/)
    expect(formatAgo(now - 86_400_000, now)).toMatch(/yesterday|1 day ago/)
  })
})

describe('DraftSaver', () => {
  afterEach(() => vi.useRealTimers())

  function setup() {
    const put = vi.fn(async (_d: Draft) => undefined)
    const del = vi.fn(async (_k: string) => undefined)
    const onError = vi.fn()
    const saver = new DraftSaver({ put, delete: del } as never, onError)
    return { saver, put, del, onError }
  }

  test('writes the latest text once, after a pause', () => {
    vi.useFakeTimers()
    const { saver, put } = setup()
    saver.schedule('url:a', 'one', 'base')
    saver.schedule('url:a', 'two', 'base')
    expect(put).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DRAFT_DELAY_MS)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]?.[0]).toMatchObject({
      key: 'url:a',
      text: 'two',
      baseHash: hashText('base'),
    })
  })

  test('flush writes immediately; clear drops the pending write and deletes', async () => {
    vi.useFakeTimers()
    const { saver, put, del } = setup()
    saver.schedule('url:a', 'text', 'base')
    await saver.flush()
    expect(put).toHaveBeenCalledTimes(1)
    await saver.flush()
    expect(put).toHaveBeenCalledTimes(1) // nothing pending

    saver.schedule('url:a', 'more', 'base')
    await saver.clear('url:a')
    vi.advanceTimersByTime(DRAFT_DELAY_MS * 2)
    expect(put).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('url:a')
  })

  test('storage errors are reported, not thrown', async () => {
    const onError = vi.fn()
    const saver = new DraftSaver(
      {
        put: async () => Promise.reject(new Error('quota')),
        delete: async () => Promise.reject(new Error('gone')),
      } as never,
      onError,
    )
    saver.schedule('url:a', 'x', '')
    await saver.flush()
    await saver.clear('url:a')
    expect(onError).toHaveBeenCalledTimes(2)
  })

  test('the max age is about a month', () => {
    expect(DRAFT_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('banners', () => {
  test('show several actions', () => {
    const banner = document.createElement('div')
    const a = vi.fn()
    const b = vi.fn()
    showBanner({ banner } as unknown as Layout, 'Changed on disk', [
      { label: 'Keep mine', run: a },
      { label: 'Load theirs', run: b },
    ])
    const buttons = [...banner.querySelectorAll('button')].map(x => x.textContent)
    expect(buttons).toEqual(['Keep mine', 'Load theirs', ''])
    banner.querySelector<HTMLButtonElement>('button')?.click()
    expect(a).toHaveBeenCalledTimes(1)
    expect(banner.hidden).toBe(false)
  })
})

describe('offerDraftRestore', () => {
  function setup(draft: Draft | undefined, source = 'saved text') {
    const banner = document.createElement('div')
    banner.hidden = true
    const app = {
      doc: { scratch: false, localId: 'doc1', sourceUrl: null, source },
      modified: false,
      layout: { banner } as unknown as Layout,
      applyText: vi.fn(async () => undefined),
    }
    const store = {
      get: vi.fn(async () => draft),
      delete: vi.fn(async () => undefined),
    }
    const buttons = () =>
      [...banner.querySelectorAll('button')].map(b => b.textContent).filter(Boolean)
    const click = (label: string) =>
      [...banner.querySelectorAll('button')].find(b => b.textContent === label)?.click()
    return { app, store, banner, buttons, click }
  }
  const draft = (over: Partial<Draft> = {}): Draft => ({
    key: 'local:doc1',
    text: 'my unsaved edits',
    baseHash: hashText('saved text'),
    updatedAt: Date.now() - 120_000,
    ...over,
  })

  test('offers Restore when the document is unchanged since the edits', async () => {
    const { app, store, banner, buttons, click } = setup(draft())
    await offerDraftRestore(app as unknown as ViewerApp, store)
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toMatch(/Unsaved edits from 2 minutes ago/)
    expect(buttons()).toEqual(['Restore', 'Discard them'])
    click('Restore')
    expect(app.applyText).toHaveBeenCalledWith('my unsaved edits')
  })

  test('offers Compare first when the document changed since', async () => {
    const { app, store, banner, buttons } = setup(draft({ baseHash: hashText('older') }))
    await offerDraftRestore(app as unknown as ViewerApp, store)
    expect(banner.textContent).toMatch(/has changed since/)
    expect(buttons()).toEqual(['Compare…', 'Restore anyway', 'Discard them'])
  })

  test('Discard them deletes the backup', async () => {
    const { app, store, banner, click } = setup(draft())
    await offerDraftRestore(app as unknown as ViewerApp, store)
    click('Discard them')
    expect(store.delete).toHaveBeenCalledWith('local:doc1')
    expect(banner.hidden).toBe(true)
  })

  test('silently drops a backup identical to the document', async () => {
    const { app, store, banner } = setup(draft({ text: 'saved text' }))
    await offerDraftRestore(app as unknown as ViewerApp, store)
    expect(store.delete).toHaveBeenCalledWith('local:doc1')
    expect(banner.hidden).toBe(true)
  })

  test('does nothing without a backup, or once the user is already editing', async () => {
    const none = setup(undefined)
    await offerDraftRestore(none.app as unknown as ViewerApp, none.store)
    expect(none.banner.hidden).toBe(true)

    const editing = setup(draft())
    editing.app.modified = true
    await offerDraftRestore(editing.app as unknown as ViewerApp, editing.store)
    expect(editing.banner.hidden).toBe(true)
  })

  test('scratch documents are never offered a backup', async () => {
    const { app, store, banner } = setup(draft())
    app.doc = { ...app.doc, scratch: true }
    await offerDraftRestore(app as unknown as ViewerApp, store)
    expect(store.get).not.toHaveBeenCalled()
    expect(banner.hidden).toBe(true)
  })
})
