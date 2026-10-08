# Security model

## Threats considered

1. A malicious Markdown file: XSS, phishing UI, tracking, prompt injection.
2. A malicious web page talking to the extension (forged messages).
3. Exfiltration of AI API keys.
4. A crafted settings file imported by the user.
5. Dependency vulnerabilities.

## Controls

| Threat | Control | Where |
| --- | --- | --- |
| Script execution from Markdown | Rendering happens in an extension page; CSP `script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; form-action 'none'` | `scripts/manifest.mjs` |
| HTML injection | DOMPurify forbids script, style, link, meta, base, iframe, object, embed, form, button, textarea, select, template, dialog, SVG image/use/feImage. Event handlers, `srcdoc`, `formaction`, `poster`, `xlink:href` and `data-*` are removed. Inputs other than disabled checkboxes are removed | `src/engine/sanitize.ts` |
| CSS tracking and UI redress | Inline `style` limited to layout-neutral properties, with no `url()`, `var()` or `image-set`. `.ms-doc` uses `contain: layout paint` so fixed-position content stays inside the article | `sanitize.ts`, `styles/document.css` |
| Unsafe URLs | Links: http(s), mailto, tel, and `file:` only for local documents. Media: http(s), blob, `data:image/*`, and `file:` only for local documents. `srcset` resolved per candidate. Invalid links lose their href | `src/shared/urls.ts`, `src/viewer/document-view.ts` |
| Diagram SVG | Mermaid `securityLevel:'strict'`, `htmlLabels:false`, `themeCSS` locked via `secure`. SVG re-sanitized without links, scripts or animation. Mermaid's `<style>` kept only if every rule is scoped to the diagram id and loads nothing | `src/viewer/diagrams.ts` |
| KaTeX | `trust:false` (blocks `\href`, `\url`, `\html*`), `maxSize` and `maxExpand` limits. Mermaid's nested KaTeX forced to the patched version via npm `overrides` | `src/engine/markdown.ts`, `package.json` |
| DOM clobbering | `name` attributes removed (`<a name>` converted to an id); viewer ids reserved; no reliance on named globals | `sanitize.ts` |
| Forged messages | Every message is shape-validated. Senders are classified as content script or extension page. Handoff requires the top frame and the sender's own URL. Claim, render-tab and open-viewer require an extension page. `web_accessible_resources` is empty and there is no `externally_connectable` | `src/shared/messages.ts`, `src/background/router.ts`, `sender.ts` |
| Handoff token theft | 128-bit random, one-time, 5-minute TTL, stored in `storage.session` (trusted contexts only), removed from the URL after use | `src/background/handoff.ts`, `src/viewer/index.ts` |
| API key exfiltration | Key bound to the endpoint origin it was saved for. Never synced, exported or imported. AI settings excluded from imports. https required except loopback. Credentials-free fetches (`credentials:'omit'`). Key read only in the service worker | `src/storage/secrets-store.ts`, `src/shared/settings.ts`, `src/background/ai-service.ts` |
| Prompt injection | Document framed as untrusted data, `</document>`-style breakout neutralized, AI output rendered with `html:false` and sanitized, remote media in answers never loaded, confirmation before the first send per provider | `src/ai/prompts.ts`, `src/viewer/ai-panel.ts` |
| Opened folders | Read-only directory access granted by the user through the native picker. Documents address files as `workspace://<id>/<path>`; standard URL resolution clamps `..` at the folder root, so content can never read outside the picked folder. Folder images load as `blob:` URLs created by the extension; non-Markdown files are never linked | `src/shared/urls.ts`, `src/viewer/workspace.ts`, `src/viewer/folder-session.ts` |
| Least privilege | No `tabs`, `history`, `cookies` or `downloads`. `activeTab` for on-demand rendering. Note: Chrome derives host access per origin from the `*.md` content-script patterns, which is effectively all http(s) origins — inherent to auto-detection. Users who restrict site access get a per-origin grant prompt instead | manifest |
| HTML export | Re-sanitized (diagram figures, already sanitized at render, are re-inserted via unguessable placeholders). The exported file carries a meta CSP `default-src 'none'` and makes no external requests: math is native MathML, no CDN | `src/viewer/export.ts` |

## Residual risks and notes

- `storage.local` holds the API key unencrypted at rest, as every browser extension's storage does. Choose **session-only** key storage for higher assurance.
- `connect-src` is broad (`*`) because documents can come from any origin and AI endpoints are user-defined. Script execution is impossible under the CSP, so injected markup cannot issue requests.
- Remote images in documents load by default (badges are common in READMEs). Enable **Privacy → Click to load** to block third-party tracking pixels.

## Reporting

Please report vulnerabilities privately via the repository's security advisory feature rather than public issues.
