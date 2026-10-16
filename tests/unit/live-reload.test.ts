import type { LoadedDoc } from '@/viewer/app'
import { documentName, sameVersion } from '@/viewer/live-reload'

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
