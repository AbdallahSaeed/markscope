import { PermissionNeededError, SourceLoadError } from '@/shared/errors'
import { loadSource, MAX_DOCUMENT_BYTES } from '@/viewer/source-loader'

const deps = (
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  readFile = vi.fn(async () => '# file'),
  granted = false,
) => ({
  fetch: vi.fn(fetchImpl) as unknown as typeof fetch,
  readFile,
  hasPermission: vi.fn(async () => granted),
})

describe('loadSource', () => {
  test('fetches text and captures validators', async () => {
    const d = deps(
      async () =>
        new Response('# hi', {
          headers: { etag: '"v1"', 'last-modified': 'Mon, 01 Jan 2026 00:00:00 GMT' },
        }),
    )
    const res = await loadSource('https://a.com/x.md', null, d)
    expect(res).toEqual({
      changed: true,
      text: '# hi',
      validators: { etag: '"v1"', lastModified: 'Mon, 01 Jan 2026 00:00:00 GMT' },
    })
  })

  test('sends conditional headers and reports 304 as unchanged', async () => {
    const d = deps(async () => new Response(null, { status: 304 }))
    const res = await loadSource(
      'https://a.com/x.md',
      { etag: '"v1"', lastModified: 'x' },
      d,
    )
    expect(res.changed).toBe(false)
    const init = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      'If-None-Match': '"v1"',
      'If-Modified-Since': 'x',
    })
    expect(init.credentials).toBe('omit')
  })

  test('network failure means host permission is needed', async () => {
    const d = deps(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(loadSource('https://docs.example.com/a/x.md', null, d)).rejects.toEqual(
      new PermissionNeededError('https://docs.example.com/*'),
    )
  })

  test('network failure WITH permission is a retryable load error, not a permission prompt', async () => {
    const d = deps(
      async () => {
        throw new TypeError('Failed to fetch')
      },
      undefined,
      true,
    )
    await expect(
      loadSource('https://docs.example.com/x.md', null, d),
    ).rejects.toBeInstanceOf(SourceLoadError)
  })

  test('HTTP errors and oversize documents', async () => {
    await expect(
      loadSource(
        'https://a.com/x.md',
        null,
        deps(async () => new Response('nope', { status: 404, statusText: 'Not Found' })),
      ),
    ).rejects.toThrow(/404 Not Found/)
    await expect(
      loadSource(
        'https://a.com/x.md',
        null,
        deps(
          async () =>
            new Response('x', {
              headers: { 'content-length': String(MAX_DOCUMENT_BYTES + 1) },
            }),
        ),
      ),
    ).rejects.toBeInstanceOf(SourceLoadError)
  })

  test('file URLs use the file reader', async () => {
    const readFile = vi.fn(async () => '# local')
    const res = await loadSource(
      'file:///docs/a.md',
      null,
      deps(async () => new Response(''), readFile),
    )
    expect(res).toEqual({ changed: true, text: '# local', validators: {} })
    expect(readFile).toHaveBeenCalledWith('file:///docs/a.md')
  })

  test('unsupported schemes are rejected', async () => {
    await expect(
      loadSource(
        'chrome://settings',
        null,
        deps(async () => new Response('')),
      ),
    ).rejects.toThrow(/Unsupported/)
  })
})
