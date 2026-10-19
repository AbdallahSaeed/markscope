/**
 * Turns a palette (a few hex colors) into the full set of Markscope CSS tokens, and
 * the tokens into CSS. Pure: the build script writes `styles/themes.css` from
 * `allPalettesCss()`, and HTML export appends `exportPaletteCss()` for the active theme.
 *
 * Readability is enforced here, not hoped for: every text-like token is nudged
 * (OKLCH lightness only, never hue) until it meets the minimum in `CONTRAST_RULES`,
 * and the nudges are reported in `adjusted` so a faithful color is never silently
 * replaced.
 */
import { ensureContrast, mix, shiftLightness } from './theme-color.ts'
import { PALETTES, type Palette } from './theme-palettes.ts'
import { THEME_REGISTRY, themeById, type Scheme } from './themes.ts'

export type Tokens = Record<string, string>

export interface Derived {
  scheme: Scheme
  tokens: Tokens
  /** Token names whose lightness had to move to reach the contrast minimum. */
  adjusted: string[]
}

/** `[foreground token, background token, minimum WCAG ratio]`. Tested for every theme. */
export const CONTRAST_RULES: readonly (readonly [string, string, number])[] = [
  ['--ink', '--paper', 4.5],
  ['--ink-2', '--paper', 4.5],
  ['--accent-ink', '--accent', 4.5],
  ['--accent', '--paper', 4.5],
  ['--code-ink', '--code-bg', 4.5],
  ['--ink', '--mark', 4.5],
  ['--ink-3', '--paper', 3],
  ['--danger', '--paper', 3],
  ['--c-note', '--paper', 3],
  ['--c-tip', '--paper', 3],
  ['--c-important', '--paper', 3],
  ['--c-warning', '--paper', 3],
  ['--c-caution', '--paper', 3],
  ['--hl-keyword', '--code-bg', 3],
  ['--hl-string', '--code-bg', 3],
  ['--hl-number', '--code-bg', 3],
  ['--hl-title', '--code-bg', 3],
  ['--hl-attr', '--code-bg', 3],
  ['--hl-comment', '--code-bg', 3],
  ['--hl-meta', '--code-bg', 3],
]

