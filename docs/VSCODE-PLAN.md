# Markscope for VS Code: plan

Status: **proposal**, written 2026-10-19 against branch `feat/codemirror-editor` (version 1.0.0 + Unreleased editor work).
Goal: ship Markscope as a VS Code extension, published on the **Visual Studio Marketplace** and on **Open VSX** (VSCodium, Cursor, Windsurf, Gitpod, Theia). The browser extension keeps working unchanged.

---

## Implementation status (updated 2026-10-19)

Branch `feat/vscode-extension`. Phases 0–3 are built and tested.

| Phase                        | State                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Spike                      | Done in the real thing: the webview harness runs the built bundle under the exact CSP (Blob worker, lazy Mermaid and Graphviz chunks, KaTeX, `wasm-unsafe-eval`) with no violations. Still to do by you: reserve the publisher id and Open VSX namespace.                                                                                 |
| 1 Shared seams               | Done (`AITransport`, `renderExportHtml`, `DocumentView` link hooks, `buildLayout({ hide })`, host theme). The "extract from `app.ts`" item was dropped on purpose: `PreviewApp` is small enough that sharing it would only move code around.                                                                                              |
| 2 Preview MVP                | Done: panels, follow/lock, live updates, settings, theme and high contrast, links and images, editor ⇄ preview sync, commands, restore after reload.                                                                                                                                                                                      |
| 3 Doctor, Reader, export, AI | Done: doctor → Problems, the read-only Reader tab, Export as HTML, Copy Rendered HTML, the status-bar item and the BYO-key AI assistant.                                                                                                                                                                                                  |
| 4–6                          | Docs, CI and release jobs are written. Security and code reviews are done and acted on, and an automated accessibility check (axe, four themes) runs in the webview harness. The extension is to be published on the Marketplace as `AbdallahSaeed.markscope-reader`. Still open: the manual QA matrix, listing screenshots and Open VSX. |

Deviations from this plan, and why:

- **AI came after the first Marketplace upload** (decision D4 as recommended): it is in the codebase now (host service, SecretStorage key, application-scoped `markscope.ai.*`, untrusted-workspace gate) and ships with the next version. `vscode.lm` as a provider is still backlog.
- **Links and images reuse the `workspace://` scheme** instead of new URL policy: the base is `workspace://vscodedoc/<path>`, and the existing folder resolution clamps `..`. The webview sends folder-relative paths, never URIs.
- **Lines are 1-based on the wire** (as in the viewer); only the host converts to VS Code's 0-based lines.
- **Panel restore** needs the webview to save `{ uri, locked }`, so the protocol gained a `lock` message and a `hash` on `document`.
- **Status bar item** shows words, reading time and problem count for the visible preview (computed in the host; the preview also shows them in its footer and Info tab).
- **Links to non-Markdown files** (for example `src/foo.ts#L42`) open in the editor through an opt-in `file` link kind, confined to the document's folder; the browser still never links them.
- Settings are `scope: resource` (window for `preview.*`) and generated from `src/vscode/config-schema.ts`.

## 1. Summary

