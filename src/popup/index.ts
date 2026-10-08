/**
 * Toolbar popup: context-aware action for the current tab, quick toggles
 * and recent documents.
 */
import { h, icon, relativeTime } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { errorMessage } from '@/shared/errors'
import type { Settings, Theme } from '@/shared/settings'
import { buildViewerUrl, sourceProtocol, toRawUrl } from '@/shared/urls'
import { libraryStore, settingsStore } from '@/storage'
import { entryHref, entryLabel } from '@/viewer/home'
import { applyAppearance } from '@/viewer/theme'

const viewerBase = chrome.runtime.getURL('viewer.html')
const store = settingsStore()
const library = libraryStore()

function openTab(url: string): void {
  void chrome.tabs.create({ url })
  window.close()
}

function switchRow(
  label: string,
  desc: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'ms-switch' })
  input.checked = checked
  input.addEventListener('change', () => onChange(input.checked))
  return h(
    'label',
    { class: 'ms-row' },
    h(
      'span',
      { class: 'ms-row__text' },
      h('strong', { text: label }),
      h('small', { text: desc }),
    ),
    input,
  )
}

function themeControl(current: Theme, onChange: (t: Theme) => void): HTMLElement {
  const opts: [Theme, string, readonly string[]][] = [
    ['system', 'System', ICONS.monitor],
    ['light', 'Light', ICONS.sun],
    ['dark', 'Dark', ICONS.moon],
  ]
  return h(
    'div',
    { class: 'ms-row' },
    h('span', { class: 'ms-row__text' }, h('strong', { text: 'Theme' })),
    h(
      'div',
      { class: 'ms-seg', role: 'radiogroup', 'aria-label': 'Theme' },
      ...opts.map(([id, label, ico]) => {
        const btn = h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: 'ms-seg__btn',
            'aria-checked': String(current === id),
            title: label,
          },
          icon(ico),
          h('span', { text: label }),
        )
        btn.addEventListener('click', () => {
          btn.parentElement
            ?.querySelectorAll('[role="radio"]')
            .forEach(b => b.setAttribute('aria-checked', String(b === btn)))
          onChange(id)
        })
        return btn
      }),
    ),
  )
}

async function tabCard(tab: chrome.tabs.Tab | undefined): Promise<HTMLElement> {
  const url = tab?.url ?? ''
  const status = h('p', { class: 'ms-card__status', role: 'status' })
  const card = (
    title: string,
    body: string,
    action?: { label: string; run: () => Promise<void> | void },
  ) => {
    const btn = action
      ? h('button', {
          type: 'button',
          class: 'ms-btn ms-btn--primary',
          text: action.label,
        })
      : null
    btn?.addEventListener('click', async () => {
      btn.disabled = true
      try {
        await action?.run()
      } catch (error) {
        status.textContent = errorMessage(error)
        btn.disabled = false
      }
    })
    return h(
      'section',
      { class: 'ms-card', 'aria-label': 'Current tab' },
      h('h2', { text: title }),
      h('p', { text: body }),
      btn,
      status,
    )
  }

  if (url.startsWith(viewerBase))
    return card(
      'Viewing in Markscope',
      'Press ? in the viewer for keyboard shortcuts, or Ctrl/⌘ K for commands.',
    )
  const raw = toRawUrl(url)
  if (raw) {
    return card(
      'Repository file',
      'Open the raw Markdown of this file in the Markscope viewer.',
      {
        label: 'Open in Markscope',
        run: () => openTab(buildViewerUrl(viewerBase, { src: raw })),
      },
    )
  }
  if (tab?.id !== undefined && sourceProtocol(url)) {
    const tabId = tab.id
    return card(
      'This page',
      'If this tab shows plain-text Markdown that was not detected automatically, render it now.',
      {
        label: 'Render as Markdown',
        run: async () => {
          const res = (await chrome.runtime.sendMessage({
            type: 'render-active-tab',
            tabId,
          })) as { ok: boolean; error?: string }
          if (!res?.ok) throw new Error(res?.error ?? 'Could not render this page')
          window.close()
        },
      },
    )
  }
  return card(
    'Markscope',
    'Open a Markdown file, URL or scratch document from the start page.',
  )
}

async function render(settings: Settings): Promise<void> {
  applyAppearance(settings)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const lib = await library.load()
  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess()
  const recents = lib.entries.slice(0, 5)
  const root = document.getElementById('ms-popup') as HTMLElement

  const nodes: (HTMLElement | null)[] = [
    h(
      'header',
      { class: 'ms-pop-head' },
      h('img', { src: 'icons/icon-32.png', alt: '', width: '20', height: '20' }),
      h('span', { class: 'ms-wordmark', text: 'Markscope' }),
      h(
        'button',
        {
          type: 'button',
          class: 'ms-icon-btn',
          'aria-label': 'Settings',
          title: 'Settings',
          on: { click: () => void chrome.runtime.openOptionsPage() },
        },
        icon(ICONS.settings),
      ),
    ),
    await tabCard(tab),
    !fileAccess
      ? h(
          'p',
          { class: 'ms-warn' },
          'Local .md files need “Allow access to file URLs”. ',
          h('button', {
            type: 'button',
            class: 'ms-link-btn',
            text: 'Enable',
            on: { click: () => openTab(`chrome://extensions/?id=${chrome.runtime.id}`) },
          }),
        )
      : null,
    h(
      'section',
      { class: 'ms-group', 'aria-label': 'Quick settings' },
      switchRow(
        'Open Markdown automatically',
        'Render .md URLs when you visit them',
        settings.autoRender,
        v => void store.update({ autoRender: v }),
      ),
      switchRow(
        'Live reload',
        'Watch open documents for changes',
        settings.liveReload.enabled,
        v => void store.update({ liveReload: { enabled: v } }),
      ),
      themeControl(settings.theme, t => void store.update({ theme: t })),
    ),
    h(
      'section',
      { class: 'ms-group', 'aria-labelledby': 'ms-recent-title' },
      h('h2', { class: 'ms-section-label', id: 'ms-recent-title', text: 'Recent' }),
      recents.length
        ? h(
            'ul',
            { class: 'ms-recents' },
            ...recents.map(e => {
              const { title, detail } = entryLabel(e)
              return h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ms-recent',
                    title: detail,
                    on: { click: () => openTab(entryHref(e, viewerBase)) },
                  },
                  e.favorite ? icon(ICONS.star) : icon(ICONS.file),
                  h('span', { class: 'ms-recent__title', text: title }),
                  h('span', { class: 'ms-recent__time', text: relativeTime(e.openedAt) }),
                ),
              )
            }),
          )
        : h('p', { class: 'ms-muted', text: 'Documents you open will appear here.' }),
    ),
    h(
      'footer',
      { class: 'ms-pop-foot' },
      h(
        'button',
        { type: 'button', class: 'ms-btn', on: { click: () => openTab(viewerBase) } },
        icon(ICONS.folder),
        h('span', { text: 'Start page' }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ms-btn',
          on: { click: () => openTab(buildViewerUrl(viewerBase, { scratch: true })) },
        },
        icon(ICONS.edit),
        h('span', { text: 'Scratch' }),
      ),
    ),
  ]
  root.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null))
}

const showError = (error: unknown) => {
  const root = document.getElementById('ms-popup')
  if (root) root.textContent = errorMessage(error)
}
window.addEventListener('unhandledrejection', e => showError(e.reason))

store
  .load()
  .then(render)
  .catch(error => {
    document.body.textContent = errorMessage(error)
  })
// Controls update themselves; only re-apply appearance on external changes.
store.subscribe(s => applyAppearance(s))
