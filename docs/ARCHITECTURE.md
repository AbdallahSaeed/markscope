# Markscope architecture

## Contexts

| Context | Entry | Bundle | Responsibility |
| --- | --- | --- | --- |
| Content script | `src/content/index.ts` | IIFE, ~6 KB | Detect plain-text Markdown, read `<pre>` text, hand off. Shows an "Open in Markscope" banner on back/forward, raw marker, or when auto-open is off. |
| Service worker | `src/background/index.ts` | ESM | Validated message router, one-time handoff store, AI service (Port), context menus, dynamic content scripts for user URL patterns. |
| Viewer | `src/viewer/index.ts` → `viewer.html` | ESM + split chunks | Document lifecycle, rendering, UI. |
| Render worker | `src/engine/worker.ts` | ESM module worker | markdown-it + plugins + highlight.js + KaTeX → HTML string. |
| Popup / Options | `src/popup`, `src/options` | ESM | Quick actions and settings. |

## Document lifecycle

1. **Detect.** The static content script matches Markdown URL patterns generated from `shared/urls.ts`. `decide()` checks the content type, that the body is a single `<pre>`, the URL, the back/forward state, the raw marker and the auto-open setting.
2. **Handoff.** `{type:'handoff', url, text}` goes to the service worker. The router requires a content-script sender, the top frame, and `sender.url === url` (hash ignored). The text is stored under a random 128-bit id in `storage.session` (memory fallback above 4 MB), then `tabs.update` navigates to `viewer.html?src=URL&h=ID#hash`.
3. **Claim.** The viewer claims the id once (extension-page senders only) and strips `h` from the URL. On reload it fetches `src` directly: `fetch` with conditional headers for http(s), XHR for `file:`.
4. **Render.** `RenderClient` renders in-thread under 64 KB and in the Worker above that. The result carries the HTML, headings, links, images, code blocks, front matter, feature flags and timing.
5. **Sanitize and decorate.** `sanitizeToFragment` (DOMPurify + hooks) runs, then `DocumentView`:
   - resolves links (anchor, document via viewer, external, or invalid) and media (scheme policy, optional third-party blocking);
   - adds heading anchors, the code toolbar and gutters, and table wrappers;
   - loads KaTeX CSS lazily;
   - observes diagrams with an IntersectionObserver.
6. **Derive.** The sidebar outline and scrollspy, the doctor, stats, title, recents and status bar are updated.
7. **Watch.** If live reload is on, `Watcher` polls with backoff, pauses while the tab is hidden, and never overlaps polls. A change re-renders anchored to the first visible `data-source-line`. User edits always win over polls.

## Engine

`createMarkdown(options)` builds markdown-it with:

- tasklist, footnote, emoji, sub/sup/mark/ins/abbr/deflist;
- alerts plus `:::` callouts;
- KaTeX (`trust:false`);
- `fencePlugin`: code, Mermaid and Graphviz placeholders, with DOT-in-mermaid routing and a highlight budget;
- `structurePlugin`: GitHub slugs, `data-source-line`, link/image inventory and `[[toc]]`.

Instances are cached by a settings key. Rendering is pure (no DOM), so the same code runs in the Worker, in tests and in the AI panel.

## State and storage

| Store | Area | Contents |
| --- | --- | --- |
| Settings | `storage.sync` | Schema-validated; writes are serialized; viewers subscribe through `onChanged`, so changes apply live in every tab |
| Library | `storage.local` | Recents (50) and favorites (200), as metadata only |
| Secrets | `storage.local` / `storage.session` | API key bound to its endpoint origin; access level set to trusted contexts |
| Local docs | IndexedDB `markscope/docs` | Dropped, picked and scratch documents, plus File System Access handles |
| Handoff | `storage.session` | One-time, 5-minute TTL |

## AI layer

```
AIPanel ──Port(markscope.ai)──► ai-service (SW)
   request id per run              ├─ parseAIRequest (validation)
   ignores stale events            ├─ settings.ai.enabled gate
                                   ├─ secrets.getApiKey(origin of baseUrl)
                                   ├─ buildPrompt (document as untrusted data, tag breakout neutralized, truncation flagged)
                                   └─ AIProvider.stream() ─► Anthropic SDK | OpenAI-compatible SSE
```

A new message aborts the run in flight. Aborted runs emit nothing, and every event carries the request id.

## Performance notes

- **Lazy loading.** Mermaid (~2.5 MB) and Graphviz (WASM, ~1.5 MB) are lazy chunks, imported only when a document has diagrams and rendered when near the viewport.
- **Threading.** Big documents parse in a Worker. The highlight budget (1.5 MB of code) and `content-visibility: auto` on large documents keep the main thread and layout cheap.
- **Event handling.** Scrollspy uses an IntersectionObserver trigger and measures only headings. Search uses the CSS Custom Highlight API (no DOM mutation). AI streaming repaints at most once per frame.
- **Live reload.** Polling uses conditional requests, so an unchanged file costs a 304 with no body.
