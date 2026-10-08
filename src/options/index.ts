/**
 * Settings page. Every control writes through the validated settings store
 * immediately (no Save button); the viewer updates live via storage events.
 */
import { h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { errorMessage } from '@/shared/errors'
import {
  AI_PRESETS,
  aiKeyOrigin,
  isAllowedAIBaseUrl,
  isValidMatchPattern,
  LIMITS,
  type AIProviderId,
  type DeepPartial,
  type Settings,
} from '@/shared/settings'
import { originPattern } from '@/shared/urls'
import { libraryStore, secretsStore, settingsStore } from '@/storage'
import { AIClient } from '@/viewer/ai-client'
import { applyAppearance } from '@/viewer/theme'

const store = settingsStore()
const secrets = secretsStore()
const library = libraryStore()
let settings: Settings

let pendingSave: Promise<void> = Promise.resolve()
const status = h('div', { class: 'ms-saved', role: 'status', 'aria-live': 'polite' })
function flash(text = 'Saved'): void {
  status.textContent = text
  status.classList.add('is-on')
  setTimeout(() => status.classList.remove('is-on'), 1400)
}

function save(patch: DeepPartial<Settings>): Promise<void> {
  pendingSave = pendingSave.then(() => doSave(patch))
  return pendingSave
}

async function doSave(patch: DeepPartial<Settings>): Promise<void> {
  try {
    settings = await store.update(patch)
    applyAppearance(settings)
    flash()
  } catch (error) {
    flash(`Error: ${errorMessage(error)}`)
  }
}

let uid = 0
const field = (label: string, desc: string | null, control: HTMLElement) => {
  const id = `f${++uid}`
  control.id = id
  return h(
    'div',
    { class: 'ms-field' },
    h(
      'div',
      { class: 'ms-field__text' },
      h('label', { for: id, text: label }),
      desc ? h('p', { text: desc }) : null,
    ),
    control,
  )
}

function toggle(
  label: string,
  desc: string | null,
  get: (s: Settings) => boolean,
  patch: (v: boolean) => DeepPartial<Settings>,
) {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'ms-switch' })
  input.checked = get(settings)
  input.addEventListener('change', () => void save(patch(input.checked)))
  return field(label, desc, input)
}

function select<T extends string>(
  label: string,
  desc: string | null,
  options: [T, string][],
  value: T,
  onChange: (v: T) => void,
) {
  const el = h(
    'select',
    { class: 'ms-select' },
    ...options.map(([v, l]) => h('option', { value: v, text: l })),
  )
  el.value = value
  el.addEventListener('change', () => onChange(el.value as T))
  return field(label, desc, el)
}

function range(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  format: (n: number) => string,
  onChange: (n: number) => void,
) {
  const out = h('output', { text: format(value) })
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    class: 'ms-range',
  })
  input.addEventListener('input', () => (out.textContent = format(Number(input.value))))
  input.addEventListener('change', () => onChange(Number(input.value)))
  const wrap = h('div', { class: 'ms-range-wrap' }, input, out)
  const f = field(label, null, wrap)
  // Label targets the range input itself.
  wrap.removeAttribute('id')
  input.id = `f${++uid}`
  f.querySelector('label')?.setAttribute('for', input.id)
  return f
}

function section(
  id: string,
  title: string,
  intro: string,
  ...children: (HTMLElement | null)[]
) {
  return h(
    'section',
    { class: 'ms-section', id, 'aria-labelledby': `${id}-title` },
    h('h2', { id: `${id}-title`, text: title }),
    h('p', { class: 'ms-section__intro', text: intro }),
    ...children,
  )
}

