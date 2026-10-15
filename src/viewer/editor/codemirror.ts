/**
 * CodeMirror 6 implementation of the editor. Loaded with `import()` the
 * first time the Edit view opens, so reading never pays for it.
 */
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
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
import { tags as t } from '@lezer/highlight'
import type { CreateEditor, EditorCallbacks } from './adapter'
import { minimalChange } from './diff'

/** Marks transactions made by `setValue`, which must not count as user edits. */
const programmatic = Annotation.define<boolean>()

/** Colors come from tokens.css, so light/dark switch without reconfiguring. */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--paper-2)',
    color: 'var(--ink)',
    fontSize: '13.5px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
  '.cm-content': { padding: '28px 0 80px', caretColor: 'var(--accent)' },
  '.cm-line': { paddingInline: '4px 24px' },
  '.cm-gutters': {
    backgroundColor: 'var(--paper-2)',
    color: 'var(--ink-3)',
    border: 'none',
    paddingInlineStart: '8px',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--accent-soft) 40%, transparent)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--accent-soft)' },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in oklch, var(--accent-soft) 60%, transparent)',
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--accent-soft)',
    outline: '1px solid var(--rule-strong)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-ui)',
  },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--rule)' },
  '.cm-textfield': {
    backgroundColor: 'var(--paper-2)',
    color: 'var(--ink)',
    border: '1px solid var(--rule-strong)',
    borderRadius: '4px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--paper-3)',
    color: 'var(--ink)',
    border: '1px solid var(--rule-strong)',
    borderRadius: '4px',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--accent-soft)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    outline: '1px solid var(--accent)',
  },
})

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--hl-title)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--hl-string)' },
  { tag: t.quote, color: 'var(--ink-2)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--ink-3)' },
  { tag: [t.meta, t.labelName], color: 'var(--hl-meta)' },
  { tag: t.comment, color: 'var(--hl-comment)' },
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: t.atom, color: 'var(--hl-number)' },
])

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
    // Tab indents; Esc then Tab still moves focus out (no keyboard trap).
    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
    EditorView.contentAttributes.of({
      'aria-label': 'Markdown source editor',
      spellcheck: 'false',
    }),
    theme,
    EditorView.updateListener.of(update => {
      if (
        update.docChanged &&
        !update.transactions.some(tr => tr.annotation(programmatic))
      )
        callbacks.onChange()
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

  return {
    getValue: () => view.state.doc.toString(),
    setValue(next, opts) {
      if (opts?.resetHistory) {
        view.setState(EditorState.create({ doc: next, extensions: exts }))
        view.scrollDOM.scrollTop = 0
        return
      }
      const change = minimalChange(view.state.doc.toString(), next)
      if (change) view.dispatch({ changes: change, annotations: programmatic.of(true) })
    },
    focus: () => view.focus(),
    topVisibleLine() {
      const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop
      const block = view.lineBlockAtHeight(Math.max(0, top))
      return view.state.doc.lineAt(block.from).number
    },
    destroy() {
      view.scrollDOM.removeEventListener('scroll', callbacks.onScroll)
      view.destroy()
    },
  }
}
