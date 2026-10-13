import { describe, expect, it } from "vitest";
import { contrastRatio, ensureContrast, parseHex, toHex } from "../theme/color";
import { BUILTIN_PALETTES, resolvePalette } from "../theme/palettes";
import { paletteToCssVars, typicalBackdrop } from "../theme/theme-vars";

describe("theme generation", () => {
  it("parses and formats hex", () => {
    expect(parseHex("#4FA3F8")).toEqual([79, 163, 248]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(toHex([79, 163, 248])).toBe("#4FA3F8");
  });

  it("raises contrast to at least 2.5 against the backdrop", () => {
    const backdrop = parseHex("#D9D9D9");
    const yellow = parseHex("#F8A300");
    expect(contrastRatio(yellow, backdrop)).toBeLessThan(2.5);
    const fixed = ensureContrast(yellow, backdrop);
    expect(contrastRatio(fixed, backdrop)).toBeGreaterThanOrEqual(2.49);
    expect(ensureContrast(parseHex("#000000"), backdrop)).toEqual([0, 0, 0]);
  });

  it("emits contrast variables for custom palettes only", () => {
    const dark = paletteToCssVars(BUILTIN_PALETTES[0]);
    expect(dark["--bg"]).toBe("#000000");
    expect(dark["--red-contrast"]).toBeUndefined();
    const dawn = paletteToCssVars(resolvePalette("dawn", "light"));
    expect(dawn["--yellow-contrast"]).toMatch(/^#[0-9A-F]{6}$/);
    const backdrop = typicalBackdrop(resolvePalette("dawn", "light"));
    expect(contrastRatio(parseHex(dawn["--yellow-contrast"]), backdrop)).toBeGreaterThanOrEqual(2.49);
  });

  it("falls back to the default palette for unknown ids or mismatched appearance", () => {
    expect(resolvePalette("nope", "dark").id).toBe("opencast-dark");
    expect(resolvePalette("sky", "light").id).toBe("opencast-light");
  });
});
