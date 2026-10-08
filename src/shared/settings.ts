/**
 * Settings schema, defaults and validation.
 *
 * Settings are untrusted input (they come from storage, imports and other
 * extension contexts), so every read goes through `parseSettings`, which
 * merges defaults, clamps numbers and rejects unknown enum values.
 */

export const SETTINGS_VERSION = 1

export const THEMES = ['system', 'light', 'dark'] as const
export const FONT_FAMILIES = ['sans', 'serif', 'mono'] as const
export const CONTENT_WIDTHS = ['narrow', 'normal', 'wide', 'full'] as const
export const FRONT_MATTER_MODES = ['show', 'hide'] as const
export const REMOTE_IMAGE_MODES = ['allow', 'block'] as const
export const AI_PROVIDERS = ['anthropic', 'openai', 'local', 'custom'] as const
export const KEY_STORAGE_MODES = ['local', 'session'] as const

export type Theme = (typeof THEMES)[number]
export type FontFamily = (typeof FONT_FAMILIES)[number]
export type ContentWidth = (typeof CONTENT_WIDTHS)[number]
export type FrontMatterMode = (typeof FRONT_MATTER_MODES)[number]
export type RemoteImageMode = (typeof REMOTE_IMAGE_MODES)[number]
export type AIProviderId = (typeof AI_PROVIDERS)[number]
export type KeyStorageMode = (typeof KEY_STORAGE_MODES)[number]

export interface MarkdownSettings {
  html: boolean
  breaks: boolean
  typographer: boolean
  linkify: boolean
  emoji: boolean
  math: boolean
  mermaid: boolean
  graphviz: boolean
  footnotes: boolean
  alerts: boolean
  extended: boolean
  frontMatter: FrontMatterMode
}

export interface Settings {
  version: number
  autoRender: boolean
  theme: Theme
  typography: {
    fontFamily: FontFamily
    fontSize: number
    lineHeight: number
    contentWidth: ContentWidth
  }
  code: {
    highlight: boolean
    lineNumbers: boolean
    wrap: boolean
  }
  markdown: MarkdownSettings
  privacy: {
    remoteImages: RemoteImageMode
  }
  liveReload: {
    enabled: boolean
    intervalMs: number
  }
  layout: {
    sidebar: boolean
  }
  /** Extra match patterns (beyond *.md etc.) that should open in Markscope. */
  urlPatterns: string[]
  ai: {
    enabled: boolean
    provider: AIProviderId
    model: string
    baseUrl: string
    keyStorage: KeyStorageMode
    confirmBeforeSend: boolean
  }
}

export const LIMITS = {
  fontSize: { min: 12, max: 24 },
  lineHeight: { min: 1.2, max: 2.2 },
  intervalMs: { min: 500, max: 60_000 },
  urlPatterns: 50,
  modelLength: 120,
  baseUrlLength: 500,
} as const

export const AI_PRESETS: Record<AIProviderId, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  local: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  custom: { baseUrl: '', model: '' },
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    autoRender: true,
    theme: 'system',
    typography: {
      fontFamily: 'sans',
      fontSize: 16,
      lineHeight: 1.65,
      contentWidth: 'normal',
    },
    code: { highlight: true, lineNumbers: false, wrap: false },
    markdown: {
      html: true,
      breaks: false,
      typographer: true,
      linkify: true,
      emoji: true,
      math: true,
      mermaid: true,
      graphviz: true,
      footnotes: true,
      alerts: true,
      extended: true,
      frontMatter: 'show',
    },
    privacy: { remoteImages: 'allow' },
    liveReload: { enabled: false, intervalMs: 1500 },
    layout: { sidebar: true },
    urlPatterns: [],
    ai: {
      enabled: false,
      provider: 'anthropic',
      model: AI_PRESETS.anthropic.model,
      baseUrl: AI_PRESETS.anthropic.baseUrl,
      keyStorage: 'local',
      confirmBeforeSend: true,
    },
  }
}

type Rec = Record<string, unknown>

const isRecord = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const rec = (v: unknown): Rec => (isRecord(v) ? v : {})

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback
}

function str(v: unknown, fallback: string, maxLength: number): string {
  return typeof v === 'string' ? v.trim().slice(0, maxLength) : fallback
}

/**
 * Chrome match pattern: <scheme>://<host><path>. We accept a strict subset
 * (http, https, file, *) and reject anything that could widen to every URL.
 */
