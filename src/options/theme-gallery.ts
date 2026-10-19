/**
 * The theme gallery on the settings page: two radio groups (light, dark), one card per
 * named theme. A card is a miniature document drawn with that theme's own tokens (it carries
 * `data-theme` + `data-palette`, so the stylesheet scopes the tokens to it). Plain radio
 * inputs give keyboard behavior for free: Tab to the group, arrows move and select.
 */
import { h } from '@/shared/dom'
import { themesOf, type Scheme, type ThemeInfo } from '@/shared/themes'

export interface GalleryState {
  themeLight: string
  themeDark: string
}

function card(info: ThemeInfo, selected: boolean, onPick: () => void): HTMLElement {
  const input = h('input', {
    type: 'radio',
    name: `ms-theme-${info.scheme}`,
    value: info.id,
    class: 'ms-theme-card__input',
  })
  input.checked = selected
  input.addEventListener('change', () => {
    if (input.checked) onPick()
  })
  return h(
    'label',
    {
      class: 'ms-theme-card',
      title: info.description,
      dataset: { theme: info.scheme, palette: info.id },
    },
    input,
    h(
      'span',
      { class: 'ms-theme-card__page', 'aria-hidden': 'true' },
      h('span', { class: 'ms-theme-card__h', text: 'Aa' }),
      h('span', { class: 'ms-theme-card__line' }),
      h('span', { class: 'ms-theme-card__line is-short' }),
      h('span', { class: 'ms-theme-card__code' }, h('i'), h('i'), h('i'), h('i')),
      h('span', { class: 'ms-theme-card__link', text: 'link' }),
    ),
    h('span', { class: 'ms-theme-card__name', text: info.name }),
  )
}

function group(
  scheme: Scheme,
  selected: string,
  onPick: (scheme: Scheme, id: string) => void,
): HTMLElement {
  const label = scheme === 'light' ? 'Light themes' : 'Dark themes'
  const titleId = `ms-theme-group-${scheme}`
  return h(
    'div',
    { class: 'ms-theme-group', role: 'radiogroup', 'aria-labelledby': titleId },
    h('h3', { id: titleId, class: 'ms-theme-group__title', text: label }),
    h(
      'div',
      { class: 'ms-theme-grid' },
      ...themesOf(scheme).map(info =>
        card(info, info.id === selected, () => onPick(scheme, info.id)),
      ),
    ),
  )
}

/** `onPick` is called with the scheme and id the user chose (it should save and switch the mode). */
export function themeGallery(
  state: GalleryState,
  onPick: (scheme: Scheme, id: string) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'ms-theme-gallery' },
    group('light', state.themeLight, onPick),
    group('dark', state.themeDark, onPick),
  )
}
