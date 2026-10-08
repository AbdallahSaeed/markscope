/**
 * Lazy diagram rendering. Mermaid (~2.5 MB) and Graphviz (WASM) are only
 * downloaded when a document actually contains a diagram, and each diagram
 * renders when it scrolls near the viewport.
 */
import DOMPurify from 'dompurify'
import { errorMessage } from '@/shared/errors'

type Kind = 'mermaid' | 'graphviz'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let vizPromise: Promise<
  Awaited<ReturnType<typeof import('@viz-js/viz').instance>>
> | null = null
let seq = 0

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(m => m.default)
  return mermaidPromise
}

function loadViz() {
  vizPromise ??= import('@viz-js/viz').then(m => m.instance())
  return vizPromise
}

/**
 * Mermaid emits a <style> element scoped to the diagram id. User directives
 * cannot inject CSS (themeCSS is locked via `secure`), and any stylesheet
 * that could load resources or escape the diagram scope is dropped.
 */
export function sanitizeSvg(svg: string, scopeId?: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'style'],
    FORBID_TAGS: ['script', 'a', 'animate', 'set', 'image', 'use', 'feImage'],
    FORBID_ATTR: ['href', 'xlink:href'],
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment
  for (const style of Array.from(fragment.querySelectorAll('style'))) {
    const css = style.textContent ?? ''
    // url(#local-gradient) references are fine; anything else could load a resource.
    const unsafe = /@import|url\s*\(\s*(?!['"]?#)|expression|position\s*:\s*fixed/i.test(
      css,
    )
    const scoped =
      scopeId !== undefined &&
      css
        .split('}')
        .every(
          rule =>
            rule.trim() === '' ||
            rule.trim().startsWith(`#${scopeId}`) ||
            rule.trim().startsWith('@'),
        )
    if (unsafe || !scoped) style.remove()
  }
  return fragment
}

async function renderOne(el: HTMLElement, dark: boolean): Promise<void> {
  const kind = el.dataset.diagram as Kind
  const source = el.querySelector('.ms-diagram__source code')?.textContent ?? ''
  const renderId = `ms-mermaid-${++seq}`
  el.dataset.state = 'rendering'
  el.querySelector('.ms-diagram__error')?.remove()
  try {
    let svg: string
    if (kind === 'mermaid') {
      const mermaid = await loadMermaid()
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'neutral',
        fontFamily: 'inherit',
        // Plain SVG <text> labels: no HTML inside <foreignObject> to sanitize.
        // (Root-level setting; the flowchart-scoped one is deprecated/ignored.)
        htmlLabels: false,
        // Directives in the document may not override security or inject CSS.
        secure: [
          'secure',
          'securityLevel',
          'startOnLoad',
          'maxTextSize',
          'themeCSS',
          'fontFamily',
          'htmlLabels',
          'flowchart',
        ],
      })
      svg = (await mermaid.render(renderId, source)).svg
    } else {
      const viz = await loadViz()
      svg = viz.renderString(source, { format: 'svg', engine: 'dot' })
    }
    const figure =
      el.querySelector('.ms-diagram__figure') ??
      el.appendChild(
        Object.assign(document.createElement('div'), { className: 'ms-diagram__figure' }),
      )
    figure.replaceChildren(sanitizeSvg(svg, kind === 'mermaid' ? renderId : undefined))
    el.dataset.state = 'ready'
  } catch (error) {
    el.dataset.state = 'error'
    const msg = document.createElement('p')
    msg.className = 'ms-diagram__error'
    msg.textContent = `${kind === 'mermaid' ? 'Mermaid' : 'Graphviz'} error: ${errorMessage(error).split('\n')[0]}`
    el.append(msg)
    // Mermaid leaves an error SVG in <body> when rendering fails.
    document.getElementById(`d${renderId}`)?.remove()
    document.getElementById(renderId)?.remove()
  }
}

export class DiagramRenderer {
  private observer: IntersectionObserver | null = null
  private dark = false

  observe(root: HTMLElement, dark: boolean): void {
    this.disconnect()
    this.dark = dark
    const items = Array.from(root.querySelectorAll<HTMLElement>('.ms-diagram'))
    if (items.length === 0) return
    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          this.observer?.unobserve(entry.target)
          void renderOne(entry.target as HTMLElement, this.dark)
        }
      },
      { rootMargin: '600px 0px' },
    )
    items.forEach(el => this.observer?.observe(el))
  }

  /** Re-render visible Mermaid diagrams after a theme change. */
  retheme(root: HTMLElement, dark: boolean): void {
    this.dark = dark
    root
      .querySelectorAll<HTMLElement>(
        '.ms-diagram[data-diagram="mermaid"][data-state="ready"]',
      )
      .forEach(el => {
        void renderOne(el, dark)
      })
  }

  /** Render everything now (export/print need fully rendered diagrams). */
  /**
   * Render everything now (print/export need complete output). With `dark`
   * given, Mermaid diagrams already rendered in another theme are redone.
   */
  async renderAll(root: HTMLElement, dark: boolean = this.dark): Promise<void> {
    const all = Array.from(root.querySelectorAll<HTMLElement>('.ms-diagram'))
    const todo = all.filter(
      el =>
        el.dataset.state !== 'ready' ||
        (el.dataset.diagram === 'mermaid' && dark !== this.dark),
    )
    await Promise.all(todo.map(el => renderOne(el, dark)))
  }

  /** Restores diagrams to the on-screen theme after a print/export pass. */
  async restoreTheme(root: HTMLElement): Promise<void> {
    await Promise.all(
      Array.from(
        root.querySelectorAll<HTMLElement>('.ms-diagram[data-diagram="mermaid"]'),
      ).map(el => renderOne(el, this.dark)),
    )
  }

  disconnect(): void {
    this.observer?.disconnect()
    this.observer = null
  }
}
