/**
 * The named color themes. `theme` (system | light | dark) picks the scheme;
 * `themeLight` / `themeDark` pick which palette is used in each scheme.
 *
 * This is the pure registry (ids, labels, scheme) shared by settings, the
 * options gallery, the palette and the VS Code configuration schema. The colors
 * live in `theme-palettes.ts`. Node imports this file too: relative `.ts` paths only.
 */

export type Scheme = 'light' | 'dark'

export interface ThemeInfo {
  id: string
  name: string
  scheme: Scheme
  /** One line for the VS Code settings UI and the gallery tooltip. */
  description: string
}

const light = (id: string, name: string, description: string): ThemeInfo => ({
  id,
  name,
  scheme: 'light',
  description,
})
const dark = (id: string, name: string, description: string): ThemeInfo => ({
  id,
  name,
  scheme: 'dark',
  description,
})

export const THEME_REGISTRY: readonly ThemeInfo[] = [
  light(
    'cadmium-light',
    'Cadmium Light',
    'The Markscope default: warm paper, indigo accent.',
  ),
  light('ayu-light', 'Ayu Light', 'Bright and simple, with an orange accent.'),
  light('catppuccin-latte', 'Catppuccin Latte', 'Soft pastels on a cool, creamy base.'),
  light(
    'everforest-light',
    'Everforest Light',
    'Warm, low-contrast greens on parchment.',
  ),
  light(
    'graphite-light',
    'Graphite Light',
    'Neutral cool gray with a steel-blue accent.',
  ),
  light('gruvbox-light', 'Gruvbox Light', 'Retro groove: cream paper and earthy ink.'),
  light(
    'rose-pine-dawn',
    'Rosé Pine Dawn',
    'Soho vibes: warm sand with muted rose and iris.',
  ),
  light(
    'solarized-light',
    'Solarized Light',
    'Precision colors for machines and people.',
  ),
  light('tokyo-night-light', 'Tokyo Night Light', 'The daytime sibling of Tokyo Night.'),
  light('ulysses-light', 'Ulysses Light', 'Warm writing paper with a calm blue accent.'),

  dark('cadmium-dark', 'Cadmium Dark', 'The Markscope default dark: deep indigo-gray.'),
  dark('ayu-dark', 'Ayu Dark', 'Deep and focused, with a golden accent.'),
  dark('ayu-mirage', 'Ayu Mirage', 'The softer, bluish middle ground of Ayu.'),
  dark('catppuccin-mocha', 'Catppuccin Mocha', 'The darkest, coziest Catppuccin.'),
  dark('cyberdream', 'cyberdream', 'A high-contrast, futuristic neon theme.'),
  dark('dracula', 'Dracula', 'A dark theme with vivid purple and pink.'),
  dark(
    'everforest-dark',
    'Everforest Dark',
    'Comfortable, green-tinted and easy on the eyes.',
  ),
  dark('github-dark', 'GitHub Dark', 'The familiar GitHub dark default.'),
  dark('gruvbox-dark', 'Gruvbox Dark', 'Retro groove: warm browns and punchy accents.'),
  dark('horizon-dark', 'Horizon Dark', 'Warm dark with coral and teal highlights.'),
  dark('kanagawa', 'Kanagawa', 'Inspired by the colors of Hokusai’s Great Wave.'),
  dark('material-dark', 'Material Dark', 'Material Design on a neutral charcoal base.'),
  dark(
    'monokai-pro',
    'Monokai Pro',
    'Inspired by Monokai Pro: vivid colors on charcoal.',
  ),
  dark('night-owl', 'Night Owl', 'Made for late-night coders, with careful contrast.'),
  dark('nightfox', 'Nightfox', 'A cool, balanced dark with soft saturation.'),
  dark('nord', 'Nord', 'An arctic, north-bluish palette.'),
  dark('one-dark', 'One Dark', 'Atom’s classic dark.'),
  dark('oxocarbon-dark', 'Oxocarbon Dark', 'IBM Carbon inspired: crisp and minimal.'),
  dark('palenight', 'Palenight', 'Material Palenight: a purple-tinged night.'),
  dark('rose-pine', 'Rosé Pine', 'All natural pine, faux fur and a bit of soho vibes.'),
  dark('rose-pine-moon', 'Rosé Pine Moon', 'Rosé Pine with a bluer, lighter surface.'),
  dark('solarized-dark', 'Solarized Dark', 'Precision colors on teal-black.'),
  dark('synthwave-84', 'Synthwave ’84', 'Retro neon glow on a deep purple.'),
  dark('tokyo-night', 'Tokyo Night', 'A clean dark inspired by Tokyo at night.'),
  dark(
    'tokyo-night-storm',
    'Tokyo Night Storm',
    'Tokyo Night with a lighter, stormier base.',
  ),
]

const idsOf = (scheme: Scheme): readonly string[] =>
  THEME_REGISTRY.filter(t => t.scheme === scheme).map(t => t.id)

export const LIGHT_THEME_IDS: readonly string[] = idsOf('light')
export const DARK_THEME_IDS: readonly string[] = idsOf('dark')

export const DEFAULT_THEME_LIGHT = 'cadmium-light'
export const DEFAULT_THEME_DARK = 'cadmium-dark'

export function themeById(id: string): ThemeInfo | undefined {
  return THEME_REGISTRY.find(t => t.id === id)
}

export const themesOf = (scheme: Scheme): readonly ThemeInfo[] =>
  THEME_REGISTRY.filter(t => t.scheme === scheme)
