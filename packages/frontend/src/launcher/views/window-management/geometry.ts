import type { WindowLayoutRect } from "@opencast/protocol";

/**
 * Geometry of custom window commands. The editor works with a Raycast-style
 * draft (anchor position + size + offset, all in percent of the screen's
 * visible frame); `WindowLayout.rect` stores the resulting fractions.
 */

export type Anchor = "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";

/** The 3×3 position grid, row by row. */
export const ANCHORS: { value: Anchor; title: string }[] = [
  { value: "top-left", title: "Top Left" },
  { value: "top-center", title: "Top Center" },
  { value: "top-right", title: "Top Right" },
  { value: "center-left", title: "Center Left" },
  { value: "center", title: "Center" },
  { value: "center-right", title: "Center Right" },
  { value: "bottom-left", title: "Bottom Left" },
  { value: "bottom-center", title: "Bottom Center" },
  { value: "bottom-right", title: "Bottom Right" },
];

/** Editor values as typed: percentages of the visible screen. Empty offsets mean 0. */
export interface LayoutDraft {
  position: Anchor;
  width: string;
  height: string;
  x: string;
  y: string;
}

export type DraftField = "width" | "height" | "x" | "y";
export type DraftErrors = Partial<Record<DraftField, string>>;

export const DEFAULT_DRAFT: LayoutDraft = { position: "center", width: "60", height: "70", x: "", y: "" };

type AxisAnchor = "start" | "center" | "end";

const EPSILON = 0.0005;

function axes(position: Anchor): { horizontal: AxisAnchor; vertical: AxisAnchor } {
  const vertical: AxisAnchor = position.startsWith("top") ? "start" : position.startsWith("bottom") ? "end" : "center";
  const horizontal: AxisAnchor = position.endsWith("left") ? "start" : position.endsWith("right") ? "end" : "center";
  return { horizontal, vertical };
}

function anchorFrom(horizontal: AxisAnchor, vertical: AxisAnchor): Anchor {
  const v = vertical === "start" ? "top" : vertical === "end" ? "bottom" : "center";
  const h = horizontal === "start" ? "left" : horizontal === "end" ? "right" : "center";
  if (v === "center" && h === "center") return "center";
  return `${v}-${h}` as Anchor;
}

/** Origin of a window of `size` anchored on one axis (fractions). */
function anchoredOrigin(anchor: AxisAnchor, size: number): number {
  return anchor === "start" ? 0 : anchor === "end" ? 1 - size : (1 - size) / 2;
}

