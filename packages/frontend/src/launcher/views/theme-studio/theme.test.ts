import { describe, expect, it } from "vitest";
import { defaultPalette, paletteFromTheme } from "../../../theme/palettes";
import { themeSettingsUpdate } from "./apply-theme";
import { buildThemeCatalog, catalogSections, currentMark, filterCatalog, themeInUse } from "./theme-catalog";
import { copyName, draftFromPalette, draftToPalette, draftToUpsert, hasErrors, isSameDraft, normalizeHex, parseThemeJson, previewHex, themeToJson, validateDraft } from "./theme-draft";
import type { Theme } from "@surgecast/protocol";

const palette = defaultPalette("dark");
const draft = draftFromPalette(palette, { name: "My Theme" });
const user: Theme = { ...draftToUpsert(draft), id: "custom", createdAt: 1, updatedAt: 2 };

describe("theme drafts and import", () => {
  it("accepts hex shorthand but holds incomplete colors in the live preview", () => {
    expect(normalizeHex(" abc ")).toBe("#AABBCC");
    expect(normalizeHex("#aabbcc")).toBe("#AABBCC");
    expect(normalizeHex("#12G456")).toBeNull();
    expect(previewHex("#abc")).toBeNull();
    expect(draftToPalette({ ...draft, colors: { ...draft.colors, red: "#F00" } }, palette).colors.red).toBe(palette.colors.red);
    expect(draftToUpsert({ ...draft, colors: { ...draft.colors, red: "#F00" } }).colors.red).toBe("#FF0000");
  });
  it("reports blank names and invalid colors", () => {
    const errors = validateDraft({ ...draft, name: " ", colors: { ...draft.colors, blue: "bad color" } });
    expect(errors.name).toBeTruthy();
    expect(errors.blue).toBeTruthy();
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors(validateDraft(draft))).toBe(false);
  });
  it("round trips shared JSON without leaking the stored identity", () => {
    const json = themeToJson({ ...draft, id: "private-id" });
    expect(json).not.toContain("private-id");
    expect(parseThemeJson(json, "#112233")).toEqual(draft);
    expect(paletteFromTheme(user).colors.accent).toBe(draft.colors.accent);
  });
  it("accepts foreground aliases and defaults accent, but rejects missing or malformed colors", () => {
    const colors: Record<string, unknown> = { ...draft.colors, foreground: draft.colors.text };
    delete colors.text;
    delete colors.accent;
    const input = { name: "Imported", appearance: "light", colors };
    expect(parseThemeJson(JSON.stringify(input), "#123456")?.colors).toMatchObject({ text: draft.colors.text, accent: "#123456" });
    expect(parseThemeJson(JSON.stringify({ ...input, appearance: "invalid" }), "#123456")).toBeNull();
    expect(parseThemeJson(JSON.stringify({ ...input, colors: { ...colors, red: "url(secret)" } }), "#123456")).toBeNull();
    expect(parseThemeJson("[]", "#123456")).toBeNull();
    expect(parseThemeJson("not JSON", "#123456")).toBeNull();
  });
  it("chooses a unique duplicate name and compares normalized colors", () => {
    expect(copyName("Sky", ["sky copy", "Sky Copy 2"])).toBe("Sky Copy 3");
    expect(isSameDraft(draft, { ...draft, name: " My Theme ", colors: { ...draft.colors, red: draft.colors.red.toLowerCase() } })).toBe(true);
  });
});

describe("theme catalog and application", () => {
  it("folds backend built-ins into aliases and filters themes by name and appearance", () => {
    const catalog = buildThemeCatalog([{ ...user, id: "legacy-dark", name: palette.name, builtin: true }, user]);
    expect(catalog.find((t) => t.palette.id === palette.id)?.aliases).toContain("legacy-dark");
    expect(themeInUse(catalog, "legacy-dark", "dark")?.palette.id).toBe(palette.id);
    expect(themeInUse(catalog, "missing", "dark")?.palette.id).toBe(palette.id);
    const visible = filterCatalog(catalog, "my theme", "dark");
    expect(visible.map((t) => t.palette.id)).toEqual(["custom"]);
    expect(catalogSections(visible).map((s) => s.id)).toEqual(["dark"]);
    expect(filterCatalog(catalog, "my theme", "light")).toEqual([]);
  });
  it("marks fixed and system appearance themes correctly", () => {
    const catalog = buildThemeCatalog([user]);
    const entry = catalog.find((t) => t.palette.id === "custom")!;
    expect(currentMark(entry, catalog, { appearance: "dark", themeDark: "custom", themeLight: "surgecast-light" })).toBe("current");
    expect(currentMark(entry, catalog, { appearance: "system", themeDark: "custom", themeLight: "surgecast-light" })).toBe("dark");
    expect(currentMark(entry, catalog, { appearance: "light", themeDark: "custom", themeLight: "surgecast-light" })).toBeNull();
  });
  it("preserves system appearance when possible and switches it when needed", () => {
    expect(themeSettingsUpdate("custom", "dark", "current", "system", "dark")).toEqual({ "general.themeDark": "custom" });
    expect(themeSettingsUpdate("custom", "dark", "current", "system", "light")).toEqual({ "general.themeDark": "custom", "general.appearance": "dark" });
    expect(themeSettingsUpdate("custom", "light", "appearance", "dark", "dark")).toEqual({ "general.themeLight": "custom" });
  });
});
