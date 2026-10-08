/**
 * GitHub-compatible heading slugs so `[link](#some-heading)` written for
 * GitHub works unchanged in Markscope.
 */
const STRIP_RE = /[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(STRIP_RE, '').replace(/ /g, '-')
}

/** Returns a slugger that de-duplicates like GitHub: foo, foo-1, foo-2 … */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text: string) => {
    const base = slugify(text) || 'section'
    let slug = base
    let n = seen.get(base) ?? 0
    while (seen.has(slug)) {
      n += 1
      slug = `${base}-${n}`
    }
    seen.set(base, n)
    seen.set(slug, seen.get(slug) ?? 0)
    return slug
  }
}
