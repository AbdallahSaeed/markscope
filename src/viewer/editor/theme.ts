/**
 * CodeMirror theme and Markdown highlight style, shared by the editor and
 * the merge (compare) dialog. Colors come from tokens.css, so light/dark
 * switch without reconfiguring.
 */
import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const editorTheme = EditorView.theme({
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

export const markdownHighlight = HighlightStyle.define([
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