- **What we ship.** A VS Code extension, `<publisher>.markscope-reader` (plain `markscope` was taken on the Marketplace), with two surfaces:
  - a **Markscope Preview** webview that sits next to the native editor (like the built-in preview, with Markscope's renderer, diagrams, outline, search, doctor and AI);
  - an optional **Markscope Reader** custom editor ("Reopen Editor With… → Markscope Reader") for a full-tab reading view.
- **What we reuse.** Most of the code, as is:
  - the whole render engine (`src/engine/`), sanitizer, URL policy (`src/shared/urls.ts`), settings schema and validation (`src/shared/settings.ts`);
  - the doctor (`src/analysis/`), AI providers and prompts (`src/ai/`);
  - the viewer components: `DocumentView`, `Sidebar`, `SearchBar`, `AIPanel`, `diagrams.ts`, `export.ts`, `navigation.ts`, `scroll-map.ts`, toast, layout, styles and tokens.
- **What VS Code replaces.** We don't port these features, because VS Code already does them:
  - editing: the native editor replaces CodeMirror;
  - files and folders: Explorer and Quick Open;
  - saving, drafts and crash backup: hot exit;
  - live reload and disk conflicts: `TextDocument` events and VS Code's own conflict handling;
  - recents and favorites;
  - the start page.
- **What is new code** (about 1.5–2.5k lines):
  - an extension host (`src/vscode/extension/`);
  - a slim webview bootstrap and `PreviewApp` (`src/vscode/webview/`);
  - a validated webview⇄host message protocol;
  - a `--target=vscode` build;
  - a manifest generator, tests, and release jobs.
- **Effort.** About 4–6 weeks for one developer, through the first Marketplace + Open VSX release (section 12).
- **Urgent publishing fact.** Azure DevOps **global PATs are retired on 1 December 2026**. The classic `vsce publish -p <PAT>` flow depends on them. Plan the first publish as a **manual VSIX upload**, and plan CI publishing on **Microsoft Entra ID** (`vsce publish --azure-credential`, vsce ≥ 2.26.1) instead of a PAT (section 9.3).

---

## 2. Product shape in VS Code

### 2.1 Positioning (why install it over the built-in preview)

VS Code already has a Markdown preview. Markscope must be clearly better, not a duplicate. The listing and README lead with:

1. **Diagrams and math that work out of the box:**
   - Mermaid and Graphviz, lazy-loaded;
   - KaTeX;
   - GitHub alerts and `:::` callouts;
   - footnotes, `[[toc]]`, front matter tables.
2. **Document doctor in the Problems panel:**
   - broken anchors, missing images, heading jumps, duplicate headings, empty links, missing alt text, TODO/FIXME;
   - each issue is a real `Diagnostic` on the right line.
3. **Reader UX:** outline with scrollspy, in-preview search, image lightbox, focus mode, reading stats.
4. **Security posture:** the document never runs code, a strict CSP, sanitized HTML, and remote images can be blocked.
5. **Self-contained HTML export.**
6. **Optional bring-your-own-key AI**:
   - summarize, review, explain code, generate Mermaid;
   - later, VS Code's Language Model API, so no key is needed (section 7.4).

Competitors to study before writing the listing are Markdown Preview Enhanced, Markdown All in One, Markdown Preview Mermaid Support, and the built-in preview. Differentiate on the doctor, the security posture, diagram quality and speed.

### 2.2 Surfaces

| Surface               | VS Code API                                                                     | Behavior                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Markscope Preview** | `WebviewPanel` (view type `markscope.preview`)                                  | **Markscope: Open Preview** and **Open Preview to the Side** commands, plus an editor-title button on Markdown files. Follows the active Markdown editor by default; a **Lock** toggle pins it to one document. Updates on every `onDidChangeTextDocument` (debounced: 120 ms, longer above 64 KB/512 KB like the current editor) with no polling. Restores after reload through `registerWebviewPanelSerializer`. |
| **Markscope Reader**  | `CustomTextEditorProvider` (view type `markscope.reader`, `priority: "option"`) | Full-tab reader for one file. Never the default editor: we must not hijack `.md`. v1 is read-only (edits happen in a normal text editor beside it); see decision D3.                                                                                                                                                                                                                                               |
| **Problems**          | `DiagnosticCollection('markscope')`                                             | Doctor issues for documents shown in a preview (v1). Workspace-wide linting is later (section 7.3).                                                                                                                                                                                                                                                                                                                |
| **Commands**          | `contributes.commands` + `menus` + `keybindings`                                | Open Preview / to the Side, Toggle Lock, Open in Reader, Export HTML, Copy rendered HTML, Run Doctor, Toggle Outline, Find in Preview, AI actions, Set AI Key, Clear AI Key.                                                                                                                                                                                                                                       |
| **Status bar**        | `StatusBarItem` (only while a preview is active)                                | Words · reading time · doctor issue count; clicking it opens Problems.                                                                                                                                                                                                                                                                                                                                             |

### 2.3 Feature matrix (browser vs VS Code v1)

| Feature                                                                                    | Browser           | VS Code v1                        | Notes                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ----------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering (GFM, alerts, callouts, KaTeX, Mermaid, Graphviz, hljs, front matter, `[[toc]]`) | ✓                 | ✓                                 | Same `engine/` and `sanitize.ts`.                                                                                                              |
| Outline + scrollspy + filter, J/K                                                          | ✓                 | ✓                                 | Sidebar in the webview; VS Code's own Outline view also works.                                                                                 |
| Find in document                                                                           | ✓                 | ✓                                 | Key needs review (section 5.6).                                                                                                                |
| Command palette (⌘K)                                                                       | ✓                 | ✗                                 | Replaced by VS Code commands; ⌘K is a VS Code chord prefix.                                                                                    |
| Edit view (CodeMirror), split, scroll sync                                                 | ✓                 | **Native editor + preview**       | Two-way scroll sync, double-click to jump to the source and cursor highlight all go through the host (section 5.5). CodeMirror is not bundled. |
| Source view                                                                                | ✓                 | ✗                                 | The native editor _is_ the source view.                                                                                                        |
| Save / Save as / Discard / drafts / conflicts / live reload                                | ✓                 | ✗                                 | VS Code owns the document lifecycle.                                                                                                           |
| Open file / folder, Files panel, workspace links                                           | ✓                 | Partly                            | Relative `.md` links open in Markscope (or the editor, via a setting); folder browsing is VS Code's Explorer.                                  |
| Relative images                                                                            | ✓ (folder)        | ✓                                 | `webview.asWebviewUri`, restricted to workspace folders.                                                                                       |
| Remote images (allow/block)                                                                | ✓                 | ✓                                 | Same setting, and the CSP enforces it.                                                                                                         |
| Doctor                                                                                     | Sidebar           | Sidebar + **Problems panel**      |                                                                                                                                                |
| Stats                                                                                      | ✓                 | Status bar + sidebar              |                                                                                                                                                |
| Export HTML                                                                                | ✓                 | ✓                                 | Through `showSaveDialog` + `workspace.fs.writeFile`.                                                                                           |
| Export Markdown                                                                            | ✓                 | ✗                                 | Pointless: the file is already in the editor.                                                                                                  |
| Print / PDF                                                                                | ✓                 | ✗ (v1)                            | `window.print()` is unreliable in webviews. Offer "Export HTML and open in browser" instead.                                                   |
| AI (BYOK)                                                                                  | ✓                 | ✓ (v1 or v1.1, decision D4)       | Runs in the extension host; the key is in `SecretStorage`.                                                                                     |
| AI through VS Code Language Models                                                         | –                 | Later                             | `vscode.lm`; no key needed.                                                                                                                    |
| Theme                                                                                      | system/light/dark | **follow VS Code** / light / dark | Includes high-contrast themes.                                                                                                                 |
| Typography (font, size, line height, width)                                                | ✓                 | ✓                                 | `markscope.typography.*` settings.                                                                                                             |
| Recents / favorites / start page / tour                                                    | ✓                 | ✗                                 |                                                                                                                                                |
| Scratch documents                                                                          | ✓                 | ✗                                 | Untitled files cover this.                                                                                                                     |

---

## 3. How the current code maps onto VS Code

### 3.1 Coupling inventory (measured)

`chrome.*` use outside `background/` and `content/`:

| File                                                                  | API                                                          | VS Code replacement                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `storage/area.ts`, `storage/index.ts`                                 | `chrome.storage.*`                                           | Not imported. Settings come from `workspace.getConfiguration('markscope')` → `parseSettings` → posted to the webview. |
| `viewer/index.ts`                                                     | `runtime.getURL`, `sendMessage`, `isAllowedFileSchemeAccess` | Not imported: the new webview bootstrap replaces it.                                                                  |
| `viewer/export.ts:26`                                                 | `chrome.runtime.getURL('css/document.css')`                  | **Seam:** inject an `assetUrl(path)` function.                                                                        |
| `viewer/ai-client.ts`                                                 | `chrome.runtime.connect` (Port)                              | **Seam:** an `AITransport` interface; the VS Code version uses `postMessage`.                                         |
| `viewer/commands.ts`, `home.ts`, `live-reload.ts`, `source-loader.ts` | `openOptionsPage`, `tabs.create`, `permissions.*`            | Not imported.                                                                                                         |
| `popup/`, `options/`                                                  | many                                                         | Not used.                                                                                                             |

Navigation (`location.assign(buildViewerUrl(...))`) is used in `index.ts`, `home.ts`, `folder-controller.ts`, `commands.ts`, `save-actions.ts` and `document-view.ts`. In a webview, a click must become a message to the host instead (section 5.4).

File System Access (`show*Picker`, handles, IndexedDB) lives in `file-access.ts`, `local-docs.ts`, `workspace.ts`, `folder-*.ts` and `save-actions.ts`. **None of these are imported by the VS Code webview.**

### 3.2 Decision: a slim `PreviewApp`, not a ported `ViewerApp`

`viewer/app.ts` (670 lines) owns editing, saving, drafts, live reload, conflicts, folders and the editor. Adding host flags to it would put a branch in every feature and risk regressions in the browser product.

**Recommendation:** add `src/vscode/webview/preview-app.ts` (target under 400 lines). It composes the same components (`DocumentView`, `Sidebar`, `SearchBar`, `AIPanel`, `RenderClient`, diagrams, theme, toast, layout parts) and has no editing or file lifecycle. Shared behavior that today lives only in `app.ts` moves into small shared modules, so both apps call the same code. Expected candidates:

- `deriveTitle`;
- running the doctor;
- render scheduling: the debounce and the sequence guard;
- preserving scroll across re-renders (`topVisibleLine` / `scrollToLine`).

Every extraction in Phase 1 must leave the browser tests green.

### 3.3 Small seams to add in shared code (Phase 1)

1. `export.ts`: take `assetUrl: (path: string) => string` (the browser passes `chrome.runtime.getURL`).
2. `ai-client.ts`: split it into `AIClient` (request ids, stale-event filtering) and `AITransport` (`send`, `onEvent`, `dispose`). `ChromePortTransport` keeps today's behavior.
3. `DocumentView`:
   - **Link resolution:** today `resolveLink(href, baseUrl, viewerBase)` rewrites `href`s to viewer URLs. Add a `onNavigateDocument(target, hash)` / `onOpenExternal(href)` hook so a host can intercept the click instead of following the `href`. The browser keeps its default behavior.
   - **Media:** `resolveMediaSrc` must accept a `vscode-webview://` / `https://*.vscode-cdn.net` base, or the VS Code host pre-resolves media through `loadLocalMedia` (that hook already exists). Prefer the hook: no URL policy change. Write a unit test for it.
4. `layout.ts`: allow omitting toolbar buttons (home, favorite, save, discard, mode buttons) through a `features` option, so the VS Code layout doesn't carry dead controls.
5. `theme.ts`: add a `'host'` theme source. The webview reads VS Code's `body.vscode-light | vscode-dark | vscode-high-contrast | vscode-high-contrast-light` classes and watches them with a `MutationObserver`.

---

## 4. Architecture

```
┌──────────────── VS Code extension host (Node, or Web Worker for vscode.dev) ────────────────┐
│ extension.ts (activate)                                                                     │
│   ├─ PreviewManager  — panels, follow/lock, serializer, active-editor tracking               │
│   ├─ ReaderProvider  — CustomTextEditorProvider (read-only v1)                               │
│   ├─ config.ts       — workspace config → parseSettings() → Settings; onDidChangeConfiguration│
│   ├─ protocol.ts     — parseWebviewMessage() (validation, like background/router.ts)          │
│   ├─ links.ts        — open-link policy (workspace-confined files, openExternal for http(s))  │
│   ├─ diagnostics.ts  — doctor issues → DiagnosticCollection                                  │
│   ├─ export.ts       — showSaveDialog + workspace.fs.writeFile                               │
│   ├─ ai-host.ts      — reuses src/ai providers + prompts; key in context.secrets              │
│   └─ html.ts         — webview HTML, nonce, CSP, asWebviewUri for every asset                │
└──────────────▲───────────────────────────────────────────────────────┬──────────────────────┘
               │ postMessage (validated both ways, versioned)          │
┌──────────────┴──────── Webview (sandboxed iframe, our CSP) ──────────▼──────────────────────┐
│ webview/index.ts → host-bridge.ts (acquireVsCodeApi, setState/getState)                     │
│ PreviewApp → RenderClient(+worker) → sanitize → DocumentView → Sidebar/Search/AIPanel        │
│ scroll-sync.ts (data-source-line ⇄ editor line)                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Source layout

```
src/vscode/
  protocol.ts            # message types + parsers shared by host and webview (no vscode import)
  extension/
    extension.ts
    preview-manager.ts
    preview-panel.ts
    reader-provider.ts
    config.ts
    links.ts
    diagnostics.ts
    export.ts
    ai-host.ts
    html.ts
    status.ts
  webview/
    index.ts
    host-bridge.ts
    preview-app.ts
    scroll-sync.ts
    keys.ts               # in-webview shortcuts that don't fight VS Code
  README.md               # Marketplace README (PNG images, https only)
  CHANGELOG.md            # or generated from the root CHANGELOG section
  icon.png                # 256×256 PNG, from src/icons/logo.svg (scripts/icons.mjs)
scripts/
  vscode-manifest.mjs     # generates dist/vscode/package.json (contributes.*)
tsconfig.vscode.json      # no "chrome" types → compile error if chrome.* leaks in
tests/vscode/
  unit/…                  # Vitest, with a fake `vscode` module
  integration/…           # @vscode/test-cli + Mocha, runs in a real VS Code
  harness/…               # Playwright against the webview bundle with a fake host
```

### 4.2 Message protocol (`src/vscode/protocol.ts`)

Every message has `{ v: 1, type, ... }`, and both sides validate it with hand-written parsers. They return `null` on anything unexpected, following `shared/messages.ts`.

**Host → webview**

| type           | payload                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `init`         | `settings`, `theme`, `assets` (asWebviewUri map: worker, katex css, document css), `features`, `state` (restored scroll and sidebar) |
| `document`     | `uri` (string), `version`, `text`, `baseUri` (webview URI of the document's folder), `fileName`                                      |
| `settings`     | `Settings` (already validated by `parseSettings`)                                                                                    |
| `scrollToLine` | `line` (0-based), `source: 'editor'` (echo guard, like `split-view.ts`)                                                              |
| `cursorLine`   | `line`: highlights the matching preview block                                                                                        |
| `media`        | `requestId`, `url` (webview URI, or `null` if refused)                                                                               |
| `ai.event`     | the same `AIPortEvent` shape as today (request id, delta/done/error)                                                                 |
| `command`      | `name ∈ {find, toggleSidebar, runDoctor, focusMode, …}`: VS Code commands forwarded to the webview                                   |

**Webview → host**

| type                              | payload                                          | Host validation                                                                    |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `ready`                           | –                                                | –                                                                                  |
| `openLink`                        | `href`, `kind: 'document' \| 'external'`, `hash` | Re-resolved on the host with the URL policy. Never trusts `kind`.                  |
| `revealLine`                      | `line`                                           | integer, `0 ≤ line < document.lineCount`                                           |
| `scrolled`                        | `line`                                           | same, rate-limited                                                                 |
| `resolveMedia`                    | `requestId`, `path`                              | Workspace-confined path (section 6).                                               |
| `doctor`                          | `uri`, `version`, `issues[]`                     | `uri`/`version` must match the panel's document; caps on count and message length. |
| `exportHtml`                      | `html`                                           | Size cap (for example 50 MB); written only to a path the user picked.              |
| `copy`                            | `text`                                           | Size cap; `env.clipboard.writeText`.                                               |
| `ai.run` / `ai.abort` / `ai.test` | same as `AIRunMessage`                           | `parseAIRequest` (already exists).                                                 |
| `state`                           | scroll, sidebar                                  | Stored with `webview.setState` on the webview side; the host doesn't need it.      |

### 4.3 Webview HTML and CSP (`html.ts`)

```
default-src 'none';
script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval';
style-src ${webview.cspSource} 'unsafe-inline';
img-src ${webview.cspSource} data: blob: ${remoteImages === 'allow' ? 'https:' : ''};
font-src ${webview.cspSource};
worker-src blob:;
connect-src ${webview.cspSource};
```

- `'unsafe-inline'` for styles is needed because `sanitize.ts` keeps allowlisted inline `style`, and Mermaid emits a scoped `<style>`. This matches today's extension pages: MV3 doesn't restrict styles.
- No inline script, and every script tag carries the nonce.
- `connect-src` covers fetching the worker source and `document.css` for export. **AI requests never come from the webview**: they run in the host.
- `enableScripts: true`, `enableCommandUris: false`, `enableForms: false`.
- `localResourceRoots`:
  - `dist/vscode/webview` (that is, `extensionUri/webview`);
  - the workspace folder(s) that contain the document;
  - the document's own folder, for files outside any workspace.
- `retainContextWhenHidden: false`. State is restored through `getState`/`setState`; this keeps memory down. Revisit if re-render on reveal is slow on huge documents.

### 4.4 Rendering inside the webview (risks to verify in the Phase 0 spike)

| Concern                                               | Plan                                                                                                                                                                                                                                                 | Fallback                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Render worker**                                     | A webview can't `new Worker(<webview resource URL>)` cross-origin. Fetch `render-worker.js`, wrap it in a `Blob`, then `new Worker(blobUrl)`. For this target, build the worker as an IIFE (classic worker) so it has no module or import semantics. | `RenderClient` already falls back to in-thread rendering when the worker fails.                                      |
| **Lazy chunks** (Mermaid ~2.5 MB, viz.js, merge view) | ESM `import()` resolves relative to the module's webview URI, which `script-src ${cspSource}` allows. Keep `splitting: true`.                                                                                                                        | If dynamic import fails, build the VS Code webview without splitting and accept a larger initial parse (measure it). |
| **Graphviz WASM**                                     | viz.js compiles embedded WASM, which needs `'wasm-unsafe-eval'` (already in the CSP above).                                                                                                                                                          | If it is blocked, show a placeholder: "Graphviz isn't available in this environment".                                |
| **KaTeX fonts**                                       | CSS `url()`s resolve against the CSS file's webview URI. Copy `vendor/katex` as today.                                                                                                                                                               | –                                                                                                                    |
| **Mermaid theme**                                     | Pick light or dark Mermaid from the resolved theme. High contrast uses the dark Mermaid theme plus forced borders.                                                                                                                                   | –                                                                                                                    |
| **Large documents**                                   | Same thresholds: worker above 64 KB, `content-visibility: auto`. Avoid posting the full text on every keystroke: debounce on the host, and skip the update if `version` didn't change.                                                               | Above 5 MB, update only on save (setting `markscope.preview.updateOn: 'change' \| 'save'`).                          |

---

## 5. Behavior details

### 5.1 Document updates

- `PreviewManager` listens to `workspace.onDidChangeTextDocument` and `window.onDidChangeActiveTextEditor`.
- Unlocked previews follow the active editor's document **only if** it is Markdown (`languageId === 'markdown'`, or a Markscope extension from `MARKDOWN_EXTENSIONS`, so `.mdx`, `.mkd` and so on are included). Otherwise they keep showing the last document.
- On a change, post `document` with the new `version`. The webview re-renders, keeping its scroll anchored to the first visible `data-source-line` (the browser viewer already does this).
- The file is deleted or renamed: show a banner ("This file was deleted"). Keep the panel. Follow `onDidRenameFiles`.

### 5.2 Settings (`contributes.configuration`)

`scripts/vscode-manifest.mjs` generates the configuration schema from `defaultSettings()` and the `THEMES` / `FONT_FAMILIES` / `CONTENT_WIDTHS` / … constants in `src/shared/settings.ts`. It imports the `.ts` file the same way `manifest.mjs` imports `urls.ts`. The schema and the runtime can't drift.

| Key                                                                      | Type / default                                                 | Scope                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------- |
| `markscope.theme`                                                        | `"auto"` (follow VS Code) \| `"light"` \| `"dark"`             | `window`                      |
| `markscope.themeLight` / `markscope.themeDark`                           | one of 10 light / 25 dark named themes (`docs/THEMES-PLAN.md`) | `resource`                    |
| `markscope.typography.fontFamily / fontSize / lineHeight / contentWidth` | from defaults                                                  | `resource`                    |
| `markscope.markdown.*` (front matter, line numbers, wrap, …)             | from defaults                                                  | `resource`                    |
| `markscope.images.remote`                                                | `"allow"` \| `"block"` (same default as the browser)           | `resource`                    |
| `markscope.preview.followActiveEditor`                                   | `true`                                                         | `window`                      |
| `markscope.preview.openMarkdownLinks`                                    | `"inPreview"` \| `"inEditor"`                                  | `window`                      |
| `markscope.preview.updateOn`                                             | `"change"` \| `"save"`                                         | `resource`                    |
| `markscope.doctor.enabled`                                               | `true`                                                         | `resource`                    |
| `markscope.ai.enabled / provider / baseUrl / model`                      | from defaults                                                  | **`application`** (section 6) |

`config.ts` reads the section, converts it to the `Settings` shape, and runs **`parseSettings`**. That one validator covers browser imports and VS Code configuration, including the AI URL rules. Changes go through `onDidChangeConfiguration` → `affectsConfiguration('markscope')` → post `settings`.

### 5.3 Theme

- `"auto"`: the webview maps `body.vscode-dark` / `vscode-high-contrast` to `data-theme="dark"`, and `vscode-light` / `vscode-high-contrast-light` to `light`. It also sets `data-contrast="high"` for high-contrast themes.
- `tokens.css` gains a `[data-contrast="high"]` block: solid borders, no subtle tints, focus rings that use `--vscode-focusBorder`.
- Optional (decision D6): add an **"editor"** palette that maps document colors to `--vscode-editor-background` / `--vscode-editor-foreground` / `--vscode-textLink-foreground`, so the preview blends into any theme. The default stays the OKLCH Markscope palette (it's the product's look).
- Print/paper rules stay as they are; they don't apply here.

### 5.4 Links and images

- The webview intercepts every `<a>` click (`DocumentView.onClick` already does this for anchors) and **never** lets the iframe navigate.
- `#anchor` → scroll in place (already supported).
- Relative or absolute link to a Markdown file → `openLink(kind:'document')`. The host:
  1. resolves it against the document URI;
  2. requires the target to be inside a workspace folder, or inside the document's folder when there is no workspace;
  3. checks that it exists (`workspace.fs.stat`);
  4. opens it in the preview (`inPreview`), or as a text editor (`inEditor`), then scrolls to `hash`. Heading slugs are GitHub-compatible, so the existing `idFromHash` works.
- Non-Markdown local file → `vscode.open` (it opens in VS Code; nothing runs).
- `http(s):` / `mailto:` → `env.openExternal`. VS Code shows its own trusted-domains prompt, which is good.
- `file:`, `command:`, `vscode:`, `javascript:` and anything else → refused. `resolveLink` already maps unknown schemes to `invalid`; the host checks again.
- Images: relative paths go through the `loadLocalMedia` hook → `resolveMedia` → the host validates and returns `webview.asWebviewUri(target)`. Remote images follow `markscope.images.remote`, and the CSP enforces it.

### 5.5 Editor ⇄ preview sync

- **Editor → preview:**
  - `window.onDidChangeTextEditorVisibleRanges` → `scrollToLine(firstVisibleLine)`;
  - `onDidChangeTextEditorSelection` → `cursorLine`.
- **Preview → editor:**
  - webview scroll → `scrolled(line)` → `editor.revealRange(new Range(line,0,line,0), AtTop)`;
  - double-click → `revealLine` → move the cursor there and focus the editor.
- Reuse `editor/scroll-map.ts` (it interpolates between `data-source-line` blocks) and the **value-comparison echo guard** from `split-view.ts`. That's one of CLAUDE.md's "learned the hard way" items: a time window drops real scrolls.
- Settings `markscope.preview.scrollEditorWithPreview` and `scrollPreviewWithEditor` both default to `true`.

### 5.6 Keyboard

VS Code sends webview keydowns to its own keybinding service, so single-letter keys work only while the webview has focus and no VS Code binding claims them.

- Keep inside the webview: `J`/`K` (headings), `/` (find), `B` (sidebar), `Z`/`Esc` (focus mode), `?` (help).
- Drop the in-webview ⌘K palette.
- Expose everything as commands, with keybindings scoped by `when: activeWebviewPanelId == 'markscope.preview' || activeCustomEditorId == 'markscope.reader'`. For example, `ctrl/cmd+f` → `markscope.find`, because VS Code's own webview find doesn't know the CSS highlights.
- Check on macOS, Windows and Linux that no binding shadows a common VS Code one.

---

## 6. Security invariants (VS Code additions)

All existing invariants in CLAUDE.md still apply: `sanitize.ts`, the URL policy, the diagram SVG rules, and the AI rules. Add these, and cover each one with a test:

1. **The webview is untrusted input to the host.** Each message goes through `parseWebviewMessage`. The host never runs a VS Code command, opens a URI, or writes a file because the webview _says_ to; it re-derives the action from validated data and the panel's own document URI.
2. **No command URIs:** `enableCommandUris: false`, and `command:` links are refused in both `resolveLink` and `links.ts`.
3. **Confined file access:** the host serves media and opens documents only inside a workspace folder (or the document's folder). The check normalizes `..`, symlinks (`fs.realpath` on desktop) and case on Windows/macOS. Same spirit as the `workspace://` clamp.
4. **CSP:** nonce scripts only, `default-src 'none'`, no `unsafe-eval`, and no remote scripts or styles ever.
5. **AI:**
   - the key lives in `context.secrets` (OS keychain) and is never posted to the webview;
   - it stays bound to the `ai.baseUrl` origin it was saved for (reuse `secrets-store` logic through a `SecretStorage`-backed `KeyValueArea`);
   - remote endpoints must use https;
   - the document goes into the prompt as untrusted data, with `</document>` breakouts neutralized, as today.
6. **Workspace settings can't redirect AI.** `markscope.ai.*` uses `scope: "application"`, and the manifest declares `capabilities.untrustedWorkspaces: { supported: "limited", restrictedConfigurations: [ "markscope.ai.baseUrl", … ] }`. Without this, a cloned repo's `.vscode/settings.json` could set `ai.baseUrl` to an attacker's server. The origin binding would still withhold the key, but the document text would go to that server once the user runs an action.
7. **Untrusted workspaces:** rendering is allowed (we never execute document code), and AI actions are disabled until the workspace is trusted.
8. **Virtual workspaces** (github.dev, Remote Repositories): read only through `workspace.fs`. No Node `fs` in code paths that must work there.
9. **No telemetry.** State it in the README; nothing to wire to `telemetry.telemetryLevel`.

Update `docs/SECURITY.md` with a "VS Code" section that lists these.

---

## 7. AI and doctor in VS Code

### 7.1 AI host (`ai-host.ts`)

- Move the provider-facing logic of `background/ai-service.ts` into a transport-neutral module, for example `src/ai/service.ts`: `parseAIRequest` → enabled gate → key lookup by origin → `buildPrompt` → `provider.stream()` → events with request ids, abort-on-new-run.
- Both the service worker (Port) and the VS Code host (webview `postMessage`) call it.
- Anthropic SDK and OpenAI-compatible SSE both run on Node 20+ (`fetch` and streams are built in). On a web extension host the Anthropic SDK needs `dangerouslyAllowBrowser` / the direct-browser-access header, so AI stays desktop-only until it's verified there.
- Commands: **Markscope: Set AI API Key** (`showInputBox({ password: true })`) and **Clear AI API Key**.
- `ai.test` reuses the existing test flow.

### 7.2 AI later: VS Code Language Model API

- Add an `AIProvider` backed by `vscode.lm.selectChatModels()`. It uses the user's Copilot or other installed models, with no key and VS Code's own consent prompt.
- This is likely the most popular option in VS Code. It lives behind the same interface, and `provider: "vscode"` is only valid in the VS Code target.

### 7.3 Doctor → Problems

- **v1:** the webview already computes `knownIds` from the rendered DOM and runs `diagnose()`. It posts `doctor { uri, version, issues }`. The host maps each issue to a `Diagnostic`:
  - `range` = the issue's line;
  - severity mapped from `error` / `warning` / `info`;
  - `source: 'Markscope'`, and `code` = the rule id.
  - Diagnostics are dropped when the version is stale or the preview closes (setting `markscope.doctor.keepAfterClose`).
- **Later:** run the doctor in the host for every Markdown file in the workspace without a preview. `render.ts` is pure and runs in Node. Compute `knownIds` from the render result (heading slugs, footnote ids, raw-HTML ids), probably by extending `RenderResult` with an `ids` list. Check missing images with `workspace.fs.stat`. Add Quick Fixes (`CodeActionProvider`) for heading slugs and alt text.

---

## 8. Build and packaging

### 8.1 `scripts/build.mjs --target=vscode`

Output: `dist/vscode/`

| Bundle                              | esbuild options                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `extension.js`                      | `platform: 'node'`, `format: 'cjs'`, `target: 'node20'`, `external: ['vscode']`, entry `src/vscode/extension/extension.ts` |
| `extension-web.js` (Phase 7)        | `platform: 'browser'`, `format: 'cjs'`, `external: ['vscode']`, Node built-ins aliased away                                |
| `webview/js/preview.js` + `chunks/` | `format: 'esm'`, `splitting: true`, entry `src/vscode/webview/index.ts`; **no CodeMirror**, no popup or options            |
| `webview/js/render-worker.js`       | `format: 'iife'` (classic worker, loaded from a Blob)                                                                      |
| `webview/css/*`                     | `document.css`, plus a new `preview.css` that imports tokens/base and the viewer component styles it needs                 |
| static                              | `vendor/katex`, `icon.png`, `README.md`, `CHANGELOG.md`, `LICENSE`, generated `package.json`                               |

- Mark `vscode` external and make sure nothing pulls in `chrome` types at runtime.
- Add a CI guard: `tsc -p tsconfig.vscode.json` (with `types: ["vscode", "node"]`, without `"chrome"`) fails if `src/vscode/**` imports anything that touches `chrome.*`.

### 8.2 Generated `dist/vscode/package.json` (`scripts/vscode-manifest.mjs`)

```jsonc
{
  "name": "markscope",
  "displayName": "Markscope Reader: Markdown Preview, Diagrams & Doctor",
  "description": "Fast, secure Markdown preview with Mermaid, Graphviz, KaTeX, an outline, a documentation doctor in the Problems panel, and optional BYO-key AI.",
  "version": "<from root package.json>",
  "publisher": "<publisher id>", // decision D1
  "license": "MIT",
  "icon": "icon.png", // PNG ≥128×128; SVG is not allowed
  "galleryBanner": { "color": "#…", "theme": "dark" },
  "engines": { "vscode": "^1.90.0" }, // check Cursor/Windsurf/VSCodium lag first
  "categories": ["Visualization", "Programming Languages", "Linters"],
  "keywords": [
    "markdown",
    "preview",
    "mermaid",
    "graphviz",
    "katex",
    "diagram",
    "reader",
    "lint",
    "docs",
  ],
  "repository": { "type": "git", "url": "https://github.com/AbdallahSaeed/markscope" },
  "homepage": "https://abdallahsaeed.github.io/markscope/",
  "bugs": { "url": "https://github.com/AbdallahSaeed/markscope/issues" },
  "qna": "https://github.com/AbdallahSaeed/markscope/discussions",
  "main": "./extension.js",
  // "browser": "./extension-web.js",       // Phase 7
  "activationEvents": [
    "onLanguage:markdown",
    "onWebviewPanel:markscope.preview",
    "onCustomEditor:markscope.reader",
  ],
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": "limited",
      "restrictedConfigurations": [
        "markscope.ai.enabled",
        "markscope.ai.baseUrl",
        "markscope.ai.provider",
        "markscope.ai.model",
      ],
    },
    "virtualWorkspaces": true,
  },
  "contributes": {
    "commands": [/* … */],
    "menus": {
      "editor/title": [/* preview button when resourceLangId == markdown */],
      "commandPalette": [/* when clauses */],
    },
    "keybindings": [/* scoped by activeWebviewPanelId */],
    "customEditors": [
      {
        "viewType": "markscope.reader",
        "displayName": "Markscope Reader",
        "selector": [{ "filenamePattern": "*.{md,markdown,mdown,mkd,mkdn,mdx}" }],
        "priority": "option",
      },
    ],
    "configuration": {/* generated from src/shared/settings.ts */},
  },
}
```

- The `selector` patterns are generated from `MARKDOWN_EXTENSIONS`.
- Activation: VS Code infers most events from `contributes` on recent engines. Keep only the ones needed for restore and serialization.

### 8.3 Packaging

- Add devDependencies: `@vscode/vsce`, `ovsx`, `@types/vscode` (pinned to the `engines` minimum), `@vscode/test-cli`, `@vscode/test-electron`, `mocha` (+ types), and later `@vscode/test-web`.
- `npm run build:vscode` → `node scripts/build.mjs --target=vscode`.
- `npm run package:vscode` → `cd dist/vscode && vsce package --no-dependencies -o ../../release/markscope-<v>.vsix`. Bundling removes the need for `node_modules`.
- Extend `npm run release` with the build, the package, and `SHA256SUMS` for the `.vsix`.
- Size budget: the VSIX should be under 8 MB (Mermaid ~2.5 MB, viz ~1.5 MB, KaTeX fonts ~0.3 MB, hljs, the app). Fail CI above 10 MB.
- `vsce ls` in CI to check that no source maps, tests or fixtures ship.

---

## 9. Publishing

### 9.1 Accounts (one-time, manual: you)

**Visual Studio Marketplace**

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft account.
2. **Create publisher**: the ID (for example `abdallahsaeed` or `markscope`) is **permanent** and becomes part of the extension id `<publisher>.markscope-reader`. Display name: "Abdallah Saeed".
3. Check that the display name **"Markscope"** is free. The Marketplace requires unique display names, so search first and fall back to "Markscope Markdown" if needed.
4. Optional, later: **verified publisher** (blue check). It requires DNS verification of a domain you own; `*.github.io` can't be verified this way. Check the eligibility rules (they include a minimum publisher age) when applying.

**Open VSX** (Eclipse Foundation)

1. Create an Eclipse account at <https://accounts.eclipse.org> and put your **GitHub username** in its profile.
2. Sign in at <https://open-vsx.org> with GitHub, then **sign the Open VSX Publisher Agreement** from your profile. This is not the ECA: the ECA is for contributing code to Eclipse projects.
3. Create an access token in the Open VSX profile (**Access Tokens**).
4. `npx ovsx create-namespace <publisher> -p <token>`. The namespace must equal `package.json` `publisher`.
5. Creating a namespace doesn't grant exclusive rights. **Claim namespace ownership** (an issue in the `EclipseFdn/open-vsx.org` repo) to get the verified badge and keep others out.

### 9.2 First release (manual, recommended)

1. `npm run release` → `release/markscope-<v>.vsix`.
2. Install it locally (`code --install-extension release/markscope-<v>.vsix`) and run the QA checklist (section 10.4) in VS Code, Cursor and VSCodium.
3. **Marketplace:** in the publisher page, choose **New extension → Visual Studio Code** and upload the `.vsix`. No PAT is needed. Validation takes minutes.
4. **Open VSX:** `npx ovsx publish release/markscope-<v>.vsix -p <token>`.
5. Record the listing URLs in `docs/PUBLISHING.md` and set the repository variables `VSCODE_MARKETPLACE_URL` and `OPEN_VSX_URL` for the website.

### 9.3 Automated publishing (CI)

Add two jobs to `.github/workflows/release.yml`. They follow the existing pattern: they run only when their secrets or variables exist, and otherwise print a "skipped" message.

**`vscode-marketplace`: Microsoft Entra ID, not a PAT.**

- Why: Azure DevOps **global PATs** ("All accessible organizations", the scope `vsce` has always required) can't be created since 15 March 2026 and **stop working on 1 December 2026**. The VS Code publishing docs now recommend Entra ID with `vsce publish --azure-credential` (vsce ≥ 2.26.1).
- Setup:
  1. Create an Azure user-assigned managed identity (or an app registration).
  2. Add a **federated credential** for GitHub Actions. Use the _Environment_ entity type (for example `release`): a tag-based subject only matches one exact tag.
  3. Add that identity as a **member of the Marketplace publisher** (Contributor or Owner).
  4. In the job: `azure/login@v2` with `client-id` / `tenant-id` / `subscription-id` (or `allow-no-subscriptions: true`), `permissions: id-token: write`, then `npx @vscode/vsce@<pinned> publish --packagePath release/markscope-<v>.vsix --azure-credential`.
- Secrets/variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` (and `AZURE_SUBSCRIPTION_ID` if it's used).
- **Check** the official guide (<https://code.visualstudio.com/api/working-with-extensions/publishing-extension>) when setting this up. The GitHub Actions variant isn't documented officially yet; community write-ups report that adding the identity to the publisher is the fiddly step.

**`open-vsx`**

- `npx ovsx@<pinned> publish release/markscope-<v>.vsix -p "$OVSX_PAT"`. Secret: `OVSX_PAT`.

**Versioning**

- One `package.json` version for every product. A `vX.Y.Z` tag ships Chrome, Edge, Firefox, the Marketplace and Open VSX together.
- The first VS Code release is the next minor version (decision D5).
- The Marketplace accepts only `major.minor.patch` (no `-beta`). If you want beta testers before 1.x, use the `.vsix` from GitHub Releases. Or adopt the pre-release channel (`vsce publish --pre-release`, odd minor numbers by convention) later; that's a separate tag pattern and job.

### 9.4 Listing content

- `src/vscode/README.md` is the Marketplace page. It can't reuse the root README because:
  - vsce rejects **SVG images** (the root README uses `logo.svg`);
  - images must be **https**;
  - the content should show VS Code screenshots.
- Sections:
  - hero GIF/PNG of the preview next to the editor;
  - features (section 2.1 order);
  - commands and settings table;
  - security and privacy (no telemetry, no network unless remote images or AI);
  - AI setup; Open VSX note; links.
- Screenshots: extend `scripts/screenshots.mjs`, or add `scripts/vscode-screenshots.mjs`. Show light, dark and high contrast; diagrams; the Problems panel with doctor issues; AI. Use 1280×800 or larger, PNG.
- `CHANGELOG.md`: vsce shows it in a "Changelog" tab. Copy the root CHANGELOG into `dist/vscode/` at build time.
- Icon: rasterize `logo.svg` → `icon.png` at 256×256 through `scripts/icons.mjs`. Pick the `galleryBanner` color from `tokens.css` and check the contrast.
- Privacy policy: link `https://abdallahsaeed.github.io/markscope/privacy.html`, and update `docs/PRIVACY.md` with a VS Code section (the same data rules; the AI key lives in the OS keychain through SecretStorage).

---

## 10. Testing

The repo bar still applies: 80% lines/functions/statements and 75% branches on the logic layers, a test for every user-visible change, and E2E tests for flows.

### 10.1 Unit (Vitest, existing runner)

- `tests/helpers/vscode-fake.ts`: a minimal fake of the `vscode` module (Uri, Range, EventEmitter, workspace config, DiagnosticCollection), aliased in `vitest.config.ts` for `tests/vscode/unit/**`.
- Cover:
  - `protocol.ts` parsers: every message type, plus malformed, oversized and wrong-version input;
  - `config.ts`: config → `parseSettings`, invalid values, and AI settings ignored from workspace scope;
  - `links.ts`: workspace confinement, `..`, symlinks, Windows drive letters and UNC paths, `command:` refused;
  - `html.ts`: the CSP string for both remote-image modes, nonce on every script;
  - `diagnostics.ts`: severity mapping, stale-version drop;
  - `scroll-sync.ts`: the echo guard;
  - the theme-class mapping;
  - the manifest generator: settings schema matches `defaultSettings()`, selector patterns match `MARKDOWN_EXTENSIONS`.
- Add these to `coverage.include`.

### 10.2 Webview harness (Playwright, existing runner)

- `tests/vscode/harness/index.html` loads `dist/vscode/webview` with a fake `acquireVsCodeApi` that records `postMessage` calls and can inject host messages.
- Tests:
  - rendering fixtures (Mermaid, Graphviz, KaTeX, alerts);
  - theme classes (light, dark, HC) and the high-contrast tokens;
  - link clicks → `openLink` (and no navigation);
  - image resolution;
  - `scrollToLine` and the `scrolled` echo guard;
  - the doctor message;
  - export HTML;
  - large documents (`trace: 'off'`).
- The harness can't prove the real CSP or worker behavior inside VS Code; that's 10.3.

### 10.3 Integration in a real VS Code (`@vscode/test-cli` + `@vscode/test-electron`, Mocha)

- `.vscode-test.mjs` with a fixtures workspace (`tests/vscode/fixtures/`: docs with links, images, diagrams, doctor issues).
- Tests:
  - activation;
  - the open-preview command creates the panel;
  - editing the document updates the preview, verified with a **test-only** `__test.snapshot` message that is enabled only when `context.extensionMode === ExtensionMode.Test`;
  - diagnostics appear and clear;
  - config changes propagate;
  - the custom editor opens through `vscode.openWith`;
  - the serializer restores after `workbench.action.reloadWindow`;
  - untrusted mode disables AI.
- Run in CI with `xvfb-run -a npm run test:vscode` on ubuntu, against the `engines` minimum and `stable`.
- Phase 7: `@vscode/test-web` for the web extension.

### 10.4 Manual QA (add a VS Code section to `docs/QA-CHECKLIST.md`)

- VS Code stable and Insiders; Cursor; VSCodium (Open VSX build); Windsurf if possible.
- macOS, Windows (paths with spaces, drive letters, UNC, OneDrive folders) and Linux.
- Remote: **WSL, Remote-SSH, Dev Containers, Codespaces**. The webview runs locally and the host runs remotely; check media URIs and AI from the remote host.
- Multi-root workspaces; files outside any workspace; untitled Markdown.
- Light, dark, HC dark, HC light themes; zoom levels; screen reader (VoiceOver/NVDA) in the webview; keyboard-only use.
- Large documents (48k lines), many Mermaid diagrams; memory with five previews open.
- Untrusted workspace; a malicious `.vscode/settings.json` that tries to set `markscope.ai.baseUrl`.
- Split editor groups; preview lock; follow mode while switching between non-Markdown files.

---

## 11. Phased plan

Each phase ends green: `npm run typecheck`, `npm test`, `npm run test:e2e` (browser), plus the new VS Code suites once they exist. Browser behavior must not change until the last phase.

### Phase 0: Spike and go/no-go (2–3 days)

- [ ] Throwaway branch: a minimal extension that opens a `WebviewPanel` with the CSP from section 4.3 and loads the existing engine and `document.css`.
- [ ] Prove: the Blob render worker, lazy Mermaid chunk import, Graphviz WASM under `'wasm-unsafe-eval'`, KaTeX fonts, `asWebviewUri` images.
- [ ] Measure: activation time, first render of the tour doc, memory per panel.
- [ ] Try it in VS Code stable, Cursor and VSCodium.
- [ ] Check that the Marketplace display name and publisher ID are available, and **create the publisher and the Open VSX namespace now** (names are first come, first served).
- **Exit:** every row of section 4.4 works, or has an accepted fallback.

### Phase 1: Shared seams, no behavior change (3–4 days)

- [ ] `export.ts` takes `assetUrl`.
- [ ] Split `AIClient` / `AITransport`, and move service logic to `src/ai/service.ts` (the service worker uses it).
- [ ] `DocumentView` link hooks (`onNavigateDocument`, `onOpenExternal`); media through `loadLocalMedia` for host-resolved URLs.
- [ ] `layout.ts` `features` option; `theme.ts` host theme source.
- [ ] Extract shared bits from `app.ts`: render scheduling, preserving scroll, title, doctor run.
- [ ] Unit tests for every seam; the existing tests must pass unchanged.
- **Exit:** the browser extension is identical (E2E green), and `app.ts` is smaller.

### Phase 2: Extension MVP: preview (6–8 days)

- [ ] `build.mjs --target=vscode`, `vscode-manifest.mjs`, `tsconfig.vscode.json`, `npm run build:vscode`.
- [ ] `extension.ts`, `PreviewManager`, `preview-panel.ts`, `html.ts` (CSP, nonce), serializer.
- [ ] `protocol.ts` with parsers on both sides.
- [ ] Webview `index.ts`, `host-bridge.ts`, `PreviewApp`.
- [ ] Live updates from `TextDocument`; follow/lock; deleted or renamed files.
- [ ] Settings → `parseSettings` → live updates; theme `auto` + high contrast.
- [ ] Links and images (section 5.4) with host-side validation.
- [ ] Editor ⇄ preview scroll sync, cursor highlight, double-click to reveal.
- [ ] Commands, editor-title button, scoped keybindings, status bar item.
- [ ] Unit tests (10.1) and the harness (10.2).
- **Exit:** daily-driver quality preview in VS Code; the `.vsix` installs and runs locally.

### Phase 3: Doctor, Reader, export, AI (5–7 days)

- [ ] Doctor → `DiagnosticCollection` (section 7.3 v1).
- [ ] `ReaderProvider` custom editor (read-only), `priority: option`.
- [ ] Export HTML (save dialog) and Copy HTML.
- [ ] AI host + SecretStorage key + application-scoped settings + untrusted-workspace gate (or move this to 1.1, decision D4).
- [ ] Integration tests (10.3) in CI with xvfb.
- **Exit:** feature-complete v1 (section 2.3).

### Phase 4: Hardening and QA (3–5 days)

- [ ] Security review against section 6: run the `security-reviewer` agent on `src/vscode/**` and fix every HIGH and CRITICAL finding.
- [ ] Manual QA matrix (10.4), including Remote and Windows.
- [ ] Performance: large documents, many panels, `retainContextWhenHidden` decision.
- [ ] Accessibility pass in the webview (focus order, labels, contrast in HC).

### Phase 5: Listing and first publish (2–3 days, plus review time)

- [ ] `src/vscode/README.md`, screenshots/GIF, icon PNG, gallery banner, CHANGELOG copy.
- [ ] Docs: `README.md` (an "Install in VS Code" section), `CHANGELOG.md`, `docs/PUBLISHING.md` (a VS Code + Open VSX section), `docs/QA-CHECKLIST.md`, `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md` (the new context row, commands, invariants and gotchas).
- [ ] Website: add "Install for VS Code" and "Open VSX" buttons to `site/index.html`, driven by repository variables (the same mechanism as the Chrome and Firefox buttons).
- [ ] Manual first publish (section 9.2) to the Marketplace and Open VSX.

### Phase 6: CI/CD (1–2 days)

- [ ] Add the `build:vscode`, VSIX size check, `vsce ls` check, unit and integration (xvfb) jobs to `ci.yml`.
- [ ] `release.yml` jobs `vscode-marketplace` (Entra ID) and `open-vsx` (PAT), skipped when unconfigured.
- [ ] A dry run on a `v<next>-rc` tag to a test publisher, or a `workflow_dispatch` with `--dry-run` / `vsce package` only.

### Phase 7: Later (backlog)

- Web extension (`browser` entry) for vscode.dev and github.dev: `workspace.fs` only, `@vscode/test-web`.
- AI provider on the VS Code Language Model API (`vscode.lm`).
- Workspace-wide doctor with Quick Fixes.
- Editing inside the Reader (CodeMirror backed by `WorkspaceEdit`), if users ask for it.
- Print/PDF through an exported HTML opened in the system browser.
- "Editor" palette that inherits `--vscode-*` colors.
- Localization (`package.nls.json`, `vscode-l10n`), starting from `src/_locales/en`.

---

## 12. Timeline (one developer, focused)

| Week | Work                                                            |
| ---- | --------------------------------------------------------------- |
| 1    | Phase 0 spike + publisher/namespace reservation; Phase 1 starts |
| 2    | Phase 1 done; Phase 2 starts                                    |
| 3    | Phase 2 done (local `.vsix` usable)                             |
| 4    | Phase 3                                                         |
| 5    | Phase 4 + Phase 5 listing; first manual publish                 |
| 6    | Phase 6 CI publishing; buffer for review feedback and fixes     |

---

## 13. Risks and mitigations

| Risk                                                              | Likelihood | Impact                     | Mitigation                                                                                                                             |
| ----------------------------------------------------------------- | ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Global PAT retirement (1 Dec 2026) breaks `vsce` token publishing | Certain    | Publishing blocked         | Manual VSIX upload first; Entra ID (`--azure-credential`) in CI; never rely on a PAT.                                                  |
| The worker, lazy chunks or WASM fail inside the webview CSP       | Medium     | Slower or missing diagrams | Phase 0 spike; fallbacks in section 4.4 (in-thread render, no splitting, Graphviz placeholder).                                        |
| Looks like "another Markdown preview"                             | High       | Low adoption               | Lead with the doctor-in-Problems, diagrams and security story; strong screenshots; compare against the built-in preview in the README. |
| Keybinding conflicts with VS Code                                 | Medium     | Annoying UX                | Scoped `when` clauses; no ⌘K palette; manual QA on all OSes.                                                                           |
| Workspace settings redirect AI or exfiltrate text                 | Low        | High                       | `application` scope + `restrictedConfigurations` + trust gate + origin-bound key (section 6).                                          |
| Forks (Cursor, VSCodium) lag the VS Code API                      | Medium     | Install fails              | Conservative `engines.vscode` (^1.90.0); test those forks in QA.                                                                       |
| Two product surfaces double maintenance                           | High       | Slower releases            | Shared engine and components; `PreviewApp` stays thin; one version, one tag, one CHANGELOG.                                            |
| Name collision on the Marketplace                                 | Low/Med    | Rename late                | Check and reserve in Phase 0.                                                                                                          |
| Remote development path or URI bugs                               | Medium     | Broken images and links    | `workspace.fs` and `asWebviewUri` only; Remote rows in QA.                                                                             |
| VSIX size                                                         | Low        | Slow install               | Bundle, exclude CodeMirror and maps, size check in CI.                                                                                 |

---

## 14. Decisions needed from you

| #   | Decision                                           | Recommendation                                                                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Publisher ID (permanent; becomes `<id>.markscope`) | `abdallahsaeed` (personal; safe even if more extensions follow) or `markscope` (product-branded). Reserve it on **both** the Marketplace and Open VSX. |
| D2  | Display name                                       | "Markscope", if free; the subtitle carries the keywords ("Markdown Reader, Diagrams & Doctor").                                                        |
| D3  | Editing inside Markscope in v1?                    | **No.** Native editor + synced preview; the Reader is read-only. Revisit after feedback.                                                               |
| D4  | AI in v1 or v1.1?                                  | **v1.1**, together with the `vscode.lm` provider. v1 ships faster with less security surface to review.                                                |
| D5  | Versioning                                         | One shared version; VS Code debuts in the next minor (for example 1.1.0); one tag ships everything.                                                    |
| D6  | Default palette                                    | Markscope OKLCH palette by default, with an optional "editor" palette that follows the VS Code theme (Phase 7).                                        |
| D7  | Web extension (vscode.dev) in v1?                  | **No**, Phase 7. Keep `workspace.fs`-only code paths so it stays cheap later.                                                                          |
| D8  | Publish to Open VSX on day one?                    | **Yes.** It reaches Cursor, VSCodium and Windsurf users, costs nothing, and uses the same VSIX.                                                        |

---

## 15. References

- VS Code: Publishing Extensions (vsce, Entra ID, `--azure-credential`): <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- VS Code: Webview API (CSP, `asWebviewUri`, `localResourceRoots`, serializer): <https://code.visualstudio.com/api/extension-guides/webview>
- VS Code: Custom Editors: <https://code.visualstudio.com/api/extension-guides/custom-editors>
- VS Code: Workspace Trust for extensions: <https://code.visualstudio.com/api/extension-guides/workspace-trust>
- VS Code: Testing extensions (`@vscode/test-cli`): <https://code.visualstudio.com/api/working-with-extensions/testing-extension>
- VS Code: Web extensions: <https://code.visualstudio.com/api/extension-guides/web-extensions>
- VS Code: Language Model API: <https://code.visualstudio.com/api/extension-guides/language-model>
- Azure DevOps: retirement of global PATs (creation blocked 15 Mar 2026, decommissioned 1 Dec 2026): <https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops>
- Open VSX: Publishing Extensions (wiki): <https://github.com/eclipse/openvsx/wiki/Publishing-Extensions>
- Open VSX: Publisher Agreement FAQ: <https://www.eclipse.org/legal/open-vsx-registry-faq/>
