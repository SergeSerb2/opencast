import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyMatch, positionsToRanges } from "../lib/fuzzy";
import { highlightSegments } from "../components/HighlightedText/HighlightedText";

describe("fuzzyMatch", () => {
  it("matches prefixes, word starts and subsequences", () => {
    expect(fuzzyMatch("clip", "Clipboard History")?.ranges).toEqual([[0, 4]]);
    expect(fuzzyMatch("ch", "Clipboard History")?.ranges).toEqual([
      [0, 1],
      [10, 11],
    ]);
    expect(fuzzyMatch("xyz", "Clipboard History")).toBeNull();
  });

  it("requires every whitespace-separated token", () => {
    expect(fuzzyMatch("hist clip", "Clipboard History")).not.toBeNull();
    expect(fuzzyMatch("hist zzz", "Clipboard History")).toBeNull();
  });

  it("ranks word-start and prefix matches above scattered ones", () => {
    const hits = fuzzyFilter(["Capture Window to Clipboard", "Clipboard History", "Recently Closed Tabs"], "clip", (t) => [{ text: t, highlight: true }]);
    expect(hits.map((h) => h.item)).toEqual(["Clipboard History", "Capture Window to Clipboard"]);
  });

  it("returns everything for an empty query", () => {
    expect(fuzzyFilter(["a", "b"], "  ", (t) => [{ text: t }])).toHaveLength(2);
  });
});

describe("highlight", () => {
  it("merges positions into ranges", () => {
    expect(positionsToRanges([5, 1, 2, 3, 3])).toEqual([
      [1, 4],
      [5, 6],
    ]);
  });

  it("splits text into matched segments", () => {
    expect(highlightSegments("Clipboard", [[0, 4]])).toEqual([
      { text: "Clip", match: true },
      { text: "board", match: false },
    ]);
    expect(highlightSegments("abc", undefined)).toEqual([{ text: "abc", match: false }]);
  });
});
