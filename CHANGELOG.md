# Changelog

## Unreleased

- **35 named color themes** in the browser extension and the VS Code preview: 10 light (Ayu Light, Catppuccin Latte, Everforest Light, Graphite Light, Gruvbox Light, Rosé Pine Dawn, Solarized Light, Tokyo Night Light, Ulysses Light, Cadmium Light) and 25 dark (Ayu Dark and Mirage, Catppuccin Mocha, cyberdream, Dracula, Everforest, GitHub Dark, Gruvbox, Horizon, Kanagawa, Material, Monokai Pro, Night Owl, Nightfox, Nord, One Dark, Oxocarbon, Palenight, Rosé Pine and Moon, Solarized Dark, Synthwave ’84, Tokyo Night and Storm, Cadmium Dark).
  - `theme` stays System / Light / Dark; the new `themeLight` and `themeDark` pick the palette for each scheme (`markscope.themeLight` / `markscope.themeDark` in VS Code). Defaults are the existing look, so nothing changes until you choose.
  - Browser: a gallery under Settings → Appearance, “More themes…” in the popup, and `⌘K` → “Theme: Nord”. Picking a theme also switches to its scheme. `T` still cycles the mode, and its toast names the palette.
  - VS Code: **Markscope: Color Theme…** (also in the preview's ⋯ menu) and the two settings. “Follow VS Code” uses the palette of the VS Code theme's scheme.
  - Every palette is generated from a few source colors and checked for WCAG contrast (body text and links 4.5:1, secondary text, callouts and syntax colors 3:1). Colors that were too faint as text are moved in lightness only, never in hue.
  - Print is always the light default; HTML export carries only the active palette.

## 1.1.0 — 2026-10-19

- **Fixed:** a key pressed right after running a command from the command palette (for example `2` for the Edit view) could be silently ignored, because the browser had not yet moved focus off the closed palette's search box. Found by a CI failure.
- **Markscope for VS Code (new).** The same renderer in a VS Code webview, next to the native editor (`docs/VSCODE-PLAN.md`).
  - **Markscope: Open Preview / Open Preview to the Side**, an editor-title button, and **Toggle Preview Lock**. An unlocked preview follows the active Markdown file; panels are restored after a window reload.
  - Updates as you type (or on save, `markscope.preview.updateOn`); scroll sync both ways, double-click a block to put the cursor on its source line, and the block under the cursor is highlighted.
  - Mermaid, Graphviz, KaTeX, alerts, callouts, outline with scrollspy, find, focus mode and reading stats, as in the browser.
  - The document doctor reports in the **Problems panel**, on the right line.
  - Follows the VS Code theme, including high contrast (`markscope.theme`); typography, Markdown and image settings under `markscope.*`.
  - Relative links to other Markdown files and relative images work, confined to the workspace folder. `command:` and `vscode:` links are inert; web links ask VS Code to open them.
  - **Export as HTML** (command palette): a self-contained file with diagrams rendered, math as MathML and no external requests. It opens VS Code's save dialog; the command also accepts a `.html` target for keybindings and automation.
  - **Markscope Reader**: a full-tab, read-only view of one file (Explorer or editor → Reopen Editor With… → Markscope Reader, or **Markscope: Open in Reader**). It never becomes the default editor for Markdown.
  - **The same toolbar and ⋯ menu as the browser viewer**: a theme button (VS Code theme → light → dark, saved as `markscope.theme`), a **Commands** button that opens VS Code's palette filtered to Markscope, and a menu with Refresh, Show source in the editor, Lock preview, Copy Markdown, Copy rendered HTML, Export as HTML, Focus mode, Line numbers in code, AI assistant, Keyboard shortcuts, Command palette and **Settings** (opens this extension's settings). New keys: `R` refresh, `T` theme, `?` shortcut help.
  - **Update notice**: if VS Code keeps running an older copy of the extension after you replaced it (same version number), the preview says “Reload the window to finish” instead of leaving toolbar items that silently do nothing. Host and webview share a build id.
  - **Status bar item** while a preview is visible: words, reading time and the number of doctor problems; clicking it opens the Problems panel.
  - **Links to project files** work: a README link such as `src/app.ts` opens that file in the editor, `src/app.ts#L42` (or `#L10-L20`) selects those lines, and a folder link reveals it in the Explorer. Paths stay confined to the workspace folder.
  - **Copy Rendered HTML**: the rendered article (diagrams included) as an HTML fragment on the clipboard.
  - **Optional AI assistant** (off by default): summarize, outline, review, improve, explain a selection or a code block, ask questions, generate a Mermaid diagram. Providers: Anthropic, OpenAI, a local model (Ollama, LM Studio) or any OpenAI-compatible endpoint. Settings are `markscope.ai.*`; **Markscope: Set AI API Key** stores the key in VS Code's secret storage (the OS keychain), bound to the endpoint it was saved for.
    - Requests run in the extension host and the key never reaches the preview. AI settings are application-scoped, so a cloned repository's `.vscode/settings.json` cannot redirect your document text, and the assistant is off in untrusted workspaces.
  - Not in this release: editing inside Markscope.
