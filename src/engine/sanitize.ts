/**
 * HTML sanitization: the single trust boundary between rendered Markdown
 * and the viewer DOM. Everything produced by `renderDocument` passes here.
 *
 * Defence in depth: the viewer is an extension page whose CSP forbids
 * inline script, so even a sanitizer bypass cannot execute JavaScript.
 */
import DOMPurify, { type Config } from 'dompurify'

export const FORBIDDEN_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'noscript',
  'portal',
  'dialog',
  // SVG elements that fetch remote resources or reference other content.
  'image',
  'use',
  'feImage',
]

const FORBIDDEN_ATTRS = [
  'autofocus',
  'formaction',
  'srcdoc',
  'ping',
  'autoplay',
  'popover',
  'poster',
  'xlink:href',
  'background',
]

const CONFIG: Config = {
  FORBID_TAGS: FORBIDDEN_TAGS,
  FORBID_ATTR: FORBIDDEN_ATTRS,
  // KaTeX MathML; `annotation-xml` stays forbidden (known mXSS vector).
  ADD_TAGS: ['semantics', 'annotation'],
  ADD_ATTR: ['data-source-line', 'data-lang', 'data-diagram', 'align', 'start'],
  ALLOW_DATA_ATTR: false,
  // Heading ids like "links" or "title" must survive, so DOM-clobbering
  // protection is handled by our hooks (no `name`, no reserved ids).
  SANITIZE_DOM: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  USE_PROFILES: { html: true, svg: true, mathMl: true },
}

/**
 * Inline styles are needed by KaTeX (sizes, offsets, colors) and by common
 * README HTML (alignment). Only layout-neutral properties survive, and no
 * value may load a resource: this blocks tracking via url(), and UI redress
 * via position/z-index overlays.
 */
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'text-align',
  'vertical-align',
  'font-weight',
  'font-style',
  'text-decoration',
  'white-space',
  'height',
  'width',
  'min-width',
  'max-width',
  'top',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-left',
  'padding-right',
  'border-bottom-width',
  'border-top-width',
  'border-right-width',
  'border-left-width',
  'border-style',
  'border-color',
])

export function filterStyle(style: string): string {
  return style
    .split(';')
    .map(decl => {
      const i = decl.indexOf(':')
      if (i === -1) return null
      const prop = decl.slice(0, i).trim().toLowerCase()
      const value = decl.slice(i + 1).trim()
      if (!ALLOWED_STYLE_PROPS.has(prop)) return null
      if (/url\s*\(|expression|image-set|@import|\\|var\s*\(|attr\s*\(/i.test(value))
        return null
      return `${prop}:${value}`
    })
    .filter((d): d is string => d !== null)
    .join(';')
}

/** Ids used by viewer chrome; content may not claim them (DOM clobbering). */
const RESERVED_ID_RE =
  /^ms-(root|main|doc|sidebar|tab-|panel-|opt-|palette|help|home|dropzone|search|popup|options)/i
const isReservedId = (v: string) => RESERVED_ID_RE.test(v)

let hooksInstalled = false

function installHooks(purify: typeof DOMPurify): void {
  if (hooksInstalled) return
  hooksInstalled = true

  purify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'name') {
      // Legacy <a name="x"> anchors become ids; `name` never survives.
      if (
        node.nodeName === 'A' &&
        !node.hasAttribute('id') &&
        /^[\w.:-]{1,100}$/.test(data.attrValue) &&
        !isReservedId(data.attrValue)
      ) {
        node.setAttribute('id', data.attrValue)
      }
      data.keepAttr = false
    }
    if (data.attrName === 'id' && isReservedId(data.attrValue)) data.keepAttr = false
    if (data.attrName === 'style') {
      data.attrValue = filterStyle(data.attrValue)
      if (data.attrValue === '') data.keepAttr = false
    }
    if (data.attrName === 'class') {
      // Content may not impersonate viewer chrome classes beyond the ones the
      // renderer itself emits.
      data.attrValue = data.attrValue
        .split(/\s+/)
        .filter(c => !/^ms-(?!code$|diagram|toc-|frontmatter$|details$)/.test(c))
        .join(' ')
    }
  })

  purify.addHook('afterSanitizeAttributes', node => {
    if (isReservedId(node.getAttribute('id') ?? '')) node.removeAttribute('id')
    if (node.nodeName === 'INPUT') {
      // Only read-only task-list checkboxes are allowed.
      if (node.getAttribute('type') !== 'checkbox') node.remove()
      else node.setAttribute('disabled', '')
    }
    if (node.nodeName.toUpperCase() === 'A') {
      node.removeAttribute('target')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.nodeName === 'IMG') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
      node.setAttribute('referrerpolicy', 'no-referrer')
    }
    if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
      node.setAttribute('controls', '')
      node.setAttribute('preload', 'metadata')
    }
  })
}

export function sanitizeToFragment(html: string): DocumentFragment {
  installHooks(DOMPurify)
  return DOMPurify.sanitize(html, {
    ...CONFIG,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment
}

export function sanitizeToString(html: string): string {
  installHooks(DOMPurify)
  return DOMPurify.sanitize(html, { ...CONFIG }) as string
}
