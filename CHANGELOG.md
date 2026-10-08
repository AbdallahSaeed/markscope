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
- Live reload of local files pauses with a Reconnect prompt when Chrome drops file permission after a reload (no more `getFile` errors).
- Export to HTML and Markdown; print to PDF.
- Focus mode: centered full-width reading, reading-progress bar, Exit focus button (also Z / Esc); split view fills the screen.
- Optional AI assistant: Anthropic (official SDK), OpenAI, local and custom endpoints.
- 281 unit and integration tests plus 22 Playwright E2E tests.
