/** Notes' own content zoom (§7.1): default 1, 0.75–2 in 0.05 steps. */
export const ZOOM_DEFAULT = 1;
export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.05;

export function clampZoom(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

export function zoomIn(value: number): number {
  return clampZoom(clampZoom(value) + ZOOM_STEP);
}

export function zoomOut(value: number): number {
  return clampZoom(clampZoom(value) - ZOOM_STEP);
}