function generalSection(): HTMLElement {
  const list = h('ul', { class: 'ms-patterns' })
  const input = h('input', {
    type: 'text',
    class: 'ms-input',
    placeholder: 'https://docs.example.com/*',
    'aria-label': 'New URL pattern',
    spellcheck: 'false',
  })
  const error = h('p', { class: 'ms-field-error', role: 'alert', hidden: true })
  const renderList = () =>
    list.replaceChildren(
      ...(settings.urlPatterns.length
        ? settings.urlPatterns.map(p =>
            h(
              'li',
              {},
              h('code', { text: p }),
              h(
                'button',
                {
                  type: 'button',
                  class: 'ms-icon-btn',
                  'aria-label': `Remove ${p}`,
                  on: {
                    click: async () => {
                      await save({
                        urlPatterns: settings.urlPatterns.filter(x => x !== p),
                      })
                      renderList()
                    },
                  },
                },
                icon(ICONS.x),
              ),
            ),
          )
        : [h('li', { class: 'ms-muted', text: 'No extra patterns.' })]),
    )
  renderList()
  const form = h(
    'form',
    { class: 'ms-inline-form' },
    input,
    h('button', { type: 'submit', class: 'ms-btn', text: 'Add pattern' }),
  )
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const p = input.value.trim()
    if (!isValidMatchPattern(p)) {
      error.hidden = false
      error.textContent =
        'Use a match pattern like https://example.com/docs/* (http, https or file).'
      return
    }
    error.hidden = true
    // Requesting the origin here is what lets the content script run there.
    const origin = p.startsWith('file:') ? null : p
    if (origin && !(await chrome.permissions.request({ origins: [origin] }))) {
      error.hidden = false
      error.textContent = 'Permission was not granted, so the pattern was not added.'
      return
    }
    await save({ urlPatterns: [...settings.urlPatterns, p] })
    input.value = ''
    renderList()
  })
  return section(
    'general',
    'General',
    'How Markscope finds and opens Markdown.',
    toggle(
      'Open Markdown automatically',
      'Render .md, .markdown, .mdx … URLs (http, https and file) when you visit them.',
      s => s.autoRender,
      v => ({ autoRender: v }),
    ),
    toggle(
      'Live reload',
      'Watch open documents and re-render when they change. Pauses in background tabs.',
      s => s.liveReload.enabled,
      v => ({ liveReload: { enabled: v } }),
    ),
    range(
      'Live reload interval',
      LIMITS.intervalMs.min,
      10_000,
      250,
      settings.liveReload.intervalMs,
      n => `${(n / 1000).toFixed(2)} s`,
      n => void save({ liveReload: { intervalMs: n } }),
    ),
    h(
      'div',
      { class: 'ms-field ms-field--stack' },
      h(
        'div',
        { class: 'ms-field__text' },
        h('strong', { text: 'Extra URL patterns' }),
        h('p', {
          text: 'Also open these pages in Markscope — useful for docs servers that serve Markdown without a .md extension. Markscope asks for access to each origin.',
        }),
      ),
      list,
      form,
      error,
    ),
  )
}

function appearanceSection(): HTMLElement {
  return section(
    'appearance',
    'Appearance',
    'Reading comfort. Changes apply instantly to open documents.',
    select(
      'Theme',
      null,
      [
        ['system', 'Match system'],
        ['light', 'Light'],
        ['dark', 'Dark'],
      ],
      settings.theme,
      v => void save({ theme: v }),
    ),
    select(
      'Typeface',
      'Uses fonts already on your device — nothing is downloaded.',
      [
        ['sans', 'Sans-serif'],
        ['serif', 'Serif (book)'],
        ['mono', 'Monospace'],
      ],
      settings.typography.fontFamily,
      v => void save({ typography: { fontFamily: v } }),
    ),
    range(
      'Font size',
      LIMITS.fontSize.min,
      LIMITS.fontSize.max,
      1,
      settings.typography.fontSize,
      n => `${n}px`,
      n => void save({ typography: { fontSize: n } }),
    ),
    range(
      'Line height',
      LIMITS.lineHeight.min,
      LIMITS.lineHeight.max,
      0.05,
      settings.typography.lineHeight,
      n => n.toFixed(2),
      n => void save({ typography: { lineHeight: n } }),
    ),
    select(
      'Content width',
      null,
      [
        ['narrow', 'Narrow (62ch)'],
        ['normal', 'Normal (76ch)'],
        ['wide', 'Wide (96ch)'],
        ['full', 'Full width'],
      ],
      settings.typography.contentWidth,
      v => void save({ typography: { contentWidth: v } }),
    ),
    toggle(
      'Syntax highlighting',
      null,
      s => s.code.highlight,
      v => ({ code: { highlight: v } }),
    ),
    toggle(
      'Line numbers in code blocks',
      null,
      s => s.code.lineNumbers,
      v => ({ code: { lineNumbers: v } }),
    ),
    toggle(
      'Wrap long code lines',
      'Ignored when line numbers are on.',
      s => s.code.wrap,
      v => ({ code: { wrap: v } }),
    ),
  )
}

