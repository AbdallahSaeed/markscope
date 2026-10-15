import { defaultSettings, LIMITS, parseSettings } from '@/shared/settings'
import type { EditorController } from '@/viewer/editor/editor-controller'
import {
  lineToOffset,
  monotonic,
  offsetToLine,
  type Anchor,
} from '@/viewer/editor/scroll-map'
import { createSplitDivider } from '@/viewer/split-divider'
import { SplitView } from '@/viewer/split-view'

describe('scroll map', () => {
  const anchors: Anchor[] = [
    { line: 1, top: 0 },
    { line: 5, top: 100 },
    { line: 9, top: 500 },
    { line: 21, top: 1100 },
  ]

  test('lineToOffset interpolates between anchors and clamps at the ends', () => {
    expect(lineToOffset(anchors, 1)).toBe(0)
    expect(lineToOffset(anchors, 3)).toBe(50)
    expect(lineToOffset(anchors, 7)).toBe(300)
    expect(lineToOffset(anchors, 9.5)).toBe(525)
    expect(lineToOffset(anchors, 0)).toBe(0)
    expect(lineToOffset(anchors, 99)).toBe(1100)
    expect(lineToOffset([], 4)).toBe(0)
  })

  test('offsetToLine is the inverse', () => {
    for (const line of [1, 2.5, 5, 6.25, 9, 15, 21])
      expect(offsetToLine(anchors, lineToOffset(anchors, line))).toBeCloseTo(line)
    expect(offsetToLine(anchors, -10)).toBe(1)
    expect(offsetToLine(anchors, 5000)).toBe(21)
    expect(offsetToLine([], 10)).toBe(1)
  })

  test('zero-height spans map to their first line', () => {
    expect(
      offsetToLine(
        [
          { line: 1, top: 0 },
          { line: 3, top: 0 },
        ],
        0,
      ),
    ).toBe(1)
  })

  test('monotonic drops hidden, out-of-order and invalid anchors', () => {
    expect(
      monotonic([
        { line: 1, top: 0 },
        { line: 3, top: 40 },
        { line: 4, top: 0 }, // hidden block (top 0)
        { line: 4, top: 80 },
        { line: 2, top: 90 }, // line goes back
        { line: Number.NaN, top: 100 },
        { line: 8, top: 120 },
      ]),
    ).toEqual([
      { line: 1, top: 0 },
      { line: 3, top: 40 },
      { line: 4, top: 80 },
      { line: 8, top: 120 },
    ])
  })
})

describe('splitRatio setting', () => {
  test('defaults to an even split and is clamped', () => {
    expect(defaultSettings().layout.splitRatio).toBe(0.5)
    expect(parseSettings({ layout: { splitRatio: 0.65 } }).layout.splitRatio).toBe(0.65)
    expect(parseSettings({ layout: { splitRatio: 5 } }).layout.splitRatio).toBe(
      LIMITS.splitRatio.max,
    )
    expect(parseSettings({ layout: { splitRatio: -1 } }).layout.splitRatio).toBe(
      LIMITS.splitRatio.min,
    )
    expect(parseSettings({ layout: { splitRatio: 'wide' } }).layout.splitRatio).toBe(0.5)
  })
})

describe('split divider', () => {
  function setup() {
    const panes = document.createElement('div')
    const onCommit = vi.fn()
    const divider = createSplitDivider(panes, onCommit)
    panes.append(divider.el)
    const ratio = () => panes.style.getPropertyValue('--ms-split')
    const key = (k: string) =>
      divider.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }))
    return { panes, divider, onCommit, ratio, key }
  }

  test('is an accessible, focusable separator', () => {
    const { divider } = setup()
    expect(divider.el.getAttribute('role')).toBe('separator')
    expect(divider.el.getAttribute('aria-orientation')).toBe('vertical')
    expect(divider.el.tabIndex).toBe(0)
    expect(divider.el.getAttribute('aria-valuenow')).toBe('50')
  })

  test('set applies a clamped ratio without saving', () => {
    const { divider, ratio, onCommit } = setup()
    divider.set(0.6)
    expect(ratio()).toBe('60.00%')
    divider.set(0.95)
    expect(ratio()).toBe('80.00%')
    expect(divider.el.getAttribute('aria-valuenow')).toBe('80')
    expect(onCommit).not.toHaveBeenCalled()
  })

  test('arrow keys, Home/End and double-click resize and save', () => {
    const { onCommit, key, divider } = setup()
    key('ArrowRight')
    expect(onCommit).toHaveBeenLastCalledWith(0.52)
    key('ArrowLeft')
    key('ArrowLeft')
    expect(onCommit.mock.lastCall?.[0]).toBeCloseTo(0.48)
    key('Home')
    expect(onCommit).toHaveBeenLastCalledWith(LIMITS.splitRatio.min)
    key('End')
    expect(onCommit).toHaveBeenLastCalledWith(LIMITS.splitRatio.max)
    divider.el.dispatchEvent(new MouseEvent('dblclick'))
    expect(onCommit).toHaveBeenLastCalledWith(0.5)
  })

  test('other keys are left alone', () => {
    const { onCommit, key } = setup()
    expect(key('a')).toBe(true) // not prevented
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('SplitView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  function setup(active = true) {
    const preview = document.createElement('div')
    const article = document.createElement('article')
    article.innerHTML =
      '<h1 data-source-line="1">A</h1><p data-source-line="3">B</p><ul data-source-line="5"><li>C</li></ul>'
    preview.append(article)
    document.body.append(preview)
    const editor = {
      scrollElement: () => document.createElement('div'),
      revealLine: vi.fn(),
      lineCount: () => 6,
      topLine: () => 1,
      scrollToLine: vi.fn(),
    }
    const view = new SplitView({
      preview,
      article,
      editor: editor as unknown as EditorController,
      active: () => active,
    })
    return { view, article, editor }
  }
  afterEach(() => document.body.replaceChildren())

  const highlighted = (article: HTMLElement) =>
    [...article.querySelectorAll('.ms-cursor-block')].map(e => e.textContent)

  test('highlights the block that contains the cursor line', () => {
    const { view, article } = setup()
    view.onCursor(1)
    expect(highlighted(article)).toEqual(['A'])
    view.onCursor(4)
    expect(highlighted(article)).toEqual(['B'])
    view.onCursor(6)
    expect(highlighted(article)).toEqual(['C'])
    view.deactivate()
    expect(highlighted(article)).toEqual([])
  })

  test('does nothing outside the Edit view', () => {
    const { view, article, editor } = setup(false)
    view.onCursor(3)
    expect(highlighted(article)).toEqual([])
    article
      .querySelector('p')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(editor.revealLine).not.toHaveBeenCalled()
  })

  test('double-clicking a block reveals its source line in the editor', () => {
    const { article, editor } = setup()
    article
      .querySelector('li')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    // jsdom has no layout: every block measures at 0, so the first line wins.
    expect(editor.revealLine).toHaveBeenCalledWith(1)
    editor.revealLine.mockClear()
    article.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(editor.revealLine).not.toHaveBeenCalled() // not on a block
  })
})
