/**
 * The single description of Markscope's VS Code settings. It drives both the
 * generated `contributes.configuration` (scripts/vscode-manifest.mjs imports
 * this file) and the runtime conversion to `Settings` (extension/config.ts),
 * so what the Settings UI offers and what the extension accepts cannot drift.
 *
 * Must stay free of `vscode` and `@/` imports: Node loads it directly.
 */
import {
  CONTENT_WIDTHS,
  FONT_FAMILIES,
  FRONT_MATTER_MODES,
  LIMITS,
  REMOTE_IMAGE_MODES,
  defaultSettings,
  parseSettings,
  type Settings,
} from '../shared/settings.ts'

export const CONFIG_SECTION = 'markscope'

type Json = string | number | boolean
interface Entry {
  /** Setting key below `markscope.` */
  key: string
  /** Path inside `Settings` this value maps to. */
  path: readonly string[]
  description: string
  enum?: readonly string[]
  enumDescriptions?: readonly string[]
  min?: number
  max?: number
  /** VS Code value → Settings value (when they differ). */
  toSetting?: (value: unknown) => unknown
  /** Settings value → VS Code default shown in the UI. */
  fromSetting?: (value: unknown) => Json
}

const flag = (key: string, path: string[], description: string): Entry => ({
  key,
  path,
  description,
})

export const SETTING_ENTRIES: readonly Entry[] = [
  {
    key: 'theme',
    path: ['theme'],
    description: 'Preview theme. "vscode" follows the current VS Code color theme.',
    enum: ['vscode', 'light', 'dark'],
    enumDescriptions: [
      'Follow the VS Code color theme (including high contrast).',
      'Always light.',
      'Always dark.',
    ],
    toSetting: v => (v === 'vscode' ? 'system' : v),
    fromSetting: v => (v === 'system' ? 'vscode' : (v as string)),
  },
  {
    key: 'typography.fontFamily',
    path: ['typography', 'fontFamily'],
    description: 'Reading typeface.',
    enum: FONT_FAMILIES,
  },
  {
    key: 'typography.fontSize',
    path: ['typography', 'fontSize'],
    description: 'Base font size in pixels.',
    ...LIMITS.fontSize,
  },
  {
    key: 'typography.lineHeight',
    path: ['typography', 'lineHeight'],
    description: 'Line height multiplier.',
    ...LIMITS.lineHeight,
  },
  {
    key: 'typography.contentWidth',
    path: ['typography', 'contentWidth'],
    description: 'Width of the text column.',
    enum: CONTENT_WIDTHS,
  },
  flag('code.highlight', ['code', 'highlight'], 'Syntax-highlight code blocks.'),
  flag('code.lineNumbers', ['code', 'lineNumbers'], 'Show line numbers in code blocks.'),
  flag('code.wrap', ['code', 'wrap'], 'Wrap long lines in code blocks.'),
  flag('markdown.html', ['markdown', 'html'], 'Render raw HTML in Markdown (sanitized).'),
  flag(
    'markdown.breaks',
    ['markdown', 'breaks'],
    'Treat single newlines as line breaks.',
  ),
  flag('markdown.typographer', ['markdown', 'typographer'], 'Smart quotes and dashes.'),
  flag('markdown.linkify', ['markdown', 'linkify'], 'Turn bare URLs into links.'),
  flag('markdown.emoji', ['markdown', 'emoji'], 'Render :emoji: shortcodes.'),
  flag('markdown.math', ['markdown', 'math'], 'Render KaTeX math.'),
  flag('markdown.mermaid', ['markdown', 'mermaid'], 'Render Mermaid diagrams.'),
  flag('markdown.graphviz', ['markdown', 'graphviz'], 'Render Graphviz (DOT) diagrams.'),
  flag('markdown.footnotes', ['markdown', 'footnotes'], 'Render footnotes.'),
  flag(
    'markdown.alerts',
    ['markdown', 'alerts'],
    'Render GitHub alerts and ::: callouts.',
  ),
  flag(
    'markdown.extended',
    ['markdown', 'extended'],
    'Extended syntax: ==mark==, ++ins++, sub/sup, abbreviations, definition lists.',
  ),
  {
    key: 'markdown.frontMatter',
    path: ['markdown', 'frontMatter'],
    description: 'Show or hide YAML front matter.',
    enum: FRONT_MATTER_MODES,
  },
  {
    key: 'images.remote',
    path: ['privacy', 'remoteImages'],
    description:
      'Load images from the web. "block" never contacts any server; the preview CSP enforces it.',
    enum: REMOTE_IMAGE_MODES,
  },
  flag('sidebar', ['layout', 'sidebar'], 'Show the outline sidebar by default.'),
]

export interface PreviewOptions {
  followActiveEditor: boolean
  openMarkdownLinks: 'inPreview' | 'inEditor'
  updateOn: 'change' | 'save'
  scrollEditorWithPreview: boolean
  scrollPreviewWithEditor: boolean
  doctor: boolean
}

