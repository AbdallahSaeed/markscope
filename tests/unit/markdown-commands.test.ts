import type { TextChange } from '@/viewer/editor/diff'
import { displayKey, EDITOR_COMMANDS } from '@/viewer/editor/keymap'
import {
  formatTable,
  formatTableLines,
  insertLink,
  splitRow,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleStrike,
  wrapSelection,
  type MarkdownCommand,
} from '@/viewer/editor/markdown-commands'

/** Applies changes (positions in the original text) right to left. */
function applyChanges(text: string, changes: TextChange[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text)
}

/**
 * Runs a command on text with the selection marked by `[` and `]`
 * (or a single `|` cursor) and returns the result in the same notation.
 */
function run(command: MarkdownCommand, marked: string): string | null {
  const cursor = marked.indexOf('|')
  const from = cursor >= 0 ? cursor : marked.indexOf('[')
  const to = cursor >= 0 ? cursor : marked.indexOf(']') - 1
  const text = marked.replace(cursor >= 0 ? '|' : /\[|\]/g, '')
  const edit = command(text, { from, to })
  if (!edit) return null
  const out = applyChanges(text, edit.changes)
  const { from: f, to: t } = edit.selection
  return f === t
    ? `${out.slice(0, f)}|${out.slice(f)}`
    : `${out.slice(0, f)}[${out.slice(f, t)}]${out.slice(t)}`
}

describe('inline toggles', () => {
  test('wrap the selection and keep it selected', () => {
    expect(run(toggleBold, 'say [hello] now')).toBe('say **[hello]** now')
    expect(run(toggleItalic, 'say [hello] now')).toBe('say _[hello]_ now')
    expect(run(toggleCode, 'run [npm test]')).toBe('run `[npm test]`')
    expect(run(toggleStrike, '[old]')).toBe('~~[old]~~')
  })

  test('unwrap when the markers are just outside the selection', () => {
    expect(run(toggleBold, 'say **[hello]** now')).toBe('say [hello] now')
    expect(run(toggleCode, '`[x]`')).toBe('[x]')
  })

  test('unwrap when the selection includes the markers', () => {
    expect(run(toggleBold, 'say [**hello**] now')).toBe('say [hello] now')
    expect(run(toggleStrike, '[~~old~~]')).toBe('[old]')
  })

  test('with no selection insert a pair, and a second press removes it', () => {
    expect(run(toggleBold, 'a | b')).toBe('a **|** b')
    expect(run(toggleBold, 'a **|** b')).toBe('a | b')
  })

  test('a marker-only selection shorter than two markers is wrapped, not unwrapped', () => {
    expect(run(toggleBold, '[**]')).toBe('**[**]**')
  })
})

describe('insertLink', () => {
  test('wraps text and selects the url placeholder', () => {
    expect(run(insertLink, 'see [the docs] here')).toBe('see [the docs]([url]) here')
  })

  test('a selected URL becomes the target, cursor in the text', () => {
    expect(run(insertLink, 'go [https://example.com/a?b=1]')).toBe(
      'go [|](https://example.com/a?b=1)',
    )
  })

  test('with no selection inserts a link with "text" selected', () => {
    expect(run(insertLink, 'x |')).toBe('x [[text]](url)')
  })
})

describe('wrapSelection (typing a marker over a selection)', () => {
  test('wraps for *, _, ~ and backtick', () => {
    for (const ch of ['*', '_', '~', '`']) {
      const edit = wrapSelection('a word', { from: 2, to: 6 }, ch)
      expect(applyChanges('a word', edit?.changes ?? [])).toBe(`a ${ch}word${ch}`)
      expect(edit?.selection).toEqual({ from: 3, to: 7 })
    }
  })

  test('does nothing without a selection or for other characters', () => {
    expect(wrapSelection('abc', { from: 1, to: 1 }, '*')).toBeNull()
    expect(wrapSelection('abc', { from: 0, to: 2 }, 'x')).toBeNull()
  })
})

describe('tables', () => {
  test('splitRow handles outer pipes and escaped pipes', () => {
    expect(splitRow('| a | b \\| c |')).toEqual(['a', 'b \\| c'])
    expect(splitRow('  |x|y|  ')).toEqual(['x', 'y'])
  })

  test('aligns columns and keeps alignment markers', () => {
    expect(
      formatTableLines(['|Name|Qty|Note|', '|:--|--:|:-:|', '|apple|3|ok|', '|kiwi|12|']),
    ).toEqual([
      '| Name  | Qty | Note |',
      '| :---- | --: | :--: |',
      '| apple |   3 |  ok  |',
      '| kiwi  |  12 |      |',
    ])
  })

  test('counts wide characters by code point', () => {
    expect(formatTableLines(['|é|😀|', '|-|-|'])).toEqual([
      '| é   | 😀   |',
      '| --- | --- |',
    ])
  })

  test('rejects blocks without a delimiter row', () => {
    expect(formatTableLines(['| a | b |', '| c | d |'])).toBeNull()
    expect(formatTableLines(['| a |'])).toBeNull()
  })

  test('formatTable formats the table around the cursor only', () => {
    const doc = 'Intro\n\n|a|bb|\n|-|-|\n|ccc|d|\n\nAfter'
    const edit = formatTable(doc, { from: doc.indexOf('ccc'), to: doc.indexOf('ccc') })
    expect(applyChanges(doc, edit?.changes ?? [])).toBe(
      'Intro\n\n| a   | bb  |\n| --- | --- |\n| ccc | d   |\n\nAfter',
    )
    // The cursor stays on the same row (start of the third table line).
    expect(edit?.selection.from).toBe('Intro\n\n| a   | bb  |\n| --- | --- |\n'.length)
  })

  test('formatTable is a no-op outside tables and on formatted tables', () => {
    expect(formatTable('just text', { from: 2, to: 2 })).toBeNull()
    const formatted = '| a   |\n| --- |'
    expect(formatTable(formatted, { from: 1, to: 1 })).toEqual({
      changes: [],
      selection: { from: 1, to: 1 },
    })
  })
})

describe('editor keymap', () => {
  test('every command has a unique key and id', () => {
    const keys = EDITOR_COMMANDS.map(c => c.key.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(EDITOR_COMMANDS.map(c => c.id)).size).toBe(EDITOR_COMMANDS.length)
  })

  test('never takes the global ⌘K / ⌘S / ⌘O / ⌘P shortcuts', () => {
    for (const reserved of ['Mod-k', 'Mod-s', 'Mod-o', 'Mod-p', 'Shift-Mod-s'])
      expect(EDITOR_COMMANDS.map(c => c.key)).not.toContain(reserved)
  })

  test('displayKey formats for the help dialog', () => {
    expect(displayKey('Shift-Mod-x', '⌘')).toBe('Shift ⌘ X')
    expect(displayKey('Mod-b', 'Ctrl')).toBe('Ctrl B')
    expect(displayKey('Mod-Alt-t', '⌘')).toBe('⌘ Alt T')
  })
})