const MATCH_PATTERN_RE = /^(\*|https?|file):\/\/(\*|\*\.[^/*]+|[^/*]+)?\/.*$/

export function isValidMatchPattern(pattern: string): boolean {
  if (!MATCH_PATTERN_RE.test(pattern)) return false
  if (pattern.startsWith('file://')) return pattern.startsWith('file:///')
  // Host is mandatory for http(s) and wildcard schemes.
  return !/^[^:]+:\/\/\//.test(pattern)
}

function patterns(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const valid = v
    .filter((p): p is string => typeof p === 'string')
    .map(p => p.trim())
    .filter(isValidMatchPattern)
  return [...new Set(valid)].slice(0, LIMITS.urlPatterns)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** AI endpoints must use https, except loopback (local model runtimes). */
export function isAllowedAIBaseUrl(value: string): boolean {
  try {
    const u = new URL(value)
    if (u.username || u.password) return false
    return (
      u.protocol === 'https:' ||
      (u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname))
    )
  } catch {
    return false
  }
}

/** Origin an API key is bound to; the Anthropic SDK default when unset. */
export function aiKeyOrigin(provider: AIProviderId, baseUrl: string): string {
  try {
    return new URL(baseUrl || AI_PRESETS[provider].baseUrl).origin
  } catch {
    return ''
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Parse untrusted data into a complete, valid Settings object. */
export function parseSettings(input: unknown): Settings {
  const d = defaultSettings()
  const s = rec(input)
  const t = rec(s.typography)
  const c = rec(s.code)
  const m = rec(s.markdown)
  const p = rec(s.privacy)
  const l = rec(s.liveReload)
  const lay = rec(s.layout)
  const a = rec(s.ai)

  const provider = oneOf(a.provider, AI_PROVIDERS, d.ai.provider)
  const baseUrl = str(a.baseUrl, AI_PRESETS[provider].baseUrl, LIMITS.baseUrlLength)

  return {
    version: SETTINGS_VERSION,
    autoRender: bool(s.autoRender, d.autoRender),
    theme: oneOf(s.theme, THEMES, d.theme),
    typography: {
      fontFamily: oneOf(t.fontFamily, FONT_FAMILIES, d.typography.fontFamily),
      fontSize: num(
        t.fontSize,
        d.typography.fontSize,
        LIMITS.fontSize.min,
        LIMITS.fontSize.max,
      ),
      lineHeight: num(
        t.lineHeight,
        d.typography.lineHeight,
        LIMITS.lineHeight.min,
        LIMITS.lineHeight.max,
      ),
      contentWidth: oneOf(t.contentWidth, CONTENT_WIDTHS, d.typography.contentWidth),
    },
    code: {
      highlight: bool(c.highlight, d.code.highlight),
      lineNumbers: bool(c.lineNumbers, d.code.lineNumbers),
      wrap: bool(c.wrap, d.code.wrap),
    },
    markdown: {
      html: bool(m.html, d.markdown.html),
      breaks: bool(m.breaks, d.markdown.breaks),
      typographer: bool(m.typographer, d.markdown.typographer),
      linkify: bool(m.linkify, d.markdown.linkify),
      emoji: bool(m.emoji, d.markdown.emoji),
      math: bool(m.math, d.markdown.math),
      mermaid: bool(m.mermaid, d.markdown.mermaid),
      graphviz: bool(m.graphviz, d.markdown.graphviz),
      footnotes: bool(m.footnotes, d.markdown.footnotes),
      alerts: bool(m.alerts, d.markdown.alerts),
      extended: bool(m.extended, d.markdown.extended),
      frontMatter: oneOf(m.frontMatter, FRONT_MATTER_MODES, d.markdown.frontMatter),
    },
    privacy: {
      remoteImages: oneOf(p.remoteImages, REMOTE_IMAGE_MODES, d.privacy.remoteImages),
    },
    liveReload: {
      enabled: bool(l.enabled, d.liveReload.enabled),
      intervalMs: num(
        l.intervalMs,
        d.liveReload.intervalMs,
        LIMITS.intervalMs.min,
        LIMITS.intervalMs.max,
      ),
    },
    layout: { sidebar: bool(lay.sidebar, d.layout.sidebar) },
    urlPatterns: patterns(s.urlPatterns),
    ai: {
      enabled: bool(a.enabled, d.ai.enabled),
      provider,
      model: str(a.model, AI_PRESETS[provider].model, LIMITS.modelLength),
      baseUrl:
        baseUrl === '' || isAllowedAIBaseUrl(baseUrl)
          ? baseUrl
          : AI_PRESETS[provider].baseUrl,
      keyStorage: oneOf(a.keyStorage, KEY_STORAGE_MODES, d.ai.keyStorage),
      confirmBeforeSend: bool(a.confirmBeforeSend, d.ai.confirmBeforeSend),
    },
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

/** Immutable deep merge of a partial patch onto settings, then re-validated. */
export function mergeSettings(base: Settings, patch: DeepPartial<Settings>): Settings {
  return parseSettings(deepMerge(base as unknown as Rec, patch as unknown as Rec))
}

function deepMerge(base: Rec, patch: Rec): Rec {
  const out: Rec = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = base[key]
    out[key] = isRecord(value) && isRecord(current) ? deepMerge(current, value) : value
  }
  return out
}

/** Markdown-affecting settings, used to decide whether a re-render is needed. */
export function renderKey(s: Settings): string {
  return JSON.stringify([s.markdown, s.code.highlight])
}
