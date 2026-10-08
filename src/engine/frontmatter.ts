import type { FrontMatter } from './types'

const FRONT_MATTER_RE = /^(?:﻿)?(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?:\r?\n|$)/

/**
 * Splits YAML (---) or TOML (+++) front matter from the body. Only simple
 * top-level `key: value` pairs are tabulated; anything else is shown raw.
 */
export function extractFrontMatter(source: string): {
  body: string
  frontMatter: FrontMatter | null
} {
  const m = FRONT_MATTER_RE.exec(source)
  if (!m) return { body: source, frontMatter: null }
  const raw = m[2] ?? ''
  const lines = m[0].split(/\r?\n/).length - (m[0].endsWith('\n') ? 1 : 0)
  return {
    body: source.slice(m[0].length),
    frontMatter: { raw, entries: parseEntries(raw, m[1] === '+++' ? '=' : ':'), lines },
  }
}

function parseEntries(raw: string, sep: ':' | '='): [string, string][] {
  const entries: [string, string][] = []
  const re =
    sep === ':'
      ? /^([A-Za-z0-9_][\w .-]*?)\s*:\s*(.*)$/
      : /^([A-Za-z0-9_][\w.-]*)\s*=\s*(.*)$/
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    // Nested/list content: keep the raw view authoritative.
    if (/^\s/.test(line)) {
      const last = entries[entries.length - 1]
      if (last) last[1] = `${last[1]}\n${line.trim()}`.trim()
      continue
    }
    const m = re.exec(line)
    if (m) entries.push([m[1] ?? '', unquote((m[2] ?? '').trim())])
  }
  return entries
}

function unquote(v: string): string {
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1)
  }
  return v
}
