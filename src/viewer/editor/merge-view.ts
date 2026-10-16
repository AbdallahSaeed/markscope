/**
 * Side-by-side compare of the version on disk (read-only, left) and the
 * user's version (editable, right). Arrows between the panes copy a change
 * from disk into the user's version. Lazy-loaded by merge-dialog.ts.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { editorTheme, markdownHighlight } from './theme'

export interface MergeHandle {
  /** The user's (right-hand) text, including changes taken from disk. */
  result(): string
  /** Number of differing chunks left. */
  changes(): number
  destroy(): void
}

const common = [
  lineNumbers(),
  EditorView.lineWrapping,
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(markdownHighlight),
  editorTheme,
]

export function createMergeView(
  parent: HTMLElement,
  disk: string,
  mine: string,
  /** Called after the user's side changes (typing or a copied chunk). */
  onChange: () => void = () => undefined,
): MergeHandle {
  const view = new MergeView({
    a: {
      doc: disk,
      extensions: [
        ...common,
        EditorState.readOnly.of(true),
        EditorView.contentAttributes.of({ 'aria-label': 'Version on disk (read-only)' }),
      ],
    },
    b: {
      doc: mine,
      extensions: [
        ...common,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // Chunks are recomputed before this runs, so counts are current.
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange()
        }),
        EditorView.contentAttributes.of({ 'aria-label': 'Your version (editable)' }),
      ],
    },
    parent,
    revertControls: 'a-to-b',
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 6 },
  })
  return {
    result: () => view.b.state.doc.toString(),
    changes: () => view.chunks.length,
    destroy: () => view.destroy(),
  }
}
