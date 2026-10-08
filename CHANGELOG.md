# Changelog

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
