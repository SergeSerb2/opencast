import { describe, expect, it } from "vitest";
import type { CommandInfo } from "@opencast/protocol";
import {
  fuzzyMatch,
  frecency,
  rankCommands,
} from "../../src/services/core/ranking";
import { realisticCatalog, APP_NAMES } from "./catalog";

const command = (
  id: string,
  title: string,
  extra: Partial<CommandInfo> = {},
): CommandInfo => ({
  id,
  title,
  kind: "builtin",
  typeLabel: "Command",
  icon: "bolt-16",
  mode: "view",
  enabled: true,
  ...extra,
});
describe("ranking", () => {
  it("prioritizes exact aliases, then title prefixes over alias prefixes", () => {
    const commands = [
      command("a", "Google"),
      command("b", "Search Notes", { alias: "go" }),
      command("c", "Search Files", { alias: "gone" }),
    ];
    const visits = new Map([["a", { count: 10000, lastUsed: Date.now() }]]);
    expect(
      rankCommands("go", commands, visits, "high").map((c) => c.id),
    ).toEqual(["b", "a", "c"]);
  });
  it("matches subtitle and keywords while excluding disabled items", () => {
    const commands = [
      command("a", "Other", { subtitle: "Clipboard History" }),
      command("b", "Unrelated", { keywords: ["clipboard"] }),
      command("c", "Clipboard", { enabled: false }),
    ];
    expect(
      rankCommands("clipboard", commands, new Map(), "high").map((c) => c.id),
    ).toEqual(["b", "a"]);
  });
  it("returns original character offsets for accented titles and contiguous matches", () => {
    expect(fuzzyMatch("cafe", "Café")?.matches).toEqual([[0, 4]]);
    expect(fuzzyMatch("sc", "Search Commands")?.matches).toEqual([
      [0, 1],
      [7, 8],
    ]);
    expect(fuzzyMatch("sc", "Search Commands", "low")?.matches).toEqual([[0, 1], [7, 8]]);
  });
  it("decays visits and rewards repeated launches", () => {
    expect(frecency(10, 0, 0)).toBeGreaterThan(frecency(1, 0, 0));
    expect(frecency(10, 0, 86400000 * 90)).toBeLessThan(frecency(10, 0, 0));
  });
});

