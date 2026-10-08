/**
 * Command palette (⌘K / Ctrl+K): fuzzy search over commands, headings and
 * recent documents. Fully keyboard driven, ARIA combobox pattern.
 */
import { h } from '@/shared/dom'
import { fuzzyFilter } from './fuzzy'

export interface PaletteItem {
  id: string
  label: string
  group: 'Command' | 'Heading' | 'Recent'
  hint?: string
  run: () => void
}

export class CommandPalette {
  private dialog: HTMLDialogElement
  private input = h('input', {
    type: 'text',
    class: 'ms-palette__input',
    placeholder: 'Type a command, heading or document…',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'ms-palette-list',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  private list = h('ul', {
    class: 'ms-palette__list',
    id: 'ms-palette-list',
    role: 'listbox',
    'aria-label': 'Results',
  })
  private items: PaletteItem[] = []
  private shown: PaletteItem[] = []
  private active = 0
  private opening = false

  constructor(private readonly source: () => PaletteItem[] | Promise<PaletteItem[]>) {
    this.dialog = h(
      'dialog',
      { class: 'ms-palette ms-ui', 'aria-label': 'Command palette' },
      this.input,
      this.list,
      h(
        'div',
        { class: 'ms-palette__foot' },
        h('span', { text: '↑↓ navigate' }),
        h('span', { text: '↵ run' }),
        h('span', { text: 'esc close' }),
      ),
    )
    this.dialog.addEventListener('click', e => {
      if (e.target === this.dialog) this.close()
    })
    this.input.addEventListener('input', () => this.filter())
    this.input.addEventListener('keydown', e => this.onKey(e))
    this.list.addEventListener('click', e => {
      const li = (e.target as HTMLElement).closest('li')
      const idx = li ? Number(li.dataset.index) : -1
      if (idx >= 0) this.runAt(idx)
    })
    document.body.append(this.dialog)
  }

  async open(prefix = ''): Promise<void> {
    if (this.dialog.open || this.opening) return
    this.opening = true
    try {
      this.items = await this.source()
    } catch {
      this.items = []
    } finally {
      this.opening = false
    }
    this.input.value = prefix
    this.filter()
    this.dialog.showModal()
    this.input.focus()
  }

  close(): void {
    this.dialog.close()
  }

  get isOpen(): boolean {
    return this.dialog.open
  }

  private filter(): void {
    let query = this.input.value
    let pool = this.items
    if (query.startsWith('#')) {
      pool = this.items.filter(i => i.group === 'Heading')
      query = query.slice(1)
    } else if (query.startsWith('>')) {
      pool = this.items.filter(i => i.group === 'Command')
      query = query.slice(1)
    }
    this.shown = fuzzyFilter(pool, query, i => `${i.label} ${i.hint ?? ''}`, 60)
    this.active = 0
    this.renderList()
  }

  private renderList(): void {
    let lastGroup = ''
    const nodes: HTMLElement[] = []
    this.shown.forEach((item, index) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group
        nodes.push(
          h('li', { class: 'ms-palette__group', role: 'presentation', text: item.group }),
        )
      }
      nodes.push(
        h(
          'li',
          {
            role: 'option',
            id: `ms-opt-${index}`,
            class: 'ms-palette__item',
            'aria-selected': String(index === this.active),
            dataset: { index: String(index) },
          },
          h('span', { class: 'ms-palette__label', text: item.label }),
          item.hint ? h('kbd', { class: 'ms-palette__hint', text: item.hint }) : null,
        ),
      )
    })
    if (nodes.length === 0)
      nodes.push(h('li', { class: 'ms-palette__empty', text: 'No results' }))
    this.list.replaceChildren(...nodes)
    this.input.setAttribute(
      'aria-activedescendant',
      this.shown.length ? `ms-opt-${this.active}` : '',
    )
  }

  private move(delta: number): void {
    if (this.shown.length === 0) return
    this.active = (this.active + delta + this.shown.length) % this.shown.length
    this.list
      .querySelectorAll('[role="option"]')
      .forEach(el =>
        el.setAttribute(
          'aria-selected',
          String(Number((el as HTMLElement).dataset.index) === this.active),
        ),
      )
    this.list
      .querySelector(`#ms-opt-${this.active}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    this.input.setAttribute('aria-activedescendant', `ms-opt-${this.active}`)
  }

  private runAt(index: number): void {
    const item = this.shown[index]
    if (!item) return
    this.close()
    item.run()
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      this.runAt(this.active)
    }
  }
}
