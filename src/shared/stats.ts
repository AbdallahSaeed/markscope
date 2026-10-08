/** Document statistics computed from Markdown source. */
export interface DocumentStats {
  words: number
  characters: number
  lines: number
  readingMinutes: number
  codeBlocks: number
  headings: number
  links: number
  images: number
}

export const WORDS_PER_MINUTE = 230

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})/

export function computeStats(source: string): DocumentStats {
  const lines = source === '' ? 0 : source.split(/\r\n|\r|\n/).length
  let codeBlocks = 0
  let headings = 0
  let fence: string | null = null
  const prose: string[] = []

  for (const line of source.split(/\r\n|\r|\n/)) {
    const m = FENCE_RE.exec(line)
    if (m) {
      const marker = m[2] ?? ''
      if (fence === null) {
        fence = marker[0]?.repeat(marker.length) ?? null
        codeBlocks += 1
        continue
      }
      if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null
        continue
      }
    }
    if (fence !== null) continue
    if (/^\s{0,3}#{1,6}\s/.test(line)) headings += 1
    prose.push(line)
  }

  const text = prose.join('\n')
  const links = (text.match(/(?<!!)\[[^\]]*\]\([^)]*\)/g) ?? []).length
  const images = (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length
  const words = countWords(text)

  return {
    words,
    characters: source.length,
    lines,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    codeBlocks,
    headings,
    links,
    images,
  }
}

export function countWords(text: string): number {
  const cleaned = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~|[\]-]+/g, ' ')
  // CJK characters are counted individually; other scripts by whitespace.
  const cjk = cleaned.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
  )
  const rest = cleaned.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    ' ',
  )
  const words = rest.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w))
  return words.length + (cjk?.length ?? 0)
}

export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
