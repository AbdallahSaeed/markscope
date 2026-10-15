import type { CreateEditor, EditorCallbacks } from '@/viewer/editor/adapter'
import { minimalChange } from '@/viewer/editor/diff'
import {
  EDIT_DEBOUNCE_MS,
  EditorController,
  editDelay,
} from '@/viewer/editor/editor-controller'

function apply(text: string, change: ReturnType<typeof minimalChange>): string {
  if (!change) return text
  return text.slice(0, change.from) + change.insert + text.slice(change.to)
}

describe('minimalChange', () => {
  test('returns null for equal text', () => {
    expect(minimalChange('same', 'same')).toBeNull()
  })

  test('keeps the common prefix and suffix', () => {
    expect(minimalChange('# Title\n\nold line\nend', '# Title\n\nnew line\nend')).toEqual(
      {
        from: 9,
        to: 12,
        insert: 'new',
      },
    )
  })

  test.each([
    ['', 'inserted'],
    ['deleted', ''],
    ['abc', 'abXc'],
    ['aaaa', 'aa'],
    ['aa', 'aaaa'],
    ['abcabc', 'abc'],
    ['line 1\nline 2', 'line 0\nline 1\nline 2'],
  ])('%j → %j round-trips', (before, after) => {
    expect(apply(before, minimalChange(before, after))).toBe(after)
  })
})

/** A fake editor surface that records calls; `type` simulates user input. */
function fakeEditor() {
  const state = {
    created: 0,
    text: '',
    focused: 0,
    setCalls: [] as { text: string; resetHistory: boolean }[],
    callbacks: null as EditorCallbacks | null,
    scrolledTo: [] as number[],
    revealed: [] as number[],
    scroller: document.createElement('div'),
  }
  const create: CreateEditor = (_parent, text, callbacks) => {
    state.created++
    state.text = text
    state.callbacks = callbacks
    return {
      getValue: () => state.text,
      setValue(next, opts) {
        state.text = next
        state.setCalls.push({ text: next, resetHistory: !!opts?.resetHistory })
      },
      focus: () => void state.focused++,
      topLine: () => 42.5,
      scrollToLine: line => void state.scrolledTo.push(line),
      revealLine: line => void state.revealed.push(line),
      lineCount: () => state.text.split('\n').length,
      length: () => state.text.length,
      scrollElement: () => state.scroller,
      run: command => {
        const edit = command(state.text, { from: 0, to: state.text.length })
        if (!edit) return false
        state.text = edit.changes.reduceRight(
          (t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to),
          state.text,
        )
        return true
      },
      destroy: () => undefined,
    }
  }
  const type = (text: string) => {
    state.text = text
    state.callbacks?.onChange()
  }
  return { state, create, type }
}

