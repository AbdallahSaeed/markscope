import { h } from '@/shared/dom'

let dialog: HTMLDialogElement | null = null

/** Native <dialog> image viewer: focus-trapped, Esc to close, click to dismiss. */
export function openLightbox(img: HTMLImageElement): void {
  if (!dialog) {
    dialog = h('dialog', { class: 'ms-lightbox ms-ui', 'aria-label': 'Image preview' })
    dialog.addEventListener('click', () => dialog?.close())
    document.body.append(dialog)
  }
  const clone = h('img', {
    src: img.currentSrc || img.src,
    alt: img.alt,
    referrerpolicy: 'no-referrer',
  })
  const caption = img.alt
    ? h('p', { class: 'ms-lightbox__caption', text: img.alt })
    : null
  dialog.replaceChildren(clone, ...(caption ? [caption] : []))
  dialog.showModal()
}
