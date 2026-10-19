import { describe, expect, test, vi } from 'vitest'
import { themeGallery } from '@/options/theme-gallery'

const state = { themeLight: 'cadmium-light', themeDark: 'nord' }
const radios = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLInputElement>('input[type=radio]'),
]

describe('theme gallery', () => {
  test('one radio card per theme, in a light and a dark group, each carrying its own palette', () => {
    const root = themeGallery(state, vi.fn())
    expect(radios(root)).toHaveLength(35)
    expect(root.querySelectorAll('[role=radiogroup]')).toHaveLength(2)
    const cards = [...root.querySelectorAll<HTMLElement>('.ms-theme-card')]
    expect(cards).toHaveLength(35)
    const nord = cards.find(c => c.dataset.palette === 'nord')!
    expect(nord.dataset.theme).toBe('dark')
    expect(nord.textContent).toContain('Nord')
    const latte = cards.find(c => c.dataset.palette === 'catppuccin-latte')!
    expect(latte.dataset.theme).toBe('light')
  })

  test('the saved themes are the selected ones', () => {
    const checked = radios(themeGallery(state, vi.fn()))
      .filter(r => r.checked)
      .map(r => r.value)
    expect(checked.sort()).toEqual(['cadmium-light', 'nord'])
  })

  test('choosing a card reports its scheme and id', () => {
    const onPick = vi.fn()
    const root = themeGallery(state, onPick)
    const dracula = radios(root).find(r => r.value === 'dracula')!
    dracula.checked = true
    dracula.dispatchEvent(new Event('change'))
    expect(onPick).toHaveBeenCalledWith('dark', 'dracula')
    const gruvbox = radios(root).find(r => r.value === 'gruvbox-light')!
    gruvbox.checked = true
    gruvbox.dispatchEvent(new Event('change'))
    expect(onPick).toHaveBeenLastCalledWith('light', 'gruvbox-light')
  })

  test('radios of a scheme share one name, so arrow keys move within it', () => {
    const names = (scheme: string) =>
      new Set(
        radios(themeGallery(state, vi.fn()))
          .filter(r => r.closest<HTMLElement>('.ms-theme-card')?.dataset.theme === scheme)
          .map(r => r.name),
      )
    expect(names('light')).toEqual(new Set(['ms-theme-light']))
    expect(names('dark')).toEqual(new Set(['ms-theme-dark']))
  })
})
