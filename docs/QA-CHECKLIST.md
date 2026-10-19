# Markscope manual / browser-agent QA checklist

Use this for a pass in a real Chrome profile with Markscope loaded unpacked
from `dist/chrome`, either by hand or with a browser agent such as Claude in
Chrome. Every step lists the action and the expected result. Record
PASS/FAIL plus notes for each.

**Prerequisites.** `npm run build`, then load `dist/chrome` unpacked at
`chrome://extensions` and enable **Allow access to file URLs**. Serve the
fixtures with CORS so remote features can be exercised:

```bash
cd tests/e2e/site && npx --yes http-server -p 8765 --cors -c-1
# or use any public raw URL, e.g. https://raw.githubusercontent.com/github/docs/main/README.md
```

Find the extension ID at `chrome://extensions` (Markscope → ID) and use it as
`<ID>` below.

## 1. Detection and rendering
1. Open `http://127.0.0.1:8765/guide.md` → the URL becomes `chrome-extension://<ID>/viewer.html?src=…`, the heading "Guide" renders, and the tab title is "Guide · Markscope".
2. The status bar (bottom) shows words, read time, lines and ms.
3. Press **Back** → the raw text page shows a small "Open in Markscope" banner (no redirect loop).
4. Open a GitHub file page (e.g. `https://github.com/github/docs/blob/main/README.md`), click the toolbar icon, then **Open in Markscope** → the raw README renders.

## 2. Reading features
5. The `[[toc]]` box lists Installation, Usage and Reference.
6. Code block: hover → **Copy** → paste somewhere → `console.log('copy me')`.
7. Mermaid and Graphviz blocks become diagrams after scrolling to them, in both light and dark themes.
8. The `E = mc^2` display formula renders with KaTeX.
9. The TIP alert renders as a green callout titled "Tip".
10. Click the broken image → it shows a placeholder with "Broken image".
11. Click an image (any document with images) → a lightbox opens; Esc closes it.

## 3. Navigation
12. Click **Reference** in the outline → it scrolls there and the URL ends with `#reference`.
13. Scroll the document with the mouse wheel top → bottom → it scrolls smoothly, is never pulled back, the sidebar stays pinned under the toolbar, and the active outline entry follows.
14. Press **J** / **K** → next/previous heading.
15. Click "the other doc" → `other.md` opens in the viewer at "Details".