const WHITE = '#ffffff'

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`
}

export function deriveTokens(p: Palette, scheme: Scheme): Derived {
  const isDark = scheme === 'dark'
  const adjusted: string[] = []
  const fit = (name: string, color: string, bg: string, min: number): string => {
    const r = ensureContrast(color, bg, min)
    if (r.changed) adjusted.push(name)
    return r.color
  }

  const paper = p.bg
  const paper2 = p.bg2 ?? mix(p.bg, p.fg, isDark ? 0.045 : 0.04)
  const paper3 = p.bg3 ?? mix(p.bg, p.fg, isDark ? 0.1 : 0.09)
  const raised = p.raised ?? (isDark ? mix(paper2, p.fg, 0.04) : mix(p.bg, WHITE, 0.65))
  const codeBg = paper2

  const ink = fit('ink', p.fg, paper, 4.5)
  const ink2 = fit('ink-2', p.fg2 ?? mix(p.fg, p.bg, 0.25), paper, 4.5)
  const ink3 = fit('ink-3', p.fg3 ?? mix(p.fg, p.bg, 0.45), paper, 3)
  const accent = fit('accent', p.accent, paper, 4.5)
  const accentHover = fit(
    'accent-hover',
    shiftLightness(accent, isDark ? 0.06 : -0.06),
    paper,
    4.5,
  )

  // Highlighter: the warning tint behind body text, moved away from the ink until it reads.
  const mark = fit('mark', mix(paper, p.warning, isDark ? 0.4 : 0.35), ink, 4.5)

  const tokens: Tokens = {
    '--paper': paper,
    '--paper-2': paper2,
    '--paper-3': paper3,
    '--raised': raised,
    '--ink': ink,
    '--ink-2': ink2,
    '--ink-3': ink3,
    '--rule': mix(paper, p.fg, isDark ? 0.14 : 0.13),
    '--rule-strong': mix(paper, p.fg, isDark ? 0.26 : 0.26),
    '--accent': accent,
    '--accent-hover': accentHover,
    '--accent-ink': paper,
    '--accent-soft': mix(paper, accent, isDark ? 0.22 : 0.14),
    '--code-bg': codeBg,
    '--code-ink': fit('code-ink', p.fg, codeBg, 4.5),
    '--mark': mark,
    '--danger': fit('danger', p.danger, paper, 3),

    '--c-note': fit('c-note', p.note, paper, 3),
    '--c-tip': fit('c-tip', p.tip, paper, 3),
    '--c-important': fit('c-important', p.important, paper, 3),
    '--c-warning': fit('c-warning', p.warning, paper, 3),
    '--c-caution': fit('c-caution', p.caution, paper, 3),

    '--hl-keyword': fit('hl-keyword', p.keyword, codeBg, 3),
    '--hl-string': fit('hl-string', p.string, codeBg, 3),
    '--hl-number': fit('hl-number', p.number, codeBg, 3),
    '--hl-title': fit('hl-title', p.title, codeBg, 3),
    '--hl-attr': fit('hl-attr', p.attr, codeBg, 3),
    '--hl-comment': fit('hl-comment', p.comment, codeBg, 3),
    '--hl-meta': fit('hl-meta', p.meta, codeBg, 3),
  }

  const shadow = isDark ? '#000000' : mix(p.fg, '#000000', 0.5)
  tokens['--shadow-1'] = isDark
    ? `0 1px 2px ${rgba(shadow, 0.3)}, 0 2px 10px ${rgba(shadow, 0.25)}`
    : `0 1px 2px ${rgba(shadow, 0.06)}, 0 2px 10px ${rgba(shadow, 0.06)}`
  tokens['--shadow-2'] = isDark
    ? `0 18px 50px -12px ${rgba(shadow, 0.6)}, 0 2px 6px ${rgba(shadow, 0.3)}`
    : `0 18px 50px -12px ${rgba(shadow, 0.28)}, 0 2px 6px ${rgba(shadow, 0.08)}`

  return { scheme, tokens, adjusted }
}

const declarations = (tokens: Tokens, scheme: Scheme): string =>
  [`color-scheme: ${scheme};`, ...Object.entries(tokens).map(([k, v]) => `${k}: ${v};`)]
    .map(line => `    ${line}`)
    .join('\n')

/** One `[data-theme][data-palette='id']` rule (specificity ties with the base dark block; themes.css comes later). Only custom properties and `color-scheme` are declared. */
export function paletteRule(id: string): string {
  const info = themeById(id)
  const palette = PALETTES[id]
  if (!info || !palette) throw new Error(`Unknown theme palette: ${id}`)
  const { tokens, adjusted } = deriveTokens(palette, info.scheme)
  const note = adjusted.length ? ` /* nudged for contrast: ${adjusted.join(', ')} */` : ''
  return `  /* ${info.name} */${note}\n  [data-theme][data-palette='${id}'] {\n${declarations(tokens, info.scheme)}\n  }`
}

/** Ids that have palette data (everything in the registry except the Cadmium base). */
export const PALETTE_IDS: readonly string[] = THEME_REGISTRY.map(t => t.id).filter(
  id => id in PALETTES,
)

/**
 * Every palette, screen only: printed pages always use the light base palette
 * (paper is white and browsers skip background colors by default).
 */
export function allPalettesCss(): string {
  return `@media screen {\n${PALETTE_IDS.map(paletteRule).join('\n\n')}\n}\n`
}

/** The active palette alone, for a self-contained HTML export. Empty for the Cadmium base. */
export function exportPaletteCss(id: string): string {
  return id in PALETTES ? `@media screen {\n${paletteRule(id)}\n}\n` : ''
}
