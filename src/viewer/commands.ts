/** Command registry: shortcuts, palette entries and the "more" menu. */
import { describeSource } from '@/shared/urls'
import type { ViewerApp } from './app'
import { entryHref, entryLabel } from './home'
import type { MenuItem } from './menu'
import type { PaletteItem } from './palette'
import { key, modKey, MOD_LABEL, showShortcutHelp, type Shortcut } from './shortcuts'
import type { LibraryStore } from '@/storage/library-store'

export interface CommandContext {
  app: ViewerApp
  library: LibraryStore
  viewerBase: string
  openFile: () => void
  newScratch: () => void
  goHome: () => void
}

export function shortcutTable(ctx: CommandContext): Shortcut[] {
  const { app } = ctx
  const hasDoc = () => app.doc !== null
  const list: Shortcut[] = [
    {
      keys: `${MOD_LABEL} K`,
      description: 'Command palette',
      match: modKey('k'),
      run: () => app.palette.open(),
      global: true,
    },
    {
      keys: `${MOD_LABEL} O`,
      description: 'Open a local file',
      match: modKey('o'),
      run: ctx.openFile,
      global: true,
    },
    {
      keys: '/',
      description: 'Find in document',
      match: key('/'),
      run: () =>
        hasDoc() && app.search.open(window.getSelection()?.toString() || undefined),
    },
    {
      keys: '1',
      description: 'Read view',
      match: key('1'),
      run: () => hasDoc() && app.setView('read'),
    },
    {
      keys: '2',
      description: 'Edit view (live preview)',
      match: key('2'),
      run: () => hasDoc() && app.setView('split'),
    },
    {
      keys: '3',
      description: 'Source view',
      match: key('3'),
      run: () => hasDoc() && app.setView('source'),
    },
    {
      keys: 'B',
      description: 'Toggle sidebar',
      match: key('b'),
      run: () => app.toggleSidebar(),
    },
    {
      keys: 'T',
      description: 'Switch theme (system → light → dark)',
      match: key('t'),
      run: () => app.cycleTheme(),
    },
    {
      keys: 'J',
      description: 'Next heading',
      match: key('j'),
      run: () => app.jumpHeading(1),
    },
    {
      keys: 'K',
      description: 'Previous heading',
      match: key('k'),
      run: () => app.jumpHeading(-1),
    },
    {
      keys: 'R',
      description: 'Reload document',
      match: key('r'),
      run: () => void app.reload(),
    },
    {
      keys: 'S',
      description: 'Star / unstar document',
      match: key('s'),
      run: () => void app.toggleFavorite(),
    },
    {
      keys: 'Z',
      description: 'Focus (distraction-free) mode',
      match: key('z'),
      run: () => app.toggleZen(),
    },
    {
      keys: 'F',
      description: 'Fullscreen',
      match: key('f'),
      run: () => void app.toggleFullscreen(),
    },
    {
      keys: 'A',
      description: 'AI assistant (when enabled)',
      match: key('a'),
      run: () => app.toggleAI(),
    },
    {
      keys: 'E',
      description: 'Explain selection with AI',
      match: key('e'),
      run: () => {
        if (app.openAI()) app.ai.explainSelection()
      },
    },
    {
      keys: `${MOD_LABEL} P`,
      description: 'Print / Save as PDF (renders all diagrams first)',
      match: modKey('p'),
      run: () => void app.print(),
      global: true,
    },
    {
      keys: 'Shift H',
      description: 'Go to start page',
      match: key('H'),
      run: ctx.goHome,
    },
    {
      keys: '?',
      description: 'Show keyboard shortcuts',
      match: key('?'),
      run: () => showShortcutHelp(list),
    },
    {
      keys: 'Esc',
      description: 'Close panels',
      // Don't match while a dialog/menu is open: it must receive Escape
      // un-prevented to close natively.
      match: e =>
        key('Escape')(e) &&
        !document.querySelector('dialog[open], .ms-menu:not([hidden])'),
      run: () => {
        if (app.search.isOpen) app.search.close()
        else if (!app.ai.el.hidden) app.closeAI()
        else document.body.classList.remove('sidebar-open', 'zen')
      },
      global: true,
    },
  ]
  return list
}

