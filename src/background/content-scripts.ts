/**
 * User-configured URL patterns (Settings → General) are registered as
 * dynamic content scripts — but only for origins the user has granted via
 * the optional host permission prompt.
 */
import { isValidMatchPattern } from '@/shared/settings'

export const DYNAMIC_SCRIPT_ID = 'markscope-user-patterns'

export async function syncUserPatterns(
  patterns: string[],
  api: {
    scripting: Pick<
      typeof chrome.scripting,
      | 'registerContentScripts'
      | 'unregisterContentScripts'
      | 'getRegisteredContentScripts'
    >
    permissions: Pick<typeof chrome.permissions, 'contains'>
  },
): Promise<string[]> {
  const valid = patterns.filter(isValidMatchPattern)
  const granted: string[] = []
  for (const p of valid) {
    if (await api.permissions.contains({ origins: [p] })) granted.push(p)
  }
  const existing = await api.scripting.getRegisteredContentScripts({
    ids: [DYNAMIC_SCRIPT_ID],
  })
  if (existing.length > 0)
    await api.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] })
  if (granted.length > 0) {
    await api.scripting.registerContentScripts([
      {
        id: DYNAMIC_SCRIPT_ID,
        js: ['js/content.js'],
        matches: granted,
        runAt: 'document_end',
        persistAcrossSessions: true,
      },
    ])
  }
  return granted
}