describe('EditorController', () => {
  afterEach(() => vi.useRealTimers())

  function setup() {
    const fake = fakeEditor()
    const onChange = vi.fn()
    const onScroll = vi.fn()
    const load = vi.fn(async () => fake.create)
    const ctrl = new EditorController(document.createElement('div'), {
      onChange,
      onScroll,
      load,
    })
    return { fake, ctrl, onChange, onScroll, load }
  }

  test('buffers text until mounted, then mounts once with the latest text', async () => {
    const { fake, ctrl, load } = setup()
    ctrl.setValue('first', { resetHistory: true })
    ctrl.setValue('second')
    expect(ctrl.mounted).toBe(false)
    expect(ctrl.value).toBe('second')
    expect(ctrl.topLine()).toBe(1)
    expect(ctrl.lineCount()).toBe(1)
    expect(ctrl.scrollElement()).toBeNull()

    await Promise.all([ctrl.show(), ctrl.show()])
    expect(load).toHaveBeenCalledTimes(1)
    expect(fake.state.created).toBe(1)
    expect(fake.state.text).toBe('second')
    expect(fake.state.focused).toBe(2)
    expect(ctrl.mounted).toBe(true)
    expect(ctrl.topLine()).toBe(42.5)
  })

  test('setValue after mount passes resetHistory through to the editor', async () => {
    const { fake, ctrl } = setup()
    await ctrl.show()
    ctrl.setValue('other doc', { resetHistory: true })
    ctrl.setValue('discarded')
    expect(fake.state.setCalls).toEqual([
      { text: 'other doc', resetHistory: true },
      { text: 'discarded', resetHistory: false },
    ])
    expect(ctrl.value).toBe('discarded')
  })

  test('user edits are debounced; the value is current immediately', async () => {
    vi.useFakeTimers()
    const { fake, ctrl, onChange } = setup()
    await ctrl.show()
    fake.type('a')
    fake.type('ab')
    expect(ctrl.value).toBe('ab')
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(EDIT_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('cancelPending drops a pending change notification', async () => {
    vi.useFakeTimers()
    const { fake, ctrl, onChange } = setup()
    await ctrl.show()
    fake.type('typed')
    ctrl.cancelPending()
    vi.advanceTimersByTime(EDIT_DEBOUNCE_MS * 2)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('forwards scroll events', async () => {
    const { fake, ctrl, onScroll } = setup()
    await ctrl.show()
    fake.state.callbacks?.onScroll()
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  test('a failed load can be retried', async () => {
    const fake = fakeEditor()
    const load = vi
      .fn<() => Promise<CreateEditor>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue(fake.create)
    const ctrl = new EditorController(document.createElement('div'), {
      onChange: vi.fn(),
      onScroll: vi.fn(),
      load,
    })
    await expect(ctrl.show()).rejects.toThrow('chunk failed')
    expect(ctrl.mounted).toBe(false)
    await ctrl.show()
    expect(ctrl.mounted).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
  })

  test('run applies a command and refocuses; does nothing before mount', async () => {
    const { ctrl, fake } = setup()
    const upper = (text: string) => ({
      changes: [{ from: 0, to: text.length, insert: text.toUpperCase() }],
      selection: { from: 0, to: 0 },
    })
    ctrl.setValue('abc')
    expect(ctrl.run(upper)).toBe(false)
    await ctrl.show()
    expect(ctrl.run(upper)).toBe(true)
    expect(ctrl.value).toBe('ABC')
    expect(ctrl.run(() => null)).toBe(false)
    expect(fake.state.focused).toBe(3)
  })

  test('forwards cursor updates', async () => {
    const onCursor = vi.fn()
    const fake = fakeEditor()
    const ctrl = new EditorController(document.createElement('div'), {
      onChange: vi.fn(),
      onScroll: vi.fn(),
      onCursor,
      load: async () => fake.create,
    })
    await ctrl.show()
    fake.state.callbacks?.onCursor({ line: 2, col: 5, selected: 0 })
    expect(onCursor).toHaveBeenCalledWith({ line: 2, col: 5, selected: 0 })
  })

  test('forwards scrolling, reveal and measurements once mounted', async () => {
    const { ctrl, fake } = setup()
    ctrl.scrollToLine(3)
    ctrl.revealLine(4)
    expect(fake.state.scrolledTo).toEqual([])
    ctrl.setValue('a\nb\nc')
    await ctrl.show()
    ctrl.scrollToLine(2.5)
    ctrl.revealLine(3)
    expect(fake.state.scrolledTo).toEqual([2.5])
    expect(fake.state.revealed).toEqual([3])
    expect(ctrl.lineCount()).toBe(3)
    expect(ctrl.scrollElement()).toBe(fake.state.scroller)
  })

  test('the typing pause grows with the document size', () => {
    expect(editDelay(1000)).toBe(EDIT_DEBOUNCE_MS)
    expect(editDelay(100 * 1024)).toBeGreaterThan(EDIT_DEBOUNCE_MS)
    expect(editDelay(1024 * 1024)).toBeGreaterThan(editDelay(100 * 1024))
  })

  test('large documents wait longer before re-rendering', async () => {
    vi.useFakeTimers()
    const { fake, ctrl, onChange } = setup()
    await ctrl.show()
    fake.type('x'.repeat(100 * 1024))
    vi.advanceTimersByTime(EDIT_DEBOUNCE_MS)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(editDelay(100 * 1024))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('focus before mount is a no-op', () => {
    const { ctrl, fake } = setup()
    ctrl.focus()
    expect(fake.state.focused).toBe(0)
  })
})
