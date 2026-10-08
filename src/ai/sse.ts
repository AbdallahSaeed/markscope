/**
 * Incremental Server-Sent Events parser (data lines only), robust to
 * chunks splitting lines and CRLF line endings.
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(buffer[nl] === '\r' ? nl + 2 : nl + 1)
        if (line === '') {
          if (data.length) yield data.join('\n')
          data = []
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
        }
      }
    }
    // Flush a final line that arrived without a trailing newline.
    buffer += decoder.decode()
    if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''))
    if (data.length) yield data.join('\n')
  } finally {
    reader.releaseLock()
  }
}
