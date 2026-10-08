# Publishing Markscope

## Artifacts

`npm run release` produces:

- `release/markscope-<version>-chrome.zip`: Chrome Web Store and Microsoft Edge Add-ons
- `release/markscope-<version>-firefox.zip`: Firefox Add-ons (experimental)
- `release/SHA256SUMS.txt`

Versioning follows SemVer; `package.json` `version` is copied into the manifest.

## Chrome Web Store

1. Developer account: https://chrome.google.com/webstore/devconsole (one-time US$5 registration, 2-step verification).
2. **New item** → upload the chrome zip.
3. Fill the listing from `CHROMEWEBSTORE.md` (the source of truth; `docs/store/listing.md` is a shorter summary): description, category, screenshots, 128 px icon, promo tile.
4. **Privacy practices**: single purpose, permission justifications, data disclosure, privacy-policy URL.
5. Submit for review. Expect a longer review, because of content scripts on all hosts for `*.md` and the optional host permissions.

## Microsoft Edge Add-ons

1. Partner Center: https://partner.microsoft.com/dashboard/microsoftedge (free).
2. Upload the same chrome zip and reuse the listing text and assets.

## Firefox Add-ons (experimental)

1. https://addons.mozilla.org/developers/: upload the firefox zip.
2. Source code submission: AMO requires the source for minified bundles. Upload the repo zip with build instructions (`npm ci && npm run build:firefox`).
3. Known gaps: Firefox opens many `text/markdown` responses as downloads; `file://` access differs from Chromium; File System Access handles are unavailable.

## Manual steps that need you

- [ ] Create or verify the developer accounts above (payment and identity are required).
- [ ] Fill the `_TODO_` publisher, contact email and URLs in `CHROMEWEBSTORE.md`.
- [ ] Host the privacy policy (`docs/PRIVACY.md`) at a public URL.
- [ ] Review the generated screenshots in `docs/store/screenshots/` and choose 1 to 5.
- [ ] Create a public Git remote (e.g. GitHub `markscope`) and push; tag `v1.0.0`.
- [ ] Submit each listing and respond to reviewer questions.
- [ ] Optional: reserve the `markscope` name and domain before announcing.


## URLs for the store forms

| Field | Value |
| --- | --- |
| Website / homepage | https://abdallahsaeed.github.io/markscope/ |
| Privacy policy | https://abdallahsaeed.github.io/markscope/privacy.html |
| Support | https://github.com/AbdallahSaeed/markscope/issues |
| Source code (AMO) | https://github.com/AbdallahSaeed/markscope (or the `-source.zip` attached to each GitHub Release) |

## Automated publishing (after the first manual submission)

The **Release** workflow (`.github/workflows/release.yml`) runs on tags `v*`. It always creates a GitHub Release. Store jobs run only when these repository **secrets** exist (Settings → Secrets and variables → Actions). Never paste them into issues or chat.

| Secret | Where to get it |
| --- | --- |
| `CHROME_EXTENSION_ID` | The item ID shown in the Chrome Web Store dashboard after the first manual upload |
| `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | A Google Cloud OAuth client with the Chrome Web Store API enabled ([guide](https://developer.chrome.com/docs/webstore/using-api)) |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | addons.mozilla.org → Tools → Manage API Keys |

After a listing is approved, set the repository **variables** `CHROME_STORE_URL` and `FIREFOX_STORE_URL`. The website's install buttons then switch from the release zip to the store pages on the next deploy.

## Notes for Mozilla reviewers

- Bundled third-party libraries (Mermaid, DOMPurify, KaTeX, highlight.js, markdown-it, viz.js) trigger generic `innerHTML` / `Function` lint warnings. The extension CSP is `script-src 'self' 'wasm-unsafe-eval'` without `'unsafe-eval'`, so `eval`/`Function` cannot execute, and all document HTML is sanitized by DOMPurify before insertion.
- Build from source: `npm ci && npm run build:firefox` → `dist/firefox` (Node 22).
- `data_collection_permissions`: required `none`; optional `websiteContent`, requested at runtime only when the user enables the optional AI assistant (document text is sent only to the provider endpoint the user configures).
