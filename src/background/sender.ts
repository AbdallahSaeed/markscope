/** Sender classification used to authorise runtime messages. */
export type SenderKind = 'extension-page' | 'content-script' | 'untrusted'

export function classifySender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
  extensionOrigin: string,
): SenderKind {
  if (sender.id !== runtimeId) return 'untrusted'
  const url = sender.url ?? ''
  if (url.startsWith(extensionOrigin)) return 'extension-page'
  if (sender.tab?.id !== undefined && /^(https?|file):/.test(url)) return 'content-script'
  return 'untrusted'
}