function markdownSection(): HTMLElement {
  const m = (label: string, desc: string | null, key: keyof Settings['markdown']) =>
    toggle(
      label,
      desc,
      s => s.markdown[key] as boolean,
      v => ({ markdown: { [key]: v } }),
    )
  return section(
    'markdown',
    'Markdown',
    'Syntax features. GitHub-flavored Markdown (tables, task lists, strikethrough, autolinks) is always on.',
    m(
      'Raw HTML',
      'Allow inline HTML. It is always sanitized; scripts never run.',
      'html',
    ),
    m('Math (KaTeX)', '$inline$ and $$block$$ formulas.', 'math'),
    m('Mermaid diagrams', '```mermaid fenced blocks. Loaded only when used.', 'mermaid'),
    m('Graphviz diagrams', '```dot / ```graphviz blocks.', 'graphviz'),
    m('Alerts & callouts', 'GitHub > [!NOTE] alerts and ::: tip containers.', 'alerts'),
    m('Footnotes', null, 'footnotes'),
    m('Emoji shortcodes', ':rocket: → 🚀', 'emoji'),
    m(
      'Extended syntax',
      'Sub/superscript, ==mark==, ++insert++, abbreviations, definition lists.',
      'extended',
    ),
    m('Smart typography', 'Curly quotes, dashes, ellipses.', 'typographer'),
    m('Autolink URLs', null, 'linkify'),
    m('Line breaks', 'Treat single newlines as <br> (like GitHub comments).', 'breaks'),
    select(
      'Front matter',
      null,
      [
        ['show', 'Show as collapsible table'],
        ['hide', 'Hide'],
      ],
      settings.markdown.frontMatter,
      v => void save({ markdown: { frontMatter: v } }),
    ),
  )
}

function privacySection(): HTMLElement {
  return section(
    'privacy',
    'Privacy',
    'Markscope has no analytics and makes no network requests of its own.',
    select(
      'Remote images',
      'Blocking stops tracking pixels in documents from third-party hosts until you click to load.',
      [
        ['allow', 'Load automatically'],
        ['block', 'Click to load (third-party hosts)'],
      ],
      settings.privacy.remoteImages,
      v => void save({ privacy: { remoteImages: v } }),
    ),
    h(
      'div',
      { class: 'ms-field ms-field--stack' },
      h(
        'div',
        { class: 'ms-field__text' },
        h('strong', { text: 'History' }),
        h('p', {
          text: 'Recent documents and favorites are stored only in this browser.',
        }),
      ),
      h(
        'div',
        { class: 'ms-button-row' },
        h('button', {
          type: 'button',
          class: 'ms-btn',
          text: 'Clear recent documents',
          on: {
            click: async () => {
              await library.clearRecents()
              flash('Recent documents cleared')
            },
          },
        }),
      ),
    ),
  )
}

