import { createCodeMirror } from '@/viewer/editor/codemirror'
import { EditorController } from '@/viewer/editor/editor-controller'

describe('CodeMirror editor (jsdom)', () => {
  afterEach(() => document.body.replaceChildren())

  function mount(text: string) {
    const parent = document.createElement('div')
    document.body.append(parent)
    const onChange = vi.fn()
    const onScroll = vi.fn()
    const onCursor = vi.fn()
    const editor = createCodeMirror(parent, text, { onChange, onScroll, onCursor })
    return { parent, editor, onChange, onScroll, onCursor }
  }

  test('renders the text in an accessible, non-spellchecked content area', () => {
    const { parent, editor } = mount('# Title\n\nBody')
    const content = parent.querySelector<HTMLElement>('.cm-content')
    expect(content?.getAttribute('aria-label')).toBe('Markdown source editor')
    expect(content?.getAttribute('spellcheck')).toBe('false')
    expect(content?.getAttribute('contenteditable')).toBe('true')
    expect(editor.getValue()).toBe('# Title\n\nBody')
    editor.destroy()
  })

  test('programmatic setValue does not count as a user edit', () => {
    const { editor, onChange } = mount('one')
    editor.setValue('two')
    editor.setValue('three', { resetHistory: true })
    expect(editor.getValue()).toBe('three')
    expect(onChange).not.toHaveBeenCalled()
    editor.destroy()
  })

  test('reports the cursor on mount and runs formatting commands as one edit', async () => {
    const { toggleBold } = await import('@/viewer/editor/markdown-commands')
    const { editor, onCursor, onChange } = mount('hello')
    expect(onCursor).toHaveBeenLastCalledWith({ line: 1, col: 1, selected: 0 })
    expect(editor.run(toggleBold)).toBe(true)
    expect(editor.getValue()).toBe('****hello')
    expect(onCursor).toHaveBeenLastCalledWith({ line: 1, col: 3, selected: 0 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(editor.run(() => null)).toBe(false)
    editor.destroy()
  })

  test('renders untrusted text as text, never as markup', () => {
    const { parent, editor } = mount('<img src=x onerror="alert(1)"><script>x</script>')
    expect(parent.querySelector('img, script')).toBeNull()
    expect(parent.querySelector('.cm-content')?.textContent).toContain('<script>')
    editor.destroy()
  })

  test('the controller lazy-loads the real CodeMirror module', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const ctrl = new EditorController(host, { onChange: vi.fn(), onScroll: vi.fn() })
    ctrl.setValue('lazy', { resetHistory: true })
    await ctrl.show()
    expect(host.querySelector('.cm-editor')).not.toBeNull()
    expect(ctrl.value).toBe('lazy')
  })
})
