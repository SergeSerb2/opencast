import { native } from "../../../bridge/native";
import { showFailureToast, showToast } from "../../../components";

/** Copy without closing the window (theme JSON is usually pasted somewhere else later). */
export async function copyWithToast(text: string, title: string): Promise<void> {
  try {
    await native.call("clipboard.write", { content: { kind: "text", text } });
    showToast({ style: "success", title });
  } catch (error) {
    showFailureToast("Failed to copy", error);
  }
}

export async function readClipboardText(): Promise<string | null> {
  const snapshot = await native.call("clipboard.read");
  if (!snapshot) return null;
  return snapshot.text ?? (snapshot.primary.kind === "text" ? snapshot.primary.text : null);
}
