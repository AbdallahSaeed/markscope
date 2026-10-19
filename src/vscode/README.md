# Markscope for VS Code

A fast, secure Markdown preview for developers. Diagrams, math, an outline, and a **documentation doctor that reports problems in the Problems panel**.

![Markscope preview next to the editor](https://raw.githubusercontent.com/AbdallahSaeed/markscope/main/docs/store/screenshots/1-reader-light.png)

## Why Markscope

- **Diagrams that just work**: Mermaid and Graphviz, loaded only when a document uses them.
- **Math and more**: KaTeX, GitHub alerts, `::: tip` callouts, footnotes, front matter, `[[toc]]`.
- **Document doctor**: broken anchors, missing images, heading-level jumps, duplicate headings, empty links, missing alt text and TODO/FIXME show up as real problems on the right line.
- **Reader features**: outline with scrollspy, find in preview, image lightbox, focus mode, reading stats.
- **Stays in step with your editor**: the preview updates as you type, scrolls with the editor (and the editor with the preview), and double-clicking a block jumps to its source line.
- **Secure by design**: the preview never runs code from your document. HTML is sanitized, the content security policy blocks scripts, and remote images can be blocked entirely.

## Use it

1. Open a Markdown file.
2. Run **Markscope: Open Preview to the Side** (or click the preview button in the editor title bar).

| Command                                            | What it does                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Markscope: Open Preview / Open Preview to the Side | Open the preview in this column or beside the editor                |
| Markscope: Toggle Preview Lock                     | Keep the preview on its file instead of following the active editor |
| Markscope: Find in Preview                         | Search the rendered document (`Ctrl/⌘ F` in the preview)            |
| Markscope: Toggle Outline                          | Show or hide the outline sidebar (`B`)                              |
| Markscope: Toggle Focus Mode                       | Distraction-free reading (`Z`)                                      |
| Markscope: Run Document Doctor                     | Re-check the document                                               |
| Markscope: Export as HTML                          | Save the rendered document as one self-contained HTML file          |
| Markscope: Open in Reader                          | Read a file in a full tab (also under Reopen Editor With…)          |

In the preview: `J` / `K` jump between headings, `/` finds, `B` toggles the outline, `Z` is focus mode.

## Settings

Search for **Markscope** in Settings. Highlights:

- `markscope.theme`: follow the VS Code theme (default, including high contrast), or force light or dark.
- `markscope.images.remote`: `allow` or `block` images from the web.
- `markscope.preview.openMarkdownLinks`: open links to other Markdown files in the preview or in the editor.
- `markscope.preview.updateOn`: refresh while typing, or only on save.
- `markscope.markdown.*`, `markscope.code.*`, `markscope.typography.*`: what is rendered and how it looks.

## Privacy and security

Markscope has no telemetry and no server. It makes no network requests of its own; the only requests are the images a document references, and you can block those with `markscope.images.remote`. Links to other files open only inside your workspace folder. See the [privacy policy](https://abdallahsaeed.github.io/markscope/privacy.html).

## Also in your browser

Markscope is also a browser extension (Chrome, Edge, Firefox) that turns any Markdown URL into a navigable document: <https://abdallahsaeed.github.io/markscope/>.

[Report an issue](https://github.com/AbdallahSaeed/markscope/issues) · [Source](https://github.com/AbdallahSaeed/markscope) · MIT license