/** Round to 0.01% so values survive the backend's strict 0..1 check. */
function roundFraction(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** "33.33" for 0.33333; at most two decimals, no trailing zeros. */
export function formatPercent(fraction: number): string {
  const value = Math.round(fraction * 10000) / 100;
  return String(Object.is(value, -0) ? 0 : value);
}

/** Parse a percentage as typed ("50", "50%", " 33.5 "). Empty → null, junk → NaN. */
export function parsePercent(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (!trimmed) return null;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Fractional rect for a draft. Invalid numbers fall back to defaults so the preview never breaks. */
export function draftToRect(draft: LayoutDraft): WindowLayoutRect {
  const percent = (text: string, fallback: number) => {
    const value = parsePercent(text);
    return value === null || Number.isNaN(value) ? fallback : value;
  };
  // 0.01% is the smallest size that survives rounding; validation rejects ≤ 0 separately.
  const width = Math.min(Math.max(percent(draft.width, 100), 0.01), 100) / 100;
  const height = Math.min(Math.max(percent(draft.height, 100), 0.01), 100) / 100;
  const { horizontal, vertical } = axes(draft.position);
  return {
    x: roundFraction(anchoredOrigin(horizontal, width) + percent(draft.x, 0) / 100),
    y: roundFraction(anchoredOrigin(vertical, height) + percent(draft.y, 0) / 100),
    width: roundFraction(width),
    height: roundFraction(height),
  };
}

function axisFromRect(origin: number, size: number): { anchor: AxisAnchor; offset: number } {
  if (Math.abs(origin) <= EPSILON) return { anchor: "start", offset: 0 };
  if (Math.abs(origin + size - 1) <= EPSILON) return { anchor: "end", offset: 0 };
  if (Math.abs(origin + size / 2 - 0.5) <= EPSILON) return { anchor: "center", offset: 0 };
  return { anchor: "start", offset: origin };
}

/** Draft that reproduces a stored rect: the anchor it touches, otherwise top-left plus offsets. */
export function rectToDraft(rect: WindowLayoutRect): LayoutDraft {
  const h = axisFromRect(rect.x, rect.width);
  const v = axisFromRect(rect.y, rect.height);
  return {
    position: anchorFrom(h.anchor, v.anchor),
    width: formatPercent(rect.width),
    height: formatPercent(rect.height),
    x: h.offset ? formatPercent(h.offset) : "",
    y: v.offset ? formatPercent(v.offset) : "",
  };
}

function sizeError(text: string): string | undefined {
  const value = parsePercent(text);
  if (value === null) return "Required";
  if (Number.isNaN(value)) return "Must be a number";
  if (value <= 0) return "Must be greater than 0";
  if (value > 100) return "Must be 100 or less";
  return undefined;
}

function offsetError(text: string): string | undefined {
  const value = parsePercent(text);
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Must be a number";
  if (value < -100 || value > 100) return "Must be between -100 and 100";
  return undefined;
}

/**
 * Validate a draft. Returns the rect when every field is valid and the window
 * stays inside the screen; an offset that pushes it out reports its allowed range.
 */
export function validateDraft(draft: LayoutDraft): { rect?: WindowLayoutRect; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const set = (field: DraftField, message: string | undefined) => {
    if (message) errors[field] = message;
  };
  set("width", sizeError(draft.width));
  set("height", sizeError(draft.height));
  set("x", offsetError(draft.x));
  set("y", offsetError(draft.y));
  if (Object.keys(errors).length) return { errors };

  const rect = draftToRect(draft);
  const { horizontal, vertical } = axes(draft.position);
  const range = (anchor: AxisAnchor, size: number) => {
    const origin = anchoredOrigin(anchor, size);
    return { min: -origin, max: 1 - size - origin };
  };
  const fits = (start: number, size: number) => start >= -EPSILON / 10 && start + size <= 1 + EPSILON / 10;
  if (!fits(rect.x, rect.width)) {
    const { min, max } = range(horizontal, rect.width);
    errors.x = `Must be between ${formatPercent(min)} and ${formatPercent(max)}`;
  }
  if (!fits(rect.y, rect.height)) {
    const { min, max } = range(vertical, rect.height);
    errors.y = `Must be between ${formatPercent(min)} and ${formatPercent(max)}`;
  }
  if (Object.keys(errors).length) return { errors };
  return { rect: clampRect(rect), errors };
}

/** Snap rounding noise back inside 0..1. */
function clampRect(rect: WindowLayoutRect): WindowLayoutRect {
  const width = Math.min(rect.width, 1);
  const height = Math.min(rect.height, 1);
  return { x: Math.min(Math.max(rect.x, 0), 1 - width), y: Math.min(Math.max(rect.y, 0), 1 - height), width, height };
}

export function validateName(name: string): string | undefined {
  return name.trim() ? undefined : "Name is required";
}

/** Human summary used in subtitles and metadata, e.g. "Center · 60% × 70%". */
export function describeRect(rect: WindowLayoutRect): { position: string; size: string; offset?: string } {
  const draft = rectToDraft(rect);
  const position = ANCHORS.find((a) => a.value === draft.position)?.title ?? "Custom";
  const offset = draft.x || draft.y ? `${draft.x || "0"}%, ${draft.y || "0"}%` : undefined;
  return { position, size: `${draft.width}% × ${draft.height}%`, offset };
}
