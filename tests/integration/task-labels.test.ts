import { describe, expect, test } from 'vitest'
import { renderDocument } from '@/engine/render'
import { defaultSettings } from '@/shared/settings'
import { DocumentView } from '@/viewer/document-view'

function render(md: string): HTMLElement {
  const article = document.createElement('article')
  document.body.append(article)
  const settings = defaultSettings()
  const view = new DocumentView(article, 'chrome-extension://x/viewer.html', {})
  view.render(renderDocument(md, { markdown: settings.markdown } as never), {
    settings,
    baseUrl: null,
    sourceLength: md.length,
    dark: false,
    aiEnabled: false,
  })
  return article
}

describe('task list checkboxes', () => {
  test('are named after their list item, checked or not', () => {
    const boxes = [
      ...render('- [ ] Write tests\n- [x] Ship *it*\n').querySelectorAll(
        'input[type="checkbox"]',
      ),
    ]
    expect(boxes.map(b => b.getAttribute('aria-label'))).toEqual([
      'Write tests',
      'Ship it',
    ])
  })

  test('long items are shortened and empty ones still get a name', () => {
    const label = (md: string) =>
      render(md).querySelector('input[type="checkbox"]')?.getAttribute('aria-label') ?? ''
    expect(label(`- [ ] ${'word '.repeat(60)}\n`).length).toBeLessThanOrEqual(120)
    // A checkbox with no text around it (raw HTML) still gets a name.
    expect(label('<ul><li><input type="checkbox" disabled></li></ul>\n')).toBe('Task')
  })
})
