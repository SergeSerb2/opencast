import { memo, type ReactNode } from "react";
import type { MatchRange } from "../../lib/fuzzy";

/** Split text into plain and matched segments. Ranges are `[start, end)` and may overlap or be unsorted. */
export function highlightSegments(text: string, ranges: readonly MatchRange[] | undefined): { text: string; match: boolean }[] {
  if (!ranges || ranges.length === 0) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const [start, end] of ranges) for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) marks[i] = true;
  const segments: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else segments.push({ text: text[i], match: marks[i] });
  }
  return segments;
}

/** Text with fuzzy-match ranges emphasized (primary color, medium weight). */
export const HighlightedText = memo(function HighlightedText({ text, ranges }: { text: string; ranges?: readonly MatchRange[] }): ReactNode {
  if (!ranges || ranges.length === 0) return text;
  return highlightSegments(text, ranges).map((segment, i) =>
    segment.match ? (
      <mark key={i} className="sc-match">
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
});