function aiSection(): HTMLElement {
  const keyInput = h('input', {
    type: 'password',
    class: 'ms-input',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Paste API key',
  })
  const keyState = h('p', { class: 'ms-muted' })
  const testOut = h('p', { class: 'ms-test-out', role: 'status' })
  const refreshKeyState = async () => {
    const origin = await secrets.storedOrigin()
    const current = aiKeyOrigin(settings.ai.provider, settings.ai.baseUrl)
    keyState.textContent = !origin
      ? 'No key stored.'
      : origin === current
        ? `A key for ${origin} is stored (${settings.ai.keyStorage === 'session' ? 'this browser session only' : 'on this device'}).`
        : `The stored key belongs to ${origin} and will not be sent to ${current || 'this endpoint'}. Re-enter the key to use it here.`
  }
  void refreshKeyState()

  const baseUrl = h('input', {
    type: 'url',
    class: 'ms-input',
    value: settings.ai.baseUrl,
    spellcheck: 'false',
  })
  const model = h('input', {
    type: 'text',
    class: 'ms-input',
    value: settings.ai.model,
    spellcheck: 'false',
  })
  baseUrl.addEventListener('change', async () => {
    const value = baseUrl.value.trim()
    if (value !== '' && !isAllowedAIBaseUrl(value)) {
      flash('Use https:// (http:// is only allowed for localhost)')
      baseUrl.value = settings.ai.baseUrl
      return
    }
    await save({ ai: { baseUrl: value } })
    await refreshKeyState()
  })
  model.addEventListener('change', () => void save({ ai: { model: model.value.trim() } }))

  const ensureOrigin = async (): Promise<boolean> => {
    const origin = originPattern(settings.ai.baseUrl)
    if (!origin) return false
    // Firefox requires an explicit data-collection grant before website
    // content leaves the browser (declared optional in the manifest).
    const isFirefox = navigator.userAgent.includes('Firefox/')
    const wanted = (
      isFirefox
        ? { origins: [origin], data_collection: ['websiteContent'] }
        : { origins: [origin] }
    ) as chrome.permissions.Permissions
    return (
      (await chrome.permissions.contains(wanted)) || chrome.permissions.request(wanted)
    )
  }

  const saveKey = h('button', { type: 'button', class: 'ms-btn', text: 'Save key' })
  saveKey.addEventListener('click', async () => {
    try {
      await secrets.setApiKey(
        keyInput.value,
        settings.ai.keyStorage,
        aiKeyOrigin(settings.ai.provider, settings.ai.baseUrl),
      )
      keyInput.value = ''
      await refreshKeyState()
      flash('Key saved')
    } catch (error) {
      flash(`Error: ${errorMessage(error)}`)
    }
  })
  const clearKey = h('button', {
    type: 'button',
    class: 'ms-btn ms-btn--danger',
    text: 'Remove key',
  })
  clearKey.addEventListener('click', async () => {
    await secrets.clear()
    await refreshKeyState()
    flash('Key removed')
  })

  const test = h('button', {
    type: 'button',
    class: 'ms-btn ms-btn--primary',
    text: 'Test connection',
  })
  test.addEventListener('click', async () => {
    testOut.textContent = 'Testing…'
    // A field edited just before clicking commits on blur; wait for it.
    await pendingSave
    if (!(await ensureOrigin())) {
      testOut.textContent = 'Access to the provider origin was not granted.'
      return
    }
    let reply = ''
    const client = new AIClient()
    client.run(
      { type: 'ai.test' },
      {
        onDelta: t => (reply += t),
        onDone: () => {
          testOut.textContent = `✓ Connected — model replied “${reply.trim().slice(0, 40)}”.`
          client.dispose()
        },
        onError: m => {
          testOut.textContent = `✗ ${m}`
          client.dispose()
        },
      },
    )
  })

  const enable = h('input', { type: 'checkbox', role: 'switch', class: 'ms-switch' })
  enable.checked = settings.ai.enabled
  enable.addEventListener('change', async () => {
    if (enable.checked && !(await ensureOrigin())) {
      enable.checked = false
      flash('AI stays off: provider access not granted')
      return
    }
    await save({ ai: { enabled: enable.checked } })
  })

  const provider = h(
    'select',
    { class: 'ms-select' },
    ...(
      [
        ['anthropic', 'Anthropic (Claude)'],
        ['openai', 'OpenAI'],
        ['local', 'Local model (Ollama / LM Studio, OpenAI-compatible)'],
        ['custom', 'Custom OpenAI-compatible endpoint'],
      ] as [AIProviderId, string][]
    ).map(([v, l]) => h('option', { value: v, text: l })),
  )
  provider.value = settings.ai.provider
  provider.addEventListener('change', async () => {
    const id = provider.value as AIProviderId
    const preset = AI_PRESETS[id]
    baseUrl.value = preset.baseUrl
    model.value = preset.model
    await save({
      ai: { provider: id, baseUrl: preset.baseUrl, model: preset.model, enabled: false },
    })
    enable.checked = false
    await refreshKeyState()
  })

  return section(
    'ai',
    'AI assistant',
    'Optional. Off by default. Markscope is fully functional without it. Requests go directly from your browser to the provider you choose — never through a Markscope server.',
    field(
      'Enable AI features',
      'Adds the assistant panel, “Explain” buttons on code blocks and AI commands.',
      enable,
    ),
    field('Provider', null, provider),
    field(
      'Base URL',
      'For local models, e.g. http://localhost:11434/v1 (Ollama).',
      baseUrl,
    ),
    field('Model', 'Model identifier sent to the provider.', model),
    select(
      'Key storage',
      'Session keys are forgotten when the browser closes.',
      [
        ['local', 'Remember on this device'],
        ['session', 'This browser session only'],
      ],
      settings.ai.keyStorage,
      v => void save({ ai: { keyStorage: v } }),
    ),
    h(
      'div',
      { class: 'ms-field ms-field--stack' },
      h(
        'div',
        { class: 'ms-field__text' },
        h('strong', { text: 'API key' }),
        h('p', {
          text: 'Stored in extension storage that web pages and content scripts cannot read; never synced. Not needed for local models.',
        }),
      ),
      h('div', { class: 'ms-inline-form' }, keyInput, saveKey, clearKey),
      keyState,
    ),
    toggle(
      'Confirm before sending a document',
      'Ask once per session before document text leaves the browser.',
      s => s.ai.confirmBeforeSend,
      v => ({ ai: { confirmBeforeSend: v } }),
    ),
    h('div', { class: 'ms-button-row' }, test),
    testOut,
  )
}

