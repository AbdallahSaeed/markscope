/**
 * Turns a RenderResult into the live, interactive document DOM: sanitizes,
 * resolves links/images against the source URL, and adds code-block chrome,
 * heading anchors, diagrams and image interactions.
 */
import { sanitizeToFragment } from '@/engine/sanitize'
import { languageLabel } from '@/engine/highlight'
import type { RenderResult } from '@/engine/types'
import { copyText, h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import type { Settings } from '@/shared/settings'
import { describeSource, resolveLink, resolveMediaSrc, safeParseUrl } from '@/shared/urls'
import { DiagramRenderer } from './diagrams'
import { openLightbox } from './lightbox'

export const LARGE_DOCUMENT_CHARS = 400_000

export interface DocumentViewHooks {
  onExplainCode?: (code: string, lang: string) => void
  onImageError?: (src: string) => void
  onNavigateAnchor?: (id: string) => void
  /** Loads folder (workspace:) or file: media as a blob URL. */
  loadLocalMedia?: (url: string) => Promise<string | null>
  /** A relative image can't be resolved (document has no location). */
  onUnresolvedLocalMedia?: (count: number) => void
  /** User clicked a "needs folder" placeholder (a user gesture). */
  onRequestFolder?: () => void
  /** Same-folder document link: navigate in place (keeps folder permission). */
  onNavigateWorkspace?: (target: string, hash: string) => boolean
}

const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const isRelativeRef = (ref: string) =>
  ref.trim() !== '' &&
  !HAS_SCHEME_RE.test(ref) &&
  !ref.startsWith('//') &&
  !ref.startsWith('#')

let katexCssLoaded = false
function ensureKatexCss(): void {
  if (katexCssLoaded) return
  katexCssLoaded = true
  document.head.append(
    h('link', { rel: 'stylesheet', href: 'vendor/katex/katex.min.css' }),
  )
}

export class DocumentView {
  readonly diagrams = new DiagramRenderer()
  private brokenImages = new Set<string>()
  private objectUrls: string[] = []

  constructor(
    readonly article: HTMLElement,
    private readonly viewerBase: string,
    private readonly hooks: DocumentViewHooks,
  ) {
    article.addEventListener('click', this.onClick)
  }

  get failedImages(): ReadonlySet<string> {
    return this.brokenImages
  }

  render(
    result: RenderResult,
    opts: {
      settings: Settings
      baseUrl: string | null
      sourceLength: number
      dark: boolean
      aiEnabled: boolean
    },
  ): void {
    const fragment = sanitizeToFragment(result.html)
    this.brokenImages = new Set()
    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls = []
    this.rewriteLinks(fragment, opts.baseUrl)
    this.rewriteMedia(fragment, opts.baseUrl, opts.settings)
    this.decorateHeadings(fragment)
    this.decorateCode(fragment, opts.settings, opts.aiEnabled)
    this.wrapTables(fragment)
    if (result.features.math) ensureKatexCss()

    this.article.classList.toggle('is-large', opts.sourceLength > LARGE_DOCUMENT_CHARS)
    this.article.replaceChildren(fragment)
    this.diagrams.observe(this.article, opts.dark)
  }

  /** All ids in the rendered document (for the doctor's anchor check). */
  knownIds(): Set<string> {
    return new Set(Array.from(this.article.querySelectorAll('[id]'), el => el.id))
  }

  private rewriteLinks(root: DocumentFragment, baseUrl: string | null): void {
    for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const resolved = resolveLink(a.getAttribute('href') ?? '', baseUrl, this.viewerBase)
      switch (resolved.kind) {
        case 'anchor':
          a.setAttribute('href', resolved.href)
          break
        case 'document':
          a.setAttribute('href', resolved.href)
          a.dataset.msDoc = resolved.target
          a.title ||= `Open ${describeSource(resolved.target).name} in Markscope`
          break
        case 'external':
          a.setAttribute('href', resolved.href)
          a.classList.add('ms-external')
          break
        case 'invalid':
          a.removeAttribute('href')
          a.classList.add('ms-link-invalid')
          a.title = 'Link removed: unsupported or unsafe URL'
          break
      }
    }
  }

  private rewriteMedia(
    root: DocumentFragment,
    baseUrl: string | null,
    settings: Settings,
  ): void {
    const baseHost = baseUrl ? safeParseUrl(baseUrl)?.host : undefined
    let unresolved = 0
    for (const el of Array.from(
      root.querySelectorAll<HTMLImageElement | HTMLSourceElement | HTMLVideoElement>(
        'img[src], source[src], video[src], audio[src]',
      ),
    )) {
      const original = el.getAttribute('src') ?? ''
      const src = resolveMediaSrc(original, baseUrl)
      if (!src) {
        // A relative image in a document with no known location (opened via
        // ⌘O or drag & drop): say why, instead of silently dropping it.
        if (!baseUrl && isRelativeRef(original) && el instanceof HTMLImageElement) {
          el.replaceWith(this.needsFolderPlaceholder(original, el.alt))
          unresolved += 1
          continue
        }
        el.removeAttribute('src')
        continue
      }
      if (src.startsWith('workspace:')) {
        el.removeAttribute('src')
        el.dataset.msOriginalSrc = original
        void this.loadLocal(el, src)
        continue
      }
      const remoteHost = /^https?:/.test(src) ? safeParseUrl(src)?.host : undefined
      if (
        settings.privacy.remoteImages === 'block' &&
        remoteHost &&
        remoteHost !== baseHost &&
        el instanceof HTMLImageElement
      ) {
        el.replaceWith(this.blockedImage(src, el.alt, remoteHost))
        continue
      }
      el.setAttribute('src', src)
      if (el instanceof HTMLImageElement) {
        el.dataset.msOriginalSrc = original
        el.addEventListener(
          'error',
          () => {
            // Some browsers refuse file:// images in extension pages; read the
            // file through the extension instead before giving up.
            if (src.startsWith('file:') && this.hooks.loadLocalMedia)
              void this.loadLocal(el, src)
            else this.markBroken(el)
          },
          { once: true },
        )
      }
    }
    if (unresolved) this.hooks.onUnresolvedLocalMedia?.(unresolved)
    // srcset can smuggle relative URLs; resolve or drop each candidate.
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[srcset]'))) {
      const resolved = (el.getAttribute('srcset') ?? '')
        .split(',')
        .map(part => {
          const [url, size] = part.trim().split(/\s+/, 2)
          const abs = url ? resolveMediaSrc(url, baseUrl) : null
          // Folder images are loaded via blob URLs from `src`; drop srcset ones.
          return abs && !abs.startsWith('workspace:')
            ? [abs, size].filter(Boolean).join(' ')
            : null
        })
        .filter(Boolean)
      if (resolved.length) el.setAttribute('srcset', resolved.join(', '))
      else el.removeAttribute('srcset')
    }
  }

  private async loadLocal(
    el: HTMLImageElement | HTMLSourceElement | HTMLVideoElement,
    url: string,
  ): Promise<void> {
    try {
      const blobUrl = (await this.hooks.loadLocalMedia?.(url)) ?? null
      if (!blobUrl) throw new Error('unavailable')
      this.objectUrls.push(blobUrl)
      el.setAttribute('src', blobUrl)
      if (el instanceof HTMLImageElement) {
        el.addEventListener('error', () => this.markBroken(el), { once: true })
      }
    } catch {
      if (el instanceof HTMLImageElement) this.markBroken(el)
      else el.removeAttribute('src')
    }
  }

  private needsFolderPlaceholder(src: string, alt: string): HTMLElement {
    const name = src.split(/[?#]/)[0]?.split('/').pop() ?? src
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'ms-blocked-image ms-needs-folder',
        title: `${src} is a relative path. Open the folder that contains this document to show it.`,
      },
      icon(ICONS.folder),
      h('span', {
        text: `Image “${alt || name}” — open the folder to show local images`,
      }),
    )
    btn.addEventListener('click', () => this.hooks.onRequestFolder?.())
    return btn
  }

  private blockedImage(src: string, alt: string, host: string): HTMLElement {
    const btn = h(
      'button',
      { class: 'ms-blocked-image', type: 'button', title: src },
      icon(ICONS.eye),
      h('span', { text: `Load image from ${host}` }),
      alt ? h('small', { text: alt }) : null,
    )
    btn.addEventListener('click', () => {
      const img = h('img', { src, alt, loading: 'lazy', referrerpolicy: 'no-referrer' })
      img.addEventListener('error', () => this.markBroken(img), { once: true })
      btn.replaceWith(img)
    })
    return btn
  }

  private markBroken(img: HTMLImageElement): void {
    const original = img.dataset.msOriginalSrc ?? img.src
    this.brokenImages.add(original)
    const placeholder = h(
      'span',
      {
        class: 'ms-broken-image',
        role: 'img',
        'aria-label': img.alt || 'Image failed to load',
        title: img.src,
      },
      icon(ICONS.file),
      h('span', { text: img.alt || 'Image failed to load' }),
    )
    img.replaceWith(placeholder)
    this.hooks.onImageError?.(original)
  }

  private decorateHeadings(root: DocumentFragment): void {
    for (const heading of Array.from(
      root.querySelectorAll<HTMLElement>(
        'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]',
      ),
    )) {
      const anchor = h('a', {
        class: 'ms-anchor',
        href: `#${heading.id}`,
        'aria-label': `Link to “${heading.textContent?.trim() ?? ''}”`,
      })
      anchor.textContent = '§'
      heading.prepend(anchor)
    }
  }

  private decorateCode(
    root: DocumentFragment,
    settings: Settings,
    aiEnabled: boolean,
  ): void {
    for (const block of Array.from(root.querySelectorAll<HTMLElement>('.ms-code'))) {
      const code = block.querySelector('code')
      if (!code) continue
      const lang = block.dataset.lang ?? ''
      const text = code.textContent ?? ''
      const lines = text.endsWith('\n')
        ? text.split('\n').length - 1
        : text.split('\n').length

      const copy = h(
        'button',
        {
          type: 'button',
          class: 'ms-code__btn',
          'data-action': 'copy',
          'aria-label': 'Copy code',
          title: 'Copy code',
        },
        icon(ICONS.copy),
        h('span', { text: 'Copy' }),
      )
      const explain = aiEnabled
        ? h(
            'button',
            {
              type: 'button',
              class: 'ms-code__btn',
              'data-action': 'explain',
              'aria-label': 'Explain code with AI',
              title: 'Explain with AI',
            },
            icon(ICONS.sparkles),
            h('span', { text: 'Explain' }),
          )
        : null
      const bar = h(
        'div',
        { class: 'ms-code__bar ms-ui' },
        h('span', { class: 'ms-code__lang', text: lang ? languageLabel(lang) : 'text' }),
        h('span', {
          class: 'ms-code__meta',
          text: `${lines} ${lines === 1 ? 'line' : 'lines'}`,
        }),
        h('span', { class: 'ms-code__spacer' }),
        explain,
        copy,
      )
      block.prepend(bar)

      const pre = block.querySelector('pre')
      if (pre && settings.code.lineNumbers && lines > 1) {
        const gutter = h('span', { class: 'ms-gutter', 'aria-hidden': 'true' })
        gutter.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join(
          '\n',
        )
        pre.prepend(gutter)
        pre.classList.add('has-gutter')
      }
      if (pre && settings.code.wrap && !settings.code.lineNumbers)
        pre.classList.add('is-wrapped')
    }
  }

  private wrapTables(root: DocumentFragment): void {
    for (const table of Array.from(root.querySelectorAll('table'))) {
      if (table.closest('.ms-frontmatter')) continue
      const wrap = h('div', {
        class: 'ms-table-wrap',
        tabindex: '0',
        role: 'region',
        'aria-label': 'Table',
      })
      table.replaceWith(wrap)
      wrap.append(table)
    }
  }

  private readonly onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const btn = target.closest<HTMLButtonElement>('.ms-code__btn')
    if (btn) {
      const block = btn.closest('.ms-code') as HTMLElement | null
      const code = block?.querySelector('code')?.textContent ?? ''
      if (btn.dataset.action === 'copy') void this.copy(btn, code)
      else if (btn.dataset.action === 'explain')
        this.hooks.onExplainCode?.(code, block?.dataset.lang ?? '')
      return
    }
    const img = target.closest('img')
    if (img && !img.closest('a') && this.article.contains(img)) {
      openLightbox(img)
      return
    }
    const anchor = target.closest('a')
    const docTarget = anchor?.dataset.msDoc
    if (
      docTarget?.startsWith('workspace:') &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      let hash = ''
      try {
        hash = new URL(anchor?.getAttribute('href') ?? '', 'https://x.invalid/').hash
      } catch {
        // no hash
      }
      if (this.hooks.onNavigateWorkspace?.(docTarget, hash)) {
        event.preventDefault()
        return
      }
    }
    const href = anchor?.getAttribute('href')
    if (anchor && href?.startsWith('#') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      let id = href.slice(1)
      try {
        id = decodeURIComponent(id)
      } catch {
        // malformed escape: use the raw fragment
      }
      this.hooks.onNavigateAnchor?.(id)
    }
  }

  private async copy(btn: HTMLButtonElement, code: string): Promise<void> {
    const label = btn.querySelector('span')
    try {
      await copyText(code.replace(/\n$/, ''))
      btn.classList.add('is-done')
      if (label) label.textContent = 'Copied'
    } catch {
      if (label) label.textContent = 'Copy failed'
    }
    setTimeout(() => {
      btn.classList.remove('is-done')
      if (label) label.textContent = 'Copy'
    }, 1500)
  }

  dispose(): void {
    this.diagrams.disconnect()
    this.article.removeEventListener('click', this.onClick)
  }
}
