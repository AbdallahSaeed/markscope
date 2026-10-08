/**
 * Left sidebar with three tabs: Outline (TOC + scrollspy + filter),
 * Doctor (documentation lint) and Info (statistics).
 */
import type { DoctorIssue } from '@/analysis/doctor'
import type { Heading } from '@/engine/types'
import { h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import { formatReadingTime, type DocumentStats } from '@/shared/stats'

export type SidebarTab = 'outline' | 'doctor' | 'info'

export interface SidebarHooks {
  onHeading: (id: string) => void
  onLine: (line: number) => void
  onTab: (tab: SidebarTab) => void
}

export class Sidebar {
  readonly el: HTMLElement
  private tabs: Record<SidebarTab, HTMLButtonElement>
  private panels: Record<SidebarTab, HTMLElement>
  private outlineList = h('ol', { class: 'ms-outline' })
  private filter = h('input', {
    type: 'search',
    class: 'ms-outline-filter',
    placeholder: 'Filter headings',
    'aria-label': 'Filter headings',
  })
  private links = new Map<string, HTMLAnchorElement>()
  private headings: Heading[] = []
  private activeId: string | null = null
  private observer: IntersectionObserver | null = null
  private doctorBadge = h('span', { class: 'ms-badge', hidden: true })

  constructor(private readonly hooks: SidebarHooks) {
    const tab = (id: SidebarTab, label: string, ico: readonly string[], extra?: Node) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'ms-tab',
          id: `ms-tab-${id}`,
          'aria-controls': `ms-panel-${id}`,
          'aria-selected': 'false',
          on: { click: () => this.select(id, true) },
        },
        icon(ico),
        h('span', { text: label }),
        extra,
      )
    this.tabs = {
      outline: tab('outline', 'Outline', ICONS.list),
      doctor: tab('doctor', 'Doctor', ICONS.stethoscope, this.doctorBadge),
      info: tab('info', 'Info', ICONS.info),
    }
    const panel = (id: SidebarTab, ...children: Node[]) =>
      h(
        'div',
        {
          role: 'tabpanel',
          class: 'ms-panel',
          id: `ms-panel-${id}`,
          'aria-labelledby': `ms-tab-${id}`,
          hidden: true,
        },
        ...children,
      )
    this.panels = {
      outline: panel(
        'outline',
        this.filter,
        h('nav', { 'aria-label': 'Document outline' }, this.outlineList),
      ),
      doctor: panel('doctor'),
      info: panel('info'),
    }
    const tablist = h(
      'div',
      { role: 'tablist', class: 'ms-tabs', 'aria-label': 'Sidebar' },
      ...Object.values(this.tabs),
    )
    tablist.addEventListener('keydown', e => this.onTabKey(e))
    this.el = h(
      'aside',
      { class: 'ms-sidebar ms-ui', 'aria-label': 'Document sidebar' },
      tablist,
      ...Object.values(this.panels),
    )
    this.filter.addEventListener('input', () => this.applyFilter())
    this.outlineList.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a) return
      e.preventDefault()
      this.hooks.onHeading(a.dataset.id ?? '')
    })
    // Re-evaluate once scrolling settles (covers short final sections).
    window.addEventListener('scrollend', () => this.refreshActive())
    this.select('outline', false)
  }

  select(tab: SidebarTab, notify: boolean): void {
    for (const [id, btn] of Object.entries(this.tabs) as [
      SidebarTab,
      HTMLButtonElement,
    ][]) {
      const on = id === tab
      btn.setAttribute('aria-selected', String(on))
      btn.tabIndex = on ? 0 : -1
      this.panels[id].hidden = !on
    }
    if (notify) this.hooks.onTab(tab)
  }

  private onTabKey(e: KeyboardEvent): void {
    const order: SidebarTab[] = ['outline', 'doctor', 'info']
    const current = order.findIndex(
      t => this.tabs[t].getAttribute('aria-selected') === 'true',
    )
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = order[(current + delta + order.length) % order.length] ?? 'outline'
    this.select(next, true)
    this.tabs[next].focus()
  }

  setHeadings(headings: Heading[], article: HTMLElement): void {
    this.headings = headings
    this.links.clear()
    this.activeId = null
    const min = headings.length ? Math.min(...headings.map(x => x.level)) : 1
    const items = headings.map(heading => {
      const a = h(
        'a',
        {
          href: `#${heading.id}`,
          class: `ms-outline__link l${heading.level - min + 1}`,
          title: heading.text,
          dataset: { id: heading.id },
        },
        heading.text || '(untitled)',
      )
      this.links.set(heading.id, a)
      return h('li', {}, a)
    })
    this.outlineList.replaceChildren(
      ...(items.length
        ? items
        : [h('li', { class: 'ms-empty', text: 'No headings in this document' })]),
    )
    this.applyFilter()
    this.observe(article)
  }

  private applyFilter(): void {
    const q = this.filter.value.trim().toLowerCase()
    for (const [, a] of this.links) {
      const li = a.parentElement
      if (li) li.hidden = q !== '' && !(a.textContent ?? '').toLowerCase().includes(q)
    }
  }

  /** Scrollspy: the active heading is the last one above the reading line. */
  private observe(article: HTMLElement): void {
    this.observer?.disconnect()
    const els = this.headings
      .map(x => article.querySelector(`[id="${CSS.escape(x.id)}"]`))
      .filter((x): x is Element => !!x)
    this.observed = els
    this.observer = new IntersectionObserver(() => this.updateActive(els), {
      rootMargin: '-56px 0px -65% 0px',
      threshold: [0, 1],
    })
    els.forEach(el => this.observer?.observe(el))
  }

  private observed: Element[] = []

  private refreshActive(): void {
    if (this.observed.length) this.updateActive(this.observed)
  }

  private updateActive(els: Element[]): void {
    // The intersection callback is only a cheap trigger; the active heading
    // is the last one whose top has crossed the reading line.
    const line = Math.min(160, window.innerHeight * 0.3)
    let id: string | null = els[0]?.id ?? null
    for (const el of els) {
      if (el.getBoundingClientRect().top <= line) id = el.id
      else break
    }
    // At the very bottom the last sections can never reach the reading line;
    // activate the last heading that is actually on screen.
    const atBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
    if (atBottom) {
      const onScreen = els.filter(el => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.top < window.innerHeight
      })
      id = onScreen[onScreen.length - 1]?.id ?? id
    }
    if (id === this.activeId) return
    if (this.activeId) this.links.get(this.activeId)?.removeAttribute('aria-current')
    this.activeId = id
    const link = id ? this.links.get(id) : undefined
    if (link) {
      link.setAttribute('aria-current', 'location')
      if (!this.el.matches(':hover')) this.revealInPanel(link)
    }
  }

  /**
   * Keeps the active entry visible by scrolling the outline panel only.
   * (Element.scrollIntoView would also scroll the window — fighting the
   * user's scroll and cancelling smooth scrolling.)
   */
  private revealInPanel(link: HTMLElement): void {
    const panel = this.panels.outline
    const p = panel.getBoundingClientRect()
    const r = link.getBoundingClientRect()
    const margin = 24
    if (r.top < p.top + margin) panel.scrollTop -= p.top + margin - r.top
    else if (r.bottom > p.bottom - margin)
      panel.scrollTop += r.bottom - (p.bottom - margin)
  }

  get currentHeadingIndex(): number {
    return this.headings.findIndex(x => x.id === this.activeId)
  }

  get allHeadings(): Heading[] {
    return this.headings
  }

  setDoctor(issues: DoctorIssue[]): void {
    const errors = issues.filter(i => i.severity === 'error').length
    this.doctorBadge.hidden = issues.length === 0
    this.doctorBadge.textContent = String(issues.length)
    this.doctorBadge.classList.toggle('is-error', errors > 0)
    const panel = this.panels.doctor
    if (issues.length === 0) {
      panel.replaceChildren(
        h(
          'div',
          { class: 'ms-empty-state' },
          icon(ICONS.check),
          h('p', { text: 'No problems found.' }),
          h('small', { text: 'Checks anchors, headings, images, links and TODOs.' }),
        ),
      )
      return
    }
    const list = h(
      'ul',
      { class: 'ms-issues' },
      ...issues.map(issue =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: `ms-issue ms-issue--${issue.severity}`,
              on: { click: () => this.hooks.onLine(issue.line) },
            },
            h('span', { class: 'ms-issue__sev', text: issue.severity }),
            h('span', { class: 'ms-issue__msg', text: issue.message }),
            h('span', { class: 'ms-issue__line', text: `L${issue.line}` }),
          ),
        ),
      ),
    )
    panel.replaceChildren(
      h('p', {
        class: 'ms-panel__summary',
        text: `${issues.length} finding${issues.length === 1 ? '' : 's'} · ${errors} error${errors === 1 ? '' : 's'}`,
      }),
      list,
    )
  }

  setInfo(
    stats: DocumentStats,
    meta: { source: string; renderMs: number; size: number },
  ): void {
    const row = (k: string, v: string) => [h('dt', { text: k }), h('dd', { text: v })]
    this.panels.info.replaceChildren(
      h(
        'dl',
        { class: 'ms-stats' },
        ...row('Words', stats.words.toLocaleString()),
        ...row('Reading time', formatReadingTime(stats.readingMinutes)),
        ...row('Characters', stats.characters.toLocaleString()),
        ...row('Lines', stats.lines.toLocaleString()),
        ...row('Headings', String(stats.headings)),
        ...row('Code blocks', String(stats.codeBlocks)),
        ...row('Links', String(stats.links)),
        ...row('Images', String(stats.images)),
        ...row('Size', formatBytes(meta.size)),
        ...row('Render time', `${Math.round(meta.renderMs)} ms`),
      ),
      h('p', { class: 'ms-panel__source', text: meta.source }),
    )
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
