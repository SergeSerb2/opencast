import { describe, expect, it } from "vitest";
import { ALL_STATIC_PAGES, extensionPages } from "../catalog";
import { searchSettings, settingId, type SearchablePage } from "../search";

const pages: SearchablePage[] = [
  { id: "general", title: "General", keywords: ["theme", "dark mode"], rows: ["Open at Login", "OpenCast Hotkey", "Interface Size"] },
  { id: "ai", title: "AI", keywords: ["openai", "api key"], rows: ["Default Models", "Web Search API Key", "Profile"] },
  { id: "advanced", title: "Advanced", rows: ["Import from Raycast", "Favicon Provider"] },
  { id: "cloud-sync", title: "Cloud Sync", rows: ["Encryption Passphrase", "Synced Devices"] },
  { id: "applications", title: "Applications", rows: ["Hotkey Action"] },
];

describe("settings search", () => {
  it("returns every page without a query", () => {
    expect(searchSettings(pages, "  ").map((m) => m.page.id)).toEqual(["general", "ai", "advanced", "cloud-sync", "applications"]);
  });

  it("ranks title prefix, then title substring, then keywords, then rows", () => {
    const ids = (query: string) => searchSettings(pages, query).map((m) => m.page.id);
    expect(ids("a")).toEqual(["ai", "advanced", "applications", "general", "cloud-sync"]);
    expect(ids("sync")).toEqual(["cloud-sync"]);
    expect(ids("dark")).toEqual(["general"]);
    expect(ids("hotkey")).toEqual(["general", "applications"]);
  });

  it("requires every word and reports matching rows in page order", () => {
    const [match, ...rest] = searchSettings(pages, "api key");
    expect(match.page.id).toBe("ai");
    expect(match.rows).toEqual(["Web Search API Key"]);
    expect(rest).toEqual([]);
    expect(searchSettings(pages, "import raycast")[0]).toMatchObject({ page: { id: "advanced" }, rows: ["Import from Raycast"] });
    expect(searchSettings(pages, "import zebra")).toEqual([]);
  });

  it("ignores case and diacritics and caps the rows per page", () => {
    expect(searchSettings(pages, "PASSPHRÁSE")[0].rows).toEqual(["Encryption Passphrase"]);
    const many: SearchablePage[] = [{ id: "x", title: "X", rows: ["Row 1", "Row 2", "Row 3", "Row 4"] }];
    expect(searchSettings(many, "row")[0].rows).toHaveLength(3);
    expect(searchSettings(many, "row", 2)[0].rows).toEqual(["Row 1", "Row 2"]);
  });

  it("makes stable row anchors", () => {
    expect(settingId("REM/EM to Pixel Conversion")).toBe("rem-em-to-pixel-conversion");
    expect(settingId("Show “What's New”")).toBe("show-what-s-new");
    expect(settingId("Délai d'injection")).toBe("delai-d-injection");
  });

  it("finds the real catalog's pages by their rows and installed extensions by command", () => {
    const catalog = [...ALL_STATIC_PAGES, ...extensionPages([{ name: "github", title: "GitHub", author: "me", source: "store", enabled: true, installedAt: 0, updatedAt: 0, commands: [{ name: "prs", title: "My Pull Requests", mode: "view" }], tools: [], preferences: [] }])];
    expect(searchSettings(catalog, "api key").map((m) => m.page.id)).toEqual(expect.arrayContaining(["ai", "ai/models"]));
    expect(searchSettings(catalog, "pull requests")[0].page.id).toBe("extensions/github");
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
  });
});
