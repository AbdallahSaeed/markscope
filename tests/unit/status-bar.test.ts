import { computeStats } from '@/shared/stats'
import { formatCursor, renderCursor, renderStatus } from '@/viewer/status-bar'

describe('status bar', () => {
  const info = (over: Partial<Parameters<typeof renderStatus>[1]> = {}) => ({
    stats: computeStats('# Title\n\nSome words here.'),
    renderMs: 12.4,
    live: false,
    modified: false,
    ...over,
  })

  test('shows stats, and live/modified only when set', () => {
    const el = document.createElement('footer')
    renderStatus(el, info())
    expect(el.textContent).toContain('words')
    expect(el.textContent).toContain('12 ms')
    expect(el.querySelector<HTMLElement>('.ms-status__live')?.hidden).toBe(true)
    expect(el.querySelector<HTMLElement>('.ms-status__modified')?.hidden).toBe(true)

    renderStatus(el, info({ live: true, modified: true }))
    expect(el.querySelector('.ms-status__live')?.textContent).toBe('● Live')
    expect(el.querySelector('.ms-status__modified')?.textContent).toMatch(/S to save/)
  })

  test('the cursor survives a status re-render and hides outside the editor', () => {
    const el = document.createElement('footer')
    renderStatus(el, info())
    renderCursor(el, { line: 3, col: 7, selected: 0 })
    renderStatus(el, info({ modified: true }))
    const cursor = el.querySelector<HTMLElement>('.ms-status__cursor')
    expect(cursor?.textContent).toBe('Ln 3, Col 7')
    expect(cursor?.hidden).toBe(false)
    renderCursor(el, null)
    expect(cursor?.hidden).toBe(true)
  })

  test('renderCursor creates its element when the status is empty', () => {
    const el = document.createElement('footer')
    renderCursor(el, { line: 1, col: 1, selected: 0 })
    expect(el.querySelector('.ms-status__cursor')?.textContent).toBe('Ln 1, Col 1')
  })

  test('formatCursor includes the selection length', () => {
    expect(formatCursor({ line: 1, col: 2, selected: 0 })).toBe('Ln 1, Col 2')
    expect(formatCursor({ line: 10, col: 1, selected: 1234 })).toBe(
      'Ln 10, Col 1 (1,234 selected)',
    )
  })
})
