# Privacy policy — Markscope

_Last updated: 2026-10-09_

Markscope is a browser extension that displays Markdown documents.

**Data collection.** Markscope does not collect, transmit, sell or share personal data. It contains no analytics, telemetry, advertising or remote code.

**Data stored on your device**

- Settings, in browser sync storage if you are signed in to your browser.
- Recent and favorite documents (URLs, file names and titles), in local extension storage.
- Documents you drop, pick or write in scratch mode, in the extension's IndexedDB.
- Folders you open: a reference to the folder (granted through your browser's folder picker) so you can reopen it from the start page. Files are read on demand to display them and are not copied into storage. You can forget a folder from the start page.
- An AI provider API key, only if you enter one. It is stored in local or session extension storage and is never synced or exported.

You can clear history in **Settings → Privacy**, remove the key in **Settings → AI**, or uninstall the extension to remove everything.

**Network requests.** Markscope loads the documents you open from their own servers, and the images those documents reference (optionally click-to-load).

**Optional AI features.** These are off by default. When you enable them and run an AI action, the current document text (and selection or question) is sent directly from your browser to the AI provider and endpoint you configured: Anthropic, OpenAI, a local model or a custom endpoint. That provider's privacy policy applies. Markscope operates no servers and never sees this data.

**Permissions** are used only as described in the README's Permissions section.

**Contact:** open an issue in the project repository.
