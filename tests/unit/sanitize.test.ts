import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  filterStyle,
  FORBIDDEN_TAGS,
  sanitizeToFragment,
  sanitizeToString,
} from '@/engine/sanitize'
import { renderSafe } from '../helpers/render'

const malicious = readFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/malicious.md'),
  'utf8',
)

describe('sanitizer', () => {
  test('malicious fixture: no executable content survives', () => {
    const el = renderSafe(malicious)
    const html = el.innerHTML
    for (const tag of [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'style',
      'link',
      'meta',
      'base',
      'button',
    ]) {
      expect(el.querySelector(tag), tag).toBeNull()
    }
    // Inspect real attributes: payload strings may legitimately remain as
    // escaped, inert text (e.g. inside diagram source or KaTeX annotations).
    const attrs = Array.from(el.querySelectorAll('*')).flatMap(n =>
      Array.from(n.attributes),
    )
    expect(attrs.filter(a => /^on/i.test(a.name)).map(a => a.name)).toEqual([])
    expect(
      attrs
        .filter(a => /javascript:|vbscript:|data:text\/html/i.test(a.value))
        .map(a => `${a.name}=${a.value}`),
    ).toEqual([])
    expect(
      attrs.filter(a => /^(srcdoc|autoplay|autofocus|formaction)$/i.test(a.name)),
    ).toEqual([])
    expect(html).not.toMatch(/<script/i)
    expect(el.querySelector('input:not([type="checkbox"])')).toBeNull()
    expect(el.querySelector('[name]')).toBeNull()
    expect(el.querySelector('#ms-sidebar')).toBeNull()
    expect((window as unknown as { __pwned?: string }).__pwned).toBeUndefined()
  })

  test('data:text/html links are dropped', () => {
    expect(
      sanitizeToString('<a href="data:text/html,<script>alert(1)</script>">x</a>'),
    ).not.toContain('data:')
  })

  test('targets removed and rel=noopener noreferrer added', () => {
    const out = sanitizeToString('<a href="https://a.com" target="_blank">x</a>')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).not.toContain('target')
  })

  test('images are lazy, async and send no referrer', () => {
    const out = sanitizeToString('<img src="https://a.com/x.png" alt="x">')
    expect(out).toContain('loading="lazy"')
    expect(out).toContain('referrerpolicy="no-referrer"')
  })

  test('legacy <a name> anchors become ids', () => {
    const frag = sanitizeToFragment('<a name="legacy-anchor"></a>')
    expect(frag.querySelector('#legacy-anchor')).not.toBeNull()
    expect(frag.querySelector('[name]')).toBeNull()
  })

  test('heading ids that shadow document properties survive', () => {
    for (const id of ['links', 'title', 'body', 'images', 'forms', 'location']) {
      expect(sanitizeToString(`<h2 id="${id}">x</h2>`)).toContain(`id="${id}"`)
    }
  })

  test('reserved ms- ids and chrome classes are stripped from content', () => {
    const out = sanitizeToString(
      '<div id="ms-root" class="ms-toolbar ms-code keep">x</div>',
    )
    expect(out).not.toContain('ms-root')
    expect(out).not.toContain('ms-toolbar')
    expect(out).toContain('ms-code')
    expect(out).toContain('keep')
  })

  test('only checkbox inputs, always disabled', () => {
    const out = sanitizeToString('<input type="checkbox" checked><input type="password">')
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('disabled')
    expect(out).not.toContain('password')
  })

  test('keeps safe rich content: details, tables, svg, MathML', () => {
    const out = sanitizeToString(
      '<details><summary>s</summary><table><tr><td>1</td></tr></table></details><svg viewBox="0 0 1 1"><path d="M0 0"/></svg><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>',
    )
    for (const t of [
      '<details>',
      '<table>',
      '<svg',
      '<path',
      '<semantics>',
      '<annotation',
    ])
      expect(out).toContain(t)
  })

  test('media gets controls and no autoplay', () => {
    const out = sanitizeToString('<video src="a.mp4" autoplay></video>')
    expect(out).toContain('controls')
    expect(out).not.toContain('autoplay')
  })

  test('forbidden tag list covers the dangerous set', () => {
    expect(FORBIDDEN_TAGS).toEqual(
      expect.arrayContaining([
        'script',
        'iframe',
        'object',
        'embed',
        'form',
        'style',
        'base',
        'meta',
        'link',
      ]),
    )
  })
})

describe('sanitizer hardening (security review)', () => {
  test('inline styles keep KaTeX-safe properties only', () => {
    expect(filterStyle('height:0.81em;vertical-align:-0.2em;color:#c00')).toBe(
      'height:0.81em;vertical-align:-0.2em;color:#c00',
    )
    expect(filterStyle('position:fixed;inset:0;z-index:99999;background:red')).toBe('')
    expect(filterStyle('background-color:url(https://t.example/p)')).toBe('')
    expect(filterStyle('color: var(--x); width: 10px')).toBe('width:10px')
  })

  test('style-based tracking and overlays are removed', () => {
    const out = sanitizeToString(
      '<div style="background:url(https://t.example/p);position:fixed;z-index:9">x</div><p style="text-align:center">c</p>',
    )
    expect(out).not.toContain('url(')
    expect(out).not.toContain('position')
    expect(out).toContain('text-align:center')
  })

  test('SVG image/use, poster and xlink:href are removed', () => {
    const out = sanitizeToString(
      '<svg><image href="https://t.example/p"/><use href="#x"/><a xlink:href="file:///etc/passwd"><text>t</text></a></svg><video poster="https://t.example/p.png"></video>',
    )
    expect(out).not.toMatch(/<image|<use|poster|xlink:href/)
  })

  test('<a name> cannot smuggle a reserved viewer id', () => {
    const frag = sanitizeToFragment(
      '<a name="ms-root"></a><a name="ms-panel-doctor"></a>',
    )
    expect(frag.querySelector('[id]')).toBeNull()
  })

  test('only real viewer ids are reserved; headings like "MS-DOS" keep their id', () => {
    expect(sanitizeToString('<h2 id="ms-dos">MS-DOS</h2>')).toContain('id="ms-dos"')
    expect(sanitizeToString('<h2 id="ms-main">x</h2>')).not.toContain('id=')
  })
})
