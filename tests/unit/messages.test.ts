import { MAX_HANDOFF_BYTES, parseAIRequest, parseRuntimeMessage } from '@/shared/messages'

describe('runtime message validation', () => {
  test('valid handoff normalises content type', () => {
    expect(
      parseRuntimeMessage({
        type: 'handoff',
        url: 'https://a.com/x.md',
        text: '# hi',
        contentType: 'text/plain; charset=utf-8',
      }),
    ).toEqual({
      type: 'handoff',
      url: 'https://a.com/x.md',
      text: '# hi',
      contentType: 'text/plain',
    })
  })
  test.each([
    [null],
    ['handoff'],
    [{}],
    [{ type: 'nope' }],
    [{ type: 'handoff', url: 'javascript:x', text: '', contentType: 'text/plain' }],
    [{ type: 'handoff', url: 'https://a.com/x.md', text: 1, contentType: 'text/plain' }],
    [{ type: 'handoff', url: 'https://a.com/x.md', text: '', contentType: 'text/html' }],
    [{ type: 'handoff.claim', id: '../../etc' }],
    [{ type: 'render-active-tab', tabId: -1 }],
    [{ type: 'render-active-tab', tabId: 1.5 }],
    [{ type: 'open-viewer', src: 'chrome://settings' }],
  ])('rejects %j', raw => {
    expect(parseRuntimeMessage(raw)).toBeNull()
  })
  test('rejects oversize handoffs', () => {
    expect(
      parseRuntimeMessage({
        type: 'handoff',
        url: 'https://a.com/x.md',
        text: 'x'.repeat(MAX_HANDOFF_BYTES + 1),
        contentType: 'text/plain',
      }),
    ).toBeNull()
  })
  test('other valid messages', () => {
    expect(
      parseRuntimeMessage({ type: 'handoff.claim', id: 'abcdef0123456789' }),
    ).toEqual({ type: 'handoff.claim', id: 'abcdef0123456789' })
    expect(parseRuntimeMessage({ type: 'render-active-tab', tabId: 4 })).toEqual({
      type: 'render-active-tab',
      tabId: 4,
    })
    expect(parseRuntimeMessage({ type: 'open-viewer' })).toEqual({ type: 'open-viewer' })
    expect(
      parseRuntimeMessage({ type: 'open-viewer', src: 'https://a.com/b.md' }),
    ).toEqual({ type: 'open-viewer', src: 'https://a.com/b.md' })
  })
})

describe('AI request validation', () => {
  const base = {
    type: 'ai.run',
    id: 3,
    task: 'summarize',
    document: '# Doc',
    title: 'Doc',
  }
  test('accepts valid run, test and abort', () => {
    expect(parseAIRequest(base)).toEqual({ ...base, history: [] })
    expect(parseAIRequest({ type: 'ai.test', id: 1 })).toEqual({ type: 'ai.test', id: 1 })
    expect(parseAIRequest({ type: 'ai.abort' })).toEqual({ type: 'ai.abort' })
    expect(
      parseAIRequest({
        ...base,
        task: 'ask',
        question: 'Why?',
        selection: 'x',
        history: [{ role: 'user', content: 'q' }],
      }),
    ).toMatchObject({ question: 'Why?', selection: 'x' })
  })
  test.each([
    [{ ...base, task: 'hack' }],
    [{ ...base, document: 5 }],
    [{ ...base, history: [{ role: 'system', content: 'x' }] }],
    [{ ...base, history: 'x' }],
    [
      {
        ...base,
        history: Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })),
      },
    ],
    [{ ...base, question: 'x'.repeat(20_000) }],
    [{ ...base, selection: 5 }],
    [{ type: 'other', id: 1 }],
    [{ ...base, id: undefined }],
    [{ ...base, id: -1 }],
    [{ type: 'ai.test' }],
    [[]],
  ])('rejects %#', raw => {
    expect(parseAIRequest(raw)).toBeNull()
  })
})
