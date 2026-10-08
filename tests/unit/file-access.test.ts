import {
  canWrite,
  ensurePermission,
  FileAccessNeededError,
  hasPermission,
  pickSaveTarget,
  readIfPermitted,
  suggestedFileName,
  supportsSavePicker,
  writeText,
} from '@/viewer/file-access'

type Perm = 'granted' | 'denied' | 'prompt'

function fakeHandle(
  opts: {
    perm?: Perm
    grantOnRequest?: boolean
    writable?: boolean
    legacy?: boolean
  } = {},
) {
  let perm: Perm = opts.perm ?? 'granted'
  let content = 'initial'
  const written: string[] = []
  const handle = {
    kind: 'file',
    name: 'notes.md',
    getFile: vi.fn(async () => new File([content], 'notes.md', { lastModified: 42 })),
    ...(opts.legacy
      ? {}
      : {
          queryPermission: vi.fn(async () => perm),
          requestPermission: vi.fn(async () => {
            if (opts.grantOnRequest) perm = 'granted'
            return perm
          }),
        }),
    ...(opts.writable === false
      ? {}
      : {
          createWritable: vi.fn(async () => ({
            write: async (t: string) => {
              content = t
            },
            close: async () => {
              written.push(content)
            },
          })),
        }),
  }
  return { handle: handle as unknown as FileSystemFileHandle, raw: handle, written }
}

describe('file access permissions', () => {
  test('granted handles read without prompting', async () => {
    const { handle, raw } = fakeHandle()
    expect(await hasPermission(handle, 'read')).toBe(true)
    expect((await readIfPermitted(handle)).name).toBe('notes.md')
    expect(raw.requestPermission).not.toHaveBeenCalled()
  })

  test('handles restored after a reload (prompt state) never call getFile from timers', async () => {
    const { handle, raw } = fakeHandle({ perm: 'prompt' })
    await expect(readIfPermitted(handle)).rejects.toBeInstanceOf(FileAccessNeededError)
    expect(raw.getFile).not.toHaveBeenCalled()
  })

  test('ensurePermission requests access (user gesture) and reports the outcome', async () => {
    const granted = fakeHandle({ perm: 'prompt', grantOnRequest: true })
    expect(await ensurePermission(granted.handle, 'readwrite')).toBe(true)
    expect(granted.raw.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    const denied = fakeHandle({ perm: 'prompt' })
    expect(await ensurePermission(denied.handle, 'read')).toBe(false)
  })

  test('browsers without the permission API are treated as granted', async () => {
    const { handle } = fakeHandle({ legacy: true })
    expect(await hasPermission(handle, 'read')).toBe(true)
    expect(await ensurePermission(handle, 'readwrite')).toBe(true)
  })

  test('permission API failures are treated as not granted', async () => {
    const { handle, raw } = fakeHandle()
    raw.queryPermission = vi.fn(async () => {
      throw new Error('boom')
    })
    expect(await hasPermission(handle, 'read')).toBe(false)
  })
})

describe('writing', () => {
  test('writes and closes the stream', async () => {
    const { handle, written } = fakeHandle()
    expect(canWrite(handle)).toBe(true)
    await writeText(handle, '# Saved')
    expect(written).toEqual(['# Saved'])
  })

  test('read-only handles are reported and refuse writes', async () => {
    const { handle } = fakeHandle({ writable: false })
    expect(canWrite(handle)).toBe(false)
    await expect(writeText(handle, 'x')).rejects.toThrow(/cannot write/)
  })
})

describe('save picker', () => {
  afterEach(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  test('absent picker → unsupported, null result', async () => {
    expect(supportsSavePicker()).toBe(false)
    expect(await pickSaveTarget('a.md')).toBeNull()
  })

  test('returns the picked handle with Markdown types and suggested name', async () => {
    const { handle } = fakeHandle()
    const picker = vi.fn(async () => handle)
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker
    expect(supportsSavePicker()).toBe(true)
    expect(await pickSaveTarget('Guide.md')).toBe(handle)
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Guide.md' }),
    )
  })

  test('cancelling resolves null; other errors propagate', async () => {
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker =
      async () => {
        throw new DOMException('cancelled', 'AbortError')
      }
    expect(await pickSaveTarget('a.md')).toBeNull()
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker =
      async () => {
        throw new DOMException('nope', 'SecurityError')
      }
    await expect(pickSaveTarget('a.md')).rejects.toThrow('nope')
  })

  test.each([
    ['README.md', 'README.md'],
    ['Guide', 'Guide.md'],
    ['notes.txt', 'notes.txt'],
    ['a/b:c?.md', 'a b c .md'],
    ['', 'document.md'],
  ])('suggestedFileName(%j) = %j', (input, expected) => {
    expect(suggestedFileName(input)).toBe(expected)
  })
})
