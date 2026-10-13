import { describe, expect, it } from "vitest";
import type { ClipboardItem } from "@opencast/protocol";
import { clipboardSections, entriesSince, entryPath, formattedJson, suggestedFileName, suggestedSnippetName, textPreview } from "./clipboard-model";
import { colorFormats, parseHexColor } from "./color-formats";

const item = (patch: Partial<ClipboardItem>): ClipboardItem => ({ id: "x", kind: "text", title: "x", pinned: false, copyCount: 1, contentHash: "h", createdAt: 0, lastCopiedAt: 0, ...patch });

describe("clipboardSections", () => {
  it("puts pinned entries first, then date sections by last copy", () => {
    const now = Date.now();
    const sections = clipboardSections([item({ id: "old", lastCopiedAt: now - 400 * 86_400_000 }), item({ id: "pin", pinned: true, lastCopiedAt: 1 }), item({ id: "new", lastCopiedAt: now })]);
    expect(sections.map((s) => [s.title, s.items.map((i) => i.id)])).toEqual([
      ["Pinned", ["pin"]],
      ["Today", ["new"]],
      ["Older", ["old"]],
    ]);
  });
});

describe("textPreview", () => {
  it("keeps the first 15 lines and counts the rest", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const preview = textPreview(text);
    expect(preview.text.split("\n")).toHaveLength(15);
    expect(preview.hiddenCharacters).toBe(text.length - preview.text.length);
    expect(textPreview("short")).toEqual({ text: "short", hiddenCharacters: 0 });
  });
});

describe("entry helpers", () => {
  it("formats JSON only for objects and arrays", () => {
    expect(formattedJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(formattedJson("42")).toBeNull();
    expect(formattedJson("{nope")).toBeNull();
  });

  it("suggests names", () => {
    expect(suggestedFileName("Hello, brave new world")).toBe("Hello-brave-new.txt");
    expect(suggestedFileName("!!!")).toBe("Untitled.txt");
    expect(suggestedSnippetName("  first line\nsecond")).toBe("first line");
  });

  it("finds local paths for files and stored images", () => {
    expect(entryPath(item({ kind: "file", filePaths: ["/a/b.pdf"] }))).toBe("/a/b.pdf");
    expect(entryPath(item({ kind: "image", imagePath: "/data/clip.png" }))).toBe("/data/clip.png");
    expect(entryPath(item({ kind: "image", imagePath: "data:image/png;base64,AA" }))).toBeUndefined();
  });

  it("selects recent unpinned entries for deletion", () => {
    const now = 10 * 60_000;
    const entries = [item({ id: "a", lastCopiedAt: now - 60_000 }), item({ id: "b", lastCopiedAt: now - 9 * 60_000 }), item({ id: "c", lastCopiedAt: now, pinned: true })];
    expect(entriesSince(entries, 5, now).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("color formats", () => {
  it("parses hex colors", () => {
    expect(parseHexColor("#7C5CFF")).toEqual({ r: 124, g: 92, b: 255, a: 1 });
    expect(parseHexColor("#fff8")).toEqual({ r: 255, g: 255, b: 255, a: 136 / 255 });
    expect(parseHexColor("blue")).toBeNull();
  });

  it("converts to every format", () => {
    const formats = Object.fromEntries(colorFormats({ r: 255, g: 0, b: 0, a: 1 }).map((f) => [f.title, f.value]));
    expect(formats.Hex).toBe("#FF0000");
    expect(formats["Hex with Alpha"]).toBe("#FF0000FF");
    expect(formats.RGBA).toBe("rgba(255, 0, 0, 1)");
    expect(formats["RGBA (Percentage)"]).toBe("rgba(100%, 0%, 0%, 1)");
    expect(formats["RGB (CSS4)"]).toBe("rgb(255 0 0)");
    expect(formats.HSL).toBe("hsl(0, 100%, 50%)");
    expect(formats.HWB).toBe("hwb(0 0% 0%)");
    expect(formats.Lab).toBe("lab(54.29% 80.8 69.89)");
    expect(formats.Oklch).toBe("oklch(0.628 0.2577 29.23)");
    expect(formats.NSColor).toBe("NSColor(srgbRed: 1, green: 0, blue: 0, alpha: 1)");
  });
});
