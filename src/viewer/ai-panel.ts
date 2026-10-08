/**
 * Optional AI assistant drawer. Hidden entirely unless AI is enabled in
 * Settings. Output is rendered through the same sanitizing pipeline as
 * documents.
 */
import { TASK_LABELS } from '@/ai/prompts'
import { renderDocument } from '@/engine/render'
import { sanitizeToFragment } from '@/engine/sanitize'
import { copyText, h, icon } from '@/shared/dom'
import { ICONS } from '@/shared/icons'
import type { AITask, ChatTurn } from '@/shared/messages'
import { defaultSettings, type Settings } from '@/shared/settings'
import { AIClient } from './ai-client'
import { DiagramRenderer } from './diagrams'

export interface AIContext {
  document: () => string
  title: () => string
  selection: () => string
  dark: () => boolean
}

const QUICK: AITask[] = ['summarize', 'outline', 'review', 'improve', 'diagram']
const CONFIRM_KEY = 'markscope.ai.confirmed'

export class AIPanel {
  readonly el: HTMLElement
  private log = h('div', {
    class: 'ms-ai__log',
    role: 'log',
    'aria-live': 'polite',
    'aria-busy': 'false',
  })
  private input = h('textarea', {
    class: 'ms-ai__input',
    rows: '2',
    placeholder: 'Ask about this document…',
    'aria-label': 'Ask about this document',
  })
  private sendBtn = h(
    'button',
    { type: 'button', class: 'ms-btn ms-btn--primary', 'aria-label': 'Send' },
    icon(ICONS.send),
  )
  private modelLabel = h('span', { class: 'ms-ai__model' })
  private client = new AIClient()
  private busy = false
  /** Finalises the in-flight answer when the user presses Stop. */
  private finishCurrent: (() => void) | null = null
  private paintFrame = 0
  private thread: { task: AITask; history: ChatTurn[]; selection?: string } | null = null
  private settings: Settings = defaultSettings()