- **Accessibility** (found by an automated axe check, so this also applies to the browser extension): task-list checkboxes are now named after their item, the muted text color (`--ink-3`) and alert titles meet WCAG AA contrast, and unselected sidebar tabs are readable in the light theme.
  - Build and test: `npm run build:vscode`, `npm run package:vscode`, `npm run test:vscode:webview`, `npm run test:vscode`.
- **New editor (CodeMirror 6)** in the Edit view: Markdown syntax highlighting, line numbers, active-line highlight, bracket matching, soft wrap, and find & replace inside the editor (⌘/Ctrl F).
  - Enter continues lists, task lists and quotes; Backspace removes list markup. Tab / Shift+Tab indent and outdent (Esc then Tab leaves the editor).
  - Undo history survives Discard: ⌘/Ctrl Z in the editor brings discarded edits back.
  - Scroll sync is now accurate with wrapped lines.
  - The editor is loaded only when the Edit view is first opened, so reading pays nothing for it.
- **Markdown writing help** in the editor:
  - ⌘/Ctrl B bold, ⌘/Ctrl I italic, ⌘/Ctrl E inline code, ⇧⌘/Ctrl⇧X strikethrough, ⇧⌘/Ctrl⇧K link, ⌘⌥/Ctrl Alt T format the table under the cursor. Pressing again removes the formatting. They are listed in the shortcut help (?) and, in the Edit view, in the command palette.
  - Typing `*`, `_`, `~` or `` ` `` over a selection wraps it; `(`, `[`, `{` and `"` close themselves.
  - Pasting a URL over selected text turns it into a link.
  - The status bar shows the cursor line, column and selection length in the Edit view.
- **Editor and preview stay together** in the Edit view:
  - Scroll sync works both ways and stays aligned inside long sections (it interpolates between blocks); reaching the bottom of one pane scrolls the other to its bottom.
  - Double-click a block in the preview to put the editor cursor on its source line.
  - The preview block under the editor cursor is highlighted.
  - Drag the divider between the panes to resize them (or focus it and use ←/→, Home/End; double-click resets). The split is remembered.
  - Large documents wait longer after typing before re-rendering (over 64 KB and 512 KB).
- **Edits are protected:**
  - Live reload keeps watching while you edit. If the file or URL changes underneath unsaved edits, a banner offers **Keep mine**, **Load theirs** (with Undo) or **Compare…**.
  - Save checks the file first: if it changed on disk since you opened it, you choose **Overwrite**, **Load theirs** or **Compare…** instead of silently overwriting it.
  - **Compare** opens a side-by-side view of the disk version and yours. Arrows copy a change from disk into your version, which you can also edit.
  - Unsaved edits are backed up in this browser while you type. After a crash or an accidental close, reopening the document offers to restore them (or to compare first, if the document changed since). Backups are removed when you save or discard, and after 30 days.

## 1.0.0 — 2026-10-09

First release of Markscope.

- Extension-page viewer with strict CSP; content script hands off text, never renders.
- GFM, alerts and callouts, footnotes, emoji, extended syntax, KaTeX, Mermaid, Graphviz, front matter, `[[toc]]`.
- Outline with scrollspy, in-document search, command palette, keyboard shortcuts.
- Read, Edit (live preview) and Source views; scratch documents; drag and drop; File System Access live reload.
- Live reload with conditional requests and backoff.
- Document doctor and statistics.
- Save (⌘/Ctrl S) back to opened/dropped files and Save as… for web, `file://` and scratch documents; the Save button appears only with unsaved edits.
- **Discard** (toolbar button, ⋯ menu, command palette) reverts unsaved edits to the last saved version, with an Undo banner.
- Live reload of local files pauses with a Reconnect prompt when Chrome drops file permission after a reload (no more `getFile` errors).
- **Open folder** (⇧⌘/Ctrl⇧O, start page, or drop a folder): Files tab with the folder's Markdown tree, relative images and links that work, in-place navigation with Back/Forward, folder-wide file search in the command palette, recent folders, Reconnect after reload.
- Files tab "Show all files" toggle: non-Markdown files are listed (dimmed, with type badges) but not openable. Folders with no Markdown open in this mode with an overview card (file counts and types) instead of a bare message.
- Home button in the toolbar (also Shift H).
- Relative images in a file opened on its own now show a clear "open the folder" placeholder (one click finds the file in the folder) instead of disappearing; `file://` images fall back to loading through the extension.
- Print / Save as PDF: always printed in the light palette (readable from the dark theme), light-themed diagrams, page margins, external link URLs shown, front matter omitted.
- Self-contained HTML export: no external requests (math as native MathML), Mermaid styling preserved, links to other documents point at the original files, code language labels; Markdown export is byte-identical to the source.
- Focus mode: centered full-width reading, reading-progress bar, Exit focus button (also Z / Esc); split view fills the screen.
- Optional AI assistant: Anthropic (official SDK), OpenAI, local and custom endpoints.
- 304 unit and integration tests plus 27 Playwright E2E tests.
