/** Color math for theme generation: sRGB ↔ OKLab, WCAG contrast, lightness correction. */

export type RGB = [r: number, g: number, b: number]; // 0..255

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Composite `top` at `alpha` over `bottom`. */
export function mix(bottom: RGB, top: RGB, alpha: number): RGB {
  return [bottom[0] + (top[0] - bottom[0]) * alpha, bottom[1] + (top[1] - bottom[1]) * alpha, bottom[2] + (top[2] - bottom[2]) * alpha];
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.min(255, Math.max(0, v))) as RGB;
}

function withLightness(color: RGB, lightness: number): RGB {
  const [, a, b] = rgbToOklab(color);
  return oklabToRgb([lightness, a, b]);
}

/**
 * Move the color's OKLab lightness away from the backdrop until the WCAG
 * contrast reaches `minRatio`: coarse steps of 0.1, then bisection.
 */
export function ensureContrast(color: RGB, backdrop: RGB, minRatio = 2.5): RGB {
  if (contrastRatio(color, backdrop) >= minRatio) return color;
  const direction = relativeLuminance(backdrop) < 0.18 ? 1 : -1;
  const start = rgbToOklab(color)[0];
  let failing = start;
  let passing: number | null = null;
  for (let step = 1; step <= 10; step++) {
    const l = Math.min(1, Math.max(0, start + direction * step * 0.1));
    if (contrastRatio(withLightness(color, l), backdrop) >= minRatio) {
      passing = l;
      break;
    }
    failing = l;
    if (l === 0 || l === 1) break;
  }
  if (passing === null) return withLightness(color, direction > 0 ? 1 : 0);
  let good: number = passing;
  for (let i = 0; i < 12; i++) {
    const mid: number = (failing + good) / 2;
    if (contrastRatio(withLightness(color, mid), backdrop) >= minRatio) good = mid;
    else failing = mid;
  }
  return withLightness(color, good);
}