export function menuItems(ctx: CommandContext): (MenuItem | 'separator')[] {
  const { app } = ctx
  const s = () => app.settings
  return [
    {
      label: 'Reload',
      hint: 'R',
      run: () => void app.reload(),
      hidden: () => !app.doc?.sourceUrl && !app.doc?.handle,
    },
    {
      label: 'Live reload',
      run: () => app.updateSettings({ liveReload: { enabled: !s().liveReload.enabled } }),
      checked: () => s().liveReload.enabled,
    },
    {
      label: 'View original file',
      run: () => app.viewOriginal(),
      hidden: () => !app.doc?.sourceUrl,
    },
    { label: 'Copy Markdown', run: () => void app.copySource() },
    'separator',
    { label: 'Export as HTML', run: () => void app.exportAs('html') },
    { label: 'Export as Markdown', run: () => void app.exportAs('md') },
    { label: 'Print / Save as PDF', hint: `${MOD_LABEL} P`, run: () => void app.print() },
    'separator',
    {
      label: 'Focus mode',
      hint: 'Z',
      run: () => app.toggleZen(),
      checked: () => document.body.classList.contains('zen'),
    },
    { label: 'Fullscreen', hint: 'F', run: () => void app.toggleFullscreen() },
    {
      label: 'Line numbers in code',
      run: () => app.updateSettings({ code: { lineNumbers: !s().code.lineNumbers } }),
      checked: () => s().code.lineNumbers,
    },
    'separator',
    {
      label: 'Keyboard shortcuts',
      hint: '?',
      run: () => showShortcutHelp(shortcutTable(ctx)),
    },
    {
      label: 'Command palette',
      hint: `${MOD_LABEL} K`,
      run: () => void app.palette.open(),
    },
    { label: 'Start page', run: ctx.goHome },
    { label: 'Settings', run: () => void chrome.runtime.openOptionsPage() },
  ]
}

export async function paletteItems(ctx: CommandContext): Promise<PaletteItem[]> {
  const { app } = ctx
  const lib = await ctx.library.load()
  const commands: PaletteItem[] = [
    ...shortcutTable(ctx)
      .filter(s => !['?', 'Esc', `${MOD_LABEL} K`].includes(s.keys))
      .map(s => ({
        id: `cmd:${s.description}`,
        label: s.description,
        group: 'Command' as const,
        hint: s.keys,
        run: s.run,
      })),
    ...menuItems(ctx)
      .filter((m): m is MenuItem => m !== 'separator' && !m.hidden?.())
      .filter(m => !m.hint)
      .map(m => ({
        id: `menu:${m.label}`,
        label: m.label,
        group: 'Command' as const,
        run: m.run,
      })),
    {
      id: 'cmd:scratch',
      label: 'New scratch document',
      group: 'Command',
      run: ctx.newScratch,
    },
    {
      id: 'cmd:copy-code',
      label: 'Copy all code blocks',
      group: 'Command',
      run: () => void copyAllCode(app),
    },
  ]
  const headings: PaletteItem[] = (app.result?.headings ?? []).map(h => ({
    id: `h:${h.id}`,
    label: `${'  '.repeat(Math.max(0, h.level - 1))}${h.text}`,
    group: 'Heading',
    hint: `H${h.level}`,
    run: () => app.scrollToId(h.id),
  }))
  const recents: PaletteItem[] = lib.entries.slice(0, 20).map(e => {
    const { title, detail } = entryLabel(e)
    return {
      id: `r:${detail}`,
      label: title,
      group: 'Recent',
      hint: e.ref.kind === 'url' ? describeSource(e.ref.url).host : 'Local',
      run: () => location.assign(entryHref(e, ctx.viewerBase)),
    }
  })
  return [...headings, ...commands, ...recents]
}

async function copyAllCode(app: ViewerApp): Promise<void> {
  const blocks = app.result?.codeBlocks ?? []
  if (blocks.length === 0) return
  const text = blocks
    .map(b => `\`\`\`${b.lang}\n${b.content.replace(/\n$/, '')}\n\`\`\``)
    .join('\n\n')
  await navigator.clipboard.writeText(text)
  const { toast } = await import('./toast')
  toast(`Copied ${blocks.length} code block${blocks.length === 1 ? '' : 's'}`)
}
