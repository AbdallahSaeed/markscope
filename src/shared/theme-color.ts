/**
 * Small, dependency-free color math for the theme generator: hex ⇄ OKLab/OKLCH,
 * mixing, WCAG contrast and a lightness "nudge" that keeps hue and chroma.
 * Imported by Node (the build script) as well as the bundles, so: relative
 * `.ts` imports only and no runtime-only globals.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Oklch {
  l: number
  c: number
  h: number
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`Not a #rrggbb color: ${hex}`)
  const n = parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

const toLinear = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number): number => {
  const s = clamp01(v)
  return 255 * (s <= 0.0031308 ? 12.92 * s : 1.055 * s ** (1 / 2.4) - 0.055)
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

interface Lab {
  l: number
  a: number
  b: number
}

function toOklab(hex: string): Lab {
  const rgb = parseHex(hex)
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** Linear sRGB of an OKLab color; channels may fall outside 0–1 (out of gamut). */
function labToLinear({ l, a, b }: Lab): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (lin: [number, number, number]): boolean =>
  lin.every(v => v >= -0.0005 && v <= 1.0005)

function labToHex(lab: Lab): string {
  const [r, g, b] = labToLinear(lab)
  return toHex({ r: fromLinear(r), g: fromLinear(g), b: fromLinear(b) })
}

export function toOklch(hex: string): Oklch {
  const { l, a, b } = toOklab(hex)
  return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI }
}

/** OKLCH → hex. Out-of-gamut colors keep their lightness and hue and lose chroma. */
export function fromOklch({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180
  let chroma = c
  for (let i = 0; i < 40; i++) {
    const lab = { l, a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) }
    if (inGamut(labToLinear(lab))) return labToHex(lab)
    chroma *= 0.92
  }
  return labToHex({ l, a: 0, b: 0 })
}

/** `t` of the way from `a` to `b`, in OKLab. */
export function mix(a: string, b: string, t: number): string {
  const x = toOklab(a)
  const y = toOklab(b)
  return labToHex({
    l: x.l + (y.l - x.l) * t,
    a: x.a + (y.a - x.a) * t,
    b: x.b + (y.b - x.b) * t,
  })
}

/** The same hue and chroma at lightness shifted by `delta` (clamped). */
export function shiftLightness(hex: string, delta: number): string {
  const c = toOklch(hex)
  return fromOklch({ ...c, l: Math.min(0.99, Math.max(0.01, c.l + delta)) })
}

export interface Nudged {
  color: string
  changed: boolean
}

/**
 * Returns `color` unchanged when it already reaches `min` contrast against `bg`.
 * Otherwise moves its lightness (never hue) away from the background — darker on
 * a light surface, lighter on a dark one — in 0.5% steps until it does.
 */
export function ensureContrast(color: string, bg: string, min: number): Nudged {
  if (contrast(color, bg) >= min) return { color, changed: false }
  const start = toOklch(color)
  // Away from the background: toward whichever extreme it contrasts with more.
  const dir = contrast('#000000', bg) >= contrast('#ffffff', bg) ? -1 : 1
  let best = color
  for (let step = 1; step <= 200; step++) {
    const l = start.l + dir * step * 0.005
    if (l < 0 || l > 1) break
    best = fromOklch({ ...start, l })
    if (contrast(best, bg) >= min) return { color: best, changed: true }
  }
  // Could not reach it by lightness alone (a very low-chroma surface): fall back to the extreme.
  const extreme = dir < 0 ? '#000000' : '#ffffff'
  return {
    color: contrast(best, bg) > contrast(extreme, bg) ? best : extreme,
    changed: true,
  }
}
