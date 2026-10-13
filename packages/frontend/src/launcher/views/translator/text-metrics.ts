/** "3 Words · 15 Characters" under the source text. */
export function countLabel(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const characters = [...text].length;
  return `${words} ${words === 1 ? "Word" : "Words"} · ${characters} ${characters === 1 ? "Character" : "Characters"}`;
}

const STEPS: [maxLength: number, size: number][] = [
  [60, 24],
  [120, 22],
  [200, 20],
];

/**
 * Both panes share one text size that shrinks from 24px to 18px as the longer
 * of the two texts grows; each line break counts like a short line of text.
 */
export function translatorFontSize(...texts: string[]): number {
  const length = Math.max(0, ...texts.map((t) => [...t].length + (t.match(/\n/g)?.length ?? 0) * 24));
  for (const [max, size] of STEPS) if (length <= max) return size;
  return 18;
}
