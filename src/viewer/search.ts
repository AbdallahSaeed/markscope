/**
 * In-document search. Finds case-insensitive matches across text nodes and
 * returns DOM Ranges; the viewer paints them with the CSS Custom Highlight
 * API, so the document DOM is never mutated for highlighting.
 */
export const MAX_MATCHES = 2000

export function collectTextNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (
        parent.closest(
          '.katex-mathml, .ms-ui, script, style, [aria-hidden="true"].ms-gutter',
        )
      ) {
        return NodeFilter.FILTER_REJECT
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  return nodes
}

/**
 * Matches may span adjacent text nodes (e.g. "foo **bar**"), so nodes are
 * concatenated and offsets mapped back to (node, offset) pairs.
 */
export function findMatches(root: Node, query: string, limit = MAX_MATCHES): Range[] {
  const q = query.toLowerCase()
  if (q.trim() === '') return []
  const nodes = collectTextNodes(root)
  const starts: number[] = []
  let text = ''
  for (const n of nodes) {
    starts.push(text.length)
    text += n.nodeValue ?? ''
  }
  const haystack = text.toLowerCase()
  const doc = root.ownerDocument ?? (root as Document)
  const ranges: Range[] = []

  const locate = (pos: number): [Text, number] => {
    // Binary search the node containing `pos`.
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((starts[mid] ?? 0) <= pos) lo = mid
      else hi = mid - 1
    }
    return [nodes[lo] as Text, pos - (starts[lo] ?? 0)]
  }

  let from = 0
  while (ranges.length < limit) {
    const idx = haystack.indexOf(q, from)
    if (idx === -1) break
    const [sNode, sOff] = locate(idx)
    const [eNode, eOff] = locate(idx + q.length - 1)
    const range = doc.createRange()
    range.setStart(sNode, sOff)
    range.setEnd(eNode, eOff + 1)
    ranges.push(range)
    from = idx + Math.max(1, q.length)
  }
  return ranges
}
