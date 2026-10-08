/** Static viewer chrome: toolbar, panes, status bar. */
import { h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'

export type ViewMode = 'read' | 'split' | 'source'

export interface Layout {
  root: HTMLElement
  toolbar: HTMLElement
  sidebarBtn: HTMLButtonElement
  title: HTMLElement
  subtitle: HTMLElement
  favoriteBtn: HTMLButtonElement
  modeButtons: Record<ViewMode, HTMLButtonElement>
  searchBtn: HTMLButtonElement
  aiBtn: HTMLButtonElement
  themeBtn: HTMLButtonElement
  paletteBtn: HTMLButtonElement
  moreBtn: HTMLButtonElement
  shell: HTMLElement
  sidebarSlot: HTMLElement
  main: HTMLElement
  banner: HTMLElement
  panes: HTMLElement
  editor: HTMLTextAreaElement
  sourceView: HTMLElement
  article: HTMLElement
  aiSlot: HTMLElement
  status: HTMLElement
  home: HTMLElement
}

const iconBtn = (
  label: string,
  ico: readonly string[],
  extra: Record<string, string> = {},
) =>
  h(
    'button',
    { type: 'button', class: 'ms-icon-btn', 'aria-label': label, title: label, ...extra },
    icon(ico),
  )

export function buildLayout(mount: HTMLElement): Layout {
  const sidebarBtn = iconBtn('Toggle sidebar (B)', ICONS.menu, {
    'aria-controls': 'ms-sidebar-slot',
  })
  const title = h('h1', { class: 'ms-title', text: 'Markscope' })
  const subtitle = h('p', { class: 'ms-subtitle' })
  const favoriteBtn = iconBtn('Add to favorites', ICONS.star, { 'aria-pressed': 'false' })
  favoriteBtn.classList.add('ms-star')

  const mode = (id: ViewMode, label: string, ico: readonly string[], key: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ms-seg__btn',
        'aria-pressed': 'false',
        title: `${label} (${key})`,
        dataset: { mode: id },
      },
      icon(ico),
      h('span', { text: label }),
    )
  const modeButtons = {
    read: mode('read', 'Read', ICONS.book, '1'),
    split: mode('split', 'Edit', ICONS.columns, '2'),
    source: mode('source', 'Source', ICONS.code, '3'),
  }
  const searchBtn = iconBtn('Find in document (/)', ICONS.search)
  const aiBtn = iconBtn('AI assistant (A)', ICONS.sparkles, { hidden: '' })
  const themeBtn = iconBtn('Switch theme (T)', ICONS.monitor)
  const paletteBtn = h(
    'button',
    { type: 'button', class: 'ms-palette-btn', title: 'Command palette' },
    icon(ICONS.command),
    h('span', { text: 'Commands' }),
    h('kbd', { text: 'K' }),
  )
  const moreBtn = iconBtn('More actions', ICONS.more)

  const toolbar = h(
    'header',
    { class: 'ms-toolbar ms-ui' },
    h('a', { class: 'ms-skip', href: '#ms-doc', text: 'Skip to document' }),
    sidebarBtn,
    h('div', { class: 'ms-titles' }, title, subtitle),
    favoriteBtn,
    h(
      'div',
      { class: 'ms-seg', role: 'group', 'aria-label': 'View mode' },
      ...Object.values(modeButtons),
    ),
    h(
      'div',
      { class: 'ms-toolbar__actions' },
      searchBtn,
      aiBtn,
      themeBtn,
      paletteBtn,
      h('div', { class: 'ms-menu-wrap' }, moreBtn),
    ),
  )

  const editor = h('textarea', {
    class: 'ms-editor',
    spellcheck: 'false',
    'aria-label': 'Markdown source editor',
    wrap: 'off',
  })
  const sourceView = h('pre', {
    class: 'ms-source',
    tabindex: '0',
    'aria-label': 'Markdown source',
  })
  const article = h('article', { class: 'ms-doc', id: 'ms-doc', tabindex: '-1' })
  const panes = h(
    'div',
    { class: 'ms-panes', dataset: { view: 'read' } },
    h('div', { class: 'ms-pane ms-pane--editor' }, editor),
    h('div', { class: 'ms-pane ms-pane--source' }, sourceView),
    h('div', { class: 'ms-pane ms-pane--preview' }, article),
  )
  const banner = h('div', { class: 'ms-banner ms-ui', role: 'status', hidden: true })
  const main = h('main', { class: 'ms-main', id: 'ms-main' }, banner, panes)
  const sidebarSlot = h('div', { class: 'ms-sidebar-slot', id: 'ms-sidebar-slot' })
  const aiSlot = h('div', { class: 'ms-ai-slot' })
  const shell = h('div', { class: 'ms-shell' }, sidebarSlot, main, aiSlot)
  const status = h('footer', {
    class: 'ms-status ms-ui',
    'aria-label': 'Document status',
  })
  const home = h('div', { class: 'ms-home-root', hidden: true })
  const root = h('div', { class: 'ms-app' }, toolbar, shell, status, home)
  mount.replaceChildren(root)

  return {
    root,
    toolbar,
    sidebarBtn,
    title,
    subtitle,
    favoriteBtn,
    modeButtons,
    searchBtn,
    aiBtn,
    themeBtn,
    paletteBtn,
    moreBtn,
    shell,
    sidebarSlot,
    main,
    banner,
    panes,
    editor,
    sourceView,
    article,
    aiSlot,
    status,
    home,
  }
}

export function showBanner(
  layout: Layout,
  message: string,
  action?: { label: string; run: () => void },
  kind: 'info' | 'warn' | 'error' = 'info',
): void {
  const b = layout.banner
  b.className = `ms-banner ms-ui ms-banner--${kind}`
  b.replaceChildren(
    h('span', { text: message }),
    ...(action
      ? [
          h('button', {
            type: 'button',
            class: 'ms-btn ms-btn--small',
            text: action.label,
            on: { click: action.run },
          }),
        ]
      : []),
    h(
      'button',
      {
        type: 'button',
        class: 'ms-icon-btn',
        'aria-label': 'Dismiss',
        on: { click: () => (b.hidden = true) },
      },
      icon(ICONS.x),
    ),
  )
  b.hidden = false
}

export function hideBanner(layout: Layout): void {
  layout.banner.hidden = true
}
