/** Glyphs offered by the AI command and preset icon pickers (Raycast `Icon` values). */
export const AI_ICON_CHOICES = [
  "stars-16",
  "wand-16",
  "bolt-16",
  "light-bulb-16",
  "speech-bubble-16",
  "pencil-16",
  "text-16",
  "paragraph-16",
  "quotation-marks-16",
  "bullet-points-16",
  "check-list-16",
  "envelope-16",
  "megaphone-16",
  "globe-01-16",
  "link-16",
  "book-16",
  "bookmark-16",
  "blank-document-16",
  "snippets-16",
  "code-16",
  "terminal-16",
  "bug-16",
  "hammer-16",
  "wrench-screwdriver-16",
  "cog-16",
  "magnifying-glass-16",
  "binoculars-16",
  "bar-chart-16",
  "line-chart-16",
  "calculator-16",
  "coins-16",
  "calendar-16",
  "clock-16",
  "person-16",
  "two-people-16",
  "heart-16",
  "star-16",
  "tag-16",
  "hashtag-16",
  "flag-16",
  "trophy-16",
  "rocket-16",
  "brush-16",
  "swatch-16",
  "image-16",
  "camera-16",
  "music-16",
  "map-16",
  "airplane-16",
  "house-16",
  "cart-16",
  "gift-16",
  "mug-16",
  "leaf-16",
  "sun-16",
  "moon-16",
  "shield-01-16",
  "lock-16",
  "key-16",
  "game-controller-16",
] as const;

const NUMBERED_SUFFIX = /-(0\d)$/;

/** "light-bulb-16" → "Light Bulb", "globe-01-16" → "Globe". */
export function iconTitle(name: string): string {
  return name
    .replace(/-(16|20)$/, "")
    .replace(NUMBERED_SUFFIX, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