export const PREVIEW_DEFAULTS: PreviewOptions = {
  followActiveEditor: true,
  openMarkdownLinks: 'inPreview',
  updateOn: 'change',
  scrollEditorWithPreview: true,
  scrollPreviewWithEditor: true,
  doctor: true,
}

export const PREVIEW_PROPERTIES: Record<string, Record<string, unknown>> = {
  'preview.followActiveEditor': {
    type: 'boolean',
    default: PREVIEW_DEFAULTS.followActiveEditor,
    description:
      'An unlocked preview shows whichever Markdown file is active. Turn off to keep the first file it opened.',
  },
  'preview.openMarkdownLinks': {
    type: 'string',
    enum: ['inPreview', 'inEditor'],
    default: PREVIEW_DEFAULTS.openMarkdownLinks,
    description: 'Where a link to another Markdown file opens.',
  },
  'preview.updateOn': {
    type: 'string',
    enum: ['change', 'save'],
    default: PREVIEW_DEFAULTS.updateOn,
    description: 'Refresh the preview while typing, or only when the file is saved.',
  },
  'preview.scrollEditorWithPreview': {
    type: 'boolean',
    default: PREVIEW_DEFAULTS.scrollEditorWithPreview,
    description: 'Scrolling the preview scrolls the editor.',
  },
  'preview.scrollPreviewWithEditor': {
    type: 'boolean',
    default: PREVIEW_DEFAULTS.scrollPreviewWithEditor,
    description: 'Scrolling the editor scrolls the preview.',
  },
  'doctor.enabled': {
    type: 'boolean',
    default: PREVIEW_DEFAULTS.doctor,
    description:
      'Report documentation problems (broken anchors, missing images, …) in the Problems panel.',
  },
}

function lookup(root: unknown, path: readonly string[]): unknown {
  let cur = root
  for (const part of path) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function assign(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
) {
  let cur = target
  path.forEach((part, i) => {
    if (i === path.length - 1) cur[part] = value
    else cur = (cur[part] ??= {}) as Record<string, unknown>
  })
}

/** `contributes.configuration.properties`, generated from the entries and `defaultSettings()`. */
export function configurationProperties(): Record<string, Record<string, unknown>> {
  const defaults = defaultSettings()
  const out: Record<string, Record<string, unknown>> = {}
  for (const e of SETTING_ENTRIES) {
    const raw = lookup(defaults, e.path)
    const def = e.fromSetting ? e.fromSetting(raw) : (raw as Json)
    out[`${CONFIG_SECTION}.${e.key}`] = {
      type:
        typeof def === 'number'
          ? 'number'
          : typeof def === 'boolean'
            ? 'boolean'
            : 'string',
      default: def,
      description: e.description,
      scope: 'resource',
      ...(e.enum ? { enum: [...e.enum] } : {}),
      ...(e.enumDescriptions ? { enumDescriptions: [...e.enumDescriptions] } : {}),
      ...(e.min !== undefined ? { minimum: e.min } : {}),
      ...(e.max !== undefined ? { maximum: e.max } : {}),
    }
  }
  for (const [key, schema] of Object.entries(PREVIEW_PROPERTIES))
    out[`${CONFIG_SECTION}.${key}`] = {
      scope: key.startsWith('preview.') ? 'window' : 'resource',
      ...schema,
    }
  return out
}

/**
 * Builds validated `Settings` from VS Code configuration. `get` returns the
 * user's value for a key below `markscope.` (undefined → the default). Anything
 * out of range or of the wrong type falls back through `parseSettings`.
 */
export function settingsFromConfig(get: (key: string) => unknown): Settings {
  const raw: Record<string, unknown> = {}
  for (const e of SETTING_ENTRIES) {
    const value = get(e.key)
    if (value === undefined) continue
    assign(raw, e.path, e.toSetting ? e.toSetting(value) : value)
  }
  return parseSettings(raw)
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback

export function previewOptionsFromConfig(get: (key: string) => unknown): PreviewOptions {
  const flagOf = (key: string, fallback: boolean) =>
    typeof get(key) === 'boolean' ? (get(key) as boolean) : fallback
  return {
    followActiveEditor: flagOf(
      'preview.followActiveEditor',
      PREVIEW_DEFAULTS.followActiveEditor,
    ),
    openMarkdownLinks: pick(
      get('preview.openMarkdownLinks'),
      ['inPreview', 'inEditor'],
      PREVIEW_DEFAULTS.openMarkdownLinks,
    ),
    updateOn: pick(
      get('preview.updateOn'),
      ['change', 'save'],
      PREVIEW_DEFAULTS.updateOn,
    ),
    scrollEditorWithPreview: flagOf(
      'preview.scrollEditorWithPreview',
      PREVIEW_DEFAULTS.scrollEditorWithPreview,
    ),
    scrollPreviewWithEditor: flagOf(
      'preview.scrollPreviewWithEditor',
      PREVIEW_DEFAULTS.scrollPreviewWithEditor,
    ),
    doctor: flagOf('doctor.enabled', PREVIEW_DEFAULTS.doctor),
  }
}
