import {
  buildViewerUrl,
  markdownMatchPatterns,
  normalizeDocumentUrl,
  sourceProtocol,
} from '@/shared/urls'

export const MENU_OPEN_LINK = 'markscope-open-link'
export const MENU_OPEN_PAGE = 'markscope-open-repo-page'

const REPO_BLOB_PATTERNS = [
  'https://github.com/*/blob/*',
  'https://gitlab.com/*/-/blob/*',
  'https://bitbucket.org/*/src/*',
]

export function createMenus(
  menus: Pick<typeof chrome.contextMenus, 'create' | 'removeAll'>,
): Promise<void> {
  return menus.removeAll().then(() => {
    menus.create({
      id: MENU_OPEN_LINK,
      title: 'Open link in Markscope',
      contexts: ['link'],
      targetUrlPatterns: [
        ...markdownMatchPatterns().filter(p => !p.startsWith('file')),
        ...REPO_BLOB_PATTERNS,
      ],
    })
    menus.create({
      id: MENU_OPEN_PAGE,
      title: 'Open this file in Markscope',
      contexts: ['page'],
      documentUrlPatterns: REPO_BLOB_PATTERNS,
    })
  })
}

export function menuTargetUrl(
  info: chrome.contextMenus.OnClickData,
  viewerBase: string,
): string | null {
  const raw =
    info.menuItemId === MENU_OPEN_LINK
      ? info.linkUrl
      : info.menuItemId === MENU_OPEN_PAGE
        ? info.pageUrl
        : undefined
  if (!raw) return null
  const src = normalizeDocumentUrl(raw)
  if (!sourceProtocol(src)) return null
  return buildViewerUrl(viewerBase, { src })
}
