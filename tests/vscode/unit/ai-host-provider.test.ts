// @vitest-environment node
/**
 * The extension host's AI path with the real provider code against a local
 * OpenAI-compatible server: streaming, the key as a bearer token, endpoint
 * rules, and the document staying out of anything but the provider request.
 */
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { AIPortEvent, AIPortRequest } from '@/shared/messages'
import { defaultSettings, type Settings } from '@/shared/settings'
import { memoryArea } from '@/storage/area'
import { createSecretsStore } from '@/storage/secrets-store'
import { createPanelAI } from '@/vscode/extension/ai-host'

let server: Server
let base = ''
const requests: { auth: string | undefined; path: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      requests.push({ auth: req.headers.authorization, path: req.url ?? '', body })
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const t of ['Hello ', 'from ', 'the model.'])
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const settings = (over: Partial<Settings['ai']> = {}): Settings => {
  const d = defaultSettings()
  return {
    ...d,
    ai: {
      ...d.ai,
      enabled: true,
      provider: 'local',
      baseUrl: base,
      model: 'tiny',
      ...over,
    },
  }
}

const run: AIPortRequest = {
  type: 'ai.run',
  id: 7,
  task: 'summarize',
  document: '# Plans\n\nThe launch code is 1234.',
  title: 'Plans',
  history: [],
}

async function until(cond: () => boolean): Promise<void> {
  const end = Date.now() + 5000
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(r => setTimeout(r, 10))
  }
}

describe('host AI with the real provider', () => {
  test('streams the answer, sends the key as a bearer token, and the key never reaches the webview', async () => {
    requests.length = 0
    const events: AIPortEvent[] = []
    const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
    await secrets.setApiKey('sk-local-key', 'local', new URL(base).origin)
    const ai = createPanelAI({
      loadSettings: async () => settings(),
      secrets,
      post: e => events.push(e),
    })
    ai.handle(run)
    await until(() => events.some(e => e.type === 'done'))

    const text = events
      .filter(e => e.type === 'delta')
      .map(e => (e as { text: string }).text)
      .join('')
    expect(text).toBe('Hello from the model.')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.path).toBe('/v1/chat/completions')
    expect(requests[0]!.auth).toBe('Bearer sk-local-key')
    expect(requests[0]!.body).toContain('launch code is 1234') // the document goes to the provider...
    expect(JSON.stringify(events)).not.toContain('sk-local-key') // ...and the key goes nowhere else
  })

  test('a key saved for another origin is not sent to this endpoint', async () => {
    requests.length = 0
    const events: AIPortEvent[] = []
    const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
    await secrets.setApiKey('sk-other', 'local', 'https://api.anthropic.com')
    const ai = createPanelAI({
      loadSettings: async () => settings(),
      secrets,
      post: e => events.push(e),
    })
    ai.handle(run)
    await until(() => events.some(e => e.type === 'done'))
    expect(requests[0]!.auth).toBeUndefined()
  })

  test('when disabled nothing is sent to the endpoint at all', async () => {
    requests.length = 0
    const events: AIPortEvent[] = []
    const secrets = createSecretsStore({ local: memoryArea(), session: memoryArea() })
    const ai = createPanelAI({
      loadSettings: async () => settings({ enabled: false }),
      secrets,
      post: e => events.push(e),
    })
    ai.handle(run)
    await until(() => events.length > 0)
    expect(events[0]).toMatchObject({ type: 'error', id: 7 })
    expect(requests).toHaveLength(0)
  })
})
