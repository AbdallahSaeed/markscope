# Chrome Web Store Listing — Markscope

> Last Updated: 2026-10-09

## Store Listing

**Extension Name**
Markscope — Markdown Reader for Developers

**Short Description** (114/132)
Fast, secure Markdown viewer: GFM, Mermaid, math, outline, search, live reload, document doctor and optional AI.

**Detailed Description**

Markscope turns any Markdown file you open in Chrome into a clean, navigable document, built for developers who read READMEs, specs, runbooks and changelogs all day.

Opens Markdown automatically
• Files ending in .md, .markdown, .mdx and similar open formatted, from websites and from your computer
• GitHub, GitLab and Bitbucket file pages open as formatted Markdown in one click
• Drag a file into the window, or open one from disk; it refreshes when you save it

Reads beautifully
• Tables, task lists, footnotes, emoji and GitHub-style note/tip/warning boxes
• Colored code with one-click copy and optional line numbers
• Flowcharts and diagrams written in Mermaid or Graphviz, plus math formulas
• Light, dark or system theme; choose typeface, size, line spacing and page width

Navigate like in your editor
• An outline of headings that follows you as you read
• Command palette (Ctrl/⌘ K) and keyboard shortcuts for everything
• Find text in the document, jump between headings, follow links between documents
• Edit with a live preview, or view the source with line numbers

Keeps documentation healthy
• Document Doctor lists broken in-page links, missing images, skipped heading levels, missing image descriptions and TODO notes
• Word count, reading time and other statistics
• Save as HTML or Markdown, or print to PDF

Optional AI assistant (off by default, bring your own key)
Summarize, outline or review a document, explain code or selected text, ask questions, or draw a diagram. Works with Anthropic Claude, OpenAI, a model running on your own computer, or any compatible service. Your text goes directly to the service you choose, never to us.

How to use
1. Open any Markdown link or file; it appears formatted automatically.
2. To read files on your computer, open Markscope's details in chrome://extensions and turn on "Allow access to file URLs".
3. Click the toolbar icon for quick settings and recent documents.

Privacy
No analytics, no tracking, no ads. Scripts inside Markdown files never run. Documents stay in your browser unless you choose to use the AI assistant.

Support: open an issue in the project repository.

**Category**: Developer Tools
**Single Purpose**: Displays Markdown documents as formatted, navigable pages in the browser.
**Primary Language**: English

## Graphics & Assets

| Asset | Size | File |
| --- | --- | --- |
| Store icon | 128×128 | `src/icons/icon-128.png` |
| Screenshots | 1280×800 | `docs/store/screenshots/1-…6-*.png` (`node scripts/screenshots.mjs`) |
| Small promo tile | 440×280 | `docs/store/promo-440x280.png` |

### Screenshot Notes
1. Feature tour in light theme: headings, outline, callouts
2. Mermaid and Graphviz diagrams
3. Command palette
4. Edit view with live preview and the Doctor tab
5. Code in dark theme
6. Start page with recents and favorites

## Permissions Justification

| Permission | Justification |
| --- | --- |
| Content scripts on Markdown URLs (`*://*/*.md`, `file:///*.md`, …) | Detects pages whose address ends in a Markdown extension and whose content is plain text, reads that text and opens it formatted. Because Markdown files can live on any website, the pattern must cover all hosts; Chrome therefore shows "Read and change your data on all websites". The script reads nothing on other pages and never modifies web pages except to show an optional "Open in Markscope" button on Markdown text pages. |
| `storage` | Saves the user's settings, recent and favorite documents, and briefly passes a document's text from the page to the viewer tab. |
| `activeTab` | When the user clicks "Render as Markdown" in the popup, reads the text of that one tab only. |
| `scripting` | Used with activeTab to read that tab's text, and to enable detection on extra sites the user explicitly adds in Settings. |
| `contextMenus` | Adds "Open link in Markscope" for Markdown links and "Open this file in Markscope" on GitHub/GitLab/Bitbucket file pages. |
| Optional host permissions (`http://*/*`, `https://*/*`) | Never granted at install. Requested for a single site only when the user adds that site in Settings, configures an AI service address, or has limited Markscope's site access and wants to reload a document from that site. |

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No.

- Website content: processed locally to display it. Sent to a third party only if the user runs an AI action, and only to the AI service the user configured.
- Settings are stored with `chrome.storage.sync`, so Chrome syncs them through the user's Google account if browser sync is enabled. They contain display preferences only, never document content or API keys.
- Recent documents (addresses and titles), local documents and an optional AI key stay in this browser's local extension storage.

### Data Use Certification
- [x] Not sold to third parties
- [x] Not used or transferred for purposes unrelated to the single purpose
- [x] Not used or transferred to determine creditworthiness or for lending

## Privacy Policy
**Privacy Policy URL**: https://abdallahsaeed.github.io/markscope/privacy.html

## Distribution
**Visibility**: Public
**Regions**: All regions

## Developer Info
**Publisher Name**: Abdallah Saeed
**Contact Email**: _TODO (must be monitored)_
**Support URL**: https://github.com/AbdallahSaeed/markscope/issues
**Homepage URL**: https://abdallahsaeed.github.io/markscope/

## Version History
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-09 | First release |

## Review Notes
Test steps for reviewers: install, open `https://raw.githubusercontent.com/github/docs/main/README.md` (it opens formatted), press Ctrl/⌘ K for commands, and open the toolbar popup. AI features are off by default and require the reviewer's own API key.

### Known Issues / Limitations
- Local files need "Allow access to file URLs".
- Firefox build is experimental.

### Rejection History
None yet.
