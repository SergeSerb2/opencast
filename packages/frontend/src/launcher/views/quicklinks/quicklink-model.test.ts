import { describe, expect, it } from "vitest";
import type { Quicklink } from "@surgecast/protocol";
import { duplicateNoteContent, titleMatchesFirst } from "../notes-search/notes-model";
import { DEFAULT_ICON, defaultLinkIcon, openedLabel, quicklinkDraft, quicklinkIcon, quicklinkPayload, validateQuicklink } from "./quicklink-model";

const link: Quicklink = { id: "q", name: "Docs", link: "https://example.dev/{query}", createdAt: 0, updatedAt: 0 };

describe("quicklink model", () => {
  it("drafts from a quicklink and keeps only icon names", () => {
    expect(quicklinkDraft({ ...link, icon: "star-16" }).icon).toBe("star-16");
    expect(quicklinkDraft({ ...link, icon: { fileIcon: "/x" } }).icon).toBe(DEFAULT_ICON);
    expect(quicklinkDraft().openWith).toBe("");
  });

  it("validates required fields", () => {
    expect(validateQuicklink({ name: "", link: " ", openWith: "", tags: [], icon: DEFAULT_ICON })).toEqual({ link: "Link is required", name: "Name is required" });
  });

  it("sends null to reset Open With and the icon", () => {
    const payload = quicklinkPayload({ name: " Docs ", link: " https://x.dev ", openWith: "", tags: ["dev"], icon: DEFAULT_ICON });
    expect(JSON.parse(JSON.stringify(payload))).toEqual({ name: "Docs", link: "https://x.dev", openWith: null, icon: null, tags: ["dev"] });
  });

  it("resolves default icons", () => {
    expect(defaultLinkIcon("https://github.com/{argument}", "google")).toEqual({ source: "https://www.google.com/s2/favicons?domain=github.com&sz=64", fallback: "link-16" });
    expect(defaultLinkIcon("~/Documents", "google")).toEqual({ fileIcon: "~/Documents" });
    expect(defaultLinkIcon("https://x.dev", "none", { name: "Arc", path: "/Applications/Arc.app" })).toEqual({ fileIcon: "/Applications/Arc.app" });
    expect(quicklinkIcon({ ...link, icon: "star-16" }, "google", [])).toMatchObject({ tile: { glyph: "star-16" } });
  });

  it("describes open counts", () => {
    expect([undefined, 1, 4].map(openedLabel)).toEqual(["Never", "Once", "4 times"]);
  });
});

describe("notes model", () => {
  const note = (title: string) => ({ id: title, title, preview: "", characters: 0, words: 0, createdAt: 0, updatedAt: 0 });

  it("moves title matches first", () => {
    expect(titleMatchesFirst([note("Groceries"), note("Ideas"), note("Big ideas")], "idea").map((n) => n.title)).toEqual(["Ideas", "Big ideas", "Groceries"]);
  });

  it("marks the first line of a duplicate", () => {
    expect(duplicateNoteContent("# Plan\nbody")).toBe("# Plan (Copy)\nbody");
    expect(duplicateNoteContent("")).toBe("Untitled (Copy)");
  });
});
