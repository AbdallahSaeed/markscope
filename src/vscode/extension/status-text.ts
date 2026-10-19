/** The status-bar text for the previewed document. Pure, so it can be unit-tested. */
import { formatReadingTime, type DocumentStats } from '@/shared/stats'

/** Counting words in a very large file on every update isn't worth it. */
export const MAX_STATS_CHARS = 2_000_000

export function statusText(
  stats: Pick<DocumentStats, 'words' | 'readingMinutes'> | null,
  issues: number,
): { text: string; tooltip: string } {
  const parts: string[] = []
  if (stats)
    parts.push(
      `$(book) ${stats.words.toLocaleString('en-US')} words · ${formatReadingTime(stats.readingMinutes)}`,
    )
  if (issues > 0) parts.push(`$(warning) ${issues}`)
  if (parts.length === 0) parts.push('$(book) Markscope')
  const problems =
    issues === 0
      ? 'No documentation problems.'
      : `${issues} documentation ${issues === 1 ? 'problem' : 'problems'}; click to open the Problems panel.`
  return { text: parts.join('  '), tooltip: `Markscope preview. ${problems}` }
}
