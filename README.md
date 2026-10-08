<p align="center"><img src="src/icons/logo.svg" width="96" height="96" alt="Markscope logo"></p>

<h1 align="center">Markscope</h1>

<p align="center"><strong>A fast, secure Markdown reader for developers — right in your browser.</strong><br>
Open any <code>.md</code> file, local or remote, and get an outline, search, diagrams, math, live reload and a documentation doctor. Optional, bring-your-own-key AI.</p>

---

## Vision

Developers read Markdown all day: READMEs, ADRs, runbooks, specs, changelogs. Browsers show it as raw text. Markscope turns every Markdown URL into a navigable, well-typeset document **without ever running code from the document** and without sending anything anywhere unless you explicitly ask an AI provider you configured.

## Features

**Reading**

- GitHub-flavored Markdown: tables, task lists, strikethrough, autolinks, footnotes, emoji
- GitHub alerts (`> [!NOTE]`) and `::: tip` / `::: details` containers
- Syntax highlighting with language badge, copy button, optional line numbers and wrapping
- Mermaid and Graphviz diagrams (loaded only when a document uses them, rendered as they scroll into view)
- KaTeX math, inline and display
- Front matter shown as a collapsible table
- GitHub-compatible heading anchors, so links written for GitHub work unchanged
- Inline `[[toc]]`, a sidebar outline with scrollspy and filter, and J/K heading navigation
- Relative links to other `.md` files open inside Markscope at the right anchor
- Image lightbox, broken-image placeholders, optional click-to-load for third-party images

**Developer workflow**

- Auto-detects `.md`, `.markdown`, `.mdx`, `.mdown`, `.mkd` and `.mkdn` over http, https and `file://`
- Opens GitHub, GitLab and Bitbucket *blob* pages as raw Markdown (popup or context menu)
- **Live reload** with ETag/Last-Modified (304s), paused in background tabs, keeps your reading position
- Drag and drop a file, or use **Open file** (⌘/Ctrl O). Picked files live-reload via the File System Access API
- **Edit view** with live preview and scroll sync. **Save** (⌘/Ctrl S) writes back to files you opened or dropped. **Save as…** (⇧⌘/Ctrl⇧S) saves web, `file://` and scratch documents to a file of your choice, and later saves go there
- **Source view** with line numbers, plus scratch documents that autosave in the browser
- **Command palette** (⌘/Ctrl K) covering commands, headings and recent documents
- **Find in document** (`/`), highlighted with the CSS Custom Highlight API
- **Document doctor**: broken anchors, missing images, heading-level jumps, duplicate headings, empty links, missing alt text and TODO/FIXME
- Document stats: words, reading time, lines, code blocks, links, images and render time
- Recents and favorites, focus mode, fullscreen
- **Export**: a self-contained HTML file (no network requests, diagrams and math included), the Markdown source, or Print / Save as PDF with a print-optimized light layout

**Appearance**: system, light and dark themes on an OKLCH token system; sans, serif or mono reading type; size, line height and width controls; responsive down to 320 px; keyboard-first; screen-reader friendly.

### AI features (optional, off by default)

Summarize, outline, review documentation, suggest improvements, explain the selection, explain a code block, ask questions about the document, and generate a Mermaid diagram.

Providers sit behind one `AIProvider` interface:

| Provider | Transport |
| --- | --- |
| Anthropic (Claude) | Official `@anthropic-ai/sdk`, streamed |
| OpenAI | Chat Completions, SSE |
| Local model | Any OpenAI-compatible server (Ollama, LM Studio, llama.cpp) |
| Custom endpoint | Any OpenAI-compatible gateway |

Requests go straight from the extension's service worker to your provider. There is no Markscope server. Keys never reach web pages, are never synced or exported, and are bound to the endpoint origin they were saved for.

## Installation

### From a store

Store listings are being prepared (see [docs/PUBLISHING.md](docs/PUBLISHING.md)).

### From a release zip

1. Download `markscope-<version>-chrome.zip` from the releases and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Optional, for local files: in the extension's **Details**, enable **Allow access to file URLs**.

## Development

Requirements: Node.js ≥ 20.

```bash
npm install
npm run dev            # watch build → dist/chrome (load it unpacked)
npm test               # unit + integration (Vitest, jsdom)
npm run test:coverage  # with coverage thresholds (80%)
npx playwright install chromium
npm run test:e2e       # Playwright drives the real extension in Chromium
npm run typecheck
```

## Architecture

```
 *.md URL ─► content script (6 KB) ──handoff──► service worker ──tabs.update──► viewer.html
            reads <pre> text only        validates sender + URL,     extension page, strict CSP
                                         stores text one-time        │
                                         (storage.session)           ├─ RenderClient ─► Web Worker: markdown-it + plugins + hljs + KaTeX
                                                                     ├─ DOMPurify sanitizer (single trust boundary)
                                                                     ├─ DocumentView: links, media, code chrome, lazy diagrams
                                                                     ├─ Sidebar (outline / doctor / info), search, palette
                                                                     └─ AI panel ──Port──► service worker ─► AIProvider ─► provider API
 popup.html   context-aware actions, quick settings, recents
 options.html validated settings, URL patterns, AI configuration, backup
```

