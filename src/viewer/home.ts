/**
 * Start page shown when the viewer opens without a document: open a file,
 * a URL or a scratch document, and jump back into recents/favorites.
 */
import { h, icon, relativeTime } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import {
  buildViewerUrl,
  describeSource,
  normalizeDocumentUrl,
  sourceProtocol,
} from '@/shared/urls'
import type { Library, LibraryEntry } from '@/storage/library-store'
import type { Workspace } from './workspace'
import { MOD_LABEL } from './shortcuts'

export interface HomeHooks {
  openFile: () => void
  openFolder: () => void
  openStoredFolder: (ws: Workspace) => void
  removeFolder: (ws: Workspace) => void
  openUrl: (url: string) => void
  newScratch: () => void
  openTour: () => void
  toggleFavorite: (entry: LibraryEntry) => void
  removeEntry: (entry: LibraryEntry) => void
}

export function entryHref(entry: LibraryEntry, viewerBase: string): string {
  const ref = entry.ref
  if (ref.kind === 'url') return buildViewerUrl(viewerBase, { src: ref.url })
  if (ref.kind === 'workspace')
    return buildViewerUrl(viewerBase, { ws: ref.id, path: ref.path })
  return buildViewerUrl(viewerBase, { doc: ref.id })
}

export function entryLabel(entry: LibraryEntry): { title: string; detail: string } {
  if (entry.ref.kind === 'local')
    return { title: entry.title || entry.ref.name, detail: `Local · ${entry.ref.name}` }
  if (entry.ref.kind === 'workspace')
    return {
      title: entry.title || (entry.ref.path.split('/').pop() ?? entry.ref.path),
      detail: `${entry.ref.name} / ${entry.ref.path}`,
    }
  const d = describeSource(entry.ref.url)
  return { title: entry.title || d.name, detail: `${d.host}${d.path}` }
}