## 4. Search and command palette
16. Press **/**, type `needle`, Enter → counter "1/2"; Enter → "2/2"; matches are highlighted; Esc closes.
17. Press **Ctrl/⌘ K**, type `source view`, Enter → Source view with line numbers.
18. Ctrl/⌘ K, type `#usage` → the heading result jumps to Usage.

## 5. Views and editing
19. Press **2** → Edit view: type in the editor → the preview updates live; the status shows "Edited · ⌘S to save" and a **Save** button appears.
19a. Open a local file (⌘O), edit it, press ⌘S → Chrome asks once to allow editing → the file on disk is updated and the Save button disappears.
19b. On a web document, edit, then ⌘S → a Save dialog opens; after saving, the URL changes to `?doc=…`, relative links still work, and the next ⌘S saves without a dialog.
19c. In the Edit view: the source is highlighted with line numbers; on a `- item` line press Enter → `- ` continues the list; Tab nests it, Shift+Tab un-nests; ⌘/Ctrl F opens find & replace inside the editor; scrolling the editor scrolls the preview to the same place; Esc then Tab moves focus out of the editor.
19e. In the Edit view, select a word: ⌘/Ctrl B makes it bold and pressing again removes it; ⌘/Ctrl I, ⌘/Ctrl E and ⇧⌘/Ctrl⇧X do italic, code and strikethrough; ⇧⌘/Ctrl⇧K makes a link with `url` selected. Typing `*` over a selection wraps it. Typing `(` inserts `()`. Copy a URL, select text and paste → `[text](url)`. Put the cursor in a messy table and press ⌘⌥/Ctrl Alt T → the columns align. The status bar shows "Ln …, Col …" while editing, and the shortcut help (?) lists the editor commands.
19f. In the Edit view of a long document: scroll the editor → the preview follows; scroll the preview → the editor follows; scroll either to the bottom → the other reaches its bottom. Double-click a preview paragraph → the editor cursor jumps to its line. The preview block for the cursor line is tinted. Drag the divider → the panes resize; reload → the split is kept. Tab to the divider and press ←/→ → it moves in 2% steps; double-click it → back to 50/50. Below 900 px wide the panes stack and the divider is hidden.
19g. Open a local file (⌘O) and edit it without saving. Change the file in another editor, then press ⌘S → a banner says it changed on disk; **Compare…** shows both versions side by side, the arrows copy a change into yours, and **Use my version** applies it; **Overwrite** saves yours; **Load theirs** shows the disk version and its Undo brings your edits back. With live reload on, the same banner appears while you are editing, without pressing Save.
19h. Edit any document without saving, wait a second, then close the tab (confirm leaving) and reopen the document → a banner offers to **Restore** the unsaved edits. Restore → the edits are back and unsaved. Discard them, reopen → no banner. If the document changed in between, the banner offers **Compare…** first.
19d. Edit any document → **Discard** appears next to Save → click → the last saved text returns, Save/Discard hide; the banner's **Undo** brings the edits back. Discard again, click in the editor and press ⌘/Ctrl Z → the edits also come back.
19c. Reload the viewer of a saved/opened local file with live reload on → a "Reconnect" banner appears (no console error); click it → live reload resumes.
20. Press **1** → Read view. **3** → Source view.
21. Start page (Shift+H) → **Scratch document** → type, reload → the content persists.
22. Start page → **Feature tour** → the full showcase renders.
23. Drag a local `.md` file onto the window → it opens; edit and save the file on disk with live reload on → the view updates.
23a. Start page → **Open folder…** (or ⇧⌘O) → pick this repo → README renders **with its logo image**; the **Files** tab lists Markdown files (no node_modules); clicking a doc link opens it without a page reload; Back/Forward work; ⌘K → type a file name → opens it.
23b. Open `README.md` via **Open file** (⌘O) → the logo shows an "open the folder" placeholder and a banner; click it, pick the repo folder → the same README reopens from the folder with the image.
23d. Open a folder that has **no** Markdown files → an overview card ("No Markdown files in …", file counts and types) and the Files tab listing every file, dimmed, not clickable; in a Markdown folder, "Show all files" toggles the same listing.
23e. Toolbar home icon (next to ☰) → start page.
23c. Reload a folder document → "Reconnect" card → click → Chrome asks for access → the document returns.

## 6. Appearance and settings
24. Press **T** repeatedly → system → light → dark; Mermaid re-themes.
25. Options page: set Content width "Wide" and Font size 18 → the open viewer updates without reload.
26. Options: enable "Line numbers in code blocks" → gutters appear in the viewer.
27. Options → Privacy → "Click to load" → third-party images become "Load image from …" buttons.
28. Reload the viewer → all settings persist. Restart Chrome → settings, recents and favorites persist.

## 7. Doctor and info
29. Sidebar → **Doctor** → lists "Anchor #does-not-exist…" and "Image failed to load"; clicking an issue scrolls to the line.
30. Sidebar → **Info** → words, reading time and render time.

## 8. Export and print
31. ⋯ menu → Export as HTML → `Guide.html` downloads; open it with Wi-Fi off → diagrams are styled (not black boxes), math renders, code shows a language label, links to other .md files point at the original files.
32. ⋯ → Export as Markdown → `Guide.md` downloads.
33. Ctrl/⌘ P (in **dark** theme too) → the preview is light and readable, has margins, no front matter, diagrams rendered in light colors, external links show their URL.

## 9. Live reload
34. ⋯ → enable Live reload; edit `tests/e2e/site/guide.md` on disk → the viewer updates within ~2 s and keeps the scroll position.

## 10. Security
35. Open `http://127.0.0.1:8765/malicious.md` (copy `tests/fixtures/malicious.md` into the served folder) → no alert or dialog, no navigation away, the red "overlay" stays inside the article and the toolbar remains clickable.
36. DevTools console on the viewer → no CSP violations except blocked third-party resources, if any.

## 11. Popup
37. Toolbar icon on a viewer tab → "Viewing in Markscope"; toggles work; recent list opens documents.
38. On a non-Markdown text page → **Render as Markdown** renders it.

## 12. AI (optional; needs a key or a local model)
39. Options → AI: enable, choose provider, save key, **Test connection** → "✓ Connected".
40. Viewer → **A** → Summarize → a streamed answer appears; **Stop** mid-stream works; a follow-up question keeps context.
41. Select text → **E** → "Explain selection". Code block → **Explain**.
42. AI output containing an image URL shows "[image not loaded: …]".

## 13. Responsive and accessibility
43. Resize to 375 px wide → no horizontal scroll; the sidebar becomes a drawer (B toggles it).
44. Tab through the toolbar → visible focus rings; every icon button has a tooltip/name.
45. Press **?** → the shortcuts dialog opens; Esc closes it.

## 14. VS Code extension

Install the `.vsix` (`code --install-extension release/markscope-<version>.vsix`) and use a folder with Markdown files, images and a Mermaid diagram.

46. Open a `.md` file → **Markscope: Open Preview to the Side** (and the editor-title button) → the preview opens beside it. Typing updates it within a moment; the status bar and Info tab show words and reading time.
47. Scroll the editor → the preview follows; scroll the preview → the editor follows; neither jitters. Double-click a paragraph in the preview → the cursor jumps to its line. Moving the cursor highlights its block.
48. A file with a broken `#anchor` link and a missing image → the **Problems** panel lists them on the right lines; fixing the file clears them; closing the preview clears them.
49. Open another Markdown file → the unlocked preview follows. **Toggle Preview Lock** → the tab shows 🔒 and no longer follows. Open a `.txt` file → nothing changes.
50. A relative link to another `.md` file (with `#heading`) opens it in the preview at that heading (or in the editor with `markscope.preview.openMarkdownLinks`). A relative image shows. `../../outside.md` and an image symlinked outside the folder do not open or show.
51. A web link asks VS Code to open it (trusted-domain prompt on first use). A `command:` or `vscode:` link does nothing.
52. Light, dark, **high contrast** and **high contrast light** themes: the preview matches, with visible borders and focus rings in high contrast. Switching theme while a Mermaid diagram is shown re-themes it.
53. `markscope.images.remote` = `block` → a web image shows a "Load image" placeholder and no request is made (check the webview's DevTools: **Developer: Open Webview Developer Tools**). Console: no CSP violations.
54. Reload the window (**Developer: Reload Window**) → the preview comes back on the same file, with the lock state.
55. A 5 MB Markdown file and one with 20 Mermaid diagrams → the editor stays responsive.
56. Remote: repeat 46–50 over WSL, Remote-SSH and a Dev Container. Windows: a path with spaces and a drive letter. Untitled (unsaved) Markdown previews, with a hint that relative images need a saved file.
57. Untrusted workspace (Restricted Mode) → the preview still renders; workspace settings that enable raw HTML, diagrams or remote images are ignored.
58. **Markscope: Export as HTML** → a save dialog; the saved file opens offline with diagrams, math and code highlighting, and the browser's network panel shows no requests.
59. **Markscope: Open in Reader** (and Reopen Editor With… → Markscope Reader) → a full tab with outline and search; it is read-only, titled with the file name, and Problems still show. Markdown still opens in the text editor by default.
60. The status bar shows `N words · M min` (and a warning count when the doctor finds problems) while a preview is visible; clicking it opens Problems. It disappears when no preview is visible.
61. **Markscope: Copy Rendered HTML** → paste into a text editor: an HTML fragment (no `<html>` wrapper, no viewer chrome), diagrams as SVG.
62. AI (needs a key or a local model): in User settings set `markscope.ai.enabled`, the provider (and base URL for a local/custom endpoint), then **Markscope: Set AI API Key**. The preview shows the AI button; **A** opens the panel; Summarize streams an answer; **Stop** works. Setting `markscope.ai.baseUrl` in a *workspace* `.vscode/settings.json` has no effect. In Restricted Mode the assistant is off and a request shows an untrusted-workspace message.
63. **Markscope: Clear AI API Key** removes the key; the next request says the key is missing. A key saved for one provider is not sent after switching to another endpoint.
64. A README link to a source file opens it in the editor; `file.ts#L10` selects line 10 and `#L10-L20` the range; a link to a folder reveals it in the Explorer; `../../outside.txt` does nothing but show a notice.