  constructor(
    private readonly ctx: AIContext,
    private readonly onClose: () => void,
  ) {
    const quick = h(
      'div',
      { class: 'ms-ai__quick' },
      ...QUICK.map(task =>
        h('button', {
          type: 'button',
          class: 'ms-chip',
          text: TASK_LABELS[task],
          on: { click: () => this.start(task) },
        }),
      ),
      h('button', {
        type: 'button',
        class: 'ms-chip',
        text: 'Explain selection',
        on: { click: () => this.explainSelection() },
      }),
    )
    const form = h('form', { class: 'ms-ai__form' }, this.input, this.sendBtn)
    form.addEventListener('submit', e => {
      e.preventDefault()
      this.submit()
    })
    this.sendBtn.addEventListener('click', () =>
      this.busy ? this.stop() : this.submit(),
    )
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        this.submit()
      }
    })
    this.el = h(
      'aside',
      { class: 'ms-ai ms-ui', 'aria-label': 'AI assistant', hidden: true },
      h(
        'header',
        { class: 'ms-ai__head' },
        icon(ICONS.sparkles),
        h('h2', { text: 'Assistant' }),
        this.modelLabel,
        h(
          'button',
          {
            type: 'button',
            class: 'ms-icon-btn',
            'aria-label': 'New conversation',
            title: 'New conversation',
            on: { click: () => this.reset() },
          },
          icon(ICONS.plus),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'ms-icon-btn',
            'aria-label': 'Close assistant',
            title: 'Close (Esc)',
            on: { click: () => this.onClose() },
          },
          icon(ICONS.x),
        ),
      ),
      quick,
      this.log,
      form,
      h('p', {
        class: 'ms-ai__note',
        text: 'AI output can be wrong. Document text is sent to your configured provider only when you run a request.',
      }),
    )
    this.reset()
  }

  configure(settings: Settings): void {
    this.settings = settings
    this.modelLabel.textContent = `${settings.ai.provider} · ${settings.ai.model}`
  }

  focus(): void {
    this.input.focus()
  }

  reset(): void {
    this.stop()
    this.thread = null
    this.log.replaceChildren(
      h(
        'div',
        { class: 'ms-ai__empty' },
        h('p', { text: 'Ask a question, or pick a quick action above.' }),
        h('small', {
          text: 'Tip: select text in the document, then “Explain selection”.',
        }),
      ),
    )
  }

  explainSelection(selection = this.ctx.selection()): void {
    if (!selection.trim()) {
      this.addNotice('Select some text in the document first.')
      return
    }
    this.start('explain', selection)
  }

  explainCode(code: string, lang: string): void {
    this.start('explain-code', lang ? `\`\`\`${lang}\n${code}\n\`\`\`` : code)
  }

  start(task: AITask, selection?: string, question?: string): void {
    const label =
      question ??
      (selection
        ? `${TASK_LABELS[task]}: “${truncateLabel(selection)}”`
        : TASK_LABELS[task])
    this.thread = { task, history: [], ...(selection ? { selection } : {}) }
    this.log.replaceChildren()
    this.send(label, question)
  }

  private submit(): void {
    const question = this.input.value.trim()
    if (!question || this.busy) return
    this.input.value = ''
    if (!this.thread || this.thread.history.length === 0)
      this.start('ask', undefined, question)
    else this.send(question, question)
  }

  private send(label: string, question?: string): void {
    const thread = this.thread
    if (!thread) return
    if (!this.confirmed()) {
      this.askConfirmation(() => this.send(label, question))
      return
    }
    this.addTurn('user', label)
    const out = this.addTurn('assistant', '')
    out.classList.add('is-streaming')
    let text = ''
    const historyBefore = thread.history
    const finish = (stopped: boolean) => {
      this.finishCurrent = null
      cancelAnimationFrame(this.paintFrame)
      out.classList.remove('is-streaming')
      this.paint(out, text, true)
      if (text) this.addActions(out, text)
      if (stopped) this.addNotice('Stopped.')
      thread.history = [
        ...historyBefore,
        { role: 'user', content: question ?? label },
        { role: 'assistant', content: text || '(no answer)' },
      ]
      this.setBusy(false)
    }
    this.finishCurrent = () => finish(true)
    this.setBusy(true)
    this.client.run(
      {
        task: thread.task,
        document: this.ctx.document(),
        title: this.ctx.title(),
        ...(thread.selection ? { selection: thread.selection } : {}),
        ...(question ? { question } : {}),
        history: historyBefore,
      },
      {
        onDelta: delta => {
          text += delta
          // Re-render at most once per frame while streaming.
          cancelAnimationFrame(this.paintFrame)
          this.paintFrame = requestAnimationFrame(() => this.paint(out, text))
        },
        onDone: truncated => {
          finish(false)
          if (truncated)
            this.addNotice('The document was long, so only its beginning was sent.')
        },
        onError: message => {
          this.finishCurrent = null
          cancelAnimationFrame(this.paintFrame)
          out.classList.remove('is-streaming')
          out.classList.add('is-error')
          out.replaceChildren(h('p', { text: message }))
          this.setBusy(false)
        },
      },
    )
  }

  private stop(): void {
    if (!this.busy) return
    this.client.abort()
    if (this.finishCurrent) this.finishCurrent()
    else this.setBusy(false)
  }

  private setBusy(busy: boolean): void {
    this.busy = busy
    // Announce finished answers, not every streamed token.
    this.log.setAttribute('aria-busy', String(busy))
    this.sendBtn.replaceChildren(icon(busy ? [...ICONS.stop] : [...ICONS.send]))
    this.sendBtn.setAttribute('aria-label', busy ? 'Stop' : 'Send')
  }

  private paint(target: HTMLElement, markdown: string, final = false): void {
    const result = renderDocument(markdown, {
      markdown: {
        ...this.settings.markdown,
        html: false,
        mermaid: final,
        graphviz: final,
      },
      highlight: true,
    })
    target.replaceChildren(stripRemoteMedia(sanitizeToFragment(result.html)))
    // One renderer per finished answer so earlier answers keep their observers.
    if (final) new DiagramRenderer().observe(target, this.ctx.dark())
    const nearBottom =
      this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80
    if (nearBottom) this.log.scrollTop = this.log.scrollHeight
  }

  private addTurn(role: 'user' | 'assistant', text: string): HTMLElement {
    const body = h('div', { class: 'ms-ai__body ms-doc' }, text)
    this.log.append(
      h(
        'div',
        { class: `ms-ai__turn ms-ai__turn--${role}` },
        h('span', { class: 'ms-ai__role', text: role === 'user' ? 'You' : 'Assistant' }),
        body,
      ),
    )
    return body
  }

  private addActions(target: HTMLElement, text: string): void {
    const copy = h(
      'button',
      { type: 'button', class: 'ms-chip ms-chip--quiet' },
      icon(ICONS.copy),
      h('span', { text: 'Copy' }),
    )
    copy.addEventListener(
      'click',
      () => void copyText(text).then(() => (copy.lastChild!.textContent = 'Copied')),
    )
    target.after(h('div', { class: 'ms-ai__actions' }, copy))
  }

  private addNotice(text: string): void {
    this.log.append(h('p', { class: 'ms-ai__notice', text }))
  }

  private confirmed(): boolean {
    if (!this.settings.ai.confirmBeforeSend) return true
    return (
      sessionStorage.getItem(CONFIRM_KEY) ===
      this.settings.ai.provider + this.settings.ai.baseUrl
    )
  }

  private askConfirmation(proceed: () => void): void {
    const size = this.ctx.document().length
    const box = h(
      'div',
      {
        class: 'ms-ai__confirm',
        role: 'alertdialog',
        'aria-label': 'Confirm sending document',
      },
      h(
        'p',
        {},
        'Send this document (',
        h('strong', { text: `${size.toLocaleString()} characters` }),
        `) to ${this.settings.ai.provider} at `,
        h('code', { text: this.settings.ai.baseUrl || 'the provider default' }),
        '?',
      ),
      h(
        'div',
        { class: 'ms-ai__confirm-actions' },
        h('button', {
          type: 'button',
          class: 'ms-btn ms-btn--primary',
          text: 'Send',
          on: {
            click: () => {
              sessionStorage.setItem(
                CONFIRM_KEY,
                this.settings.ai.provider + this.settings.ai.baseUrl,
              )
              box.remove()
              proceed()
            },
          },
        }),
        h('button', {
          type: 'button',
          class: 'ms-btn',
          text: 'Cancel',
          on: { click: () => box.remove() },
        }),
      ),
    )
    this.log.append(box)
    box.querySelector('button')?.focus()
  }
}

/**
 * AI output may be steered by prompt injection in the document. A remote
 * image URL would then exfiltrate data the moment it loads, so remote media
 * in AI answers are replaced by inert text showing the URL.
 */
export function stripRemoteMedia(fragment: DocumentFragment): DocumentFragment {
  for (const el of Array.from(
    fragment.querySelectorAll('img, video, audio, source, picture, image'),
  )) {
    const src = el.getAttribute('src') ?? el.getAttribute('srcset') ?? ''
    if (/^(data|blob):/i.test(src) && !el.hasAttribute('srcset')) continue
    const note = document.createElement('span')
    note.className = 'ms-ai__blocked'
    note.textContent = src
      ? `[image not loaded: ${src.slice(0, 120)}]`
      : '[image not loaded]'
    el.replaceWith(note)
  }
  return fragment
}

function truncateLabel(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > 60 ? `${one.slice(0, 57)}…` : one
}