Key decisions (details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **Render in an extension page, not in the web page.** The page's CSP can't break images or fonts, and the extension's CSP (`script-src 'self'`) means even a sanitizer bypass cannot execute script.
- **The content script never renders.** It reads `textContent` and hands it off, so its attack surface is tiny.
- **Pure, testable core.** Parsing, sanitizing, URL policy, settings validation, the doctor, prompts and providers are framework-free modules with unit tests. UI modules are thin.

## Project structure

```
src/
  background/   service worker: message router, handoff store, AI service, context menus, dynamic content scripts
  content/      content script + pure detection logic
  engine/       markdown-it pipeline, plugins (structure, fences, callouts), highlighting, sanitizer, render worker
  analysis/     document doctor
  ai/           AIProvider interface, Anthropic + OpenAI-compatible providers, SSE parser, prompts
  storage/      storage abstraction, settings / library / secrets stores
  shared/       settings schema, message contracts, URL policy, slugs, stats, DOM helpers, icons
  viewer/       viewer app (layout, document view, sidebar, search, palette, AI panel, home, export)
  popup/  options/  pages/  styles/  icons/  samples/  _locales/
scripts/        build (esbuild), manifest generation, packaging, icon rasterization
tests/          unit/, integration/ (Vitest) and e2e/ (Playwright)
docs/           architecture, security, privacy, store listing
```

## Configuration

All settings live on the options page (right-click the toolbar icon, then **Options**) and are validated against a schema, so imported files can't inject invalid values.

| Area | Settings |
| --- | --- |
| General | Auto-open Markdown URLs, live reload and interval, extra URL patterns |
| Appearance | Theme, typeface, font size, line height, content width, highlighting, line numbers, wrapping |
| Markdown | Raw HTML (always sanitized), math, Mermaid, Graphviz, alerts, footnotes, emoji, extended syntax, smart typography, autolinks, line breaks, front matter |
| Privacy | Third-party images (load or click-to-load), clear history |
| AI | Enable, provider, base URL (https, or http for localhost only), model, key storage (device or session) |
| Backup | Export, import (AI settings excluded) or reset |

## Permissions

| Permission | Why |
| --- | --- |
| Content script on `*.md` and similar URLs | Detect Markdown documents and read their text. Chrome applies host access per **origin** (the path in a match pattern is ignored), so the install prompt says Markscope can "read and change your data on all websites". This is inherent to auto-detecting Markdown on any site; the script itself only reads plain-text pages whose URL ends in a Markdown extension |
| `storage` | Settings, recents and favorites, one-time handoff |
| `activeTab` + `scripting` | "Render this page" from the popup, only on the tab you invoke it on |
| `contextMenus` | "Open link in Markscope" |
| Optional host access (requested per origin) | Live reload from servers without CORS, your extra URL patterns, your AI provider |

There is no `tabs`, `history`, `downloads` or `cookies` permission. If you restrict Markscope's site access in Chrome (**Details → Site access → On click / On specific sites**), Markscope keeps working on the sites you allow and offers a per-origin **Grant access** prompt elsewhere.

## Security

See [docs/SECURITY.md](docs/SECURITY.md). In brief:

- DOMPurify with hardened hooks: no scripts, event handlers, forms, frames or `<style>`; inline styles are allowlisted; reserved ids are protected.
- Strict extension-page CSP. Paint containment on the article stops content overlaying the UI.
- All messages are validated, and senders are authorized by type: content scripts can only hand off their own top-frame URL.
- Link and media URLs pass a scheme allowlist. `file:` resources are allowed only for local documents.
- AI output is sanitized and its remote media are never loaded. Document text is framed as untrusted for the model.

## Privacy

Markscope has no analytics, no telemetry and no remote code. Documents never leave your browser unless you run an AI action, which is sent only to the provider you configured, after a confirmation. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Testing

| Layer | Tooling | What is covered |
| --- | --- | --- |
| Unit | Vitest | Markdown pipeline, sanitizer (XSS corpus), URL policy, settings, storage, stats, slugs, doctor, fuzzy search, AI prompts, providers and SSE, loader |
| Integration | Vitest + chrome fake | Handoff flow and sender authorization, AI port streaming and abort, content script against a text/plain page, DOM pipeline |
| E2E | Playwright + real extension | Open → detect → render → search → TOC → copy → theme → settings → reload → persistence → restart; malicious and very large docs, broken links and images, back button, CORS permission flow, live reload, responsive overflow |

## Build and release

```bash
npm run build            # dist/chrome
npm run build:firefox    # dist/firefox (background.scripts variant)
npm run release          # typecheck + tests + both builds + release/*.zip + SHA256SUMS.txt
```

Release checklist: bump `version` in `package.json`, update `CHANGELOG.md`, run `npm run release` and `npm run test:e2e`, then upload the zips.

## Publishing

Targets are the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (experimental). Listing copy, permission justifications and the privacy disclosure are in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md); screenshots are in [docs/store/](docs/store/). Steps and what needs manual action are in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Roadmap

- Localization (UI strings are centralized for translation)
- Multi-document workspace (folder view for picked directories)
- External link checker (opt-in, per-origin permission)
- Firefox parity for `file://` documents
- Shiki-quality highlighting as an opt-in, lazy-loaded engine

## Contributing

Issues and pull requests are welcome. Please:

1. Keep the core modules pure and covered (`npm run test:coverage` must stay ≥ 80%).
2. Add an E2E case for user-visible flows.
3. Never weaken the sanitizer or CSP without a security review note in the PR.
4. Use conventional commits (`feat:`, `fix:`, …).

## Acknowledgements

Built on markdown-it, DOMPurify, highlight.js, KaTeX, Mermaid and viz.js.

## License

[MIT](LICENSE)
