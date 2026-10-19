import { describe, expect, test } from 'vitest'
import { defaultSettings } from '@/shared/settings'
import {
  envelope,
  MAX_DOCTOR_ISSUES,
  parseHostMessage,
  parseWebviewMessage,
  PROTOCOL_VERSION,
} from '@/vscode/protocol'

const v = PROTOCOL_VERSION
const issue = { rule: 'broken-anchor', severity: 'warning', message: 'm', line: 3 }

describe('parseWebviewMessage (untrusted input)', () => {
  test('rejects non-objects, missing or wrong version, unknown types', () => {
    for (const bad of [null, 1, 'x', [], {}, { type: 'ready' }, { v: 2, type: 'ready' }])
      expect(parseWebviewMessage(bad)).toBeNull()
    expect(parseWebviewMessage({ v, type: 'runCommand', command: 'x' })).toBeNull()
  })

  test('accepts ready and normalizes openLink', () => {
    expect(parseWebviewMessage(envelope({ type: 'ready' }))).toEqual({ type: 'ready' })
    expect(
      parseWebviewMessage({ v, type: 'openLink', kind: 'document', target: 'a.md' }),
    ).toEqual({ type: 'openLink', kind: 'document', target: 'a.md', hash: '' })
  })

  test('openLink validates kind, target and hash', () => {
    const base = { v, type: 'openLink', kind: 'external', target: 'https://x.test/' }
    expect(parseWebviewMessage({ ...base, kind: 'command' })).toBeNull()
    expect(parseWebviewMessage({ ...base, target: '' })).toBeNull()
    expect(parseWebviewMessage({ ...base, target: 'a'.repeat(9000) })).toBeNull()
    expect(parseWebviewMessage({ ...base, hash: 'top' })).toBeNull()
    expect(parseWebviewMessage({ ...base, hash: '#top' })).toMatchObject({ hash: '#top' })
  })

  test('line numbers must be positive safe integers', () => {
    for (const type of ['revealLine', 'scrolled'])
      for (const line of [0, -1, 1.5, NaN, Infinity, '3', null, 1e12])
        expect(parseWebviewMessage({ v, type, line })).toBeNull()
    expect(parseWebviewMessage({ v, type: 'scrolled', line: 12 })).toEqual({
      type: 'scrolled',
      line: 12,
    })
  })

  test('resolveMedia needs an id and a non-empty bounded path', () => {
    expect(
      parseWebviewMessage({ v, type: 'resolveMedia', requestId: 1, path: 'a.png' }),
    ).toEqual({ type: 'resolveMedia', requestId: 1, path: 'a.png' })
    expect(
      parseWebviewMessage({ v, type: 'resolveMedia', requestId: -1, path: 'a' }),
    ).toBeNull()
    expect(
      parseWebviewMessage({ v, type: 'resolveMedia', requestId: 1, path: '' }),
    ).toBeNull()
  })

  test('doctor validates every issue and caps the count', () => {
    const ok = { v, type: 'doctor', uri: 'file:///a.md', version: 4, issues: [issue] }
    expect(parseWebviewMessage(ok)).toMatchObject({ type: 'doctor', version: 4 })
    expect(
      parseWebviewMessage({ ...ok, issues: [{ ...issue, severity: 'fatal' }] }),
    ).toBeNull()
    expect(parseWebviewMessage({ ...ok, issues: [{ ...issue, line: 0 }] })).toBeNull()
    expect(
      parseWebviewMessage({ ...ok, issues: [{ ...issue, extra: 1 }] }),
    ).toMatchObject({
      issues: [issue],
    })
    expect(
      parseWebviewMessage({ ...ok, issues: Array(MAX_DOCTOR_ISSUES + 1).fill(issue) }),
    ).toBeNull()
    expect(parseWebviewMessage({ ...ok, version: 1.5 })).toBeNull()
  })

  test('export and copy are size-bounded strings', () => {
    expect(
      parseWebviewMessage({ v, type: 'exportHtml', html: '<p>', fileName: 'a.html' }),
    ).not.toBeNull()
    expect(
      parseWebviewMessage({ v, type: 'exportHtml', html: 1, fileName: 'a' }),
    ).toBeNull()
    expect(parseWebviewMessage({ v, type: 'copy', text: 'hi' })).toEqual({
      type: 'copy',
      text: 'hi',
    })
    expect(parseWebviewMessage({ v, type: 'copy' })).toBeNull()
  })

  test('ai requests go through the shared AI validator', () => {
    expect(parseWebviewMessage({ v, type: 'ai', request: { type: 'ai.abort' } })).toEqual(
      {
        type: 'ai',
        request: { type: 'ai.abort' },
      },
    )
    expect(
      parseWebviewMessage({ v, type: 'ai', request: { type: 'ai.run', id: 1 } }),
    ).toBeNull()
    expect(parseWebviewMessage({ v, type: 'ai' })).toBeNull()
  })
})

