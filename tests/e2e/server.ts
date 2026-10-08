/**
 * Fixture server that mimics raw.githubusercontent.com: Markdown served as
 * text/plain with CORS and ETags. `/nocors/*` omits CORS headers to exercise
 * the optional host-permission flow.
 */
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const SITE = path.resolve(process.cwd(), 'tests/e2e/site')
const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures')

export interface FixtureServer {
  url: string
  setOverride(name: string, body: string): void
  close(): Promise<void>
}

export function largeDocument(sections = 6000): string {
  const parts = ['# Large document\n']
  for (let i = 0; i < sections; i++) {
    parts.push(
      `## Section ${i}\n\nParagraph ${i} with **bold**, \`code\` and a [link](#section-${Math.max(0, i - 1)}).\n\n\`\`\`ts\nexport const value${i} = ${i}\n\`\`\`\n`,
    )
  }
  return parts.join('\n')
}

export async function startServer(): Promise<FixtureServer> {
  const overrides = new Map<string, string>()
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const nocors = url.pathname.startsWith('/nocors/')
    // Extension-less paths (docs servers) map to the .md fixture.
    const base = path.basename(url.pathname)
    const name = base.includes('.') ? base : `${base}.md`
    let body: string | undefined = overrides.get(name)
    if (body === undefined && name === 'large.md') body = largeDocument()
    if (body === undefined) {
      for (const dir of [SITE, FIXTURES]) {
        try {
          body = await readFile(path.join(dir, name), 'utf8')
          break
        } catch {
          // try next directory
        }
      }
    }
    if (body === undefined || !name.endsWith('.md')) {
      res.writeHead(404, {
        'content-type': 'text/plain',
        ...(nocors ? {} : { 'access-control-allow-origin': '*' }),
      })
      res.end('not found')
      return
    }
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`
    const headers: Record<string, string> = {
      'content-type': 'text/plain; charset=utf-8',
      etag,
      'cache-control': 'no-cache',
    }
    if (!nocors) {
      headers['access-control-allow-origin'] = '*'
      headers['access-control-expose-headers'] = 'etag'
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers)
      res.end()
      return
    }
    res.writeHead(200, headers)
    res.end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    setOverride: (n, b) => overrides.set(n, b),
    close: () =>
      new Promise(resolve => {
        // Browsers keep connections alive; drop them so close() can finish.
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
