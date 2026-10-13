import { describe, expect, it } from "vitest";
import type { MenuItemInfo } from "@surgecast/protocol";
import { menuEntries, menuSections, parseMenuShortcut } from "./menu-model";

const item = (path: string[], extra: Partial<MenuItemInfo> = {}): MenuItemInfo => ({ path, title: path[path.length - 1], enabled: true, ...extra });

const ITEMS: MenuItemInfo[] = [
  item(["File", "New Window"], { shortcut: "⌘N" }),
  item(["File", "Share"]),
  item(["File", "Share", "Mail"]),
  item(["File", "Share", "AirDrop"]),
  item(["Edit", "Undo"], { shortcut: "⌘Z", enabled: false }),
  item(["Edit", "Find"]),
  item(["Edit", "Find", "Find…"], { shortcut: "⌘F" }),
  item(["Edit", "Find", "Find…"], { shortcut: "⌘F" }),
  item(["View", "Always Show Tab Bar"], { checked: true }),
  item(["View", ""]),
];

describe("parseMenuShortcut", () => {
  it("splits modifier glyphs from the key", () => {
    expect(parseMenuShortcut("⌘N")).toEqual({ modifiers: ["cmd"], key: "n" });
    expect(parseMenuShortcut("⌥⇧⌘V")).toEqual({ modifiers: ["opt", "shift", "cmd"], key: "v" });
    expect(parseMenuShortcut("⌃⌘Space")).toEqual({ modifiers: ["ctrl", "cmd"], key: "space" });
    expect(parseMenuShortcut("⌃⇥")).toEqual({ modifiers: ["ctrl"], key: "tab" });
    expect(parseMenuShortcut("⌘,")).toEqual({ modifiers: ["cmd"], key: "," });
  });

  it("ignores empty or modifier-only shortcuts", () => {
    expect(parseMenuShortcut(undefined)).toBeUndefined();
    expect(parseMenuShortcut("⌘")).toBeUndefined();
  });
});

describe("menuEntries", () => {
  it("keeps pressable leaves once, in menu-bar order", () => {
    const entries = menuEntries(ITEMS);
    expect(entries.map((e) => e.item.path.join(" > "))).toEqual(["File > New Window", "File > Share > Mail", "File > Share > AirDrop", "Edit > Undo", "Edit > Find > Find…", "View > Always Show Tab Bar"]);
  });

  it("derives the menu, path label and shortcut", () => {
    const mail = menuEntries(ITEMS).find((e) => e.item.title === "Mail");
    expect(mail).toMatchObject({ menu: "File", pathLabel: "File → Share" });
    expect(menuEntries(ITEMS)[0].shortcut).toEqual({ modifiers: ["cmd"], key: "n" });
  });
});

describe("menuSections", () => {
  const entries = menuEntries(ITEMS);

  it("groups by top-level menu with counts", () => {
    expect(menuSections(entries, "").map((s) => [s.title, s.subtitle])).toEqual([
      ["File", "3"],
      ["Edit", "2"],
      ["View", "1"],
    ]);
  });

  it("returns one ranked Results section while searching", () => {
    const [results, ...rest] = menuSections(entries, "find");
    expect(rest).toEqual([]);
    expect(results.title).toBe("Results");
    expect(results.entries[0].item.title).toBe("Find…");
    expect(results.entries[0].titleRanges).toEqual([[0, 4]]);
  });

  it("matches the path when the title does not", () => {
    const [results] = menuSections(entries, "share");
    expect(results.entries.map((e) => e.item.title)).toEqual(["Mail", "AirDrop"]);
  });

  it("returns nothing when no item matches", () => {
    expect(menuSections(entries, "zzzz")).toEqual([]);
  });
});
