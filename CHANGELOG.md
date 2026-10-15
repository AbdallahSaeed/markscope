# Changelog

## Unreleased

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
