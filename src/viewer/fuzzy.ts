/**
 * Small fuzzy matcher for the command palette: subsequence match with
 * bonuses for word starts and consecutive characters.
 */
export interface FuzzyResult {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase().trim()
  if (q === '') return { score: 0, indices: [] }
  const t = target.toLowerCase()
  const indices: number[] = []
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    const boundary = found === 0 || /[\s\-_/.:#]/.test(t[found - 1] ?? '')
    score += 1 + (boundary ? 3 : 0) + (found === prev + 1 ? 2 : 0)
    indices.push(found)
    prev = found
    ti = found + 1
  }
  // Prefer shorter targets and earlier matches.
  score -= (indices[0] ?? 0) * 0.05 + t.length * 0.01
  if (t.startsWith(q)) score += 5
  return { score, indices }
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
  limit = 50,
): T[] {
  if (query.trim() === '') return items.slice(0, limit)
  return items
    .map(item => ({ item, m: fuzzyMatch(query, key(item)) }))
    .filter((x): x is { item: T; m: FuzzyResult } => x.m !== null)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, limit)
    .map(x => x.item)
}
