import * as vscode from 'vscode'
import type { DoctorIssue, Severity } from '@/analysis/doctor'
import { toDiagnosticSpecs } from './diagnostic-map'

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
}

/** The document doctor's findings, shown in the Problems panel. */
export class DiagnosticsSink implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('markscope')

  /** Ignored when the document changed since the issues were computed. */
  set(doc: vscode.TextDocument, version: number, issues: readonly DoctorIssue[]): void {
    if (doc.version !== version) return
    const specs = toDiagnosticSpecs(
      issues,
      doc.lineCount,
      line => doc.lineAt(line).text.length,
    )
    this.collection.set(
      doc.uri,
      specs.map(spec => {
        const range = new vscode.Range(spec.line, 0, spec.line, spec.endCharacter)
        const diagnostic = new vscode.Diagnostic(
          range,
          spec.message,
          SEVERITY[spec.severity],
        )
        diagnostic.source = 'Markscope'
        diagnostic.code = spec.code
        return diagnostic
      }),
    )
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri)
  }

  dispose(): void {
    this.collection.dispose()
  }
}
