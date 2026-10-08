/** URL-safe random id (used for handoff tokens and local document ids). */
export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (const b of buf) out += b.toString(16).padStart(2, '0')
  return out
}
