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
19c. Reload the viewer of a saved/opened local file with live reload on → a "Reconnect" banner appears (no console error); click it → live reload resumes.
20. Press **1** → Read view. **3** → Source view.
21. Start page (Shift+H) → **Scratch document** → type, reload → the content persists.
22. Start page → **Feature tour** → the full showcase renders.
23. Drag a local `.md` file onto the window → it opens; edit and save the file on disk with live reload on → the view updates.

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
31. ⋯ menu → Export as HTML → `Guide.html` downloads, opens offline and looks like the viewer.
32. ⋯ → Export as Markdown → `Guide.md` downloads.
33. Ctrl/⌘ P → the print preview contains only the document, with diagrams rendered.

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
