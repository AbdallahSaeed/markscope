import { describe, expect, test } from 'vitest'
import { CommandPalette, type PaletteItem } from '@/viewer/palette'
import { THEME_REGISTRY } from '@/shared/themes'

const noop = () => undefined
const commandItems: PaletteItem[] = [
  { id: 'c1', label: 'Reload document', group: 'Command', run: noop },
]
const themeItems: PaletteItem[] = THEME_REGISTRY.map(t => ({
  id: `theme:${t.id}`,
  label: `Theme: ${t.name}`,
  group: 'Theme',
  hint: t.scheme,
  run: noop,
}))

// HTMLDialogElement.showModal is missing in jsdom; the palette only needs it to open.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

async function open(query: string): Promise<string[]> {
  document.body.innerHTML = ''
  const palette = new CommandPalette(() => [...commandItems, ...themeItems])
  await palette.open(query)
  return [...document.querySelectorAll('.ms-palette__label')].map(
    n => n.textContent ?? '',
  )
}

describe('palette theme entries', () => {
  test('are not listed for an empty query (35 rows would bury the commands)', async () => {
    const labels = await open('')
    expect(labels).toEqual(['Reload document'])
  })

  test('appear when searched for, and the best match is first', async () => {
    const labels = await open('theme nord')
    expect(labels[0]).toBe('Theme: Nord')
    expect((await open('dracula'))[0]).toBe('Theme: Dracula')
  })

  test('the ">" command filter does not include themes', async () => {
    expect(await open('>theme')).toEqual([])
  })
})
