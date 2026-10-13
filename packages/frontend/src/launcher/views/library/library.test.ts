import { describe, expect, it } from "vitest";
import { faviconUrl } from "./favicon";
import { appleScriptString, exportFileName } from "./files";
import { basename, copyName, dateSection, displayDirectory, formatBytes, groupByDate, tildePath } from "./format";
import { countLabel, ImportFormatError, normalizeImport } from "./transfer";

// Wednesday, 14 October 2026, 15:00 local time.
const NOW = new Date(2026, 9, 14, 15, 0, 0);
const at = (...parts: number[]) => new Date(parts[0], parts[1], parts[2], parts[3] ?? 12).getTime();

describe("dateSection", () => {
  it("buckets like Raycast's history lists (weeks start on Monday)", () => {
    expect(dateSection(at(2026, 9, 14, 9), NOW)).toBe("Today");
    expect(dateSection(at(2026, 9, 13, 23), NOW)).toBe("Yesterday");
    expect(dateSection(at(2026, 9, 12), NOW)).toBe("This Week");
    expect(dateSection(at(2026, 9, 11), NOW)).toBe("This Month");
    expect(dateSection(at(2026, 0, 2), NOW)).toBe("This Year");
    expect(dateSection(at(2025, 11, 31), NOW)).toBe("Older");
  });

  it("groups in display order and can fold This Year into Older", () => {
    const items = [at(2025, 1, 1), at(2026, 9, 14), at(2026, 2, 1)];
    expect(groupByDate(items, (t) => t, { now: NOW }).map((g) => g.title)).toEqual(["Today", "This Year", "Older"]);
    expect(groupByDate(items, (t) => t, { now: NOW, thisYear: false }).map((g) => [g.title, g.items.length])).toEqual([
      ["Today", 1],
      ["Older", 2],
    ]);
  });
});

describe("formatting", () => {
  it("formats decimal byte counts", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(912)).toBe("912 bytes");
    expect(formatBytes(182_400)).toBe("182 kB");
    expect(formatBytes(2_480_000)).toBe("2.5 MB");
    expect(formatBytes(96_400_000)).toBe("96.4 MB");
    expect(formatBytes(88_000)).toBe("88 kB");
  });

  it("abbreviates the home folder", () => {
    expect(tildePath("/Users/me/Documents/a.pdf")).toBe("~/Documents/a.pdf");
    expect(displayDirectory("/Users/me/Documents/a.pdf")).toBe("~/Documents");
    expect(displayDirectory("/Applications/Safari.app/")).toBe("/Applications");
    expect(basename("/Users/me/Developer/surgecast/")).toBe("surgecast");
  });

  it("names duplicates", () => {
    expect(copyName("Sig", ["Sig"])).toBe("Sig Copy");
    expect(copyName("Sig", ["Sig", "Sig Copy", "Sig Copy 2"])).toBe("Sig Copy 3");
  });

  it("names export files in local time", () => {
    expect(exportFileName("Snippets", new Date(2026, 9, 4, 9, 5, 7))).toBe("Snippets 2026-10-04 09.05.07.json");
  });

  it("escapes AppleScript strings", () => {
    expect(appleScriptString('a "b" \\c')).toBe('"a \\"b\\" \\\\c"');
  });
});

describe("faviconUrl", () => {
  it("uses the configured provider for web links only", () => {
    expect(faviconUrl("https://github.com/x", "google")).toBe("https://www.google.com/s2/favicons?domain=github.com&sz=64");
    expect(faviconUrl("https://youtu.be/abc", "duckduckgo")).toBe("https://icons.duckduckgo.com/ip3/youtube.com.ico");
    expect(faviconUrl("https://github.com", "none")).toBeNull();
    expect(faviconUrl("mailto:me@example.com", "google")).toBeNull();
    expect(faviconUrl("not a url", "google")).toBeNull();
  });
});

describe("normalizeImport", () => {
  it("accepts arrays, wrapped lists and single objects", () => {
    expect(normalizeImport('[{"name":"a","text":"1"}]', "snippets").count).toBe(1);
    expect(normalizeImport('{"snippets":[{"name":"a","text":"1"},{"name":"b","text":"2"}]}', "snippets").count).toBe(2);
    expect(normalizeImport(['{"name":"a","text":"1"}', '{"name":"b","text":"2"}'], "snippets").count).toBe(2);
  });

  it("maps Raycast field aliases", () => {
    const snippets = JSON.parse(normalizeImport('{"title":"Sig","text":"Best","alias":";s"}', "snippets").json);
    expect(snippets[0]).toMatchObject({ name: "Sig", keyword: ";s" });
    const links = JSON.parse(normalizeImport('[{"name":"Docs","url":"https://x.dev","applicationID":"com.apple.Safari"}]', "quicklinks").json);
    expect(links[0]).toMatchObject({ link: "https://x.dev", openWith: "com.apple.Safari" });
    expect(JSON.parse(normalizeImport('{"name":"App","link":"file:///tmp/file","applicationId":"com.apple.TextEdit"}', "quicklinks").json)[0].openWith).toBe("com.apple.TextEdit");
  });

  it("rejects invalid documents", () => {
    expect(() => normalizeImport("{", "snippets")).toThrow(ImportFormatError);
    expect(() => normalizeImport('[{"name":"a"}]', "snippets")).toThrow(ImportFormatError);
    expect(() => normalizeImport("[]", "quicklinks")).toThrow(/no entries/);
  });

  it("labels counts", () => {
    expect(countLabel(1, "snippets")).toBe("1 snippet");
    expect(countLabel(3, "quicklinks")).toBe("3 quicklinks");
  });
});
