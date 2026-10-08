/** Builds a ReadableStream that emits the given string chunks. */
export function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

export function sseResponse(events: string[], init: ResponseInit = {}): Response {
  return new Response(streamOf(events), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  })
}
