import type { ColorLike, NamedColor } from "@opencast/protocol";

const NAMED: Record<NamedColor, string> = {
  "raycast-blue": "var(--blue-contrast)",
  "raycast-green": "var(--green-contrast)",
  "raycast-magenta": "var(--magenta-contrast)",
  "raycast-orange": "var(--orange-contrast)",
  "raycast-purple": "var(--purple-contrast)",
  "raycast-red": "var(--red-contrast)",
  "raycast-yellow": "var(--yellow-contrast)",
  "raycast-primary-text": "var(--color-text-primary)",
  "raycast-secondary-text": "var(--color-text-secondary)",
};

/** Theme hue for a named color ("blue"), used to build `--blue-20` style fills. */
export function namedColorHue(color: ColorLike | undefined): string | null {
  if (typeof color !== "string" || !(color in NAMED)) return null;
  const hue = color.replace("raycast-", "");
  return hue === "primary-text" || hue === "secondary-text" ? null : hue;
}

/** Resolve a Raycast ColorLike to a CSS color for the current appearance. */
export function resolveColor(color: ColorLike | undefined | null, appearance: "dark" | "light"): string | undefined {
  if (!color) return undefined;
  if (typeof color === "object") return appearance === "dark" ? color.dark : color.light;
  return NAMED[color as NamedColor] ?? color;
}
