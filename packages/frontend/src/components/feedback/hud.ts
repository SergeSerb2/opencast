import { native } from "../../bridge/native";

/**
 * Raycast-style HUD: close the launcher, then show a short message near the
 * bottom of the screen (rendered by the native host).
 */
export async function showHUD(text: string): Promise<void> {
  await native.call("window.hide", { kind: "main", restoreFocus: true }).catch(() => undefined);
  await native.call("hud.show", { text }).catch(() => undefined);
}
