import { describe, expect, it } from "vitest";
import { countCharacters, countWords, looksLikeMarkdown, plainTitle, pluralize, timeAgo, titleFromText } from "../lib/text";

describe("titles", () => {
  it("uses the first line of the first block", () => {
    expect(titleFromText("Groceries\nmilk")).toBe("Groceries");
    expect(titleFromText("   Padded   ")).toBe("Padded");
    expect(titleFromText("")).toBe("Untitled");
    expect(titleFromText("\nsecond")).toBe("Untitled");
  });

  it("strips Markdown from stored first lines", () => {
    expect(plainTitle("# Launch plan")).toBe("Launch plan");
    expect(plainTitle("### Third level")).toBe("Third level");
    expect(plainTitle("- [ ] **Buy** milk")).toBe("Buy milk");
    expect(plainTitle("1. [x] Done item")).toBe("Done item");
    expect(plainTitle("> Quoted *idea*")).toBe("Quoted idea");
    expect(plainTitle("Read [the docs](https://example.com) and `code`")).toBe("Read the docs and code");
    expect(plainTitle("~~old~~ and ++under++")).toBe("old and under");
    expect(plainTitle("snake_case_name stays")).toBe("snake_case_name stays");
    expect(plainTitle("Escaped \\*stars\\*")).toBe("Escaped *stars*");
    expect(plainTitle("#hashtag is text")).toBe("#hashtag is text");
    expect(plainTitle("")).toBe("Untitled");
    expect(plainTitle("- ")).toBe("Untitled");
  });
});

describe("counters", () => {
  it("counts user-perceived characters of the trimmed text", () => {
    expect(countCharacters("")).toBe(0);
    expect(countCharacters("  hello  ")).toBe(5);
    expect(countCharacters("👍🏽 ok")).toBe(4);
    expect(countCharacters("é")).toBe(1); // e + combining accent
    expect(countCharacters("a\nb")).toBe(3);
  });

  it("counts word-like segments", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("one two  three")).toBe(3);
    expect(countWords("Hello, world! 42")).toBe(3);
    expect(countWords("— • —")).toBe(0);
  });

  it("pluralizes units", () => {
    expect(pluralize(0, "character")).toBe("0 characters");
    expect(pluralize(1, "character")).toBe("1 character");
    expect(pluralize(2, "word")).toBe("2 words");
  });
});

describe("timeAgo", () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const ago = (seconds: number) => timeAgo(now - seconds * 1000, now);
  it("formats relative open times", () => {
    expect(ago(5)).toBe("just now");
    expect(ago(60)).toBe("1 minute ago");
    expect(ago(32 * 60)).toBe("32 minutes ago");
    expect(ago(3 * 3600)).toBe("3 hours ago");
    expect(ago(2 * 86400)).toBe("2 days ago");
    expect(ago(14 * 86400)).toBe("2 weeks ago");
    expect(ago(40 * 86400)).toBe("1 month ago");
    expect(ago(800 * 86400)).toBe("2 years ago");
    expect(timeAgo(now + 5000, now)).toBe("just now");
  });
});

describe("looksLikeMarkdown", () => {
  it("recognizes Markdown structure", () => {
    for (const text of ["# Heading", "- item", "* item", "1. first", "- [ ] task", "> quote", "```js\ncode\n```", "---", "see [link](https://x.y)", "**bold** text", "use `code`"]) {
      expect(looksLikeMarkdown(text), text).toBe(true);
    }
  });
  it("leaves prose alone", () => {
    for (const text of ["Just a sentence.", "Two lines\nof prose", "Price: 5 * 3 = 15", "#hashtag", "email me at a@b.c"]) {
      expect(looksLikeMarkdown(text), text).toBe(false);
    }
  });
});
