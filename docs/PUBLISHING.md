# Publishing Markscope

## Artifacts

`npm run release` produces:

- `release/markscope-<version>-chrome.zip`: Chrome Web Store and Microsoft Edge Add-ons
- `release/markscope-<version>-firefox.zip`: Firefox Add-ons (experimental)
- `release/markscope-<version>.vsix`: VS Code Marketplace and Open VSX
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

## VS Code Marketplace and Open VSX

`npm run package:vscode` (after `npm run build:vscode`, or as part of `npm run release`) writes `release/markscope-<version>.vsix` and fails above 10 MB. One `.vsix` goes to both registries. The publisher id comes from `VSCODE_PUBLISHER` (default `AbdallahSaeed` in `scripts/build-vscode.mjs`; it must match the publisher id exactly, and the Open VSX namespace must be the same).

### Accounts (once, by you)

1. **Marketplace:** sign in at https://marketplace.visualstudio.com/manage with a Microsoft account and **create a publisher**. The id is permanent and becomes the extension id `<publisher>.markscope-reader`. Check first that the display name "Markscope" is free.
2. **Open VSX:** create an Eclipse account (put your GitHub username in its profile), sign in at https://open-vsx.org with GitHub, **sign the Open VSX Publisher Agreement** from your profile (this is not the ECA), and create an access token. Then `npx ovsx create-namespace <publisher> -p <token>`; the namespace must equal the publisher id. A namespace does not give exclusive rights: **claim it** (an issue in `EclipseFdn/open-vsx.org`) to get the verified badge.

**Every upload needs a new `package.json` version** (the Marketplace refuses a repeated one, and VS Code does not restart an extension that is replaced at the same version, which leaves the old code running next to new webview files).

### First release (manual)

1. `npm run release`, then install `release/markscope-<version>.vsix` locally and run section 14 of `docs/QA-CHECKLIST.md` in VS Code (and Cursor or VSCodium).
2. Marketplace: publisher page → **New extension → Visual Studio Code** → upload the `.vsix` (no token needed).
3. Open VSX: `npx ovsx publish release/markscope-<version>.vsix -p <token>`.
4. Set the repository variables `VSCODE_MARKETPLACE_URL` and `OPEN_VSX_URL` once the listings are live.

### Automated publishing

Pushing a tag `vX.Y.Z` runs the **Release** workflow (`.github/workflows/release.yml`). It tests, builds everything (including `release/markscope-<version>.vsix`) and creates the GitHub Release. Its `vscode-marketplace` and `open-vsx` jobs then publish the same `.vsix`, but only if their credentials exist (otherwise they print a skip message). Publishing uses `--skip-duplicate`, so re-running a release never fails because the version is already there.

**Rules for a release.** The tag must equal the `package.json` version, must be on `main`, and every release needs a version nobody has uploaded yet. If you upload a version by hand first, the pipeline's next release must be a higher version.

```bash
# after the PR is merged into main, with package.json at the new version (say 1.1.1)
git checkout main && git pull
git tag v1.1.1 && git push origin v1.1.1
```

#### Visual Studio Marketplace (Microsoft Entra ID, no token to store)

Azure DevOps *global* personal access tokens cannot be created any more and stop working on 1 December 2026, so CI signs in with a managed identity instead. One-time setup:

1. **Create the identity** in the Azure portal (a free Azure account is enough): *Managed Identities → Create*, any resource group and region, name it `markscope-publisher`. Open it and note the **Client ID**, **Tenant ID** and **Subscription ID**.
2. **Federated credential** on that identity: *Federated credentials → Add → GitHub Actions deploying Azure resources*. Organization `AbdallahSaeed`, repository `markscope`, entity **Environment**, environment name `release`. (Use *Environment*, not *Tag*: a tag subject matches only one exact tag.)
3. **GitHub secrets** (repository → Settings → Secrets and variables → Actions): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Create an environment named `release` (Settings → Environments) if it does not exist.
4. **Get the identity's Marketplace id**: run the **Marketplace identity** workflow by hand (Actions tab → *Marketplace identity* → *Run workflow*). It prints a `Marketplace profile id` in the log and the run summary.
5. **Add it to your publisher**: https://marketplace.visualstudio.com/manage → your publisher → *Members* → *Add*, paste that id, role **Contributor**.
6. Push a release tag. The `vscode-marketplace` job logs in with `azure/login` and runs `vsce publish --azure-credential`.

Microsoft documents this for Azure Pipelines only (https://code.visualstudio.com/api/working-with-extensions/publishing-extension); the steps above are the GitHub Actions equivalent and were not yet exercised against a real Azure identity. If step 5 does not accept the id, that is the known fiddly part: check the id printed in step 4 and that the identity's federated credential matches `repo:AbdallahSaeed/markscope:environment:release`.

#### Open VSX

Create the namespace once with the same name as the publisher (`npx ovsx create-namespace AbdallahSaeed -p <token>`) and save the Open VSX access token as the repository secret `OVSX_PAT`. The `open-vsx` job then publishes with the token from the environment.

#### Other stores

The Chrome Web Store and Firefox jobs are described in "Automated publishing of the browser extensions" below.

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

## Automated publishing of the browser extensions (after the first manual submission)

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
