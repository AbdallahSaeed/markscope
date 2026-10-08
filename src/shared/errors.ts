export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unexpected error'
}

/** Thrown when a remote source cannot be read without extra host permission. */
export class PermissionNeededError extends Error {
  constructor(readonly origin: string) {
    super(`Markscope needs permission to read ${origin}`)
    this.name = 'PermissionNeededError'
  }
}

export class SourceLoadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SourceLoadError'
  }
}

/** Minimal namespaced logger; quiet in production except warnings/errors. */
export const log = {
  warn: (...args: unknown[]) => console.warn('[markscope]', ...args),
  error: (...args: unknown[]) => console.error('[markscope]', ...args),
}
