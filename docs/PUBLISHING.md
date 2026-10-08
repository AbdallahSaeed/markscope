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
