import { describe, expect, it } from "vitest";
import { describeRect, draftToRect, formatPercent, parsePercent, rectToDraft, validateDraft, validateName, type LayoutDraft } from "./geometry";

const draft = (patch: Partial<LayoutDraft>): LayoutDraft => ({ position: "top-left", width: "50", height: "100", x: "", y: "", ...patch });

describe("parsePercent / formatPercent", () => {
  it("parses typed percentages", () => {
    expect(parsePercent("50")).toBe(50);
    expect(parsePercent(" 33.5 % ")).toBe(33.5);
    expect(parsePercent("-10")).toBe(-10);
    expect(parsePercent(".5")).toBe(0.5);
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc")).toBeNaN();
    expect(parsePercent("1e2")).toBeNaN();
  });

  it("formats fractions with at most two decimals", () => {
    expect(formatPercent(1 / 3)).toBe("33.33");
    expect(formatPercent(0.5)).toBe("50");
    expect(formatPercent(-0)).toBe("0");
  });
});

describe("draftToRect", () => {
  it("anchors the window on each axis", () => {
    expect(draftToRect(draft({ position: "top-left" }))).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(draftToRect(draft({ position: "center-right", height: "50" }))).toEqual({ x: 0.5, y: 0.25, width: 0.5, height: 0.5 });
    expect(draftToRect(draft({ position: "center", width: "60", height: "70" }))).toEqual({ x: 0.2, y: 0.15, width: 0.6, height: 0.7 });
    expect(draftToRect(draft({ position: "bottom-center", width: "40", height: "30" }))).toEqual({ x: 0.3, y: 0.7, width: 0.4, height: 0.3 });
  });

  it("adds offsets to the anchored origin", () => {
    expect(draftToRect(draft({ width: "40", height: "40", x: "10", y: "5" }))).toEqual({ x: 0.1, y: 0.05, width: 0.4, height: 0.4 });
    expect(draftToRect(draft({ position: "bottom-right", width: "40", height: "40", x: "-10", y: "-10" }))).toEqual({ x: 0.5, y: 0.5, width: 0.4, height: 0.4 });
  });

  it("keeps the preview drawable while fields are invalid", () => {
    expect(draftToRect(draft({ width: "", height: "abc" }))).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(draftToRect(draft({ width: "250" })).width).toBe(1);
  });

  it("rounds to 0.01% so thirds stay inside the screen", () => {
    const rect = draftToRect(draft({ position: "top-right", width: "33.33" }));
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.x).toBe(0.6667);
  });
});

describe("rectToDraft", () => {
  it("round-trips anchored layouts", () => {
    for (const d of [
      draft({ position: "top-left" }),
      draft({ position: "center", width: "60", height: "70" }),
      draft({ position: "bottom-right", width: "25", height: "50" }),
      draft({ position: "center-left", width: "33.33", height: "50" }),
    ]) {
      expect(rectToDraft(draftToRect(d))).toEqual(d);
    }
  });

  it("expresses floating rects as top-left plus offsets", () => {
    expect(rectToDraft({ x: 0.1, y: 0.05, width: 0.4, height: 0.5 })).toEqual({ position: "top-left", width: "40", height: "50", x: "10", y: "5" });
  });

  it("prefers the edge a full-size axis touches", () => {
    expect(rectToDraft({ x: 0, y: 0, width: 1, height: 1 }).position).toBe("top-left");
  });
});

describe("validateDraft", () => {
  it("returns the rect for valid drafts", () => {
    expect(validateDraft(draft({ position: "center", width: "60", height: "70" }))).toEqual({ rect: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 }, errors: {} });
  });

  it("reports field errors", () => {
    const { rect, errors } = validateDraft(draft({ width: "", height: "0", x: "abc", y: "120" }));
    expect(rect).toBeUndefined();
    expect(errors).toEqual({ width: "Required", height: "Must be greater than 0", x: "Must be a number", y: "Must be between -100 and 100" });
    expect(validateDraft(draft({ width: "101" })).errors.width).toBe("Must be 100 or less");
  });

  it("reports the allowed offset range when the window leaves the screen", () => {
    expect(validateDraft(draft({ width: "50", x: "60" })).errors).toEqual({ x: "Must be between 0 and 50" });
    expect(validateDraft(draft({ position: "center", width: "60", height: "70", y: "-20" })).errors).toEqual({ y: "Must be between -15 and 15" });
  });
});

describe("validateName / describeRect", () => {
  it("requires a name", () => {
    expect(validateName("  ")).toBe("Name is required");
    expect(validateName("Left Half")).toBeUndefined();
  });

  it("describes a rect for metadata", () => {
    expect(describeRect({ x: 0.2, y: 0.15, width: 0.6, height: 0.7 })).toEqual({ position: "Center", size: "60% × 70%", offset: undefined });
    expect(describeRect({ x: 0.1, y: 0, width: 0.4, height: 0.5 })).toEqual({ position: "Top Left", size: "40% × 50%", offset: "10%, 0%" });
  });
});
