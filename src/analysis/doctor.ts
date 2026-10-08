/**
 * Document Doctor: deterministic documentation lint that runs locally with
 * no AI and no network. Each issue points at a source line.
 */
import type { Heading, ImageRef, LinkRef } from '@/engine/types'

export type Severity = 'error' | 'warning' | 'info'

export interface DoctorIssue {
  rule: string
  severity: Severity
  message: string
  line: number
}

export interface DoctorInput {
  source: string
  headings: Heading[]
  links: LinkRef[]
  images: ImageRef[]
  /** Every id present in the rendered DOM (headings, footnotes, raw HTML). */
  knownIds: ReadonlySet<string>
  /** Image sources that failed to load at runtime. */
  brokenImages?: ReadonlySet<string>
}

const TODO_RE = /\b(TODO|FIXME|XXX|HACK)\b[:\s]?(.*)$/

export function findTodos(source: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  let inFence = false
  source.split('\n').forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence
    const m = TODO_RE.exec(line)
    if (m) {
      issues.push({
        rule: 'todo',
        severity: 'info',
        message: `${m[1]}${m[2]?.trim() ? `: ${m[2].trim().slice(0, 120)}` : ''}${inFence ? ' (in code)' : ''}`,
        line: i + 1,
      })
    }
  })
  return issues
}

function headingIssues(headings: Heading[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const h1s = headings.filter(h => h.level === 1)
  if (h1s.length > 1) {
    for (const h of h1s.slice(1)) {
      issues.push({
        rule: 'single-h1',
        severity: 'warning',
        message: `Additional top-level heading “${h.text}”`,
        line: h.line,
      })
    }
  }
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1]
    const cur = headings[i]
    if (prev && cur && cur.level > prev.level + 1) {
      issues.push({
        rule: 'heading-increment',
        severity: 'warning',
        message: `Heading level jumps from h${prev.level} to h${cur.level} at “${cur.text}”`,
        line: cur.line,
      })
    }
  }
  const seen = new Map<string, Heading>()
  for (const h of headings) {
    const key = h.text.toLowerCase()
    if (key === '') {
      issues.push({
        rule: 'empty-heading',
        severity: 'warning',
        message: 'Empty heading',
        line: h.line,
      })
      continue
    }
    if (seen.has(key)) {
      issues.push({
        rule: 'duplicate-heading',
        severity: 'info',
        message: `Duplicate heading “${h.text}” (anchor becomes #${h.id})`,
        line: h.line,
      })
    } else seen.set(key, h)
  }
  return issues
}

function linkIssues(links: LinkRef[], knownIds: ReadonlySet<string>): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const l of links) {
    if (l.href.trim() === '') {
      issues.push({
        rule: 'empty-link',
        severity: 'error',
        message: `Link “${l.text || '(no text)'}” has no target`,
        line: l.line,
      })
      continue
    }
    if (l.text === '') {
      issues.push({
        rule: 'link-text',
        severity: 'warning',
        message: `Link to ${l.href} has no text`,
        line: l.line,
      })
    }
    if (l.href.startsWith('#') && l.href.length > 1) {
      let id = l.href.slice(1)
      try {
        id = decodeURIComponent(id)
      } catch {
        // keep raw
      }
      if (!knownIds.has(id)) {
        issues.push({
          rule: 'broken-anchor',
          severity: 'error',
          message: `Anchor ${l.href} does not match any heading or id`,
          line: l.line,
        })
      }
    }
    if (/^http:\/\//i.test(l.href)) {
      issues.push({
        rule: 'insecure-link',
        severity: 'info',
        message: `Insecure http:// link ${l.href}`,
        line: l.line,
      })
    }
  }
  return issues
}

function imageIssues(images: ImageRef[], broken: ReadonlySet<string>): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const img of images) {
    if (img.alt.trim() === '') {
      issues.push({
        rule: 'image-alt',
        severity: 'warning',
        message: `Image ${img.src || '(no src)'} has no alt text`,
        line: img.line,
      })
    }
    if (img.src.trim() === '') {
      issues.push({
        rule: 'image-src',
        severity: 'error',
        message: 'Image has no source',
        line: img.line,
      })
    } else if (broken.has(img.src)) {
      issues.push({
        rule: 'broken-image',
        severity: 'error',
        message: `Image failed to load: ${img.src}`,
        line: img.line,
      })
    }
  }
  return issues
}

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export function diagnose(input: DoctorInput): DoctorIssue[] {
  return [
    ...headingIssues(input.headings),
    ...linkIssues(input.links, input.knownIds),
    ...imageIssues(input.images, input.brokenImages ?? new Set()),
    ...findTodos(input.source),
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.line - b.line)
}
