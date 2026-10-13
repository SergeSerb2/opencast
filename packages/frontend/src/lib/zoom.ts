import { useSetting } from "../bridge/settings";

/** Interface zoom ("Interface Size"), clamped to the supported range. */
export function useZoom(): number {
  const zoom = useSetting("general.uiZoom");
  return Number.isFinite(zoom) ? Math.min(1.5, Math.max(0.8, zoom)) : 1;
}

/** Scale a spec metric (px at zoom 1) like the CSS `round(N * --spx, 1px)` tokens. */
export function scaled(value: number, zoom: number): number {
  return Math.round(value * zoom);
}