describe("matching tiers", () => {
  const tiers = [
    command("alias", "Unrelated", { alias: "clip" }),
    command("exact", "Clip"),
    command("prefix", "Clipboard History"),
    command("word", "Search Clipboard"),
    command("substring", "Paperclip"),
    command("metadata", "Other", { keywords: ["clip"] }),
    command("subsequence", "Cxlxip"),
  ];
  it.each(["medium", "high"] as const)("keeps all tiers ordered at %s even with extreme usage", (sensitivity) => {
    for (const popular of tiers) {
      const visits = new Map([[popular.id, { count: Number.MAX_SAFE_INTEGER, lastUsed: Date.now() }]]);
      expect(rankCommands("clip", tiers, visits, sensitivity).map((c) => c.id))
        .toEqual(tiers.map((c) => c.id));
    }
  });
  it("uses frecency to reorder equally strong matches", () => {
    const commands = [command("a", "Clipboard History"), command("b", "Clipboard Manager")];
    expect(rankCommands("clip", commands, new Map([["b", { count: 100, lastUsed: Date.now() }]]), "medium")[0].id)
      .toBe("b");
  });
  it.each(["low", "medium", "high"] as const)("rejects scattered application matches at %s", (sensitivity) => {
    const ranked = rankCommands("clip", realisticCatalog, new Map(), sensitivity);
    expect(ranked[0].title).toBe("Clipboard History");
    for (const title of ["Image Capture", "Script Editor", "AirPort Utility", "Phone", "Wispr Flow", "QuickTime Player"])
      expect(ranked.some((c) => c.title === title), title).toBe(false);
  });
  it.each([
    ["Cxlip", "low", false], ["Cxlip", "medium", true], ["Cxlip", "high", true],
    ["Cxxlip", "medium", false], ["Cxxlip", "high", true],
    ["Cxxxlip", "high", false], ["Xcxlip", "high", false],
    ["Cxxx Cxlip", "medium", true],
  ] as const)("bounds gaps and starts at a word boundary: %s (%s)", (title, sensitivity, matches) => {
    expect(fuzzyMatch("clip", title, sensitivity) !== null).toBe(matches);
  });
  it("never uses subsequences in paths, subtitles, or keywords", () => {
    expect(rankCommands("clip", [command("meta", "Other", {
      subtitle: "/Applications/Cxlip.app", keywords: ["com.example.Cxlip"],
    })], new Map(), "high")).toEqual([]);
  });
  it.each([
    ["ch", "Clipboard History", [[0, 1], [10, 11]]],
    ["qt", "QuickTime Player", [[0, 1], [5, 6]]],
    ["xp", "XMLParser", [[0, 1], [3, 4]]],
    ["vs code", "Visual Studio Code", [[0, 1], [7, 8], [14, 18]]],
    ["cli his", "Clipboard History", [[0, 3], [10, 13]]],
    ["cafe", "Cafe\u0301", [[0, 5]]],
    ["cafe", "☕ Café", [[2, 6]]],
  ])("highlights word prefixes and initials: %s → %s", (query, title, matches) => {
    expect(fuzzyMatch(query as string, title as string, "low")?.matches).toEqual(matches);
  });
  it("requires distinct ordered words for each query token", () => {
    expect(fuzzyMatch("cli cli", "Clipboard History", "low")).toBeNull();
    expect(fuzzyMatch("his cli", "Clipboard History", "low")).toBeNull();
  });
  it("keeps settings below the feature despite frequent use", () => {
    const visits = new Map([["builtin:settings.openClipboardSettings", { count: Number.MAX_SAFE_INTEGER, lastUsed: Date.now() }]]);
    expect(rankCommands("clip", realisticCatalog, visits, "medium")[0].id).toBe("builtin:clipboard.clipboardHistory");
  });
});

describe("realistic root catalog", () => {
  it("includes every builtin and a broad macOS application catalog", () => {
    expect(APP_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(realisticCatalog.map((c) => c.id)).size).toBe(realisticCatalog.length);
  });
  it.each([
    ["clip", ["Clipboard History", "Clipboard History Settings"]],
    ["cl", ["Clock", "Claude"]],
    ["ch", ["Chess", "ChatGPT"]],
    ["snip", ["Search Snippets"]],
    ["set", ["Settings", "Set Volume"]],
    ["safari", ["Safari"]], ["sa", ["Safari"]], ["term", ["Terminal", "iTerm"]],
    ["calc", ["Calculator", "Calculator History"]], ["win", ["Windows App"]],
    ["left", ["Left Half"]], ["lock", ["Lock Screen"]], ["ai", ["AI Chat"]],
    ["emoji", ["Search Emoji & Symbols"]], ["1pass", ["1Password"]],
    ["vs code", ["Visual Studio Code"]], ["code", ["Visual Studio Code", "Xcode"]],
    ["chrome", ["Google Chrome"]], ["notes", ["Notes", "Search Notes"]],
    ["quick", ["Quick AI", "QuickTime Player"]], ["trash", ["Open Trash", "Empty Trash"]],
  ])("ranks useful results first for %s", (query, titles) => {
    expect(rankCommands(query as string, realisticCatalog, new Map(), "medium")
      .slice(0, titles.length).map((c) => c.title)).toEqual(titles);
  });
  it("finds Clipboard History by initials below stronger title prefixes", () => {
    const titles = rankCommands("ch", realisticCatalog, new Map(), "low").map((c) => c.title);
    expect(titles).toContain("Clipboard History");
    expect(titles.indexOf("Chess")).toBeLessThan(titles.indexOf("Clipboard History"));
  });
});
