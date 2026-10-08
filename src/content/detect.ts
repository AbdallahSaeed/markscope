/**
 * Content-script decision logic, kept pure for testing.
 */
import { hasRawMarker, isMarkdownContentType, isMarkdownPath } from '@/shared/urls'

export interface PageInfo {
  url: string
  contentType: string
  navigationType: string
  /** True when the page body is just a <pre> of text (how browsers show text/plain). */
  isPlainTextDocument: boolean
}

export type Decision =
  | { action: 'render' }
  | { action: 'skip'; reason: string }
  | { action: 'offer'; reason: string }

export function decide(
  page: PageInfo,
  opts: { autoRender: boolean; userPattern: boolean },
): Decision {
  if (!isMarkdownContentType(page.contentType))
    return { action: 'skip', reason: 'content-type' }
  if (!page.isPlainTextDocument) return { action: 'skip', reason: 'not-plain-text' }
  if (!opts.userPattern && !isMarkdownPath(page.url))
    return { action: 'skip', reason: 'not-markdown-url' }
  if (hasRawMarker(page.url)) return { action: 'offer', reason: 'raw-requested' }
  // Coming back via the Back button: redirecting again would trap the user.
  if (page.navigationType === 'back_forward')
    return { action: 'offer', reason: 'history-navigation' }
  if (!opts.autoRender) return { action: 'offer', reason: 'auto-render-off' }
  return { action: 'render' }
}

export function readPlainText(doc: Document): { text: string; isPlainText: boolean } {
  const body = doc.body
  if (!body) return { text: '', isPlainText: false }
  const children = Array.from(body.children)
  const pre = children.length === 1 && children[0]?.tagName === 'PRE' ? children[0] : null
  return pre
    ? { text: pre.textContent ?? '', isPlainText: true }
    : { text: '', isPlainText: false }
}
