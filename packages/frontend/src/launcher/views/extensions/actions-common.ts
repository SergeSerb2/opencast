import { native } from "../../../bridge/native";
import { showFailureToast, showHUD } from "../../../components";
import { hideLauncher } from "../../launch";

/** Copy text and confirm with a HUD (closes the launcher, like Raycast's copy actions). */
export async function copyText(text: string, hud = "Copied to Clipboard"): Promise<void> {
  try {
    await native.call("clipboard.write", { content: { kind: "text", text } });
    await showHUD(hud);
  } catch (error) {
    showFailureToast("Failed to copy", error);
  }
}

/** Open a URL in the default browser and close the launcher. */
export async function openUrl(url: string): Promise<void> {
  try {
    await native.call("open.url", { url });
    hideLauncher();
  } catch (error) {
    showFailureToast("Failed to open", error);
  }
}

/** Reveal a file or folder in Finder and close the launcher. */
export async function showInFinder(path: string): Promise<void> {
  try {
    await native.call("open.showInFinder", { path });
    hideLauncher();
  } catch (error) {
    showFailureToast("Failed to show in Finder", error);
  }
}