describe('parseHostMessage', () => {
  const assets = {
    worker: 'vscode-resource:/w.js',
    documentCss: 'vscode-resource:/d.css',
    katexCss: 'vscode-resource:/k.css',
  }

  test('init validates settings through parseSettings', () => {
    const msg = parseHostMessage({
      v,
      type: 'init',
      settings: { theme: 'nope', typography: { fontSize: 9999 } },
      assets,
      aiAvailable: false,
    })
    expect(msg?.type).toBe('init')
    if (msg?.type === 'init') {
      expect(msg.settings.theme).toBe(defaultSettings().theme)
      expect(msg.settings.typography.fontSize).toBeLessThanOrEqual(24)
    }
  })

  test('document requires every field', () => {
    const doc = {
      v,
      type: 'document',
      uri: 'file:///a.md',
      version: 1,
      text: '# a',
      fileName: 'a.md',
      baseUri: null,
    }
    expect(parseHostMessage(doc)).toMatchObject({
      type: 'document',
      baseUri: null,
      hash: '',
    })
    expect(parseHostMessage({ ...doc, hash: '#top' })).toMatchObject({ hash: '#top' })
    expect(parseHostMessage({ ...doc, hash: 3 })).toBeNull()
    expect(parseHostMessage({ v, type: 'lock', locked: true })).toEqual({
      type: 'lock',
      locked: true,
    })
    expect(parseHostMessage({ v, type: 'lock', locked: 'yes' })).toBeNull()
    expect(parseHostMessage({ ...doc, text: undefined })).toBeNull()
    expect(parseHostMessage({ ...doc, baseUri: 5 })).toBeNull()
  })

  test('commands are limited to the known set', () => {
    expect(parseHostMessage({ v, type: 'command', name: 'find' })).toEqual({
      type: 'command',
      name: 'find',
    })
    expect(parseHostMessage({ v, type: 'command', name: 'eval' })).toBeNull()
  })

  test('media url may be null (refused)', () => {
    expect(parseHostMessage({ v, type: 'media', requestId: 2, url: null })).toEqual({
      type: 'media',
      requestId: 2,
      url: null,
    })
    expect(parseHostMessage({ v, type: 'media', requestId: 2, url: 7 })).toBeNull()
  })

  test('ai events and version mismatch', () => {
    expect(
      parseHostMessage({
        v,
        type: 'ai.event',
        event: { type: 'delta', id: 1, text: 'x' },
      }),
    ).not.toBeNull()
    expect(
      parseHostMessage({ v, type: 'ai.event', event: { type: 'delta', id: 1 } }),
    ).toBeNull()
    expect(parseHostMessage({ v: 0, type: 'settings', settings: {} })).toBeNull()
  })

  test('envelope stamps the protocol version', () => {
    expect(envelope({ type: 'ready' })).toEqual({ v: PROTOCOL_VERSION, type: 'ready' })
  })
})