function dataSection(): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      // AI endpoint settings are never imported: a crafted file must not be
      // able to point the assistant (and its key) at another server.
      const imported = JSON.parse(await file.text()) as Record<string, unknown>
      settings = await store.replace({ ...imported, ai: settings.ai })
      flash('Settings imported')
      setTimeout(() => location.reload(), 500)
    } catch (error) {
      flash(`Import failed: ${errorMessage(error)}`)
    }
  })
  return section(
    'data',
    'Backup',
    'Export or import your settings as JSON. API keys are never included, and AI provider settings are not imported.',
    h(
      'div',
      { class: 'ms-button-row' },
      h('button', {
        type: 'button',
        class: 'ms-btn',
        text: 'Export settings',
        on: {
          click: () => {
            const blob = new Blob([JSON.stringify(settings, null, 2)], {
              type: 'application/json',
            })
            const a = h('a', {
              href: URL.createObjectURL(blob),
              download: 'markscope-settings.json',
            })
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          },
        },
      }),
      h('button', {
        type: 'button',
        class: 'ms-btn',
        text: 'Import settings…',
        on: { click: () => fileInput.click() },
      }),
      h('button', {
        type: 'button',
        class: 'ms-btn ms-btn--danger',
        text: 'Reset to defaults',
        on: {
          click: async () => {
            if (!confirm('Reset all Markscope settings to defaults?')) return
            settings = await store.reset()
            location.reload()
          },
        },
      }),
      fileInput,
    ),
  )
}

function shortcutsSection(): HTMLElement {
  const rows: [string, string][] = [
    ['Ctrl/⌘ K', 'Command palette'],
    ['Ctrl/⌘ S', 'Save (⇧ for Save as…)'],
    ['/', 'Find in document'],
    ['1 · 2 · 3', 'Read · Edit · Source view'],
    ['J / K', 'Next / previous heading'],
    ['B', 'Toggle sidebar'],
    ['T', 'Cycle theme'],
    ['R', 'Reload'],
    ['S', 'Star document'],
    ['Z', 'Focus mode'],
    ['F', 'Fullscreen'],
    ['A', 'AI assistant'],
    ['?', 'All shortcuts'],
  ]
  return section(
    'shortcuts',
    'Keyboard',
    'Single-key shortcuts work in the viewer when you are not typing. Browser-level shortcuts can be changed at chrome://extensions/shortcuts.',
    h(
      'dl',
      { class: 'ms-kbd-list' },
      ...rows.flatMap(([k, d]) => [
        h('dt', {}, h('kbd', { text: k })),
        h('dd', { text: d }),
      ]),
    ),
    h('button', {
      type: 'button',
      class: 'ms-btn',
      text: 'Edit browser shortcuts',
      on: {
        click: () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
      },
    }),
  )
}

async function main(): Promise<void> {
  settings = await store.load()
  applyAppearance(settings)
  const nav: [string, string][] = [
    ['general', 'General'],
    ['appearance', 'Appearance'],
    ['markdown', 'Markdown'],
    ['privacy', 'Privacy'],
    ['ai', 'AI assistant'],
    ['shortcuts', 'Keyboard'],
    ['data', 'Backup'],
  ]
  const root = document.getElementById('ms-options') as HTMLElement
  root.replaceChildren(
    h(
      'div',
      { class: 'ms-opt' },
      h(
        'aside',
        { class: 'ms-opt__nav' },
        h(
          'div',
          { class: 'ms-opt__brand' },
          h('img', { src: 'icons/icon-48.png', alt: '', width: '28', height: '28' }),
          h(
            'div',
            {},
            h('strong', { text: 'Markscope' }),
            h('small', { text: `Version ${__MARKSCOPE_VERSION__}` }),
          ),
        ),
        h(
          'nav',
          { 'aria-label': 'Settings sections' },
          h(
            'ul',
            {},
            ...nav.map(([id, label]) =>
              h('li', {}, h('a', { href: `#${id}`, text: label })),
            ),
          ),
        ),
      ),
      h(
        'main',
        { class: 'ms-opt__main' },
        h('h1', { text: 'Settings' }),
        generalSection(),
        appearanceSection(),
        markdownSection(),
        privacySection(),
        aiSection(),
        shortcutsSection(),
        dataSection(),
      ),
    ),
    status,
  )
}

main().catch(error => {
  document.body.textContent = `Settings failed to load: ${errorMessage(error)}`
})
