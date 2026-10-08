/**
 * Reads the current document of a tab the user invoked Markscope on (popup
 * "Render this page"), using the temporary activeTab grant.
 */
export async function readTabDocument(
  tabId: number,
  scripting: Pick<typeof chrome.scripting, 'executeScript'>,
): Promise<{ url: string; text: string; contentType: string } | null> {
  const results = await scripting.executeScript({
    target: { tabId },
    func: () => {
      const pre = document.body?.querySelector(':scope > pre')
      const text = pre?.textContent ?? document.body?.innerText ?? ''
      return { url: location.href, text, contentType: document.contentType }
    },
  })
  const result = results[0]?.result as
    { url?: unknown; text?: unknown; contentType?: unknown } | undefined
  if (
    !result ||
    typeof result.url !== 'string' ||
    typeof result.text !== 'string' ||
    typeof result.contentType !== 'string'
  ) {
    return null
  }
  return { url: result.url, text: result.text, contentType: result.contentType }
}
