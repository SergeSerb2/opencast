/**
 * "Copy Color as…" formats for clipboard color entries. Math follows CSS Color 4
 * (sRGB, Lab/LCH relative to D50 via Bradford, OKLab/OKLCH from linear sRGB).
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse #RGB, #RGBA, #RRGGBB or #RRGGBBAA. */
export function parseHexColor(input: string): Rgba | null {
  const hex = input.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1 };
}

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
const alpha = (a: number) => String(round(a, 2));

function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function rgbToLab(color: Rgba): [number, number, number] {
  const [r, g, b] = [linear(color.r), linear(color.g), linear(color.b)];
  // Linear sRGB → XYZ (D65)
  const x65 = 0.4123907992659595 * r + 0.357584339383878 * g + 0.1804807884018343 * b;
  const y65 = 0.21263900587151036 * r + 0.715168678767756 * g + 0.07219231536073371 * b;
  const z65 = 0.01933081871559185 * r + 0.11919477979462598 * g + 0.9505321522496606 * b;
  // Bradford D65 → D50
  const x = 1.0479298208405488 * x65 + 0.022946793341019088 * y65 - 0.05019222954313557 * z65;
  const y = 0.029627815688159344 * x65 + 0.990434484573249 * y65 - 0.01707382502938514 * z65;
  const z = -0.009243058152591178 * x65 + 0.015055144896577895 * y65 + 0.7518742899580008 * z65;
  const white = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x / white[0]), f(y / white[1]), f(z / white[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function rgbToOklab(color: Rgba): [number, number, number] {
  const [r, g, b] = [linear(color.r), linear(color.g), linear(color.b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function polar(a: number, b: number): [number, number] {
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return [chroma, chroma < 1e-4 ? 0 : (hue + 360) % 360];
}

export interface ColorFormat {
  title: string;
  value: string;
}

/** Every format Raycast offers, in its order. */
export function colorFormats(color: Rgba): ColorFormat[] {
  const { r, g, b, a } = color;
  const [h, s, l] = rgbToHsl(color);
  const whiteness = (Math.min(r, g, b) / 255) * 100;
  const blackness = (1 - Math.max(r, g, b) / 255) * 100;
  const [labL, labA, labB] = rgbToLab(color);
  const [lchC, lchH] = polar(labA, labB);
  const [okL, okA, okB] = rgbToOklab(color);
  const [okC, okH] = polar(okA, okB);
  const slashAlpha = a < 1 ? ` / ${alpha(a)}` : "";
  const unit = (n: number) => round(n / 255, 3);
  return [
    { title: "Hex", value: `#${hex2(r)}${hex2(g)}${hex2(b)}` },
    { title: "Hex with Alpha", value: `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}` },
    { title: "RGBA", value: `rgba(${r}, ${g}, ${b}, ${alpha(a)})` },
    { title: "RGBA (Percentage)", value: `rgba(${round((r / 255) * 100, 1)}%, ${round((g / 255) * 100, 1)}%, ${round((b / 255) * 100, 1)}%, ${alpha(a)})` },
    { title: "RGB (CSS4)", value: `rgb(${r} ${g} ${b}${slashAlpha})` },
    { title: "HSL", value: `hsl(${round(h)}, ${round(s)}%, ${round(l)}%)` },
    { title: "HSL with Alpha", value: `hsla(${round(h)}, ${round(s)}%, ${round(l)}%, ${alpha(a)})` },
    { title: "HSL (CSS4)", value: `hsl(${round(h)} ${round(s)}% ${round(l)}%${slashAlpha})` },
    { title: "HWB", value: `hwb(${round(h)} ${round(whiteness)}% ${round(blackness)}%${slashAlpha})` },
    { title: "Lab", value: `lab(${round(labL, 2)}% ${round(labA, 2)} ${round(labB, 2)}${slashAlpha})` },
    { title: "LCH", value: `lch(${round(labL, 2)}% ${round(lchC, 2)} ${round(lchH, 2)}${slashAlpha})` },
    { title: "Oklab", value: `oklab(${round(okL, 4)} ${round(okA, 4)} ${round(okB, 4)}${slashAlpha})` },
    { title: "Oklch", value: `oklch(${round(okL, 4)} ${round(okC, 4)} ${round(okH, 2)}${slashAlpha})` },
    { title: "NSColor", value: `NSColor(srgbRed: ${unit(r)}, green: ${unit(g)}, blue: ${unit(b)}, alpha: ${alpha(a)})` },
    { title: "UIColor", value: `UIColor(red: ${unit(r)}, green: ${unit(g)}, blue: ${unit(b)}, alpha: ${alpha(a)})` },
  ];
}
