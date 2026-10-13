import type { EmojiItem } from "@surgecast/protocol";

/** Backend emoji groups, in display order, with their filter icons. */
export const EMOJI_CATEGORIES: { title: string; icon: string }[] = [
  { title: "Smileys & Emotion", icon: "emoji-16" },
  { title: "People & Body", icon: "person-16" },
  { title: "Animals & Nature", icon: "bird-16" },
  { title: "Food & Drink", icon: "mug-16" },
  { title: "Travel & Places", icon: "airplane-16" },
  { title: "Activities", icon: "game-controller-16" },
  { title: "Objects", icon: "light-bulb-16" },
  { title: "Symbols", icon: "hashtag-16" },
  { title: "Flags", icon: "flag-16" },
];

export const ALL_CATEGORIES = "all";
export const FREQUENTLY_USED = "Frequently Used";

export const SKIN_TONES = ["None", "Light", "Medium Light", "Medium", "Medium Dark", "Dark"] as const;

const TONE_MODIFIERS = ["\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
const TONE_PATTERN = /[\u{1F3FB}-\u{1F3FF}]/gu;

export const MIN_COLUMNS = 6;
export const MAX_COLUMNS = 10;
export const DEFAULT_COLUMNS = 8;

/** "grinning face" → "Grinning Face" (emojibase labels are lowercase). */
export function titleCase(name: string): string {
  return name.replace(/(^|[\s(-])(\p{Ll})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * The variant of an emoji for a skin tone (0 = none … 5 = dark). Only variants
 * that use that single tone qualify, so multi-person combinations are skipped.
 */
export function skinToneVariant(item: EmojiItem, tone: number): string {
  const base = item.emoji.replace(TONE_PATTERN, "");
  if (tone === 0 || !item.skins?.length) return base;
  const modifier = TONE_MODIFIERS[tone - 1];
  return item.skins.find((skin) => {
    const tones = skin.match(TONE_PATTERN) ?? [];
    return tones.length > 0 && tones.every((t) => t === modifier);
  }) ?? base;
}

/** "U+1F600 U+FE0F" for copying code points. */
export function unicodeCodePoints(text: string): string {
  return [...text].map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
}

export interface EmojiSection {
  title: string;
  items: EmojiItem[];
}

/**
 * Shape backend sections for the grid: Frequently Used is capped at two rows
 * and hidden while searching; the Frequently Used filter keeps only that section.
 */
export function visibleSections(sections: EmojiSection[], options: { query: string; filter: string; columns: number }): EmojiSection[] {
  const searching = options.query.trim().length > 0;
  return sections
    .filter((section) => {
      if (options.filter === FREQUENTLY_USED) return section.title === FREQUENTLY_USED;
      return !(searching && section.title === FREQUENTLY_USED);
    })
    .map((section) => (section.title === FREQUENTLY_USED && options.filter !== FREQUENTLY_USED ? { ...section, items: section.items.slice(0, options.columns * 2) } : section))
    .filter((section) => section.items.length > 0);
}
