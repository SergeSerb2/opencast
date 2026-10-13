export interface ColorValue {
  hex: string;
  rgb: string;
  hsl: string;
}
export function parseColor(input: string): ColorValue | null {
  let rgb: number[];
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(input.trim());
  const r =
    /^rgb\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(
      input.trim(),
    );
  const h =
    /^hsl\(\s*([+-]?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*\)$/i.exec(
      input.trim(),
    );
  if (hex) {
    const s =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  } else if (r) {
    rgb = r.slice(1).map(Number);
    if (rgb.some((n) => n > 255)) return null;
  } else if (h) {
    const hue = (((Number(h[1]) % 360) + 360) % 360) / 60;
    const saturation = Number(h[2]) / 100;
    const light = Number(h[3]) / 100;
    if (
      ![hue, saturation, light].every(Number.isFinite) ||
      saturation > 1 ||
      light > 1
    )
      return null;
    const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue % 2) - 1));
    const m = light - chroma / 2;
    rgb = (
      hue < 1
        ? [chroma, x, 0]
        : hue < 2
          ? [x, chroma, 0]
          : hue < 3
            ? [0, chroma, x]
            : hue < 4
              ? [0, x, chroma]
              : hue < 5
                ? [x, 0, chroma]
                : [chroma, 0, x]
    ).map((n) => Math.round((n + m) * 255));
  } else return null;
  rgb = rgb.map(Math.round);
  const [red, green, blue] = rgb.map((n) => n / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const light = (max + min) / 2;
  const hue =
    delta === 0
      ? 0
      : (max === red
          ? (green - blue) / delta + (green < blue ? 6 : 0)
          : max === green
            ? (blue - red) / delta + 2
            : (red - green) / delta + 4) * 60;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  return {
    hex: `#${rgb
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`,
    rgb: `rgb(${rgb.join(", ")})`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(light * 100)}%)`,
  };
}
