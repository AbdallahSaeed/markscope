import { fuzzyFilter, fuzzyMatch } from '@/viewer/fuzzy'
import { collectTextNodes, findMatches } from '@/viewer/search'

describe('fuzzy matching', () => {
  test('subsequence match with indices', () => {
    expect(fuzzyMatch('tgl', 'Toggle sidebar')?.indices).toEqual([0, 2, 4])
    expect(fuzzyMatch('xyz', 'Toggle sidebar')).toBeNull()
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] })
  })
  test('prefers word starts and prefixes', () => {
    const items = ['Export as HTML', 'Print / Save as PDF', 'Find in document']
    expect(fuzzyFilter(items, 'pdf', x => x)[0]).toBe('Print / Save as PDF')
    expect(fuzzyFilter(items, 'exp', x => x)[0]).toBe('Export as HTML')
  })
  test('empty query returns items in order, respecting limit', () => {
    expect(fuzzyFilter([1, 2, 3], '', String, 2)).toEqual([1, 2])
  })
})

describe('in-document search', () => {
  function doc(html: string) {
    const root = document.createElement('article')
    root.innerHTML = html
    document.body.append(root)
    return root
  }

  test('case-insensitive matches across adjacent text nodes', () => {
    const root = doc('<p>Hello <strong>Wor</strong>ld and hello world</p>')
    const ranges = findMatches(root, 'hello world')
    expect(ranges.map(r => r.toString())).toEqual(['Hello World', 'hello world'])
  })

  test('skips UI chrome, line-number gutters and KaTeX MathML', () => {
    const root = doc(
      '<div class="ms-ui">find</div><span class="ms-gutter" aria-hidden="true">find</span><span class="katex-mathml">find</span><p>find</p>',
    )
    expect(findMatches(root, 'find')).toHaveLength(1)
    expect(collectTextNodes(root).map(n => n.nodeValue)).toEqual(['find'])
  })

  test('respects the match limit and empty queries', () => {
    const root = doc(`<p>${'a '.repeat(50)}</p>`)
    expect(findMatches(root, 'a', 10)).toHaveLength(10)
    expect(findMatches(root, '   ')).toEqual([])
  })
})
