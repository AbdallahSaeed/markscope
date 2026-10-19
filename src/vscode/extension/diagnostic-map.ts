/** Maps doctor issues onto editor ranges. Pure; the host wraps the results in `vscode.Diagnostic`. */
import type { DoctorIssue, Severity } from '@/analysis/doctor'

export interface DiagnosticSpec {
  /** 0-based line. */
  line: number
  endCharacter: number
  severity: Severity
  message: string
  code: string
}

/**
 * `lineLength(i)` is the length of 0-based line i. Issues past the end of the
 * document (it changed since the issue was computed) are dropped.
 */
export function toDiagnosticSpecs(
  issues: readonly DoctorIssue[],
  lineCount: number,
  lineLength: (zeroBasedLine: number) => number,
): DiagnosticSpec[] {
  const specs: DiagnosticSpec[] = []
  for (const issue of issues) {
    const line = issue.line - 1
    if (line < 0 || line >= lineCount) continue
    specs.push({
      line,
      endCharacter: lineLength(line),
      severity: issue.severity,
      message: issue.message,
      code: issue.rule,
    })
  }
  return specs
}
