/** Accessible dropdown menu (menu button pattern) with keyboard support. */
import { h } from '@/shared/dom'

export interface MenuItem {
  label: string
  hint?: string
  run: () => void
  checked?: () => boolean
  hidden?: () => boolean
}

export class Menu {
  readonly button: HTMLButtonElement
  private list: HTMLElement
  private open = false

  constructor(
    button: HTMLButtonElement,
    private readonly items: () => (MenuItem | 'separator')[],
  ) {
    this.button = button
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    this.list = h('div', { class: 'ms-menu ms-ui', role: 'menu', hidden: true })
    button.after(this.list)
    button.addEventListener('click', () => (this.open ? this.close() : this.show()))
    this.list.addEventListener('keydown', e => this.onKey(e))
    document.addEventListener('pointerdown', e => {
      if (
        this.open &&
        !this.list.contains(e.target as Node) &&
        e.target !== button &&
        !button.contains(e.target as Node)
      )
        this.close()
    })
  }

  show(): void {
    const nodes = this.items()
      .filter(i => i === 'separator' || !i.hidden?.())
      .map(item => {
        if (item === 'separator')
          return h('div', { class: 'ms-menu__sep', role: 'separator' })
        const checkable = item.checked !== undefined
        const btn = h(
          'button',
          {
            type: 'button',
            role: checkable ? 'menuitemcheckbox' : 'menuitem',
            class: 'ms-menu__item',
            tabindex: '-1',
            ...(checkable ? { 'aria-checked': String(item.checked?.()) } : {}),
          },
          h('span', { text: item.label }),
          item.hint ? h('kbd', { text: item.hint }) : null,
        )
        btn.addEventListener('click', () => {
          this.close(true)
          item.run()
        })
        return btn
      })
    this.list.replaceChildren(...nodes)
    this.list.hidden = false
    this.open = true
    this.button.setAttribute('aria-expanded', 'true')
    this.focusItem(0)
  }

  close(focusButton = false): void {
    this.list.hidden = true
    this.open = false
    this.button.setAttribute('aria-expanded', 'false')
    if (focusButton) this.button.focus()
  }

  private get menuItems(): HTMLElement[] {
    return Array.from(this.list.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
  }

  private focusItem(i: number): void {
    const items = this.menuItems
    items[(i + items.length) % items.length]?.focus()
  }

  private onKey(e: KeyboardEvent): void {
    const items = this.menuItems
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') this.focusItem(idx + 1)
    else if (e.key === 'ArrowUp') this.focusItem(idx - 1)
    else if (e.key === 'Home') this.focusItem(0)
    else if (e.key === 'End') this.focusItem(items.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') this.close(e.key === 'Escape')
    else return
    e.preventDefault()
  }
}