export function renderHome(
  root: HTMLElement,
  opts: {
    library: Library
    folders: Workspace[]
    viewerBase: string
    fileAccess: boolean
    welcome: boolean
    hooks: HomeHooks
  },
): void {
  const { hooks } = opts
  const urlInput = h('input', {
    type: 'url',
    name: 'url',
    required: true,
    placeholder: 'https://raw.githubusercontent.com/…/README.md',
    'aria-label': 'Markdown URL',
    spellcheck: 'false',
  })
  const urlError = h('p', { class: 'ms-field-error', role: 'alert', hidden: true })
  const urlForm = h(
    'form',
    { class: 'ms-url-form' },
    urlInput,
    h('button', { type: 'submit', class: 'ms-btn ms-btn--primary', text: 'Open' }),
  )
  urlForm.addEventListener('submit', e => {
    e.preventDefault()
    const value = normalizeDocumentUrl(urlInput.value.trim())
    if (!sourceProtocol(value)) {
      urlError.hidden = false
      urlError.textContent = 'Enter an http(s) or file:// URL.'
      return
    }
    urlError.hidden = true
    hooks.openUrl(value)
  })

  const action = (
    label: string,
    sub: string,
    ico: readonly string[],
    fn: () => void,
    kbd?: string,
  ) =>
    h(
      'button',
      { type: 'button', class: 'ms-home-action', on: { click: fn } },
      h('span', { class: 'ms-home-action__icon' }, icon(ico)),
      h(
        'span',
        { class: 'ms-home-action__text' },
        h('strong', { text: label }),
        h('small', { text: sub }),
      ),
      kbd ? h('kbd', { text: kbd }) : null,
    )

  const favorites = opts.library.entries.filter(e => e.favorite)
  const recents = opts.library.entries.filter(e => !e.favorite).slice(0, 12)

  const list = (entries: LibraryEntry[], empty: string) =>
    entries.length === 0
      ? h('p', { class: 'ms-muted', text: empty })
      : h(
          'ul',
          { class: 'ms-doc-list' },
          ...entries.map(entry => {
            const { title, detail } = entryLabel(entry)
            return h(
              'li',
              {},
              h(
                'a',
                { href: entryHref(entry, opts.viewerBase), class: 'ms-doc-list__link' },
                h('span', { class: 'ms-doc-list__title', text: title }),
                h('span', { class: 'ms-doc-list__detail', text: detail }),
              ),
              h('span', {
                class: 'ms-doc-list__time',
                text: relativeTime(entry.openedAt),
              }),
              h(
                'button',
                {
                  type: 'button',
                  class: `ms-icon-btn ms-star${entry.favorite ? ' is-on' : ''}`,
                  'aria-pressed': String(entry.favorite),
                  'aria-label': entry.favorite
                    ? `Unfavorite ${title}`
                    : `Favorite ${title}`,
                  on: { click: () => hooks.toggleFavorite(entry) },
                },
                icon(ICONS.star),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'ms-icon-btn',
                  'aria-label': `Remove ${title} from history`,
                  on: { click: () => hooks.removeEntry(entry) },
                },
                icon(ICONS.x),
              ),
            )
          }),
        )

  root.replaceChildren(
    h(
      'main',
      { class: 'ms-home', id: 'ms-main' },
      h(
        'section',
        { class: 'ms-home__intro', 'aria-labelledby': 'ms-home-title' },
        h('p', { class: 'ms-eyebrow', text: 'Markscope' }),
        h('h1', {
          id: 'ms-home-title',
          text: 'Read Markdown like source code deserves.',
        }),
        h('p', {
          class: 'ms-home__lede',
          text: 'Open any .md file — local or remote — and get a fast, safe, navigable document with outline, search, diagrams, math and a documentation doctor.',
        }),
        opts.welcome
          ? h(
              'div',
              { class: 'ms-callout' },
              h('strong', { text: 'Welcome! ' }),
              'Markscope now opens Markdown URLs automatically. ',
              h('button', {
                type: 'button',
                class: 'ms-link-btn',
                text: 'Take the feature tour',
                on: { click: hooks.openTour },
              }),
              '.',
            )
          : null,
        !opts.fileAccess
          ? h(
              'div',
              { class: 'ms-callout ms-callout--warn' },
              h('strong', { text: 'Local files are off. ' }),
              'To open file:// Markdown, enable “Allow access to file URLs” for Markscope. ',
              h('button', {
                type: 'button',
                class: 'ms-link-btn',
                text: 'Open extension settings',
                on: {
                  click: () =>
                    void chrome.tabs.create({
                      url: `chrome://extensions/?id=${chrome.runtime.id}`,
                    }),
                },
              }),
            )
          : null,
        h(
          'div',
          { class: 'ms-dropzone', id: 'ms-dropzone' },
          icon(ICONS.file),
          h(
            'p',
            {},
            h('strong', { text: 'Drop a Markdown file or folder anywhere' }),
            h('span', { text: ' — it stays on your device.' }),
          ),
        ),
        h(
          'div',
          { class: 'ms-home-actions' },
          action(
            'Open file…',
            'Live-reloads while you edit',
            ICONS.folder,
            hooks.openFile,
            `${MOD_LABEL} O`,
          ),
          action(
            'Open folder…',
            'Browse a project’s docs with working images',
            ICONS.book,
            hooks.openFolder,
            `⇧${MOD_LABEL} O`,
          ),
          action(
            'Scratch document',
            'Write with live preview',
            ICONS.edit,
            hooks.newScratch,
          ),
          action(
            'Feature tour',
            'See everything Markscope renders',
            ICONS.sparkles,
            hooks.openTour,
          ),
        ),
        urlForm,
        urlError,
        h(
          'p',
          { class: 'ms-home__hint' },
          'Press ',
          h('kbd', { text: `${MOD_LABEL} K` }),
          ' for the command palette and ',
          h('kbd', { text: '?' }),
          ' for all shortcuts.',
        ),
      ),
      h(
        'section',
        { class: 'ms-home__library', 'aria-label': 'Library' },
        opts.folders.length
          ? h('h2', { class: 'ms-section-label', text: 'Folders' })
          : null,
        opts.folders.length
          ? h(
              'ul',
              { class: 'ms-doc-list' },
              ...opts.folders.slice(0, 6).map(ws =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'ms-doc-list__link ms-folder-link',
                      on: { click: () => hooks.openStoredFolder(ws) },
                    },
                    h('span', { class: 'ms-doc-list__title', text: ws.name }),
                    h('span', { class: 'ms-doc-list__detail', text: 'Folder' }),
                  ),
                  h('span', {
                    class: 'ms-doc-list__time',
                    text: relativeTime(ws.openedAt),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'ms-icon-btn',
                      'aria-label': `Forget folder ${ws.name}`,
                      on: { click: () => hooks.removeFolder(ws) },
                    },
                    icon(ICONS.x),
                  ),
                ),
              ),
            )
          : null,
        h('h2', { class: 'ms-section-label', text: 'Favorites' }),
        list(favorites, 'Star a document to pin it here.'),
        h('h2', { class: 'ms-section-label', text: 'Recent' }),
        list(recents, 'Documents you open appear here.'),
      ),
    ),
  )
}
