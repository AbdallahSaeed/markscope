/**
 * Content script for Markdown URLs. Tiny by design: it reads the raw text
 * the browser already loaded and hands it to the service worker, which
 * opens it in the Markscope viewer (an extension page with a strict CSP).
 * It never renders untrusted HTML into the web page itself.
 */
import { MAX_HANDOFF_BYTES } from '@/shared/messages'
import { parseSettings } from '@/shared/settings'
import { decide, readPlainText } from './detect'

const BANNER_ID = 'markscope-offer'

async function main(): Promise<void> {
  const { text, isPlainText } = readPlainText(document)
  const nav = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  const stored = await chrome.storage.sync
    .get('settings')
    .catch(() => ({}) as Record<string, unknown>)
  const settings = parseSettings((stored as Record<string, unknown>).settings)

  const decision = decide(
    {
      url: location.href,
      contentType: document.contentType,
      navigationType: nav?.type ?? 'navigate',
      isPlainTextDocument: isPlainText,
    },
    {
      autoRender: settings.autoRender,
      userPattern: !/\.(md|markdown|mdown|mkdn?|mdx)$/i.test(location.pathname),
    },
  )
  if (decision.action === 'skip') return
  if (decision.action === 'offer') return showOffer(text)
  await handoff(text)
}

async function handoff(text: string): Promise<void> {
  if (text.length > MAX_HANDOFF_BYTES) return showOffer(text)
  await chrome.runtime.sendMessage({
    type: 'handoff',
    url: location.href,
    text,
    contentType: document.contentType,
  })
}

/** Small, self-contained banner (no external CSS, text only). */
function showOffer(text: string): void {
  if (document.getElementById(BANNER_ID)) return
  const bar = document.createElement('div')
  bar.id = BANNER_ID
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', 'Markscope')
  bar.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:8px;align-items:center;' +
    'padding:8px 10px 8px 14px;border-radius:10px;font:13px/1.3 system-ui,sans-serif;' +
    'background:#141821;color:#f3f4f7;box-shadow:0 8px 30px rgba(0,0,0,.25)'
  const label = document.createElement('span')
  label.textContent = 'Markdown document'
  const open = document.createElement('button')
  open.textContent = 'Open in Markscope'
  open.style.cssText =
    'all:unset;cursor:pointer;padding:6px 10px;border-radius:7px;background:#4f6bff;color:#fff;font-weight:600'
  open.addEventListener('click', () => {
    void handoff(text)
  })
  const close = document.createElement('button')
  close.textContent = '×'
  close.setAttribute('aria-label', 'Dismiss')
  close.style.cssText =
    'all:unset;cursor:pointer;padding:2px 6px;font-size:16px;opacity:.7'
  close.addEventListener('click', () => bar.remove())
  bar.append(label, open, close)
  document.body.append(bar)
}

main().catch(() => {
  // The extension may be updating/reloading; leave the raw page untouched.
})
