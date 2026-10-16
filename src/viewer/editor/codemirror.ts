/**
 * CodeMirror 6 implementation of the editor. Loaded with `import()` the
 * first time the Edit view opens, so reading never pays for it.
 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Annotation, EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import type { CreateEditor, CursorInfo, EditorCallbacks } from './adapter'
import { minimalChange } from './diff'
import { EDITOR_COMMANDS } from './keymap'
import { wrapSelection, type MarkdownCommand } from './markdown-commands'
import { editorTheme, markdownHighlight } from './theme'

/** Marks transactions made by `setValue`, which must not count as user edits. */
const programmatic = Annotation.define<boolean>()

/** Pairs typed in prose; backticks are left alone so ``` fences type normally. */
const pairs = markdownLanguage.data.of({
  closeBrackets: { brackets: ['(', '[', '{', '"'] },
})

function cursorInfo(state: EditorState): CursorInfo {
  const { main } = state.selection
  const line = state.doc.lineAt(main.head)
  return {
    line: line.number,
    col: main.head - line.from + 1,
    selected: main.to - main.from,
  }
}

/** Applies a pure Markdown command to the main selection as one undoable step. */
function applyCommand(view: EditorView, command: MarkdownCommand): boolean {
  const { main } = view.state.selection
  const edit = command(view.state.doc.toString(), { from: main.from, to: main.to })
  if (!edit) return false
  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection.from, head: edit.selection.to },
    scrollIntoView: true,
    userEvent: 'input.format',
  })
  return true
}

const formattingKeymap = keymap.of(
  EDITOR_COMMANDS.map(spec => ({
    key: spec.key,
    run: (view: EditorView) => applyCommand(view, spec.command),
    // Never fall through to the browser (e.g. ⌘B/⌘I in some browsers).
    preventDefault: true,
  })),
)

/** Typing `*`, `_`, `~` or `` ` `` over a selection wraps it. */
const wrapOnType = EditorView.inputHandler.of((view, from, to, text) => {
  const { ranges, main } = view.state.selection
  if (ranges.length !== 1 || main.from !== from || main.to !== to) return false
  const edit = wrapSelection(view.state.doc.toString(), main, text)
  if (!edit) return false
  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection.from, head: edit.selection.to },
    userEvent: 'input.type',
  })
  return true
})

function extensions(callbacks: EditorCallbacks): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    // GFM; its keymap continues lists/quotes on Enter and removes markup on Backspace.
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(markdownHighlight),
    closeBrackets(),
    pairs,
    wrapOnType,
    // Before the defaults: ⌘I is italic here, not "select parent syntax".
    formattingKeymap,
    // Tab indents; Esc then Tab still moves focus out (no keyboard trap).
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({
      'aria-label': 'Markdown source editor',
      spellcheck: 'false',
    }),
    editorTheme,
    EditorView.updateListener.of(update => {
      if (
        update.docChanged &&
        !update.transactions.some(tr => tr.annotation(programmatic))
      )
        callbacks.onChange()
      if (update.docChanged || update.selectionSet)
        callbacks.onCursor(cursorInfo(update.state))
    }),
  ]
}

export const createCodeMirror: CreateEditor = (parent, text, callbacks) => {
  const exts = extensions(callbacks)
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: text, extensions: exts }),
  })
  view.scrollDOM.addEventListener('scroll', callbacks.onScroll, { passive: true })
  callbacks.onCursor(cursorInfo(view.state))

  return {
    getValue: () => view.state.doc.toString(),
    setValue(next, opts) {
      if (opts?.resetHistory) {
        view.setState(EditorState.create({ doc: next, extensions: exts }))
        view.scrollDOM.scrollTop = 0
        callbacks.onCursor(cursorInfo(view.state))
        return
      }
      const change = minimalChange(view.state.doc.toString(), next)
      if (change) view.dispatch({ changes: change, annotations: programmatic.of(true) })
    },
    focus: () => view.focus(),
    topLine() {
      const height = Math.max(
        0,
        view.scrollDOM.getBoundingClientRect().top - view.documentTop,
      )
      const block = view.lineBlockAtHeight(height)
      const line = view.state.doc.lineAt(block.from).number
      const frac = block.height > 0 ? (height - block.top) / block.height : 0
      return line + Math.min(1, Math.max(0, frac))
    },
    scrollToLine(line) {
      const doc = view.state.doc
      const n = Math.min(doc.lines, Math.max(1, Math.floor(line)))
      const block = view.lineBlockAt(doc.line(n).from)
      // Where the document starts inside the scroller (content padding etc.).
      const docStart =
        view.documentTop -
        view.scrollDOM.getBoundingClientRect().top +
        view.scrollDOM.scrollTop
      view.scrollDOM.scrollTop = docStart + block.top + (line - n) * block.height
    },
    revealLine(line) {
      const doc = view.state.doc
      const pos = doc.line(Math.min(doc.lines, Math.max(1, Math.round(line)))).from
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        userEvent: 'select',
      })
      view.focus()
    },
    lineCount: () => view.state.doc.lines,
    length: () => view.state.doc.length,
    scrollElement: () => view.scrollDOM,
    run: command => applyCommand(view, command),
    destroy() {
      view.scrollDOM.removeEventListener('scroll', callbacks.onScroll)
      view.destroy()
    },
  }
}
